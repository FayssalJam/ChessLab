// Client de l'explorateur d'ouvertures Lichess (base de toutes les parties Lichess, filtrable par Elo).
// Doc : https://lichess.org/api#tag/Opening-Explorer
// Ordre de recherche : mémoire → cache IndexedDB → base locale (explorer-db/serve.py) → Lichess en direct.
import { settings, myBands, higherBands, restore } from './settings.js';
import { Chess } from 'chess.js';
import { posKey } from './core.js';
import { idbGet, idbSet, idbSetMany, idbPrune } from './idb-cache.js';

const BASE = 'https://explorer.lichess.org';
const OLD_CACHE_KEY = 'cc.explorer.cache.v1';
const MAX_MEMORY = 6000;

const cache = new Map();
const inflight = new Map();
function remember(key, data) {
  cache.delete(key);
  cache.set(key, data);
  if (cache.size > MAX_MEMORY) cache.delete(cache.keys().next().value);
}

// Ancien cache (localStorage, limité à quelques Mo) : on le reprend dans IndexedDB puis on libère la place.
{
  const old = restore(OLD_CACHE_KEY, null);
  if (old) {
    const entries = Object.entries(old);
    for (const [k, d] of entries) remember(k, d);
    idbSetMany(entries).then(() => { try { localStorage.removeItem(OLD_CACHE_KEY); } catch { /* ignore */ } });
  }
  idbPrune();
}

// --- État affiché dans la barre du haut (base locale, attente imposée par Lichess) ---
export const explorerStatus = { local: null, waitUntil: 0 };
const statusListeners = new Set();
export function onExplorerStatus(cb) {
  statusListeners.add(cb);
  cb(explorerStatus);
  return () => statusListeners.delete(cb);
}
function setStatus(patch) {
  Object.assign(explorerStatus, patch);
  for (const cb of statusListeners) cb(explorerStatus);
}

// --- Base locale ---
// Construite chaque mois depuis le dump Lichess (voir explorer-db/). Si elle ne répond pas, on la
// redemande au bout de 30 s ; une position absente (trop profonde ou trop rare) part chez Lichess.
let localCheck = null;
let localCheckedAt = 0; // 0 = vérification en cours
let localUrl = null;
export function checkLocalDb(force = false) {
  const url = (settings.localDb || '').replace(/\/+$/, '');
  if (!url) { setStatus({ local: null }); return Promise.resolve(false); }
  const maxAge = explorerStatus.local ? 300000 : 30000;
  const fresh = localCheckedAt === 0 || Date.now() - localCheckedAt < maxAge;
  if (localCheck && url === localUrl && fresh && !force) return localCheck;
  localUrl = url;
  localCheckedAt = 0;
  localCheck = (async () => {
    try {
      const res = await fetch(url + '/status', { signal: AbortSignal.timeout(1500) });
      const info = res.ok ? await res.json() : null;
      setStatus({ local: info ? { ...info, url } : null });
    } catch {
      setStatus({ local: null });
    }
    localCheckedAt = Date.now();
    return !!explorerStatus.local;
  })();
  return localCheck;
}

async function fetchLocal(path) {
  if (!(await checkLocalDb())) return null;
  try {
    const res = await fetch(explorerStatus.local.url + path, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return res.json();
    if (res.status === 503) checkLocalDb(true);
  } catch {
    checkLocalDb(true);
  }
  return null; // 404 = position absente de la base locale
}

// File d'attente : une requête à la fois, ~4 par seconde max (respect des limites Lichess).
let chain = Promise.resolve();
let last = 0;
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, last + 260 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

export class ExplorerError extends Error {}

async function fetchJson(url) {
  const headers = {};
  if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      throw new ExplorerError("Impossible de joindre l'explorateur Lichess (réseau ou blocage CORS).");
    }
    if (res.status === 429) {
      // Lichess impose une minute de pause : on l'affiche au lieu d'attendre en silence.
      setStatus({ waitUntil: Date.now() + 61000 });
      await new Promise((r) => setTimeout(r, 61000));
      setStatus({ waitUntil: 0 });
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ExplorerError("L'explorateur Lichess demande une connexion : cliquez sur « Se connecter avec Lichess » en haut à droite.");
    if (!res.ok) throw new ExplorerError(`Erreur explorateur ${res.status}`);
    return res.json();
  }
  throw new ExplorerError('Trop de requêtes, réessayez dans une minute.');
}

function request(fen, { db = 'lichess', ratings, speeds = settings.speeds, moves = 15 } = {}) {
  const params = new URLSearchParams({ variant: 'standard', fen, moves: String(moves), topGames: '0', recentGames: '0' });
  if (db === 'lichess') {
    params.set('ratings', (ratings || myBands()).join(','));
    params.set('speeds', speeds.join(','));
  }
  const path = `/${db}?${params}`;
  const key = db + '|' + posKey(fen) + '|' + params.get('ratings') + '|' + params.get('speeds') + '|' + moves;
  return { url: BASE + path, path, key };
}

/** Données déjà en cache (sans requête réseau), ou null. */
export function peek(fen, opts) {
  return cache.get(request(fen, opts).key) || null;
}

/**
 * Statistiques d'une position.
 * db : 'lichess' (filtrée par Elo/cadence) ou 'masters'.
 */
