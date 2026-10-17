// Répertoire d'ouvertures : mes coups (un par position) + réponses adverses les plus fréquentes à mon niveau.
import { Chess } from 'chess.js';
import { START_FEN, posKey } from './core.js';
import { compare, explore, total } from './explorer.js';
import { myBand, restore, store } from './settings.js';

const KEY = 'cc.repertoire.v1';

export const rep = restore(KEY, { w: {}, b: {} });
// rep[color][posKey] = { fen, mine?: {uci, san, note}, replies?: [{uci, san, share, score}] }

export function saveRep() { store(KEY, rep); }

export function setMine(color, fen, uci, san, extra = {}) {
  const k = posKey(fen);
  rep[color][k] = { ...(rep[color][k] || {}), fen, mine: { uci, san, ...extra } };
  saveRep();
}
export function removeMine(color, fen) {
  const k = posKey(fen);
  if (rep[color][k]) delete rep[color][k].mine;
  saveRep();
}
export function mineAt(color, fen) {
  const n = rep[color][posKey(fen)];
  return n && n.mine ? n.mine : null;
}
export function clearRep(color) { rep[color] = {}; saveRep(); }

function child(fen, uci) {
  const c = new Chess(fen);
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return c.fen();
}

/**
 * Construit automatiquement un répertoire pour `color`.
 * À mon tour : le coup le mieux classé (score aux niveaux supérieurs + à mon niveau).
 * Au tour adverse : les réponses qui couvrent `coverage` des parties à mon niveau.
 */
export async function buildRepertoire(color, opts, onProgress, signal) {
  const { maxPly = 12, coverage = 0.8, minShare = 0.07, maxReplies = 4, maxNodes = 150, startFen = START_FEN, keepExisting = true } = opts;
  const queue = [{ fen: startFen, ply: 0 }];
  const seen = new Set();
  let done = 0;
  while (queue.length && done < maxNodes) {
    if (signal && signal.aborted) break;
    const { fen, ply } = queue.shift();
    const k = posKey(fen);
    if (seen.has(k) || ply >= maxPly) continue;
    seen.add(k);
    const turn = fen.split(' ')[1];
    done++;
    onProgress && onProgress({ done, queued: queue.length, maxNodes, fen });
    if (turn === color) {
      let mine = keepExisting ? mineAt(color, fen) : null;
      if (!mine) {
        const cmp = await compare(fen);
        if (!cmp.best) continue; // plus assez de parties : fin de la ligne
        const b = cmp.best;
        mine = { uci: b.uci, san: b.san, highScore: b.highScore, myScore: b.myScore, auto: true };
        rep[color][k] = { ...(rep[color][k] || {}), fen, mine };
      }
      queue.push({ fen: child(fen, mine.uci), ply: ply + 1 });
    } else {
      const data = await explore(fen, { ratings: [myBand()] });
      const n = total(data);
      if (!n) continue;
      const replies = [];
      let cum = 0;
      for (const m of data.moves) {
        const share = total(m) / n;
        if (replies.length >= maxReplies || share < minShare || cum >= coverage) break;
        cum += share;
        const opScore = (turn === 'w' ? m.white : m.black) + m.draws / 2;
        replies.push({ uci: m.uci, san: m.san, share, games: total(m), score: opScore / total(m) });
      }
      rep[color][k] = { ...(rep[color][k] || {}), fen, replies };
      for (const r of replies) queue.push({ fen: child(fen, r.uci), ply: ply + 1 });
    }
    saveRep();
  }
  saveRep();
  return done;
}

/** Arbre affichable à partir de la position initiale. */
export function treeOf(color, startFen = START_FEN) {
  const visited = new Set();
  const walk = (fen, depth) => {
    const k = posKey(fen);
    if (visited.has(k) || depth > 40) return [];
    visited.add(k);
    const node = rep[color][k];
    if (!node) return [];
    const turn = fen.split(' ')[1];
    if (turn === color && node.mine) {
      const f2 = child(fen, node.mine.uci);
      return [{ san: node.mine.san, uci: node.mine.uci, fen, after: f2, mine: true, info: node.mine, children: walk(f2, depth + 1) }];
    }
    if (turn !== color && node.replies) {
      return node.replies.map((r) => { const f2 = child(fen, r.uci); return { san: r.san, uci: r.uci, fen, after: f2, mine: false, info: r, children: walk(f2, depth + 1) }; });
    }
    return [];
  };
  return walk(startFen, 0);
}

/** Toutes les lignes (racine → feuille) sous forme de listes de nœuds. */
export function linesOf(color) {
  const out = [];
  const rec = (nodes, path) => {
    if (!nodes.length) { if (path.length) out.push(path); return; }
    for (const n of nodes) rec(n.children, [...path, n]);
  };
  rec(treeOf(color), []);
  return out;
}

/** Export PGN avec variantes. */
export function toPgn(color) {
  const roots = treeOf(color);
  const numFor = (ply, force) => (ply % 2 === 0 ? `${ply / 2 + 1}. ` : force ? `${(ply - 1) / 2 + 1}... ` : '');
  const fmt = (nodes, ply, force) => {
    if (!nodes.length) return '';
    const [main, ...alts] = nodes;
    let s = numFor(ply, force) + main.san;
    for (const a of alts) s += ` (${numFor(ply, true)}${a.san}${a.children.length ? ' ' + fmt(a.children, ply + 1, false) : ''})`;
    if (main.children.length) s += ' ' + fmt(main.children, ply + 1, alts.length > 0);
    return s;
  };
  const head = `[Event "Répertoire ${color === 'w' ? 'Blancs' : 'Noirs'} - ChessLab"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n`;
  return head + fmt(roots, 0, false) + ' *\n';
}

// --- Révision espacée (Leitner) par ligne ---------------------------------
const SRS_KEY = 'cc.srs.v1';
const srs = restore(SRS_KEY, {});
const INTERVAL = [0, 1, 3, 7, 16, 35]; // jours
export function lineId(color, line) { return color + ':' + line.map((n) => n.uci).join(' '); }
export function srsGet(id) { return srs[id] || { box: 0, due: 0 }; }
export function srsUpdate(id, ok) {
  const s = srsGet(id);
  const box = ok ? Math.min(INTERVAL.length - 1, s.box + 1) : 0;
  srs[id] = { box, due: Date.now() + INTERVAL[box] * 86400000 };
  store(SRS_KEY, srs);
}
export function pickLine(color) {
  const lines = linesOf(color);
  if (!lines.length) return null;
  const now = Date.now();
  const scored = lines.map((l) => ({ l, s: srsGet(lineId(color, l)) }));
  const due = scored.filter((x) => x.s.due <= now);
  const pool = due.length ? due : scored;
  pool.sort((a, b) => a.s.box - b.s.box || a.s.due - b.s.due);
  const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 3)));
  return top[Math.floor(Math.random() * top.length)].l;
}
export function srsStats(color) {
  const lines = linesOf(color);
  const now = Date.now();
  let due = 0, mastered = 0;
  for (const l of lines) { const s = srsGet(lineId(color, l)); if (s.due <= now) due++; if (s.box >= 3) mastered++; }
  return { total: lines.length, due, mastered };
}
