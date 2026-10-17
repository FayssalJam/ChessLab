// Exécute un exercice sur l'échiquier principal : suite imposée, meilleur coup, ou partie contre Stockfish.
import { Chess } from 'chess.js';
import { engine, scoreCp } from './engine.js';
import { START_FEN } from './core.js';
import { restore, store } from './settings.js';

const STATS_KEY = 'cc.exstats.v1';
export const exStats = restore(STATS_KEY, {}); // id → {ok, ko, last}
export function recordResult(ex, ok) {
  const s = exStats[ex.id] || { ok: 0, ko: 0 };
  ok ? s.ok++ : s.ko++;
  s.last = Date.now();
  s.lastOk = ok;
  exStats[ex.id] = s;
  store(STATS_KEY, exStats);
}

export function exerciseStart(ex) {
  const moves = ex.moves ? ex.moves.split(/\s+/) : [];
  return { fen: ex.fen || START_FEN, moves };
}

export class ExerciseRunner {
  constructor(app, { onStatus, onDone }) {
    this.app = app;
    this.onStatus = onStatus;
    this.onDone = onDone;
    this.ex = null;
  }

  start(ex) {
    this.stop();
    this.ex = ex;
    this.i = 0;
    this.errors = 0;
    this.userMoves = 0;
    this.finished = false;
    this.busy = false;
    const { fen, moves } = exerciseStart(ex);
    this.app.claimEngine('exercise');
    this.app.load(fen, moves);
    this.startFen = this.app.fen();
    this.color = this.startFen.split(' ')[1];
    this.app.board.setOrientation(this.color);
    this.app.interceptor = (uci) => this.onMove(uci);
    const who = this.color === 'w' ? 'Blancs' : 'Noirs';
    const goal = ex.type === 'play'
      ? { mate: 'Matez', win: 'Gagnez (promotion ou mat)', draw: 'Tenez la nulle' }[ex.goal] + (ex.maxMoves ? ` en ${ex.maxMoves} coups max` : '')
      : ex.type === 'best' ? 'Trouvez le meilleur coup' : 'Trouvez la suite gagnante';
    this.status(`<b>${who} au trait.</b> ${goal}.`);
    if (ex.type === 'best') this.bestRef = engine.analyze(this.startFen, { depth: 16, multipv: 1 });
  }

  stop() {
    if (!this.ex) return;
    this.ex = null;
    this.app.interceptor = null;
    this.app.claimEngine(null);
  }

  status(html) { this.onStatus && this.onStatus(html); }

  finish(ok, msg) {
    if (this.finished) return;
    this.finished = true;
    recordResult(this.ex, ok && this.errors === 0);
    this.status(`<span class="${ok ? 'status-ok' : 'status-ko'}">${ok ? '✔ Réussi' : '✘ Échec'}</span> ${msg || ''}`);
    const ex = this.ex;
    this.app.interceptor = null;
    this.app.claimEngine(null);
    this.ex = null;
    this.onDone && this.onDone(ex, ok && this.errors === 0);
  }

  hint() {
    if (!this.ex) return;
    if (this.ex.hint) this.status('💡 ' + this.ex.hint);
    if (this.ex.type === 'line') {
      const c = new Chess(this.app.fen());
      try { const m = c.move(this.ex.solution[this.i]); this.app.setShapes([{ orig: m.from, brush: 'yellow' }]); } catch { /* ignore */ }
    }
  }

  async showSolution() {
    if (!this.ex) return;
    this.errors++;
    if (this.ex.type === 'line') {
      const rest = this.ex.solution.slice(this.i);
      this.status('Solution : <b>' + rest.join(' ') + '</b>');
      const c = new Chess(this.app.fen());
      try { const m = c.move(rest[0]); this.app.setShapes([{ orig: m.from, dest: m.to, brush: 'green' }]); } catch { /* ignore */ }
    } else {
      const r = await engine.analyze(this.app.fen(), { depth: 16 });
      if (r && r.lines[0]) {
        this.status('Le moteur propose : <b>' + r.lines[0].san.slice(0, 5).join(' ') + '</b>');
        const u = r.lines[0].pv[0];
        this.app.setShapes([{ orig: u.slice(0, 2), dest: u.slice(2, 4), brush: 'green' }]);
      }
    }
  }

