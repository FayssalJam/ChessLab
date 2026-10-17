import './style.css';
import { Chess } from 'chess.js';
import { Board } from './board.js';
import { START_FEN, safeChess, moveNumberPrefix } from './core.js';
import { engine, fmtScore, scoreCp, winChance } from './engine.js';
import { settings, saveSettings, SPEEDS, RATING_BANDS, myBand, higherBands, bandLabel } from './settings.js';
import { explorerPanel } from './panels/explorer-panel.js';
import { repertoirePanel } from './panels/repertoire-panel.js';
import { analysisPanel } from './panels/analysis-panel.js';
import { lessonsPanel } from './panels/lessons-panel.js';
import { trainingPanel } from './panels/training-panel.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.line = [{ fen: START_FEN }];
    this.idx = 0;
    this.listeners = { position: new Set(), eval: new Set() };
    this.interceptor = null;
    this.engineOwner = null; // 'analysis' par défaut ; un exercice peut le réserver
    this.lastEval = null;
    this.board = new Board($('#board'), { onMove: (uci) => this.userMove(uci) });
    this.board.setOrientation(settings.color);
  }

  fen() { return this.line[this.idx].fen; }
  turn() { return this.fen().split(' ')[1]; }
  on(evt, cb) { this.listeners[evt].add(cb); return () => this.listeners[evt].delete(cb); }
  emit(evt, ...a) { for (const cb of this.listeners[evt]) cb(...a); }

  userMove(uci) {
    if (this.interceptor) { this.interceptor(uci); return; }
    if (!this.play(uci)) this.refresh();
  }

  /** Joue un coup (UCI ou SAN) depuis la position courante ; tronque la suite si on était revenu en arrière. */
  play(move) {
    const c = new Chess(this.fen());
    let m;
    try {
      m = typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
        ? c.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })
        : c.move(move);
    } catch { return null; }
    const next = this.line[this.idx + 1];
    if (next && next.fen === c.fen()) { this.goto(this.idx + 1); return m; }
    this.line = this.line.slice(0, this.idx + 1);
    this.line.push({ fen: c.fen(), san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to });
    this.goto(this.idx + 1);
    return m;
  }

  goto(i) {
    this.idx = Math.max(0, Math.min(this.line.length - 1, i));
    this.refresh();
    this.emit('position', this.fen());
  }

  refresh() {
    const cur = this.line[this.idx];
    this.board.set(cur.fen, { lastMove: cur.from ? [cur.from, cur.to] : undefined });
    this.renderMoves();
    this.runEval();
  }

  load(fen, moves = []) {
    const c = safeChess(fen);
    if (!c) { this.toast('FEN invalide'); return false; }
    this.line = [{ fen: c.fen() }];
    this.idx = 0;
    for (const mv of moves) {
      let m;
      try { m = c.move(mv); } catch { break; }
      this.line.push({ fen: c.fen(), san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to });
    }
    this.goto(this.line.length - 1);
    return true;
  }

  loadPgn(pgn) {
    const c = new Chess();
    try { c.loadPgn(pgn); } catch { this.toast('PGN illisible'); return false; }
    const hdr = c.header();
    const start = hdr.FEN || START_FEN;
    return this.load(start, c.history());
  }

  setShapes(s) { this.board.shapes(s); }

  renderMoves() {
    const el = $('#moves');
    const base = this.line[0].fen;
    el.innerHTML = this.line.slice(1).map((n, i) => {
      const p = moveNumberPrefix(base, i);
      return (p ? `<span class="num">${p}</span>` : '') + `<span class="mv${i + 1 === this.idx ? ' cur' : ''}" data-i="${i + 1}">${n.san}</span>`;
    }).join(' ');
    el.querySelectorAll('.mv').forEach((s) => (s.onclick = () => this.goto(+s.dataset.i)));
    const cur = el.querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  // Évaluation continue (barre d'éval + lignes pour le panneau Analyse)
  runEval() {
    if (this.engineOwner) return;
    const fen = this.fen();
    const c = new Chess(fen);
    if (c.isGameOver()) { this.showEval(null, fen); return; }
    engine.analyze(fen, { depth: settings.engineDepth, multipv: 3 }, (lines) => {
      if (fen !== this.fen()) return;
      this.lastEval = { fen, lines };
      this.showEval(lines[0], fen);
      this.emit('eval', fen, lines);
    }).catch(() => { $('#eval-text').textContent = 'moteur indisponible'; });
  }

  showEval(line, fen) {
    const c = new Chess(fen);
    let cp = 0, txt = '';
    if (!line) {
      if (c.isCheckmate()) { cp = c.turn() === 'w' ? -10000 : 10000; txt = 'Mat'; }
      else if (c.isDraw() || c.isStalemate()) txt = 'Nulle';
    } else { cp = scoreCp(line.score); txt = `${fmtScore(line.score)}  (prof. ${line.depth})`; }
    $('#eval-fill').style.width = (winChance(cp) * 100).toFixed(1) + '%';
    $('#eval-text').textContent = txt;
  }

  /** Réserve le moteur (exercices, partie contre l'ordinateur) ; null pour le rendre à l'analyse. */
  claimEngine(owner) {
    this.engineOwner = owner;
    if (!owner) this.runEval(); else engine.stop();
  }

  toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => t.classList.remove('show'), ms);
  }
}

const app = new App();
window.app = app; // pratique pour déboguer dans la console

