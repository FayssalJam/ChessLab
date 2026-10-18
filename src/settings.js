// Réglages persistés dans le navigateur.
const KEY = 'cc.settings.v1';

// Bornes des tranches Elo de l'explorateur Lichess (chaque tranche = [borne, borne suivante[).
export const RATING_BANDS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
export const BAND_EDGES = [...RATING_BANDS, 3200];
export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

const DEFAULTS = {
  // Plages Elo en indices de BAND_EDGES : [début, fin[ → tranches RATING_BANDS[début..fin-1]
  myRange: [3, 5], // 1400–1799
  targetRange: [6, 8], // 2000–2499
  compare: false,
  arrowMode: 'popular', // 'popular' | 'best'
  branches: 3,
  speeds: ['blitz', 'rapid', 'classical'],
  token: '',
  localDb: 'http://127.0.0.1:8765', // base locale de l'explorateur (explorer-db/serve.py) ; '' pour la désactiver
  color: 'w',
  minGames: 30,
  engineDepth: 18,
};

export const settings = load();

function load() {
  let s;
  try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { s = { ...DEFAULTS }; }
  // Migration de l'ancien réglage « rating » vers une plage
  if (s.rating && !s._migrated) {
    const i = RATING_BANDS.reduce((acc, b, k) => (s.rating >= b ? k : acc), 0);
    s.myRange = [i, i + 1];
    s.targetRange = [Math.min(i + 1, 8), Math.min(i + 3, 9)];
    s._migrated = true;
  }
  return s;
}
export function saveSettings(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
}

export const bandsOf = ([a, b]) => RATING_BANDS.slice(a, b);
/** Tranches Lichess de « mon niveau » (plage choisie par l'utilisateur). */
export const myBands = () => bandsOf(settings.myRange);
/** Tranches du « niveau cible » (joueurs plus forts dont on s'inspire). */
export const higherBands = () => bandsOf(settings.targetRange);
/** Elo représentatif (milieu de la plage), utile pour régler le moteur. */
export const myRating = () => Math.round((BAND_EDGES[settings.myRange[0]] + Math.min(BAND_EDGES[settings.myRange[1]], 2800)) / 2);

export function rangeLabel([a, b]) {
  const lo = BAND_EDGES[a], hi = BAND_EDGES[b];
  if (a === 0 && b === BAND_EDGES.length - 1) return 'Tous niveaux';
  if (a === 0) return `< ${hi}`;
  if (b === BAND_EDGES.length - 1) return `${lo}+`;
  return `${lo}–${hi - 1}`;
}
export const bandLabel = (bands) => {
  if (!bands.length) return '—';
  const a = RATING_BANDS.indexOf(bands[0]);
  return rangeLabel([a, a + bands.length]);
};

export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function restore(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
