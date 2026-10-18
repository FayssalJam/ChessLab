// Cache persistant des réponses de l'explorateur Lichess, dans IndexedDB (bien plus grand que localStorage).
// Toutes les fonctions échouent en silence : sans IndexedDB (navigation privée…), on se passe de cache.
const DB = 'chesslab';
const STORE = 'explorer';
const TTL = 90 * 24 * 3600 * 1000; // les statistiques d'ouverture bougent lentement : 90 jours
const MAX = 60000;

let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE).createIndex('t', 't');
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : null);
      tx.onerror = tx.onabort = () => resolve(null);
    } catch { resolve(null); }
  }));
}

/** Données en cache pour cette clé (ou null si absentes ou périmées). */
export async function idbGet(key) {
  const v = await run('readonly', (s) => s.get(key));
  return v && Date.now() - v.t < TTL ? v.d : null;
}

export function idbSet(key, d) {
  return run('readwrite', (s) => { s.put({ d, t: Date.now() }, key); });
}

/** Écrit plusieurs entrées d'un coup : [[clé, données], …]. */
export function idbSetMany(entries, t = Date.now()) {
  return run('readwrite', (s) => { for (const [k, d] of entries) s.put({ d, t }, k); });
}

/** Supprime les entrées les plus anciennes au-delà de MAX. */
export async function idbPrune() {
  const n = await run('readonly', (s) => s.count());
  if (!n || n <= MAX) return;
  let extra = n - Math.floor(MAX * 0.9);
  await run('readwrite', (s) => {
    s.index('t').openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c && extra-- > 0) { c.delete(); c.continue(); }
    };
  });
}
