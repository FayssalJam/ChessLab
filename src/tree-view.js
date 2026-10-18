// Arbre d'ouverture visuel (SVG) : la ligne jouée forme le tronc lumineux, les coups fréquents partent en branches.
// Les données viennent de l'explorateur Lichess pour une plage Elo donnée ; l'arbre se complète au fil des réponses.
import { Chess } from 'chess.js';
import { peek, explore, candidates, total, ExplorerError } from './explorer.js';
import { settings } from './settings.js';
import { QUALITY, qualityIndex, prettySan } from './colors.js';

const COL_W = 64;
const ROW_H = 78;
const PAD_X = 40;
const PAD_Y = 44;
const SVGNS = 'http://www.w3.org/2000/svg';

let uid = 0;

function after(fen, san) {
  const c = new Chess(fen);
  c.move(san);
  return c.fen();
}
const pct = (x) => (x == null ? '' : Math.round(x * 100) + '%');

export class OpeningTree {
  /**
   * opts: { ratings: () => number[], mirror, accent, title, onNavigate(nav) }
   * nav = { idx } pour revenir dans la partie, ou { sans } pour charger une suite depuis le départ.
   */
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.id = 't' + uid++;
    this.gen = 0;
    el.classList.add('otree');
    el.innerHTML = `<div class="otree-scroll"></div><div class="otree-tip"></div><div class="otree-msg"></div>`;
    this.scroll = el.querySelector('.otree-scroll');
    this.tip = el.querySelector('.otree-tip');
    this.msg = el.querySelector('.otree-msg');
  }

  update(line, idx) {
    this.line = line;
    this.idx = idx;
    this.error = null;
    const gen = ++this.gen;
    this.render(true);
    this.fetchMissing(gen);
  }

  /** Arrête le chargement en arrière-plan (vue masquée). */
  stop() { this.gen++; }

  q() { return { ratings: this.opts.ratings() }; }

  // --- Modèle -------------------------------------------------------------
  build() {
    const line = this.line, idx = this.idx;
    const opts = this.q();
    const need = [];
    const get = (fen, prio) => { const d = peek(fen, opts); if (!d) need.push({ fen, prio }); return d; };
    const mode = settings.arrowMode;
    const K = settings.branches;
    const altFrom = Math.max(0, Math.min(idx, line.length - 1) - 4); // branches visibles sur les 5 derniers coups
    const root = { fen: line[0].fen, san: null, depth: 0, kind: 'root', children: [], nav: { idx: 0 }, current: idx === 0 };
    let node = root;
    const baseSans = [];
    for (let i = 0; i < line.length; i++) {
      const fen = line[i].fen;
      const color = fen.split(' ')[1];
      const data = get(fen, i === idx ? 0 : i < idx ? 1 + (idx - i) : 2);
      node.total = data ? total(data) : null;
      node.wdl = data ? { w: data.white, d: data.draws, b: data.black } : null;
      const played = line[i + 1] ? line[i + 1].san : null;
      const cands = data ? candidates(data, color, mode) : [];
      const showAlts = i >= altFrom || i === idx;
      let kids = showAlts ? cands.slice(0, K) : [];
      if (played && !kids.some((m) => m.san === played)) {
        const m = cands.find((x) => x.san === played) || { san: played, share: null, score: null, games: null };
        kids = [m, ...kids.slice(0, showAlts ? K - 1 : 0)];
      }
      kids.sort((a, b) => (a.san === played ? -1 : b.san === played ? 1 : 0));
      const deep = i === idx || i === line.length - 1;
      node.children = kids.map((m) => {
        const kind = m.san === played ? 'spine' : deep ? 'cand' : 'alt';
        const child = {
          san: m.san, fen: after(fen, m.san), depth: i + 1, kind, share: m.share, score: m.score, games: m.games,
          best: m.best, wdl: m.white != null ? { w: m.white, d: m.draws, b: m.black } : null, avg: m.averageRating,
          mover: color, children: [],
          nav: m.san === played ? { idx: i + 1 } : { sans: [...baseSans, m.san] },
          current: m.san === played && i + 1 === idx,
        };
        if (kind === 'cand') this.preview(child, 3, get, mode);
        return child;
      });
      if (!played) break;
      baseSans.push(played);
      node = node.children.find((c) => c.kind === 'spine');
    }
    return { root, need };
  }

  /** Prolonge une branche par la suite la plus jouée (ou la meilleure). */
  preview(node, depth, get, mode) {
    let cur = node;
    const sans = [...node.nav.sans];
    for (let d = 0; d < depth; d++) {
      const data = get(cur.fen, 3 + cur.depth);
      if (!data) return;
      const color = cur.fen.split(' ')[1];
      const m = candidates(data, color, mode)[0];
      if (!m || m.games < 3) return;
      sans.push(m.san);
      const child = {
        san: m.san, fen: after(cur.fen, m.san), depth: cur.depth + 1, kind: 'preview', share: m.share, score: m.score,
        games: m.games, best: m.best, wdl: { w: m.white, d: m.draws, b: m.black }, avg: m.averageRating, mover: color,
        children: [], nav: { sans: [...sans] },
      };
      cur.children = [child];
      cur = child;
    }
  }

  async fetchMissing(gen) {
    // On récupère les positions manquantes par ordre de priorité, en redessinant au fur et à mesure.
    for (let guard = 0; guard < 80; guard++) {
      if (gen !== this.gen) return;
      const { need } = this.build();
      if (!need.length) break;
      need.sort((a, b) => a.prio - b.prio);
      try {
        await explore(need[0].fen, this.q());
      } catch (e) {
        if (gen !== this.gen) return;
        this.error = e instanceof ExplorerError ? e.message : 'Explorateur indisponible : ' + e.message;
        this.render(false);
        return;
      }
      if (gen !== this.gen) return;
      this.render(false);
    }
  }

  // --- Mise en page ---------------------------------------------------------
  layout(root) {
    // Le tronc (ligne jouée) occupe la colonne 0. Chaque branche est une chaîne de coups qu'on range
    // dans la première colonne libre, en évitant que les connecteurs se croisent.
    const spine = [];
    for (let n = root; n; n = n.children.find((c) => c.kind === 'spine')) spine.push(n);
    const chains = [];
    for (const s of spine) for (const c of s.children) {
      if (c.kind === 'spine') continue;
      const chain = [];
      for (let x = c; x; x = x.children[0]) chain.push(x);
      chains.push({ parent: s, chain });
    }
    const curDepth = (spine.find((n) => n.current) || spine[spine.length - 1]).depth;
    // Priorité : les coups candidats de la position courante, puis les branches les plus récentes.
    chains.sort((a, b) => (a.parent.depth === curDepth ? -1 : 0) - (b.parent.depth === curDepth ? -1 : 0) || b.parent.depth - a.parent.depth);
    const occ = []; // occ[col] = Map(slot → propriétaire) ; slot 2k = nœud de profondeur k, 2k+1 = intervalle k→k+1
    const free = (col, slot, owner) => { const m = occ[col]; const o = m && m.get(slot); return o == null || o === owner; };
    const mark = (col, slot, owner) => { (occ[col] ||= new Map()).set(slot, owner); };
    let maxCol = 0, maxDepth = 0;
    for (const s of spine) { s.col = 0; maxDepth = Math.max(maxDepth, s.depth); }
    for (const { parent, chain } of chains) {
      const owner = parent.depth;
      const gap = 2 * parent.depth + 1;
      const end = 2 * chain[chain.length - 1].depth;
      const crossFree = (col) => { for (let x = 1; x < col; x++) if (!free(x, gap, owner)) return false; return true; };
      const colFree = (col) => { for (let sl = gap; sl <= end; sl++) if (!free(col, sl, sl === gap ? owner : -1)) return false; return true; };
      // Une colonne vide existe toujours en maxCol + 1. Si le connecteur horizontal ne peut éviter
      // aucune branche (c'est le cas quand on revient en arrière dans la partie), on accepte qu'il en croise une.
      let col = 1;
      while (col <= maxCol + 1 && !(crossFree(col) && colFree(col))) col++;
      if (col > maxCol + 1) { col = 1; while (!colFree(col)) col++; }
      for (let x = 1; x < col; x++) if (free(x, gap, owner)) mark(x, gap, owner);
      for (let sl = gap; sl <= end; sl++) mark(col, sl, sl === gap ? owner : 'c' + col + ':' + sl);
      for (const n of chain) { n.col = col; maxDepth = Math.max(maxDepth, n.depth); }
      maxCol = Math.max(maxCol, col);
    }
    const nodes = [];
    const walk = (n) => { nodes.push(n); n.children.forEach(walk); };
    walk(root);
    const width = PAD_X * 2 + maxCol * COL_W;
    const height = PAD_Y * 2 + maxDepth * ROW_H;
    for (const n of nodes) {
      n.x = this.opts.mirror ? width - PAD_X - n.col * COL_W : PAD_X + n.col * COL_W;
      n.y = height - PAD_Y - n.depth * ROW_H; // la racine en bas : l'arbre pousse vers le haut
    }
    return { nodes, width, height };
  }

  radius(n) {
    if (n.kind === 'root') return 18;
    if (n.current) return 27;
    if (n.kind === 'spine') return 23;
    if (n.kind === 'cand') return 15 + Math.round(11 * Math.sqrt(n.share || 0.05));
    if (n.kind === 'alt') return 18;
    return 15;
  }

  render(first) {
    const { root, need } = this.build();
    const { nodes, width, height } = this.layout(root);
    const id = this.id;
    const accent = this.opts.accent;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <defs>
        <filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="${id}-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".55"/>
        </filter>
        ${sphere(`${id}-spine`, accent)}
        ${sphere(`${id}-root`, '#e5e7eb')}
        ${sphere(`${id}-alt`, '#3b4252', true)}
        ${QUALITY.map((c, i) => sphere(`${id}-q${i}`, c, true)).join('')}
      </defs>`;
    const gEdges = el('g'), gNodes = el('g');
    svg.append(gEdges, gNodes);

    for (const n of nodes) for (const c of n.children) {
      const p = el('path');
      p.setAttribute('d', elbow(n.x, n.y, c.x, c.y));
      p.setAttribute('class', 'edge edge-' + c.kind);
      if (c.kind === 'spine') { p.setAttribute('stroke', accent); p.setAttribute('filter', `url(#${id}-glow)`); }
      else if (c.kind === 'cand') { p.setAttribute('stroke', QUALITY[qualityIndex(c.score)]); p.setAttribute('stroke-width', 2 + 6 * (c.share || 0)); }
      gEdges.append(p);
    }

    const seen = new Set();
    nodes.forEach((n, i) => {
      const g = el('g');
      const key = n.fen + '|' + n.depth + '|' + n.kind;
      const isNew = !this.seen || !this.seen.has(key);
      seen.add(key);
      g.setAttribute('class', `node node-${n.kind}${n.current ? ' is-current' : ''}${isNew ? ' enter' : ''}`);
      g.setAttribute('transform', `translate(${n.x},${n.y})`);
      g.style.setProperty('--d', (first ? i * 12 : 0) + 'ms');
      const r = this.radius(n);
      const fill = n.kind === 'root' ? `${id}-root` : n.kind === 'spine' ? `${id}-spine` : n.kind === 'cand' || n.kind === 'preview' || n.kind === 'alt' ? (n.score != null ? `${id}-q${qualityIndex(n.score)}` : `${id}-alt`) : `${id}-alt`;
      let html = '';
      if (n.current) html += `<circle r="${r + 9}" class="halo" stroke="${accent}"/>`;
      html += `<circle r="${r}" fill="url(#${fill})" filter="url(#${id}-shadow)" class="ball"/>`;
      if (n.kind === 'spine' || n.current) html += `<circle r="${r}" class="ring" stroke="${accent}"/>`;
      if (n.best && n.kind !== 'root') html += `<circle r="${r + 4}" class="best-ring"/><text class="star" y="${-r - 6}">★</text>`;
      const label = n.kind === 'root' ? '▲' : prettySan(n.san);
      const small = r < 19;
      html += `<text class="san${small ? ' sm' : ''}" y="${n.share != null && !small ? -2 : 4}">${label}</text>`;
      if (n.share != null && !small) html += `<text class="pct" y="11">${pct(n.share)}</text>`;
      g.innerHTML = html;
      g.addEventListener('mouseenter', () => this.showTip(n));
      g.addEventListener('mouseleave', () => this.hideTip());
      g.addEventListener('click', () => { this.hideTip(); this.opts.onNavigate(n.nav); });
      gNodes.append(g);
      n.g = g;
    });

    this.seen = seen;
    const keepScroll = !first && { l: this.scroll.scrollLeft, t: this.scroll.scrollTop };
    this.scroll.replaceChildren(svg);
    // Garder le coup courant visible
    const cur = nodes.find((n) => n.current) || root;
    if (first || !keepScroll) {
      this.scroll.scrollTop = Math.max(0, cur.y - this.scroll.clientHeight * 0.55);
      this.scroll.scrollLeft = this.opts.mirror ? Math.max(0, width - this.scroll.clientWidth) : 0;
    } else {
      this.scroll.scrollLeft = keepScroll.l;
      this.scroll.scrollTop = keepScroll.t;
    }
    this.msg.innerHTML = this.error
      ? `<div class="otree-error">${this.error}</div>`
      : need.length ? '<div class="otree-loading"><span></span>Chargement des statistiques Lichess…</div>' : '';
  }

  showTip(n) {
    if (n.kind === 'root') return;
    const w = n.wdl, t = w ? w.w + w.d + w.b : 0;
    const bar = t ? `<div class="wdl-bar"><i class="w" style="flex:${w.w}"></i><i class="d" style="flex:${w.d}"></i><i class="b" style="flex:${w.b}"></i></div>
      <div class="wdl-legend"><span>${Math.round((w.w / t) * 100)}% blancs</span><span>${Math.round((w.d / t) * 100)}% nulles</span><span>${Math.round((w.b / t) * 100)}% noirs</span></div>` : '';
    this.tip.innerHTML = `<b>${prettySan(n.san)}</b>${n.best ? ' <span class="gold">★ meilleur score</span>' : ''}
      <div class="tip-grid">
        ${n.share != null ? `<span>Joué</span><b>${pct(n.share)}</b>` : ''}
        ${n.games != null ? `<span>Parties</span><b>${n.games.toLocaleString('fr-FR')}</b>` : ''}
        ${n.score != null ? `<span>Score ${n.mover === 'w' ? 'Blancs' : 'Noirs'}</span><b style="color:${QUALITY[qualityIndex(n.score)]}">${pct(n.score)}</b>` : ''}
        ${n.avg ? `<span>Elo moyen</span><b>${n.avg}</b>` : ''}
      </div>${bar}<div class="tip-hint">Cliquer pour jouer cette ligne</div>`;
    const box = this.el.getBoundingClientRect();
    const r = n.g.getBoundingClientRect();
    let x = r.right - box.left + 10;
    if (x + 220 > box.width) x = r.left - box.left - 230;
    this.tip.style.left = Math.max(4, x) + 'px';
    this.tip.style.top = Math.max(4, r.top - box.top - 10) + 'px';
    this.tip.classList.add('show');
  }
  hideTip() { this.tip.classList.remove('show'); }
}

function el(tag) { return document.createElementNS(SVGNS, tag); }

/** Sphère 3D : dégradé radial avec reflet en haut à gauche. */
function sphere(id, color, dark = false) {
  return `<radialGradient id="${id}" cx="35%" cy="30%" r="75%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="${dark ? 0.55 : 0.9}"/>
    <stop offset="22%" stop-color="${color}" stop-opacity="1"/>
    <stop offset="100%" stop-color="${shade(color, -0.55)}" stop-opacity="1"/>
  </radialGradient>`;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.max(0, Math.min(255, v + v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Connecteur coudé arrondi (vertical → horizontal → vertical). */
function elbow(x1, y1, x2, y2) {
  if (x1 === x2) return `M${x1},${y1}V${y2}`;
  const my = (y1 + y2) / 2;
  const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
  const r = Math.min(14, Math.abs(x2 - x1) / 2, Math.abs(my - y1));
  return `M${x1},${y1}V${my - sy * r}Q${x1},${my} ${x1 + sx * r},${my}H${x2 - sx * r}Q${x2},${my} ${x2},${my + sy * r}V${y2}`;
}