export function explore(fen, opts = {}) {
  const { url, path, key } = request(fen, opts);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const slim = (data, source) => ({
    white: data.white, draws: data.draws, black: data.black,
    opening: data.opening || null,
    moves: normalizeMoves(fen, data.moves || []),
    source,
  });
  const p = (async () => {
    const stored = await idbGet(key);
    if (stored) { remember(key, stored); return stored; }
    // La base locale n'est pas mise dans IndexedDB : elle répond en quelques ms et change chaque mois.
    const local = (opts.db || 'lichess') === 'lichess' ? await fetchLocal(path) : null;
    if (local) { const d = slim(local, 'local'); remember(key, d); return d; }
    const d = slim(await throttled(() => fetchJson(url)), 'lichess');
    remember(key, d);
    idbSet(key, d);
    return d;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Lichess note le roque « e1h1 » : on recalcule l'UCI standard à partir du SAN.
function normalizeMoves(fen, moves) {
  const out = [];
  for (const m of moves) {
    try {
      const mv = new Chess(fen).move(m.san);
      out.push({ uci: mv.from + mv.to + (mv.promotion || ''), san: mv.san, white: m.white, draws: m.draws, black: m.black, averageRating: m.averageRating });
    } catch { /* coup inconnu : ignoré */ }
  }
  return out;
}

export const total = (x) => (x ? x.white + x.draws + x.black : 0);
/** Score (0..1) pour le camp `color` : victoire = 1, nulle = ½. */
export function scoreFor(x, color) {
  const n = total(x);
  if (!n) return null;
  return ((color === 'w' ? x.white : x.black) + x.draws / 2) / n;
}
/** Score lissé vers 50 % pour les petits échantillons (évite qu'un coup joué 3 fois paraisse génial). */
export function smoothScore(x, color, prior = 25) {
  const n = total(x);
  const s = scoreFor(x, color);
  return n ? (s * n + 0.5 * prior) / (n + prior) : 0.5;
}

/**
 * Compare « mon niveau » et « niveau supérieur » pour la position, et classe les coups.
 * Renvoie {my, high, rows:[{uci, san, my, high, myShare, highShare, myScore, highScore, rank, badges}]}
 */
export async function compare(fen) {
  const color = fen.split(' ')[1];
  const hb = higherBands();
  const [my, high] = await Promise.all([
    explore(fen, { ratings: myBands() }),
    hb.length ? explore(fen, { ratings: hb }) : Promise.resolve(null),
  ]);
  const byUci = new Map();
  for (const m of my.moves) byUci.set(m.uci, { uci: m.uci, san: m.san, my: m, high: null });
  if (high) for (const m of high.moves) {
    if (!byUci.has(m.uci)) byUci.set(m.uci, { uci: m.uci, san: m.san, my: null, high: m });
    else byUci.get(m.uci).high = m;
  }
  const myN = total(my), highN = total(high);
  const rows = [...byUci.values()].map((r) => {
    const myShare = myN ? total(r.my) / myN : 0;
    const highShare = highN ? total(r.high) / highN : 0;
    const myScore = scoreFor(r.my, color);
    const highScore = scoreFor(r.high, color);
    // Classement : ce qui marche chez les plus forts (60 %) et à mon niveau (40 %), pondéré par la popularité.
    const sH = smoothScore(r.high, color), sM = smoothScore(r.my, color);
    const pop = Math.sqrt(Math.max(highShare, myShare));
    const enough = total(r.high) + total(r.my) >= settings.minGames;
    const rank = enough ? (0.6 * sH + 0.4 * sM) * (0.7 + 0.3 * pop) : 0;
    return { ...r, myShare, highShare, myScore, highScore, rank, games: total(r.my) + total(r.high) };
  });
  rows.sort((a, b) => b.highShare + b.myShare - (a.highShare + a.myShare));
  // Badges pédagogiques
  const best = [...rows].filter((r) => r.rank > 0).sort((a, b) => b.rank - a.rank)[0];
  for (const r of rows) {
    r.badges = [];
    if (best && r.uci === best.uci) r.badges.push('best');
    if (r.myShare >= 0.08 && r.myScore != null && r.myScore < 0.42 && total(r.my) >= settings.minGames) r.badges.push('trap');
    if (r.myShare < 0.05 && r.highShare >= 0.1) r.badges.push('pop-high');
    if (r.myShare < 0.1 && total(r.my) >= 15 && r.myScore >= 0.58) r.badges.push('weapon');
  }
  return { my, high, rows, best, color };
}

/**
 * Coups candidats d'une position, enrichis (part, score, parties), triés selon le mode :
 * 'popular' = les plus joués ; 'best' = meilleur résultat parmi les coups assez joués.
 * delta = écart entre le score du coup et le score moyen de la position (pour le camp qui joue),
 * lissé vers 0 pour les petits échantillons ; null quand il y a trop peu de parties pour juger.
 * C'est lui qui donne la couleur et l'étoile ★, donc le meilleur coup est toujours le plus vert.
 */
export function candidates(data, color, mode = 'popular') {
  const n = total(data);
  if (!n) return [];
  const posScore = scoreFor(data, color);
  const minGames = Math.min(settings.minGames, Math.max(5, n * 0.01));
  const prior = 25;
  const list = data.moves.map((m) => {
    const games = total(m), score = scoreFor(m, color);
    const delta = games >= minGames ? (score * games + posScore * prior) / (games + prior) - posScore : null;
    return { ...m, games, share: games / n, score, posScore, delta, rank: delta ?? -1 };
  });
  const eligible = list.filter((m) => m.delta != null && m.share >= 0.02);
  const best = eligible.sort((a, b) => b.rank - a.rank)[0];
  for (const m of list) m.best = !!best && m.uci === best.uci;
  if (mode === 'best') {
    const strong = list.filter((m) => m.delta != null && m.share >= 0.02).sort((a, b) => b.rank - a.rank);
    const rest = list.filter((m) => !strong.includes(m)).sort((a, b) => b.share - a.share);
    return [...strong, ...rest];
  }
  return list.sort((a, b) => b.share - a.share);
}
