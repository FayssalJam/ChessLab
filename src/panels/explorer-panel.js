// Onglet « Ouvertures » : arbre visuel des coups les plus joués pour une plage Elo choisie,
// comparaison avec un niveau cible, flèches sur l'échiquier et bibliothèque des ouvertures.
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { explore, peek, candidates, total, ExplorerError } from '../explorer.js';
import { settings, saveSettings, myBands, higherBands, rangeLabel } from '../settings.js';
import { setMine, mineAt } from '../repertoire.js';
import { rangeSlider } from '../components/range-slider.js';
import { OpeningTree } from '../tree-view.js';
import { OPENINGS, FAMILIES } from '../openings.js';
import { QUALITY, qualityIndex, qualityBrush, prettySan, ACCENT, TARGET } from '../colors.js';
import { START_FEN } from '../core.js';

const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n));

export const explorerPanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.view = 'tree';
    this.libFilter = 'all';
    this.libSearch = '';
    el.innerHTML = `
      <div class="glass xp-head">
        <div class="xp-row">
          <h2 class="xp-h">Explorateur d'ouvertures</h2>
          <div class="seg" id="xp-view">
            <button data-v="tree" class="on">🌳 Arbre</button>
            <button data-v="lib">📚 Bibliothèque</button>
          </div>
        </div>
        <div class="xp-ranges">
          <div id="rs-my"></div>
          <div class="xp-cmp">
            <label class="switch"><input type="checkbox" id="xp-compare" ${settings.compare ? 'checked' : ''}><span></span></label>
            <span>Comparer</span>
          </div>
          <div id="rs-target" class="${settings.compare ? '' : 'off'}"></div>
        </div>
        <div class="xp-row xp-opts">
          <div class="seg small" id="xp-mode">
            <button data-m="popular">🔥 Les plus joués</button>
            <button data-m="best">★ Les meilleurs</button>
          </div>
          <div class="seg small" id="xp-branches">
            <span class="seg-label">Branches</span>${[2, 3, 4].map((n) => `<button data-b="${n}">${n}</button>`).join('')}
          </div>
        </div>
      </div>

      <div id="xp-tree-view">
        <div class="glass xp-now" id="xp-now"></div>
        <div class="xp-trees" id="xp-trees">
          <div class="xp-tree-col" id="xp-col-target">
            <div class="xp-tree-title" style="--c:${TARGET}"><b id="xp-t-target"></b><span>ELO</span></div>
            <div class="xp-tree" id="xp-tree-target"></div>
          </div>
          <div class="xp-neq" id="xp-neq">≠</div>
          <div class="xp-tree-col" id="xp-col-my">
            <div class="xp-tree-title" style="--c:${ACCENT}"><b id="xp-t-my"></b><span>ELO</span></div>
            <div class="xp-tree" id="xp-tree-my"></div>
          </div>
        </div>
        <div class="xp-legend">
          <span><i class="lg-spine"></i>ligne jouée</span>
          <span><i class="lg-grad"></i>score du coup pour celui qui le joue : faible → excellent</span>
          <span><i class="lg-gold">★</i>meilleur score</span>
          <span>taille = popularité · survol = détails · clic = jouer</span>
        </div>
      </div>

      <div id="xp-lib-view" style="display:none">
        <div class="glass xp-lib-head">
          <div class="seg small" id="xp-lib-filter">
            <button data-f="all" class="on">Toutes</button><button data-f="w">Pour les Blancs</button><button data-f="b">Pour les Noirs</button>
          </div>
          <input id="xp-lib-search" type="search" placeholder="Rechercher (sicilienne, d4, gambit…)">
          <span class="muted small">Popularité et score calculés pour <b id="xp-lib-range"></b></span>
        </div>
        <div id="xp-lib"></div>
      </div>`;

    const $ = (s) => el.querySelector(s);
    this.rsMy = rangeSlider($('#rs-my'), {
      label: 'Mon niveau', value: settings.myRange, accent: ACCENT,
      onChange: (v) => { saveSettings({ myRange: v }); this.refreshAll(); },
    });
    this.rsTarget = rangeSlider($('#rs-target'), {
      label: 'Niveau cible', value: settings.targetRange, accent: TARGET,
      onChange: (v) => { saveSettings({ targetRange: v }); this.refreshAll(); },
    });
    $('#xp-compare').onchange = (e) => {
      saveSettings({ compare: e.target.checked });
      $('#rs-target').classList.toggle('off', !settings.compare);
      this.refreshAll();
    };
    $('#xp-view').onclick = (e) => { const b = e.target.closest('button'); if (b) this.setView(b.dataset.v); };
    $('#xp-mode').onclick = (e) => { const b = e.target.closest('button'); if (b) { saveSettings({ arrowMode: b.dataset.m }); this.refreshAll(); } };
    $('#xp-branches').onclick = (e) => { const b = e.target.closest('button'); if (b) { saveSettings({ branches: +b.dataset.b }); this.refreshAll(); } };
    $('#xp-lib-filter').onclick = (e) => { const b = e.target.closest('button'); if (b) { this.libFilter = b.dataset.f; this.renderLib(); } };
    $('#xp-lib-search').oninput = (e) => { this.libSearch = e.target.value.toLowerCase(); this.renderLib(); };

    const nav = (n) => {
      if (n.idx != null) this.app.goto(n.idx);
      else this.app.load(this.app.line[0].fen, n.sans);
    };
    this.treeMy = new OpeningTree($('#xp-tree-my'), { ratings: myBands, accent: ACCENT, mirror: false, onNavigate: nav });
    this.treeTarget = new OpeningTree($('#xp-tree-target'), { ratings: higherBands, accent: TARGET, mirror: true, onNavigate: nav });
  },

  show() { this.refreshAll(); },
  hide() { this.app.setShapes([]); },
  position() { if (this.view === 'tree') this.refreshTree(); },

  setView(v) {
    this.view = v;
    this.el.querySelectorAll('#xp-view button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    this.el.querySelector('#xp-tree-view').style.display = v === 'tree' ? '' : 'none';
    this.el.querySelector('#xp-lib-view').style.display = v === 'lib' ? '' : 'none';
    this.refreshAll();
  },

  refreshAll() {
    const $ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('#xp-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === settings.arrowMode));
    this.el.querySelectorAll('#xp-branches button').forEach((b) => b.classList.toggle('on', +b.dataset.b === settings.branches));
    $('#xp-t-my').textContent = rangeLabel(settings.myRange);
    $('#xp-t-target').textContent = rangeLabel(settings.targetRange);
    $('#xp-lib-range').textContent = rangeLabel(settings.myRange) + ' Elo';
    $('#xp-col-target').style.display = settings.compare ? '' : 'none';
    $('#xp-neq').style.display = settings.compare ? '' : 'none';
    $('#xp-trees').classList.toggle('compare', settings.compare);
    if (this.view === 'tree') this.refreshTree();
    else { this.app.setShapes([]); this.renderLib(); }
  },

  // --- Vue arbre --------------------------------------------------------------
  refreshTree() {
    const { line, idx } = this.app;
    this.treeMy.update(line, idx);
    if (settings.compare) this.treeTarget.update(line, idx);
    this.renderNow();
  },

  async renderNow() {
    const fen = this.app.fen();
    const box = this.el.querySelector('#xp-now');
    const req = (this.nowReq = (this.nowReq || 0) + 1);
    const paint = (my, target, err) => {
      if (req !== this.nowReq) return;
      this.paintNow(box, fen, my, target, err);
      this.paintArrows(fen, my, target);
    };
    const my0 = peek(fen, { ratings: myBands() });
    const tg0 = settings.compare ? peek(fen, { ratings: higherBands() }) : null;
    paint(my0, tg0);
    try {
      const [my, target] = await Promise.all([
        explore(fen, { ratings: myBands() }),
        settings.compare ? explore(fen, { ratings: higherBands() }) : Promise.resolve(null),
      ]);
      paint(my, target);
    } catch (e) {
      paint(null, null, e instanceof ExplorerError ? e.message : e.message);
    }
  },

  paintNow(box, fen, my, target, err) {
    const color = fen.split(' ')[1];
    const opening = (my && my.opening) || (target && target.opening);
    document.getElementById('opening-name').textContent = opening ? `${opening.eco} · ${opening.name}` : '';
    if (err) { box.innerHTML = `<div class="err">${err}</div><p class="muted small">L'explorateur a besoin d'internet (explorer.lichess.ovh). Le scanner, le moteur et les cours fonctionnent hors ligne.</p>`; return; }
    if (!my) { box.innerHTML = '<div class="skeleton"></div>'; return; }
    const n = total(my);
    const mode = settings.arrowMode;
    const list = candidates(my, color, mode).slice(0, 6);
    const isMine = color === settings.color;
    const mine = mineAt(settings.color, fen);
    const wdl = n ? `<div class="big-wdl"><i class="w" style="flex:${my.white}"><span>${pct(my.white / n)}</span></i><i class="d" style="flex:${my.draws}"><span>${pct(my.draws / n)}</span></i><i class="b" style="flex:${my.black}"><span>${pct(my.black / n)}</span></i></div>` : '';
    const tTop = target ? candidates(target, color, mode)[0] : null;
    box.innerHTML = `
      <div class="now-head">
        <div>
          <div class="now-opening">${opening ? opening.name : 'Position de départ'}</div>
          <div class="muted small">${n ? fmtN(n) + ' parties à votre niveau' : 'Aucune partie : hors des sentiers battus'} · trait aux ${color === 'w' ? 'Blancs' : 'Noirs'}${isMine ? ' (vous)' : ''}</div>
        </div>
        ${tTop ? `<div class="now-target" style="--c:${TARGET}">🎯 Les ${rangeLabel(settings.targetRange)} jouent surtout <b>${prettySan(tTop.san)}</b> (${pct(tTop.share)})</div>` : ''}
      </div>
      ${wdl}
      <div class="bubbles">${list.map((m) => {
        const size = 46 + Math.round(46 * Math.sqrt(m.share));
        const c = QUALITY[qualityIndex(m.score)];
        return `<button class="bubble${m.best ? ' best' : ''}${mine && mine.uci === m.uci ? ' mine' : ''}" data-san="${m.san}" data-uci="${m.uci}" style="--s:${size}px;--c:${c}" title="${m.games.toLocaleString('fr-FR')} parties · score ${pct(m.score)}">
          <span class="b-san">${prettySan(m.san)}</span><span class="b-pct">${pct(m.share)}</span>
          ${m.best ? '<span class="b-star">★</span>' : ''}
          <span class="b-score">${pct(m.score)}</span>
        </button>`;
      }).join('') || '<span class="muted">—</span>'}</div>
      <div class="muted small now-hint">${isMine
        ? `À vous : ${mode === 'best' ? 'triés par score' : 'triés par popularité'}. ${list.find((m) => m.best) ? `Le meilleur score revient à <b>${prettySan(list.find((m) => m.best).san)}</b>.` : ''} Clic droit sur une bulle = l'ajouter à votre répertoire.`
        : 'Coups que vos adversaires jouent ici : préparez-vous aux plus gros, et punissez ceux qui marquent peu (rouge).'}</div>`;
    box.querySelectorAll('.bubble').forEach((b) => {
      b.onclick = () => this.app.play(b.dataset.san);
      b.oncontextmenu = (e) => {
        e.preventDefault();
        if (!isMine) return;
        setMine(settings.color, fen, b.dataset.uci, b.dataset.san);
        this.app.toast(`${b.dataset.san} ajouté à votre répertoire`);
        this.paintNow(box, fen, my, target);
      };
    });
  },

  paintArrows(fen, my, target) {
    if (this.view !== 'tree' || fen !== this.app.fen()) return;
    const color = fen.split(' ')[1];
    const shapes = [];
    if (my) {
      candidates(my, color, settings.arrowMode).slice(0, 3).forEach((m) => {
        shapes.push({
          orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: qualityBrush(m.score),
          modifiers: { lineWidth: Math.round(5 + 13 * Math.sqrt(m.share)) },
          label: { text: (m.best ? '★' : '') + pct(m.share), fill: QUALITY[qualityIndex(m.score)] },
        });
      });
    }
    if (target) {
      const t = candidates(target, color, settings.arrowMode)[0];
      if (t && !shapes.some((s) => s.orig + s.dest === t.uci.slice(0, 4))) {
        shapes.push({ orig: t.uci.slice(0, 2), dest: t.uci.slice(2, 4), brush: 'target', label: { text: '🎯', fill: TARGET } });
      }
    }
    this.app.setShapes(shapes);
  },

  // --- Bibliothèque -------------------------------------------------------------
  renderLib() {
    const box = this.el.querySelector('#xp-lib');
    this.el.querySelectorAll('#xp-lib-filter button').forEach((b) => b.classList.toggle('on', b.dataset.f === this.libFilter));
    const list = OPENINGS.filter((o) => (this.libFilter === 'all' || o.side === this.libFilter) &&
      (!this.libSearch || (o.name + ' ' + o.moves + ' ' + o.eco + ' ' + o.family).toLowerCase().includes(this.libSearch)));
    box.innerHTML = FAMILIES.map((f) => {
      const items = list.filter((o) => o.family === f);
      if (!items.length) return '';
      return `<h3 class="lib-family">${f}</h3><div class="lib-grid">${items.map((o) => `
        <article class="lib-card" data-i="${OPENINGS.indexOf(o)}">
          <div class="lib-board"></div>
          <div class="lib-body">
            <div class="lib-top"><span class="eco">${o.eco}</span><span class="side side-${o.side}">${o.side === 'w' ? 'Blancs' : 'Noirs'}</span></div>
            <div class="lib-name">${o.name}</div>
            <div class="lib-moves">${formatMoves(o.moves)}</div>
            <div class="lib-stat"><div class="pop-ring" style="--p:0"><span>…</span></div><div class="lib-stat-txt muted small">chargement…</div></div>
            <p class="lib-idea">${o.idea}</p>
          </div>
        </article>`).join('')}</div>`;
    }).join('') || '<p class="muted">Aucune ouverture ne correspond.</p>';

    for (const card of box.querySelectorAll('.lib-card')) {
      const o = OPENINGS[+card.dataset.i];
      const c = new Chess();
      const moves = o.moves.split(' ');
      let last;
      for (const m of moves) last = c.move(m);
      Chessground(card.querySelector('.lib-board'), {
        fen: c.fen(), viewOnly: true, coordinates: false, orientation: o.side === 'b' ? 'black' : 'white',
        lastMove: [last.from, last.to], drawable: { enabled: false, visible: false },
      });
      card.onclick = () => {
        this.app.board.setOrientation(o.side);
        this.app.load(START_FEN, moves);
        this.setView('tree');
      };
    }
    this.loadLibStats(list, box);
  },

  async loadLibStats(list, box) {
    const req = (this.libReq = (this.libReq || 0) + 1);
    const opts = { ratings: myBands() };
    let root;
    try { root = await explore(START_FEN, opts); } catch (e) {
      box.querySelectorAll('.lib-stat-txt').forEach((x) => (x.textContent = 'statistiques indisponibles'));
      return;
    }
    const rootN = total(root);
    for (const o of list) {
      if (req !== this.libReq) return;
      const c = new Chess();
      for (const m of o.moves.split(' ')) c.move(m);
      const card = box.querySelector(`.lib-card[data-i="${OPENINGS.indexOf(o)}"]`);
      if (!card) continue;
      try {
        const d = await explore(c.fen(), opts);
        const n = total(d);
        const share = rootN ? n / rootN : 0;
        const score = n ? ((o.side === 'w' ? d.white : d.black) + d.draws / 2) / n : null;
        const ring = card.querySelector('.pop-ring');
        ring.style.setProperty('--p', Math.min(100, share * 100 * 3).toFixed(1)); // ×3 pour rendre les petites parts visibles
        ring.style.setProperty('--c', QUALITY[qualityIndex(score)]);
        ring.querySelector('span').textContent = share >= 0.1 ? Math.round(share * 100) + '%' : (share * 100).toFixed(1) + '%';
        card.querySelector('.lib-stat-txt').innerHTML = `${fmtN(n)} parties · score ${o.side === 'w' ? 'Blancs' : 'Noirs'} <b style="color:${QUALITY[qualityIndex(score)]}">${pct(score)}</b>`;
      } catch {
        card.querySelector('.lib-stat-txt').textContent = 'indisponible';
      }
    }
  },
};

function formatMoves(moves) {
  return moves.split(' ').map((m, i) => (i % 2 === 0 ? `<b>${i / 2 + 1}.</b>` : '') + prettySan(m)).join(' ');
}
