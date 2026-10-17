// Stockfish 19 (WASM, mono-thread, réseau NNUE léger embarqué) dans un Web Worker.
import { uciLineToSan } from './core.js';

const ENGINE_URL = import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js';

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.searching = false;
    this.pending = null;
    this.cur = null;
    this.listeners = new Set();
  }

  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (e) { reject(e); return; }
      this.worker.onmessage = (e) => this.onLine(String(e.data));
      this.worker.onerror = (e) => reject(e);
      this._readyResolve = resolve;
      this.send('uci');
      this.send('setoption name Hash value 32');
      this.send('isready');
    });
    return this.ready;
  }

  send(cmd) { this.worker && this.worker.postMessage(cmd); }

  /**
   * Analyse une position. Annule l'analyse précédente.
   * opts: {depth, multipv, movetime, elo}
   * onUpdate(lines) appelé à chaque profondeur ; la promesse renvoie les lignes finales.
   */
  async analyze(fen, opts = {}, onUpdate) {
    await this.init();
    return new Promise((resolve) => {
      if (this.pending) this.pending.resolve(null);
      this.pending = { fen, opts, onUpdate, resolve };
      if (this.searching) this.send('stop');
      else this._start();
    });
  }

  stop() {
    if (this.pending) { this.pending.resolve(null); this.pending = null; }
    if (this.searching) this.send('stop');
  }

  _start() {
    const job = this.pending;
    this.pending = null;
    if (!job) return;
    this.cur = { ...job, lines: [], bestmove: null };
    this.searching = true;
    const { fen, opts } = job;
    const mpv = opts.multipv || 1;
    this.send(`setoption name MultiPV value ${mpv}`);
    if (opts.elo) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${Math.max(1320, opts.elo)}`);
      // En dessous de 1320 Elo, on dégrade avec le « Skill Level ».
      const skill = opts.elo < 1320 ? Math.max(0, Math.round((opts.elo - 600) / 40)) : 20;
      this.send(`setoption name Skill Level value ${skill}`);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
    }
    this.send(`position fen ${fen}`);
    if (opts.movetime) this.send(`go movetime ${opts.movetime}`);
    else this.send(`go depth ${opts.depth || 16}`);
  }

  onLine(line) {
    if (line === 'readyok' && this._readyResolve) { this._readyResolve(); this._readyResolve = null; return; }
    const cur = this.cur;
    if (!cur) return;
    if (line.startsWith('info') && line.includes(' pv ') && !this.pending) {
      const info = parseInfo(line, cur.fen);
      if (!info) return;
      cur.lines[info.multipv - 1] = info;
      if (info.multipv === (cur.opts.multipv || 1) || (cur.opts.multipv || 1) === 1) cur.onUpdate && cur.onUpdate(cur.lines.filter(Boolean));
    } else if (line.startsWith('bestmove')) {
      this.searching = false;
      cur.bestmove = line.split(' ')[1];
      if (!this.pending) cur.resolve({ lines: cur.lines.filter(Boolean), bestmove: cur.bestmove });
      else cur.resolve(null);
      this.cur = null;
      if (this.pending) this._start();
    }
  }
}

function parseInfo(line, fen) {
  const t = line.split(' ');
  const get = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : null; };
  const depth = +get('depth');
  const multipv = +(get('multipv') || 1);
  const si = t.indexOf('score');
  if (si < 0) return null;
  const kind = t[si + 1], val = +t[si + 2];
  const pv = t.slice(t.indexOf('pv') + 1);
  const turn = fen.split(' ')[1];
  const sign = turn === 'w' ? 1 : -1; // on ramène tout du point de vue des Blancs
  const score = kind === 'mate' ? { mate: val * sign } : { cp: val * sign };
  return { depth, multipv, score, pv, san: uciLineToSan(fen, pv.slice(0, 12)) };
}

/** Score « Blancs » en centipions (mats ramenés à ±10000). */
export function scoreCp(score) {
  if (!score) return 0;
  if (score.mate != null) return score.mate > 0 ? 10000 - score.mate : -10000 - score.mate;
  return score.cp;
}

export function fmtScore(score) {
  if (!score) return '';
  if (score.mate != null) return (score.mate > 0 ? '#' : '#-') + Math.abs(score.mate);
  const v = score.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/** Probabilité de gain (Blancs) à partir de centipions, formule de Lichess. */
export function winChance(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 1 / (1 + Math.exp(-0.00368208 * c));
}

export const engine = new Engine();