  async onMove(uci) {
    if (!this.ex || this.busy || this.finished) { this.app.refresh(); return; }
    const c = new Chess(this.app.fen());
    let m;
    try { m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { this.app.refresh(); return; }
    if (this.ex.type === 'line') return this.onLineMove(m);
    if (this.ex.type === 'best') return this.onBestMove(m);
    return this.onPlayMove(m);
  }

  onLineMove(m) {
    const expected = this.ex.solution[this.i];
    const norm = (s) => s.replace(/[+#?!]/g, '');
    const matesToo = m.san.includes('#') && expected.includes('#');
    if (norm(m.san) !== norm(expected) && !matesToo) {
      this.errors++;
      this.app.refresh();
      this.status(`<span class="status-ko">✘ ${m.san}</span> n'est pas la solution. ${this.errors >= 2 && this.ex.hint ? '💡 ' + this.ex.hint : 'Réessayez.'}`);
      return;
    }
    this.app.play(m.san);
    this.i++;
    if (this.i >= this.ex.solution.length || m.san.includes('#')) { this.finish(true, this.ex.explain || ''); return; }
    this.status(`✔ ${m.san} ! Continuez…`);
    this.busy = true;
    setTimeout(() => {
      this.busy = false;
      if (!this.ex) return;
      this.app.play(this.ex.solution[this.i]);
      this.i++;
      if (this.i >= this.ex.solution.length) this.finish(true);
    }, 500);
  }

  async onBestMove(m) {
    this.busy = true;
    this.status('Vérification par Stockfish…');
    const ref = await this.bestRef;
    const before = new Chess(this.app.fen());
    before.move(m.san);
    const after = await engine.analyze(before.fen(), { depth: 14 });
    this.busy = false;
    if (!ref || !after || !this.ex) return;
    const sgn = this.color === 'w' ? 1 : -1;
    const bestCp = sgn * scoreCp(ref.lines[0].score);
    const mine = before.isCheckmate() ? 10000 : sgn * scoreCp(after.lines[0] ? after.lines[0].score : { cp: 0 });
    const ok = bestCp - mine <= 80 || (bestCp > 9000 && mine > 9000);
    this.app.play(m.san);
    if (ok) this.finish(true, `${m.san} est un excellent choix.`);
    else {
      this.errors++;
      this.finish(false, `${m.san} perd ${((bestCp - mine) / 100).toFixed(1)} pion(s). Meilleur : <b>${ref.lines[0].san[0]}</b>.`);
    }
  }

  async onPlayMove(m) {
    const ex = this.ex;
    this.app.play(m.san);
    this.userMoves++;
    const pos = new Chess(this.app.fen());
    if (pos.isCheckmate()) { this.finish(true, 'Mat !'); return; }
    if (pos.isDraw() || pos.isStalemate()) {
      if (ex.goal === 'draw') this.finish(true, 'Nulle obtenue.');
      else this.finish(false, pos.isStalemate() ? 'Pat ! Attention à toujours laisser une case au roi.' : 'Partie nulle.');
      return;
    }
    this.busy = true;
    this.status('Stockfish réfléchit…');
    const r = await engine.analyze(this.app.fen(), { depth: 14 });
    this.busy = false;
    if (!r || this.ex !== ex) return;
    const sgn = this.color === 'w' ? 1 : -1;
    const ev = sgn * scoreCp(r.lines[0] ? r.lines[0].score : { cp: 0 });
    // Le gain ou la nulle s'est-il échappé ?
    if ((ex.goal === 'win' || ex.goal === 'mate') && ev < 250) { this.finish(false, `${m.san} laisse filer le gain (éval ${(ev / 100).toFixed(1)}).`); return; }
    if (ex.goal === 'draw' && ev < -250) { this.finish(false, `${m.san} perd (éval ${(ev / 100).toFixed(1)}).`); return; }
    if (ex.goal === 'win' && hasQueen(pos, this.color) && ev > 600) { this.finish(true, 'Promotion réussie, la partie est gagnée.'); return; }
    if (ex.goal === 'draw' && ex.maxMoves && this.userMoves >= ex.maxMoves) { this.finish(true, 'Vous avez tenu !'); return; }
    if (ex.goal !== 'draw' && ex.maxMoves && this.userMoves >= ex.maxMoves) { this.finish(false, `Plus de ${ex.maxMoves} coups : revoyez la technique.`); return; }
    // Réponse du moteur
    this.app.play(r.bestmove);
    const p2 = new Chess(this.app.fen());
    if (p2.isCheckmate()) { this.finish(false, 'Vous êtes maté.'); return; }
    if (p2.isDraw() || p2.isStalemate()) { ex.goal === 'draw' ? this.finish(true, 'Nulle obtenue.') : this.finish(false, 'Partie nulle.'); return; }
    this.status(`Coup ${this.userMoves}${ex.maxMoves ? '/' + ex.maxMoves : ''} · à vous.`);
  }
}

function hasQueen(chess, color) {
  return chess.board().some((row) => row.some((p) => p && p.color === color && p.type === 'q'));
}
