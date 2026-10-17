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

export const ACCENT = '#4ade80';
export const TARGET = '#8b8cf8';
export const GOLD = '#fbbf24';

const GLYPH = { N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
/** « Nf3 » → « ♞f3 » (comme dans les arbres de la vidéo). */
export const prettySan = (san) => (san && GLYPH[san[0]] ? GLYPH[san[0]] + san.slice(1) : san || '');
