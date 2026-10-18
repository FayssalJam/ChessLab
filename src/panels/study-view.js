// Vue « Étudier » de l'onglet Ouvertures : carte d'identité de l'ouverture, points clés,
// et arbre complet « réponse adverse → mon meilleur coup », construit d'un seul coup.
import { buildStudy, nodeAt, allNodes, mainLine, fenAfter, findOpening, playSan } from '../study.js';
import { OPENINGS, FAMILIES } from '../openings.js';
import { buildPlan } from '../structures.js';
import { total, scoreFor } from '../explorer.js';
import { settings, rangeLabel, restore, store } from '../settings.js';
import { rep, saveRep } from '../repertoire.js';
import { QUALITY, qualityIndex, qualityBrush, prettySan } from '../colors.js';
import { START_FEN, posKey } from '../core.js';

const KEY = 'cc.study.v1';
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n));
const qc = (s) => QUALITY[qualityIndex(s)];

/** « 3… Nf6 » à partir de la position avant le coup. */
function label(fen, san) {
  const [, turn, , , , full] = fen.split(' ');
  return `<span class="st-num">${full}${turn === 'w' ? '.' : '…'}</span>${prettySan(san)}`;
}
function formatMoves(sans) {
  return sans.map((m, i) => (i % 2 === 0 ? `<b>${i / 2 + 1}.</b>` : '') + prettySan(m)).join(' ');
}

