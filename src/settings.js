// Réglages persistés dans le navigateur.
const KEY = 'cc.settings.v1';

export const RATING_BANDS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

const DEFAULTS = {
  rating: 1500,
  higherSteps: 2, // nombre de tranches au-dessus de la mienne pour « niveau supérieur »
  speeds: ['blitz', 'rapid', 'classical'],
  token: '',
  color: 'w',
  minGames: 30,
  engineDepth: 18,
};

export const settings = load();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
}

/** Tranche Lichess contenant la note (1500 → 1400 = tranche 1400-1599). */
export function myBand(rating = settings.rating) {
  let b = RATING_BANDS[0];
  for (const x of RATING_BANDS) if (rating >= x) b = x;
  return b;
}
export function higherBands() {
  const i = RATING_BANDS.indexOf(myBand());
  return RATING_BANDS.slice(i + 1, i + 1 + settings.higherSteps);
}
export const bandLabel = (bands) => bands.length ? `${bands[0]}–${(RATING_BANDS[RATING_BANDS.indexOf(bands[bands.length - 1]) + 1] || 3000) - 1}` : '—';

export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function restore(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
