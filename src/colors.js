// Palette partagée : couleur d'un coup selon le score obtenu par le camp qui le joue.
export const QUALITY = ['#f0506e', '#f5793a', '#f4b740', '#c8d64b', '#7bd88f', '#3ddc97', '#22d3ae'];

/** Indice 0..6 : 0 = le coup perd beaucoup de points, 6 = il en gagne beaucoup. */
export function qualityIndex(score) {
  if (score == null) return 3;
  const t = (score - 0.4) / 0.2; // 40 % → 0, 60 % → 1
  return Math.max(0, Math.min(6, Math.round(t * 6)));
}
export const qualityColor = (score) => QUALITY[qualityIndex(score)];
export const qualityBrush = (score) => 'q' + qualityIndex(score);

// Couleur relative (arbre d'ouverture, bulles, flèches) : le résultat d'un coup comparé aux autres coups
// de la même position, pour le camp qui le joue. delta = score du coup − score moyen de la position.
export const REL = ['#f0506e', '#f5976b', '#9aa3b5', '#7ddc9f', '#22c96f'];
export const REL_UNKNOWN = '#4b5263';
export const REL_LABELS = ['nettement moins bon', 'un peu moins bon', 'équivalent', 'un peu meilleur', 'nettement meilleur'];
/** Indice 0..4 (rouge → vert), ou -1 si trop peu de parties pour juger. */
export function relIndex(delta) {
  if (delta == null) return -1;
  return delta <= -0.04 ? 0 : delta <= -0.015 ? 1 : delta < 0.015 ? 2 : delta < 0.04 ? 3 : 4;
}
export const relColor = (delta) => (delta == null ? REL_UNKNOWN : REL[relIndex(delta)]);
export const relBrush = (delta) => (delta == null ? 'rx' : 'r' + relIndex(delta));
export const relLabel = (delta) => (delta == null ? 'trop peu de parties pour juger' : REL_LABELS[relIndex(delta)]);

export const ACCENT = '#4ade80';
export const TARGET = '#8b8cf8';
export const GOLD = '#fbbf24';

const GLYPH = { N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
/** « Nf3 » → « ♞f3 » (comme dans les arbres de la vidéo). */
export const prettySan = (san) => (san && GLYPH[san[0]] ? GLYPH[san[0]] + san.slice(1) : san || '');
