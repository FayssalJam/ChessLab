// Onglet « Entraînement » : reconnaissance éclair, puzzles Lichess par thème, partie coachée contre Stockfish.
import { Chess } from 'chess.js';
import { ALL_EXERCISES } from '../lessons-data.js';
import { ExerciseRunner, exStats } from '../exercise.js';
import { engine } from '../engine.js';
import { scan } from '../scanner.js';
import { settings } from '../settings.js';
import { START_FEN } from '../core.js';

const LICHESS_THEMES = {
  fork: 'Fourchette', pin: 'Clouage', skewer: 'Enfilade', discoveredAttack: 'Attaque à la découverte', doubleCheck: 'Échec double',
  hangingPiece: 'Pièce en prise', trappedPiece: 'Pièce piégée', backRankMate: 'Mat du couloir', smotheredMate: 'Mat étouffé',
  deflection: 'Déviation', attraction: 'Attraction', interference: 'Interception', intermezzo: 'Coup intermédiaire', xRayAttack: 'Rayons X',
  sacrifice: 'Sacrifice', kingsideAttack: 'Attaque sur le roque', mateIn1: 'Mat en 1', mateIn2: 'Mat en 2', mateIn3: 'Mat en 3',
  zugzwang: 'Zugzwang', pawnEndgame: 'Finale de pions', rookEndgame: 'Finale de tours', endgame: 'Finale', opening: 'Ouverture', middlegame: 'Milieu de partie',
};

