// Onglet « Scanner & Plan » : faiblesses détectées instantanément, plan de jeu, lignes du moteur, revue de partie.
import { Chess } from 'chess.js';
import { scan, KIND_LABEL } from '../scanner.js';
import { buildPlan } from '../structures.js';
import { engine, fmtScore, scoreCp, winChance } from '../engine.js';
import { SIDE, formatLine } from '../core.js';

export const analysisPanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.filter = 'all';
    this.planFor = 'auto';
    this.review = null;
  },
  show() { this.position(this.app.fen()); },
  hide() { this.app.setShapes([]); },

  position(fen) {
    let findings = [];
    try { findings = scan(fen); } catch (e) { console.error(e); }
    this.findings = findings;
    const me = this.planFor === 'auto' ? this.app.board.orientationColor : this.planFor;
    let plan = null;
    try { plan = buildPlan(fen, me); } catch (e) { console.error(e); }
    const turn = fen.split(' ')[1];
    const shown = findings.filter((f) => this.filter === 'all' || (this.filter === 'me' ? f.for === me : f.for !== me));

    this.el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Scanner de position</h2>
          <select id="an-filter">
            <option value="all" ${this.filter === 'all' ? 'selected' : ''}>Tout</option>
            <option value="me" ${this.filter === 'me' ? 'selected' : ''}>Mes opportunités</option>
            <option value="them" ${this.filter === 'them' ? 'selected' : ''}>Mes dangers</option>
          </select>
        </div>
        <p class="small muted">Trait aux <b>${SIDE[turn]}</b>. Cliquez un constat pour le voir sur l'échiquier. Vert = vos idées, rouge = celles de l'adversaire.</p>
        <div id="an-findings">${shown.length ? shown.map((f, i) => `
          <div class="finding ${f.severity}" data-i="${findings.indexOf(f)}">
            <span class="who">${KIND_LABEL[f.kind] || ''} · pour ${SIDE[f.for]}${f.now ? ' · <b>maintenant</b>' : ''}</span>
            <div class="t">${f.title}</div><div class="small">${f.text}</div>
          </div>`).join('') : '<p class="muted">Rien de flagrant : position calme. Pensez plan (ci-dessous) et améliorez votre pire pièce.</p>'}</div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><b>Stockfish</b><span class="small muted" id="an-depth"></span></div>
        <div id="an-lines" class="small muted">Analyse…</div>
      </div>
      <div class="card plan">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Plan de jeu</h2>
          <select id="an-planfor">
            <option value="auto" ${this.planFor === 'auto' ? 'selected' : ''}>pour le camp en bas</option>
            <option value="w" ${this.planFor === 'w' ? 'selected' : ''}>pour les Blancs</option>
            <option value="b" ${this.planFor === 'b' ? 'selected' : ''}>pour les Noirs</option>
          </select>
        </div>
        ${plan ? this.planHtml(plan, me) : '<p class="err">Plan indisponible</p>'}
      </div>
      <div class="card">
        <b>Revue de partie</b>
        <p class="small muted">Chargez une partie (📋 FEN/PGN) puis analysez-la : chaque erreur est reliée au motif manqué.</p>
        <div class="row"><button id="an-review" class="primary">Analyser la partie (${this.app.line.length - 1} demi-coups)</button><select id="an-rv-side"><option value="both">les deux camps</option><option value="w">Blancs</option><option value="b">Noirs</option></select></div>
        <div class="progress"><div id="an-rv-prog"></div></div>
        <div id="an-review-out">${this.review ? this.reviewHtml() : ''}</div>
      </div>`;

    const $ = (s) => this.el.querySelector(s);
    $('#an-filter').onchange = (e) => { this.filter = e.target.value; this.position(this.app.fen()); };
    $('#an-planfor').onchange = (e) => { this.planFor = e.target.value; this.position(this.app.fen()); };
    this.el.querySelectorAll('.finding').forEach((d) => (d.onclick = () => this.app.setShapes(findings[+d.dataset.i].shapes)));
    $('#an-review').onclick = () => this.runReview($('#an-rv-side').value);
    this.bindReview();
    // Par défaut : on dessine les constats graves
    this.app.setShapes(shown.filter((f) => f.severity === 'high').slice(0, 3).flatMap((f) => f.shapes));
    if (this.app.lastEval && this.app.lastEval.fen === fen) this.eval(fen, this.app.lastEval.lines);
  },

  planHtml(plan, me) {
    const sec = (title, items) => (items.length ? `<h3>${title}</h3><ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>` : '');
    const st = plan.steps;
    return `<p class="small muted">Pour les <b>${SIDE[me]}</b>. ${plan.materialNote}</p>
      ${plan.structures.length ? `<div>${plan.structures.map((s) => `<span class="tag">${s.name}</span>`).join('')}</div>` : ''}
      ${st.structure.map((s) => sec('Structure : ' + s.name, s.lines)).join('')}
      ${sec('♟ Que faire avec mes pions', st.pawns)}
      ${sec('♞ Mes pièces', st.pieces)}
      ${sec('🎯 Faiblesses adverses à exploiter', st.targets)}
      ${sec('🛡 Prophylaxie (ce que veut l\'adversaire)', st.prophylaxis)}
      ${!st.pawns.length && !st.pieces.length && !st.targets.length && !st.structure.length ? '<p class="muted">Aucune particularité structurelle : développez, centralisez, roquez.</p>' : ''}`;
  },

  eval(fen, lines) {
    if (fen !== this.app.fen()) return;
    const box = this.el.querySelector('#an-lines');
    if (!box) return;
    this.el.querySelector('#an-depth').textContent = lines[0] ? `profondeur ${lines[0].depth}` : '';
    box.classList.remove('muted');
    box.innerHTML = lines.map((l, i) => `<div class="pv" data-i="${i}"><b>${fmtScore(l.score)}</b> ${formatLine(fen, l.san.slice(0, 10))}</div>`).join('');
    box.querySelectorAll('.pv').forEach((d) => (d.onclick = () => { const l = lines[+d.dataset.i]; this.app.play(l.pv[0]); }));
  },

  // --- Revue de partie ---
  async runReview(side) {
    const line = this.app.line;
    if (line.length < 2) { this.app.toast('Chargez d\'abord une partie'); return; }
    this.app.claimEngine('review');
    const evals = [];
    const prog = this.el.querySelector('#an-rv-prog');
    try {
      for (let i = 0; i < line.length; i++) {
        const fen = line[i].fen;
        const c = new Chess(fen);
        if (c.isCheckmate()) evals.push({ cp: c.turn() === 'w' ? -10000 : 10000, best: null });
        else if (c.isGameOver()) evals.push({ cp: 0, best: null });
        else {
          const r = await engine.analyze(fen, { depth: 12, multipv: 1 });
          const l = r && r.lines[0];
          evals.push({ cp: l ? scoreCp(l.score) : 0, best: l ? l.san[0] : null, bestUci: l ? l.pv[0] : null });
        }
        if (prog) prog.style.width = ((i + 1) / line.length * 100) + '%';
      }
    } finally {
      this.app.claimEngine(null);
    }
    const mistakes = [];
    for (let i = 1; i < line.length; i++) {
      const mover = line[i - 1].fen.split(' ')[1];
      if (side !== 'both' && side !== mover) continue;
      const sgn = mover === 'w' ? 1 : -1;
      const before = winChance(sgn * evals[i - 1].cp), after = winChance(sgn * evals[i].cp);
      const drop = before - after;
      if (drop < 0.1 || line[i].uci === evals[i - 1].bestUci) continue;
      const kind = drop >= 0.3 ? 'Gaffe' : drop >= 0.2 ? 'Erreur' : 'Imprécision';
      // Motifs que le joueur avait (avant) et qu'il a offerts (après)
      const missed = scan(line[i - 1].fen).filter((f) => f.for === mover && f.now && f.severity !== 'low' && f.move !== line[i].san).slice(0, 2);
      const allowed = scan(line[i].fen).filter((f) => f.for !== mover && f.now && f.severity === 'high').slice(0, 2);
      mistakes.push({ i, kind, san: line[i].san, best: evals[i - 1].best, drop, mover, missed, allowed, fen: line[i - 1].fen });
    }
    this.review = { mistakes, evals };
    this.el.querySelector('#an-review-out').innerHTML = this.reviewHtml();
    this.bindReview();
  },
  reviewHtml() {
    const { mistakes } = this.review;
    if (!mistakes.length) return '<p class="status-ok">Aucune erreur notable détectée à profondeur 12.</p>';
    const counts = { Gaffe: 0, Erreur: 0, Imprécision: 0 };
    for (const m of mistakes) counts[m.kind]++;
    const themes = {};
    for (const m of mistakes) for (const f of [...m.missed, ...m.allowed]) themes[KIND_LABEL[f.kind]] = (themes[KIND_LABEL[f.kind]] || 0) + 1;
    return `<p class="small">${counts.Gaffe} gaffe(s) · ${counts.Erreur} erreur(s) · ${counts.Imprécision} imprécision(s)</p>
      ${Object.keys(themes).length ? `<p class="small">Motifs en cause : ${Object.entries(themes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="tag">${k} ×${v}</span>`).join('')} → entraînez-les dans l'onglet Entraînement.</p>` : ''}
      ${mistakes.map((m, k) => `<div class="finding ${m.kind === 'Gaffe' ? 'high' : m.kind === 'Erreur' ? 'medium' : 'low'}" data-k="${k}">
        <span class="who">${SIDE[m.mover]} · −${(m.drop * 100).toFixed(0)}% de chances</span>
        <div class="t">${Math.ceil(m.i / 2)}${m.mover === 'w' ? '.' : '…'} ${m.san} ? (${m.kind}) — meilleur : ${m.best || '?'}</div>
        <div class="small">${m.missed.length ? 'Manqué : ' + m.missed.map((f) => f.title).join(' ; ') + '. ' : ''}${m.allowed.length ? 'Permet : ' + m.allowed.map((f) => f.title).join(' ; ') + '.' : ''}</div>
      </div>`).join('')}`;
  },
  bindReview() {
    this.el.querySelectorAll('#an-review-out .finding').forEach((d) => (d.onclick = () => {
      const m = this.review.mistakes[+d.dataset.k];
      this.app.goto(m.i - 1);
    }));
  },
};
