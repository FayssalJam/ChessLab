// Outils bas niveau : géométrie de l'échiquier, attaques, évaluation statique des échanges (SEE).
import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FILES = 'abcdefgh';
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const NAME = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
export const NAME_CAP = { p: 'Pion', n: 'Cavalier', b: 'Fou', r: 'Tour', q: 'Dame', k: 'Roi' };
export const SIDE = { w: 'Blancs', b: 'Noirs' };
export const opp = (c) => (c === 'w' ? 'b' : 'w');

export const sq = (f, r) => FILES[f] + (r + 1);
export const fr = (s) => [FILES.indexOf(s[0]), +s[1] - 1];
export const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
export const isLight = (s) => { const [f, r] = fr(s); return (f + r) % 2 === 1; };

const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const dirsFor = (t) => (t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : t === 'q' ? ROOK_DIRS.concat(BISHOP_DIRS) : []);

/** Carte { case: {type, color} } à partir d'une instance chess.js ou d'un FEN. */
export function pieceMap(chessOrFen) {
  const c = typeof chessOrFen === 'string' ? new Chess(chessOrFen) : chessOrFen;
  const m = {};
  for (const row of c.board()) for (const p of row) if (p) m[p.square] = { type: p.type, color: p.color };
  return m;
}

/** Cases attaquées (contrôlées) par la pièce posée en s. */
export function attacksFrom(map, s) {
  const p = map[s];
  if (!p) return [];
  const [f, r] = fr(s);
  const out = [];
  if (p.type === 'p') {
    const dr = p.color === 'w' ? 1 : -1;
    for (const df of [-1, 1]) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
  } else if (p.type === 'n' || p.type === 'k') {
    for (const [df, dr] of p.type === 'n' ? KNIGHT : KING) if (onBoard(f + df, r + dr)) out.push(sq(f + df, r + dr));
  } else {
    for (const [df, dr] of dirsFor(p.type)) {
      let x = f + df, y = r + dr;
      while (onBoard(x, y)) {
        const t = sq(x, y);
        out.push(t);
        if (map[t]) break;
        x += df; y += dr;
      }
    }
  }
  return out;
}

/** attackers[color][case] = liste des cases des pièces de cette couleur qui attaquent la case. */
export function attackTable(map) {
  const t = { w: {}, b: {} };
  for (const s of Object.keys(map)) {
    const c = map[s].color;
    for (const a of attacksFrom(map, s)) (t[c][a] ||= []).push(s);
  }
  return t;
}

/** Échange statique : gain (en points) pour le camp qui capture en premier. */
export function see(targetValue, attackerValues, defenderValues) {
  const atk = [...attackerValues].sort((a, b) => a - b);
  const def = [...defenderValues].sort((a, b) => a - b);
  if (!atk.length) return 0;
  const g = [targetValue];
  let onSq = atk[0], ai = 1, di = 0, d = 0;
  for (;;) {
    d++;
    const defTurn = d % 2 === 1;
    const lst = defTurn ? def : atk;
    const idx = defTurn ? di : ai;
    if (idx >= lst.length) break;
    g[d] = onSq - g[d - 1];
    onSq = lst[idx];
    if (defTurn) di++; else ai++;
  }
  for (let k = g.length - 1; k > 0; k--) g[k - 1] = -Math.max(-g[k - 1], g[k]);
  return g[0];
}

/** Gain que le camp `by` peut espérer en capturant la pièce en s (>0 = matériel gagnable). */
export function seeOn(map, table, s, by) {
  const p = map[s];
  if (!p || p.color === by) return 0;
  const vals = (list) => (list || []).map((x) => VALUE[map[x].type]);
  return see(VALUE[p.type], vals(table[by][s]), vals(table[p.color][s]));
}

/** FEN avec le trait donné à l'autre camp (pour calculer les menaces adverses). */
export function flipTurn(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  return parts.join(' ');
}

export function chessWithTurn(fen, color) {
  const parts = fen.split(' ');
  if (parts[1] !== color) return safeChess(flipTurn(fen));
  return safeChess(fen);
}

export function safeChess(fen) {
  try { return new Chess(fen); } catch { return null; }
}

/** Clé de position sans compteurs de coups (pour le cache et le répertoire). */
export const posKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function material(map) {
  const m = { w: 0, b: 0 };
  for (const s in map) if (map[s].type !== 'k') m[map[s].color] += VALUE[map[s].type];
  return m;
}

export function findKing(map, color) {
  for (const s in map) if (map[s].type === 'k' && map[s].color === color) return s;
  return null;
}

export const pieceLabel = (p, s) => `${NAME[p.type]} ${s}`;

/** Convertit une suite de coups UCI en SAN depuis un FEN. */
export function uciLineToSan(fen, ucis) {
  const c = safeChess(fen);
  const out = [];
  if (!c) return out;
  for (const u of ucis) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch { break; }
  }
  return out;
}

export function moveNumberPrefix(fen, i) {
  const [, turn, , , , full] = fen.split(' ');
  const ply = (turn === 'w' ? 0 : 1) + i;
  const num = +full + Math.floor(ply / 2);
  if (ply % 2 === 0) return num + '.';
  return i === 0 ? num + '...' : '';
}

export function formatLine(fen, sans) {
  return sans.map((s, i) => { const p = moveNumberPrefix(fen, i); return p ? p + ' ' + s : s; }).join(' ');
}