export const trainingPanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.session = { ok: 0, ko: 0, streak: 0 };
    this.runner = new ExerciseRunner(app, {
      onStatus: (h) => { const s = this.el.querySelector('#tr-status'); if (s) s.innerHTML = h; },
      onDone: (ex, ok) => this.onDone(ex, ok),
    });
    this.game = null;
  },
  show() { this.render(); },
  hide() { this.stopAll(); },
  abort() { this.stopAll(); },
  stopAll() {
    this.runner.stop();
    clearInterval(this.timer);
    if (this.game) { this.game = null; this.app.interceptor = null; this.app.claimEngine(null); }
  },

  render() {
    const themes = [...new Set(ALL_EXERCISES.map((e) => e.theme))];
    this.el.innerHTML = `
      <div class="card">
        <h2>⚡ Reconnaissance éclair</h2>
        <p class="small muted">Positions des cours, tirées au hasard (les ratées reviennent en priorité). Le chrono entraîne la reconnaissance instantanée des motifs.</p>
        <div class="row">
          <select id="tr-cat"><option value="">Tous les thèmes</option><option value="Tactique">Tactique</option><option value="Finales">Finales</option>${themes.map((t) => `<option value="t:${t}">${LICHESS_THEMES[t] || t}</option>`).join('')}</select>
          <button class="primary" id="tr-go">Position suivante</button>
          <button id="tr-hint">💡</button><button id="tr-sol">Solution</button>
          <span class="small" id="tr-score">Session : ${this.session.ok} ✔ · ${this.session.ko} ✘ · série ${this.session.streak}</span>
          <span class="small" id="tr-clock"></span>
        </div>
        <div class="ex-box"><div id="tr-status" class="small">Cliquez « Position suivante ».</div></div>
      </div>

      <div class="card">
        <h2>🧩 Puzzles Lichess par thème</h2>
        <p class="small muted">Problèmes issus de vraies parties (nécessite internet). Choisissez un motif à travailler.</p>
        <div class="row"><select id="tr-lt">${Object.entries(LICHESS_THEMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button id="tr-lgo" class="primary">Charger un puzzle</button></div>
        <div id="tr-lmsg" class="small"></div>
      </div>

      <div class="card">
        <h2>🤖 Partie coachée contre Stockfish</h2>
        <p class="small muted">Jouez à partir de la position actuelle de l'échiquier. Après chaque coup adverse, le coach vous dit s'il existe une opportunité tactique ou un danger, sans donner la réponse.</p>
        <div class="row">
          <label class="small">Elo du moteur <input id="tr-elo" type="number" min="600" max="3000" step="50" value="${Math.max(800, settings.rating + 100)}" style="width:80px"></label>
          <select id="tr-gcolor"><option value="w">Je joue les Blancs</option><option value="b">Je joue les Noirs</option></select>
          <label class="small"><input type="checkbox" id="tr-coach" checked> coach actif</label>
          <button id="tr-gstart" class="primary">Jouer</button><button id="tr-gstop">Abandonner</button>
        </div>
        <div id="tr-gmsg" class="ex-box small" style="display:none"></div>
      </div>

      <div class="card"><h2>📊 Mes statistiques par thème</h2><div id="tr-stats" class="small"></div></div>`;
    const $ = (s) => this.el.querySelector(s);
    $('#tr-go').onclick = () => this.next();
    $('#tr-hint').onclick = () => this.runner.hint();
    $('#tr-sol').onclick = () => this.runner.showSolution();
    $('#tr-lgo').onclick = () => this.lichessPuzzle($('#tr-lt').value);
    $('#tr-gstart').onclick = () => this.startGame();
    $('#tr-gstop').onclick = () => { this.stopAll(); this.gmsg('Partie arrêtée.'); };
    $('#tr-gcolor').value = settings.color;
    this.renderStats();
  },

  renderStats() {
    const byTheme = {};
    for (const e of ALL_EXERCISES) {
      const s = exStats[e.id];
      const t = LICHESS_THEMES[e.theme] || e.theme;
      byTheme[t] ||= { ok: 0, ko: 0, n: 0 };
      byTheme[t].n++;
      if (s) { byTheme[t].ok += s.ok; byTheme[t].ko += s.ko; }
    }
    for (const id in exStats) if (id.startsWith('lichess:')) {
      const t = LICHESS_THEMES[id.split(':')[1]] || id;
      byTheme[t] ||= { ok: 0, ko: 0, n: 0 };
      byTheme[t].ok += exStats[id].ok; byTheme[t].ko += exStats[id].ko;
    }
    const rows = Object.entries(byTheme).filter(([, v]) => v.ok + v.ko).sort((a, b) => a[1].ok / (a[1].ok + a[1].ko) - b[1].ok / (b[1].ok + b[1].ko));
    this.el.querySelector('#tr-stats').innerHTML = rows.length
      ? `<table class="tbl"><thead><tr><th>Thème</th><th>Réussis</th><th>Ratés</th><th>Taux</th></tr></thead><tbody>${rows.map(([t, v]) => `<tr><td>${t}</td><td>${v.ok}</td><td>${v.ko}</td><td>${Math.round((v.ok / (v.ok + v.ko)) * 100)}%</td></tr>`).join('')}</tbody></table><p class="muted">Les thèmes en haut sont vos points faibles : travaillez-les en priorité.</p>`
      : '<p class="muted">Pas encore de données.</p>';
  },

  pick() {
    const f = this.el.querySelector('#tr-cat').value;
    let pool = ALL_EXERCISES.filter((e) => e.type !== 'play' || f === 'Finales' || f.startsWith('t:'));
    if (f.startsWith('t:')) pool = pool.filter((e) => e.theme === f.slice(2));
    else if (f) pool = pool.filter((e) => e.cat === f);
    if (!pool.length) return null;
    // Priorité : jamais vus ou ratés la dernière fois
    const weight = (e) => { const s = exStats[e.id]; return !s ? 3 : s.lastOk === false ? 4 : 1; };
    const bag = pool.flatMap((e) => Array(weight(e)).fill(e)).filter((e) => !this.lastId || e.id !== this.lastId || pool.length === 1);
    return bag[Math.floor(Math.random() * bag.length)];
  },

  next() {
    this.stopAll();
    const ex = this.pick();
    if (!ex) return;
    this.lastId = ex.id;
    this.t0 = Date.now();
    this.runner.start(ex);
    const clock = this.el.querySelector('#tr-clock');
    this.timer = setInterval(() => { clock.textContent = '⏱ ' + ((Date.now() - this.t0) / 1000).toFixed(0) + ' s'; }, 250);
    this.el.querySelector('#tr-status').insertAdjacentHTML('afterbegin', `<b>${ex.title}</b> · `);
  },

  onDone(ex, ok) {
    clearInterval(this.timer);
    const secs = ((Date.now() - this.t0) / 1000).toFixed(1);
    if (ok) { this.session.ok++; this.session.streak++; } else { this.session.ko++; this.session.streak = 0; }
    const sc = this.el.querySelector('#tr-score');
    if (sc) sc.textContent = `Session : ${this.session.ok} ✔ · ${this.session.ko} ✘ · série ${this.session.streak}`;
    const st = this.el.querySelector('#tr-status');
    if (st && ok) st.insertAdjacentHTML('beforeend', ` en ${secs} s${secs < 10 ? ' ⚡ réflexe acquis' : ''}`);
    this.renderStats();
  },

  async lichessPuzzle(theme) {
    this.stopAll();
    const msg = this.el.querySelector('#tr-lmsg');
    msg.textContent = 'Chargement…';
    try {
      const headers = settings.token ? { Authorization: 'Bearer ' + settings.token } : {};
      const res = await fetch(`https://lichess.org/api/puzzle/next?angle=${theme}`, { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const c = new Chess();
      c.loadPgn(data.game.pgn);
      const fen = c.fen();
      const sol = [];
      const t = new Chess(fen);
      for (const u of data.puzzle.solution) sol.push(t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      msg.innerHTML = `Puzzle <a href="https://lichess.org/training/${data.puzzle.id}" target="_blank" rel="noopener">#${data.puzzle.id}</a> · difficulté ${data.puzzle.rating} · thèmes : ${data.puzzle.themes.map((x) => LICHESS_THEMES[x] || x).join(', ')}`;
      this.t0 = Date.now();
      this.runner.start({ id: `lichess:${theme}:${data.puzzle.id}`, title: LICHESS_THEMES[theme], fen, type: 'line', solution: sol, theme });
    } catch (e) {
      msg.innerHTML = `<span class="err">Impossible de charger un puzzle (${e.message}).</span> Utilisez la reconnaissance éclair hors ligne, ou ajoutez un jeton Lichess dans ⚙.`;
    }
  },

  // --- Partie coachée ---
  gmsg(html) { const m = this.el.querySelector('#tr-gmsg'); if (m) { m.style.display = 'block'; m.innerHTML = html; } },
  startGame() {
    this.stopAll();
    const color = this.el.querySelector('#tr-gcolor').value;
    const elo = +this.el.querySelector('#tr-elo').value;
    const coach = this.el.querySelector('#tr-coach').checked;
    const c = new Chess(this.app.fen());
    if (c.isGameOver()) this.app.load(START_FEN);
    this.game = { color, elo, coach };
    this.app.claimEngine('game');
    this.app.board.setOrientation(color);
    this.app.interceptor = (uci) => this.onGameMove(uci);
    this.gmsg(`Partie lancée contre Stockfish ~${elo} Elo.`);
    if (this.app.turn() !== color) this.engineMove();
    else this.app.refresh();
  },
  onGameMove(uci) {
    const g = this.game;
    if (!g || this.app.turn() !== g.color || g.thinking) { this.app.refresh(); return; }
    const before = this.app.fen();
    const m = this.app.play(uci);
    if (!m) { this.app.refresh(); return; }
    // Alerte : ai-je laissé une tactique à l'adversaire ?
    if (g.coach) {
      const danger = scan(this.app.fen()).filter((f) => f.for !== g.color && f.now && f.severity === 'high');
      if (danger.length) this.gmsg(`⚠ Après ${m.san}, l'adversaire a peut-être une tactique (${danger.length}). Il pourrait la trouver…`);
    }
    if (this.over()) return;
    this.engineMove(before);
  },
  async engineMove() {
    const g = this.game;
    g.thinking = true;
    const r = await engine.analyze(this.app.fen(), { movetime: 700, elo: g.elo });
    g.thinking = false;
    if (this.game !== g || !r) return;
    this.app.play(r.bestmove);
    if (this.over()) return;
    if (g.coach) {
      const f = scan(this.app.fen());
      const opp = f.filter((x) => x.for === g.color && x.now && x.severity === 'high');
      const dang = f.filter((x) => x.for !== g.color && !x.now && x.severity === 'high');
      const parts = [];
      if (opp.length) parts.push(`⚡ <b>Opportunité !</b> ${opp.length} motif(s) à exploiter. <button class="ghost" id="tr-reveal">Montrer</button>`);
      if (dang.length) parts.push(`🛡 <b>Menace adverse</b> : ${dang.map((x) => x.title).join(' ; ')}`);
      this.gmsg(parts.length ? parts.join('<br>') : 'À vous. Rien de tactique en vue : améliorez votre plus mauvaise pièce.');
      const rv = this.el.querySelector('#tr-reveal');
      if (rv) rv.onclick = () => { this.gmsg(opp.map((x) => `• ${x.title}`).join('<br>')); this.app.setShapes(opp.flatMap((x) => x.shapes)); };
    } else this.gmsg('À vous.');
  },
  over() {
    const c = new Chess(this.app.fen());
    if (!c.isGameOver()) return false;
    const res = c.isCheckmate() ? (c.turn() === this.game.color ? 'Vous êtes maté.' : 'Mat ! Bravo.') : 'Partie nulle.';
    this.gmsg(res + ' Passez à l\'onglet Scanner & Plan → « Analyser la partie » pour la revue.');
    this.game = null;
    this.app.interceptor = null;
    this.app.claimEngine(null);
    return true;
  },
};