export class StudyView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.gen = 0;
    this.closed = new Set();
    this.study = restore(KEY, null);
    const groups = FAMILIES.map((f) => `<optgroup label="${f}">${OPENINGS.map((o, i) => (o.family === f ? `<option value="${i}">${o.name} (${o.eco})</option>` : '')).join('')}</optgroup>`).join('');
    el.innerHTML = `
      <div class="glass st-head">
        <div class="xp-row">
          <select id="st-pick"><option value="">Choisir une ouverture…</option><option value="here">♟ Position actuelle de l'échiquier</option>${groups}</select>
          <div class="seg small" id="st-side"><button data-s="w">⚪ Je joue les Blancs</button><button data-s="b">⚫ Je joue les Noirs</button></div>
        </div>
        <div class="xp-row" style="margin-top:8px">
          <div class="seg small" id="st-depth"><span class="seg-label">Profondeur</span><button data-d="4">2 coups</button><button data-d="6">3 coups</button><button data-d="8">4 coups</button></div>
          <button id="st-rep" class="small" title="Enregistre vos coups recommandés et les réponses adverses dans « Mon répertoire » pour les réviser">📌 Ajouter à mon répertoire</button>
        </div>
      </div>
      <div id="st-body"></div>`;
    const $ = (s) => el.querySelector(s);
    $('#st-pick').onchange = (e) => {
      const v = e.target.value;
      if (v === 'here') this.openHere();
      else if (v !== '') { const o = OPENINGS[+v]; this.open({ name: o.name, eco: o.eco, idea: o.idea, sans: o.moves.split(' '), me: o.side }); }
    };
    $('#st-side').onclick = (e) => { const b = e.target.closest('button'); if (b && this.study) this.open({ ...this.study, me: b.dataset.s }); };
    $('#st-depth').onclick = (e) => { const b = e.target.closest('button'); if (b && this.study) this.open({ ...this.study, depth: +b.dataset.d }); };
    $('#st-rep').onclick = () => this.addToRepertoire();
    $('#st-body').addEventListener('click', (e) => {
      const mv = e.target.closest('[data-path]');
      if (!mv || !this.study) return;
      e.preventDefault(); // ne pas replier la branche en cliquant un coup
      const path = mv.dataset.path ? mv.dataset.path.split(' ') : [];
      this.app.load(START_FEN, [...this.study.sans, ...path]);
    });
    $('#st-body').addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.dataset && d.dataset.key != null) d.open ? this.closed.delete(d.dataset.key) : this.closed.add(d.dataset.key);
    }, true);
  }

  /** Ouverture reconnue sur l'échiquier (bibliothèque) ou, à défaut, position actuelle avec le nom Lichess. */
  openHere(lichessOpening) {
    const { line, idx } = this.app;
    if (line[0].fen !== START_FEN) { this.app.toast("L'étude part de la position initiale : rechargez une partie normale."); return; }
    const sans = line.slice(1, idx + 1).map((n) => n.san);
    const o = findOpening(sans);
    const me = this.app.board.orientationColor;
    if (o && o.moves.split(' ').length === sans.length) this.open({ name: o.name, eco: o.eco, idea: o.idea, sans, me });
    else this.open({ name: lichessOpening ? lichessOpening.name : o ? `${o.name} (suite)` : 'Position actuelle', eco: lichessOpening ? lichessOpening.eco : o ? o.eco : '', idea: o ? o.idea : null, sans, me });
  }

  open(study) {
    this.study = { depth: 6, ...study };
    store(KEY, this.study);
    this.closed.clear();
    this.root = null;
    this.app.board.setOrientation(this.study.me);
    this.app.load(START_FEN, this.study.sans);
    this.show();
  }

  show() {
    const $ = (s) => this.el.querySelector(s);
    const s = this.study;
    $('#st-pick').value = s ? String(OPENINGS.findIndex((o) => o.name === s.name)) : '';
    if ($('#st-pick').value === '-1') $('#st-pick').value = '';
    this.el.querySelectorAll('#st-side button').forEach((b) => b.classList.toggle('on', !!s && b.dataset.s === s.me));
    this.el.querySelectorAll('#st-depth button').forEach((b) => b.classList.toggle('on', !!s && +b.dataset.d === s.depth));
    $('#st-rep').disabled = !this.root;
    if (!s) {
      $('#st-body').innerHTML = `<div class="glass xp-now"><p>Choisissez une ouverture dans la liste, cliquez une carte de la <b>📚 Bibliothèque</b>, ou jouez les premiers coups dans <b>🌳 Arbre</b> : l'ouverture est reconnue et vous pouvez l'étudier d'un clic.</p>
        <p class="muted small">ChessLab interroge alors l'explorateur Lichess pour toutes les réponses adverses jouées à votre niveau, et calcule pour chacune votre meilleur coup.</p></div>`;
      return;
    }
    if (!this.root || this.builtFor !== this.key()) this.build();
    else this.render();
  }

  key() { return [this.study.sans.join(' '), this.study.me, this.study.depth, settings.myRange, settings.targetRange, settings.speeds].join('|'); }

  stop() { this.gen++; }

  async build() {
    const gen = ++this.gen;
    this.builtFor = this.key();
    const rootFen = fenAfter(this.study.sans);
    this.root = { fen: rootFen, path: [], children: [], state: 'todo' };
    this.render();
    await buildStudy(rootFen, this.study.me, { depth: this.study.depth }, (root) => {
      if (gen !== this.gen) return;
      this.root = root;
      this.scheduleRender();
    }, () => gen !== this.gen);
    if (gen === this.gen) this.render();
  }

  scheduleRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
  }

  render() {
    const body = this.el.querySelector('#st-body');
    if (!body || !this.study) return;
    const s = this.study, root = this.root, me = s.me;
    const nodes = allNodes(root);
    const pending = nodes.filter((n) => n.state === 'todo').length;
    this.el.querySelector('#st-rep').disabled = !root.children.length;
    body.innerHTML = `
      ${this.identityHtml(s, root)}
      ${root.error ? `<div class="glass xp-now err">${root.error}</div>` : ''}
      ${this.keyPointsHtml(root, me)}
      <div class="glass xp-now">
        <div class="now-head"><div>
          <div class="now-opening">Toutes les branches</div>
          <div class="muted small">Réponses adverses jouées dans au moins 4 % des parties à votre niveau (${rangeLabel(settings.myRange)}), et votre meilleur coup ★ face à chacune (ce qui marque chez les ${rangeLabel(settings.targetRange)} et à votre niveau).</div>
        </div>${pending ? `<div class="st-progress"><span></span>${nodes.length - pending} positions analysées…</div>` : ''}</div>
        <div class="st-tree">${this.levelHtml(root, me) || (pending ? '<div class="skeleton"></div>' : '<p class="muted">Pas assez de parties dans cette position.</p>')}</div>
        <div class="muted small now-hint">« vous » = votre score à votre niveau quand la position est atteinte (rouge = difficile, vert = favorable). ⚠ = réponse qui vous pose problème : préparez-la en priorité. 🎁 = réponse adverse fautive : punissez-la. Cliquez un coup pour l'afficher sur l'échiquier.</div>
      </div>`;
    this.position(this.app.fen());
  }

  identityHtml(s, root) {
    const st = root.stats;
    const my = st && st.my, high = st && st.high;
    const name = s.name || (root.opening && root.opening.name) || 'Position étudiée';
    let plan = null;
    try { plan = buildPlan(root.fen, s.me); } catch { /* plan indisponible */ }
    const items = plan ? [...plan.steps.structure.flatMap((x) => x.lines).slice(0, 2), ...plan.steps.pawns.slice(0, 2), ...plan.steps.pieces.slice(0, 2), ...plan.steps.prophylaxis.slice(0, 1)] : [];
    return `<div class="glass xp-now">
      <div class="now-head">
        <div>
          <div class="now-opening">${s.eco ? `<span class="eco">${s.eco}</span> ` : ''}${name}</div>
          <div class="lib-moves">${formatMoves(s.sans) || 'Position initiale'}</div>
        </div>
        <div class="st-stats">
          ${my ? `<div><b>${fmtN(total(my))}</b><span>parties à votre niveau</span></div>
          <div><b style="color:${qc(scoreFor(my, s.me))}">${pct(scoreFor(my, s.me))}</b><span>votre score (${rangeLabel(settings.myRange)})</span></div>` : '<div class="skeleton" style="height:44px;width:160px"></div>'}
          ${high ? `<div><b style="color:${qc(scoreFor(high, s.me))}">${pct(scoreFor(high, s.me))}</b><span>chez les ${rangeLabel(settings.targetRange)}</span></div>` : ''}
        </div>
      </div>
      ${s.idea ? `<p class="st-idea">💡 ${s.idea}</p>` : ''}
      ${plan && (plan.structures.length || items.length) ? `<h3>Ce que vous visez (${s.me === 'w' ? 'Blancs' : 'Noirs'})</h3>
        ${plan.structures.length ? `<div>${plan.structures.map((x) => `<span class="tag">${x.name}</span>`).join('')}</div>` : ''}
        <ul class="st-plan">${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  keyPointsHtml(root, me) {
    const nodes = allNodes(root).filter((n) => n.move && !n.move.mine);
    if (!nodes.length) return '';
    const answer = (n) => (n.children[0] ? ` → répondez <b class="st-mv st-me" data-path="${n.children[0].path.join(' ')}">★ ${prettySan(n.children[0].move.san)}</b>` : '');
    const item = (n, extra) => `<li><span class="st-mv st-opp" data-path="${n.path.join(' ')}">${pathLabel(this.study.sans, n.path)}</span> ${extra}${answer(n)}</li>`;
    const mine = (n) => 1 - n.move.score;
    const dangers = nodes.filter((n) => mine(n) <= 0.45).sort((a, b) => b.move.share - a.move.share).slice(0, 5);
    const gifts = nodes.filter((n) => mine(n) >= 0.58 && n.move.share >= 0.05).sort((a, b) => b.move.share - a.move.share).slice(0, 5);
    const ml = mainLine(root);
    const first = root.children[0] && root.children[0].move.mine ? root.children[0] : root;
    const cover = first.covered;
    return `<div class="glass xp-now">
      <div class="now-opening" style="margin-bottom:6px">Points clés</div>
      ${ml.length ? `<p><b>Ligne principale à votre niveau :</b> <span class="lib-moves">${formatMoves([...this.study.sans, ...ml[ml.length - 1].path])}</span></p>` : ''}
      ${cover ? `<p class="small muted">Les branches ci-dessous couvrent ${pct(cover)} des réponses adverses au premier coup.</p>` : ''}
      <div class="st-cols">
        <div><h3>⚠ À préparer en priorité</h3>${dangers.length ? `<ul class="st-list">${dangers.map((n) => item(n, `<span class="muted small">(${pct(n.move.share)} des parties, vous y marquez <b style="color:${qc(mine(n))}">${pct(mine(n))}</b>)</span>`)).join('')}</ul>` : '<p class="muted small">Aucune réponse adverse vraiment gênante pour l\'instant.</p>'}</div>
        <div><h3>🎁 Erreurs adverses à punir</h3>${gifts.length ? `<ul class="st-list">${gifts.map((n) => item(n, `<span class="muted small">(${pct(n.move.share)}, vous y marquez <b style="color:${qc(mine(n))}">${pct(mine(n))}</b>)</span>`)).join('')}</ul>` : '<p class="muted small">Rien de fréquent à punir pour l\'instant.</p>'}</div>
      </div>
    </div>`;
  }

  /** Branches à partir d'une position : mon coup s'il est à moi, sinon une ligne par réponse adverse. */
  levelHtml(node, me) {
    if (node.state === 'todo') return '<div class="st-wait">analyse…</div>';
    if (node.state === 'end' && node.path.length) return '<div class="st-end muted small">Fin de la théorie à votre niveau : place au plan de jeu.</div>';
    if (!node.children.length) return '';
    const turn = node.fen.split(' ')[1];
    if (turn === me) {
      const a = node.children[0];
      return `<div class="st-row st-first">Votre coup : ${this.myMoveHtml(node, a)}</div>${this.levelHtml(a, me)}`;
    }
    return node.children.map((r) => {
      const a = r.children[0];
      const mine = 1 - r.move.score;
      const tag = mine <= 0.45 ? '<span class="st-badge bad">⚠ à préparer</span>' : mine >= 0.58 ? '<span class="st-badge good">🎁 à punir</span>' : '';
      const answer = r.state === 'todo' ? '<span class="st-wait">…</span>'
        : a ? `<span class="st-to">→</span>${this.myMoveHtml(r, a)}`
        : r.state === 'end' ? '<span class="muted small">fin de la théorie</span>' : '';
      const row = `<span class="st-mv st-opp" data-path="${r.path.join(' ')}">${label(node.fen, r.move.san)}</span>
        <span class="st-share" title="${r.move.games.toLocaleString('fr-FR')} parties"><i style="width:${Math.round(r.move.share * 100)}%"></i></span><span class="st-pct">${pct(r.move.share)}</span>
        <span class="st-score" style="color:${qc(mine)}">vous ${pct(mine)}</span>${tag}${answer}`;
      const kids = a ? this.levelHtml(a, me) : '';
      if (!kids) return `<div class="st-row st-leaf">${row}</div>`;
      const key = r.path.join(' ');
      return `<details class="st-node" data-key="${key}" ${this.closed.has(key) ? '' : 'open'}><summary class="st-row">${row}</summary><div class="st-kids">${kids}</div></details>`;
    }).join('');
  }

  myMoveHtml(parent, a) {
    const m = a.move;
    return `<span class="st-mv st-me" data-path="${a.path.join(' ')}">★ ${label(parent.fen, m.san)}</span>
      <span class="st-score" style="color:${qc(m.myScore)}" title="votre niveau">${pct(m.myScore)}</span>${m.highScore != null ? `<span class="st-score muted" title="niveau cible">cible ${pct(m.highScore)}</span>` : ''}
      ${m.alts.length ? `<span class="st-alts">ou ${m.alts.map((x) => prettySan(x.san)).join(', ')}</span>` : ''}`;
  }

  /** Surligne le coup affiché sur l'échiquier et dessine les suites de l'arbre en flèches. */
  position() {
    if (!this.root || !this.study) return;
    const { line, idx } = this.app;
    const sans = line.slice(1, idx + 1).map((n) => n.san);
    const base = this.study.sans;
    const inStudy = line[0].fen === START_FEN && sans.length >= base.length && base.every((s, i) => s === sans[i]);
    const rel = inStudy ? sans.slice(base.length) : null;
    this.el.querySelectorAll('.st-mv.cur').forEach((x) => x.classList.remove('cur'));
    if (rel) this.el.querySelectorAll(`.st-tree [data-path="${rel.join(' ')}"]`).forEach((x) => x.classList.add('cur'));
    const node = rel && nodeAt(this.root, rel);
    if (!node) { this.app.setShapes([]); return; }
    this.app.setShapes(node.children.map((c) => {
      const m = c.move;
      return m.mine
        ? { orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: 'yellow', label: { text: '★', fill: '#e6a100' } }
        : { orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: qualityBrush(1 - m.score), modifiers: { lineWidth: Math.round(5 + 13 * Math.sqrt(m.share)) }, label: { text: pct(m.share), fill: qc(1 - m.score) } };
    }));
  }

  /** Copie l'étude dans « Mon répertoire » : mes coups recommandés + les réponses adverses retenues. */
  addToRepertoire() {
    const s = this.study, me = s.me;
    if (!this.root) return;
    const R = rep[me];
    const setMine = (fen, san, uci) => { const k = posKey(fen); R[k] = { ...(R[k] || {}), fen, mine: { san, uci, auto: true } }; };
    const addReply = (fen, r) => {
      const k = posKey(fen);
      const node = (R[k] = { ...(R[k] || {}), fen });
      const list = node.replies ? [...node.replies] : [];
      if (!list.some((x) => x.uci === r.uci)) list.push(r);
      node.replies = list;
    };
    // Les coups de l'ouverture elle-même, depuis la position initiale
    let fen = START_FEN;
    for (const san of s.sans) {
      const { fen: next, uci } = playSan(fen, san);
      if (fen.split(' ')[1] === me) setMine(fen, san, uci); else addReply(fen, { uci, san, share: 1, score: null });
      fen = next;
    }
    let n = 0;
    for (const node of allNodes(this.root)) for (const c of node.children) {
      if (c.move.mine) setMine(node.fen, c.move.san, c.move.uci);
      else addReply(node.fen, { uci: c.move.uci, san: c.move.san, share: c.move.share, games: c.move.games, score: c.move.score });
      n++;
    }
    saveRep();
    this.app.toast(`${n} coups ajoutés au répertoire ${me === 'w' ? 'Blancs' : 'Noirs'} : révisez-les dans « Mon répertoire »`, 3500);
  }
}

/** Libellé numéroté du dernier coup d'un chemin (ex. « 3… Nf6 »). */
function pathLabel(base, path) {
  const all = [...base, ...path];
  return label(fenAfter(all.slice(0, -1)), all[all.length - 1]);
}