// --- Panneaux ---
const panels = {
  explorer: explorerPanel, repertoire: repertoirePanel, analysis: analysisPanel, lessons: lessonsPanel, training: trainingPanel,
};
for (const [id, p] of Object.entries(panels)) p.mount($('#panel-' + id), app);
let active = 'explorer';
function showTab(id) {
  if (panels[active].hide) panels[active].hide();
  active = id;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + id));
  app.setShapes([]);
  if (panels[id].show) panels[id].show();
  try { localStorage.setItem('cc.tab', id); } catch { /* ignore */ }
}
app.showTab = showTab;
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
app.on('position', (fen) => { if (panels[active].position) panels[active].position(fen); });
app.on('eval', (fen, lines) => { if (panels[active].eval) panels[active].eval(fen, lines); });

// chessground mesure l'échiquier une seule fois : on le redessine quand la taille change.
new ResizeObserver(() => app.board.cg.redrawAll()).observe(document.getElementById('board-wrap'));

// --- Navigation ---
$('#nav-start').onclick = () => !app.interceptor && app.goto(0);
$('#nav-prev').onclick = () => !app.interceptor && app.goto(app.idx - 1);
$('#nav-next').onclick = () => !app.interceptor && app.goto(app.idx + 1);
$('#nav-end').onclick = () => !app.interceptor && app.goto(app.line.length - 1);
$('#flip').onclick = () => app.board.flip();
$('#reset').onclick = () => { if (app.interceptor && panels[active].abort) panels[active].abort(); app.load(START_FEN); };
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || app.interceptor) return;
  if (e.key === 'ArrowLeft') app.goto(app.idx - 1);
  else if (e.key === 'ArrowRight') app.goto(app.idx + 1);
  else if (e.key === 'f') app.board.flip();
});

// --- Charger FEN/PGN ---
$('#load-btn').onclick = () => {
  const d = $('#load-dlg');
  d.innerHTML = `<h2>Charger une position ou une partie</h2>
    <label>FEN ou PGN (ou suite de coups : 1.e4 e5 2.Nf3…)</label>
    <textarea id="load-txt" rows="7" placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"></textarea>
    <p class="small muted">FEN actuel : <code style="user-select:all">${app.fen()}</code></p>
    <div class="row" style="justify-content:flex-end"><button id="load-cancel">Annuler</button><button class="primary" id="load-ok">Charger</button></div>`;
  d.showModal();
  $('#load-cancel').onclick = () => d.close();
  $('#load-ok').onclick = () => {
    const t = $('#load-txt').value.trim();
    if (!t) return;
    const ok = /^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s/.test(t + ' ') ? app.load(t) : app.loadPgn(t);
    if (ok) d.close();
  };
};

// --- Réglages ---
$('#settings-btn').onclick = () => {
  const d = $('#settings-dlg');
  d.innerHTML = `<h2>Réglages</h2>
    <label>Mon Elo (Lichess)</label><input id="s-rating" type="number" min="400" max="3000" step="50" value="${settings.rating}">
    <p class="small muted">Tranche « mon niveau » : <b id="s-band"></b> · « niveau supérieur » : <b id="s-high"></b></p>
    <label>Niveau supérieur = combien de tranches au-dessus ?</label>
    <select id="s-steps">${[1, 2, 3, 4].map((n) => `<option ${n === settings.higherSteps ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label>Cadences prises en compte</label>
    <div class="row">${SPEEDS.map((s) => `<label style="font-weight:400;margin:0"><input type="checkbox" value="${s}" ${settings.speeds.includes(s) ? 'checked' : ''} class="s-speed"> ${s}</label>`).join('')}</div>
    <label>Je joue principalement avec</label>
    <select id="s-color"><option value="w" ${settings.color === 'w' ? 'selected' : ''}>les Blancs</option><option value="b" ${settings.color === 'b' ? 'selected' : ''}>les Noirs</option></select>
    <label>Minimum de parties pour recommander un coup</label><input id="s-min" type="number" min="5" max="1000" value="${settings.minGames}">
    <label>Profondeur d'analyse Stockfish</label><input id="s-depth" type="number" min="8" max="30" value="${settings.engineDepth}">
    <label>Jeton d'API Lichess (optionnel)</label><input id="s-token" type="password" value="${settings.token}" placeholder="lip_…" style="width:100%">
    <p class="small muted">Si l'explorateur exige une connexion, créez un jeton sans permission sur lichess.org/account/oauth/token. Il reste dans votre navigateur.</p>
    <div class="row" style="justify-content:flex-end"><button class="primary" id="s-ok">Enregistrer</button></div>`;
  const upd = () => {
    const r = +$('#s-rating').value || 1500;
    const steps = +$('#s-steps').value;
    const i = RATING_BANDS.indexOf(myBand(r));
    $('#s-band').textContent = bandLabel([myBand(r)]);
    $('#s-high').textContent = bandLabel(RATING_BANDS.slice(i + 1, i + 1 + steps));
  };
  d.querySelectorAll('input,select').forEach((x) => (x.oninput = upd));
  upd();
  d.showModal();
  $('#s-ok').onclick = () => {
    saveSettings({
      rating: +$('#s-rating').value || 1500,
      higherSteps: +$('#s-steps').value,
      speeds: [...d.querySelectorAll('.s-speed:checked')].map((x) => x.value),
      color: $('#s-color').value,
      minGames: +$('#s-min').value || 30,
      engineDepth: +$('#s-depth').value || 18,
      token: $('#s-token').value.trim(),
    });
    d.close();
    app.board.setOrientation(settings.color);
    app.toast(`Réglages enregistrés : mon niveau ${bandLabel([myBand()])}, supérieur ${bandLabel(higherBands())}`);
    app.emit('position', app.fen());
  };
};

let first = 'explorer';
try { first = localStorage.getItem('cc.tab') || 'explorer'; } catch { /* ignore */ }
showTab(panels[first] ? first : 'explorer');
app.goto(0);
