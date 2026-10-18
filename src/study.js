// Étude d'une ouverture : reconnaissance, puis arbre complet des réponses adverses (à mon niveau)
// avec, pour chacune, le meilleur coup à jouer (ce qui marque chez les plus forts et à mon niveau).
import { Chess } from 'chess.js';
import { compare, explore, total, scoreFor } from './explorer.js';
import { myBands } from './settings.js';
import { OPENINGS } from './openings.js';
import { START_FEN } from './core.js';

/** Ouverture de la bibliothèque la plus longue dont tous les coups ont été joués (sans = SAN depuis le départ). */
export function findOpening(sans) {
  let best = null;
  for (const o of OPENINGS) {
    const m = o.moves.split(' ');
    if (m.length > sans.length || (best && m.length <= best.moves.split(' ').length)) continue;
    if (m.every((s, i) => s === sans[i])) best = o;
  }
  return best;
}

export function fenAfter(sans, start = START_FEN) {
  const c = new Chess(start);
  for (const s of sans) c.move(s);
  return c.fen();
}

export function playSan(fen, san) {
  const c = new Chess(fen);
  const m = c.move(san);
  return { fen: c.fen(), uci: m.from + m.to + (m.promotion || '') };
}

/**
 * Construit l'arbre en largeur (les premiers coups d'abord), en appelant onUpdate après chaque position.
 * Nœud = position : { fen, path (SAN depuis la racine), move?, children, state: 'todo'|'done'|'end'|'leaf' }.
 * - à mon tour : un enfant, le coup recommandé (move.best), plus move.alts (autres bons coups) ;
 * - au tour adverse : les réponses jouées dans au moins `minShare` des parties à mon niveau.
 */
export async function buildStudy(rootFen, me, opts, onUpdate, cancelled) {
  const { depth = 6, minShare = 0.04, maxReplies = 6, maxNodes = 160 } = opts;
  const root = { fen: rootFen, path: [], ply: 0, children: [], state: 'todo' };
  const queue = [root];
  let count = 0;
  while (queue.length) {
    if (cancelled()) return root;
    const node = queue.shift();
    if (node.ply >= depth || count >= maxNodes) { node.state = 'leaf'; continue; }
    count++;
    const turn = node.fen.split(' ')[1];
    try {
      if (turn === me) {
        const cmp = await compare(node.fen);
        if (node === root) root.stats = { my: cmp.my, high: cmp.high };
        node.opening = cmp.my.opening;
        if (!cmp.best) { node.state = 'end'; onUpdate(root); continue; }
        const b = cmp.best;
        const alts = cmp.rows.filter((r) => r.rank > 0 && r.uci !== b.uci).sort((x, y) => y.rank - x.rank).slice(0, 2)
          .map((r) => ({ san: r.san, myScore: r.myScore, highScore: r.highScore, myShare: r.myShare }));
        const next = playSan(node.fen, b.san);
        const child = {
          fen: next.fen, path: [...node.path, b.san], ply: node.ply + 1, children: [], state: 'todo',
          move: { san: b.san, uci: next.uci, mine: true, myScore: b.myScore, highScore: b.highScore, myShare: b.myShare, highShare: b.highShare, alts },
        };
        node.children = [child];
        queue.push(child);
      } else {
        const data = await explore(node.fen, { ratings: myBands() });
        if (node === root) root.stats = { my: data };
        node.opening = data.opening;
        const n = total(data);
        node.games = n;
        const replies = data.moves
          .map((m) => ({ m, share: n ? total(m) / n : 0 }))
          .filter((x) => x.share >= minShare)
          .sort((a, b) => b.share - a.share)
          .slice(0, maxReplies);
        if (!replies.length) { node.state = 'end'; onUpdate(root); continue; }
        node.covered = replies.reduce((a, x) => a + x.share, 0);
        node.children = replies.map(({ m, share }) => {
          const next = playSan(node.fen, m.san);
          return {
            fen: next.fen, path: [...node.path, m.san], ply: node.ply + 1, children: [], state: 'todo',
            move: { san: m.san, uci: next.uci, mine: false, share, games: total(m), score: scoreFor(m, turn) },
          };
        });
        queue.push(...node.children);
      }
      node.state = 'done';
    } catch (e) {
      root.error = e.message;
      node.state = 'end';
      onUpdate(root);
      return root;
    }
    onUpdate(root);
  }
  for (const n of queue) n.state = 'leaf';
  onUpdate(root);
  return root;
}

/** Nœud correspondant à un chemin de SAN depuis la racine, ou null. */
export function nodeAt(root, path) {
  let n = root;
  for (const san of path) {
    n = n && n.children.find((c) => c.move.san === san);
    if (!n) return null;
  }
  return n;
}

/** Tous les nœuds de l'arbre (parcours en profondeur). */
export function allNodes(root) {
  const out = [];
  const walk = (n) => { out.push(n); n.children.forEach(walk); };
  walk(root);
  return out;
}

/** Ligne principale : la réponse adverse la plus fréquente, puis mon coup recommandé, etc. */
export function mainLine(root) {
  const out = [];
  for (let n = root; n.children.length; ) {
    n = n.children.reduce((a, c) => (!a || (c.move.share || 1) > (a.move.share || 1) ? c : a), null);
    out.push(n);
  }
  return out;
}
