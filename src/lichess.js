// Connexion au compte Lichess (OAuth2 + PKCE, sans serveur) : le jeton obtenu sert à l'explorateur d'ouvertures.
// Doc : https://lichess.org/api — Lichess accepte n'importe quel client_id pour une appli publique.
import { settings, saveSettings, restore, store } from './settings.js';

const HOST = 'https://lichess.org';
const CLIENT_ID = 'chesslab';
const PENDING_KEY = 'cc.oauth.pending';
const ACCOUNT_KEY = 'cc.lichess.account';

export class LichessError extends Error {}

const redirectUri = () => location.origin + location.pathname;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/** Redirige vers lichess.org pour autoriser ChessLab (aucune permission demandée). */
export async function login() {
  const verifier = randomString();
  const state = randomString();
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state })); } catch { /* ignore */ }
  const params = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  location.assign(`${HOST}/oauth?${params}`);
}

/**
 * À appeler au démarrage : si l'URL revient de lichess.org/oauth, échange le code contre un jeton.
 * Renvoie le compte connecté, null si rien à faire ; lève LichessError en cas d'échec.
 */
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  history.replaceState(null, '', redirectUri() + location.hash);
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  if (q.has('error')) throw new LichessError(q.get('error') === 'access_denied' ? 'Connexion Lichess annulée.' : 'Connexion Lichess refusée : ' + q.get('error'));
  if (!pending || pending.state !== q.get('state')) throw new LichessError('Connexion Lichess invalide (état inattendu), réessayez.');
  const res = await fetch(`${HOST}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: q.get('code'), code_verifier: pending.verifier,
      redirect_uri: redirectUri(), client_id: CLIENT_ID,
    }),
  }).catch(() => { throw new LichessError('Impossible de joindre lichess.org.'); });
  if (!res.ok) throw new LichessError(`Lichess a refusé le jeton (HTTP ${res.status}).`);
  const { access_token } = await res.json();
  saveSettings({ token: access_token });
  return refreshAccount();
}

export async function logout() {
  const token = settings.token;
  saveSettings({ token: '' });
  store(ACCOUNT_KEY, null);
  // Révoque le jeton côté Lichess (sans bloquer si le réseau échoue).
  if (token) fetch(`${HOST}/api/token`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
}

/** Appel authentifié (si un jeton existe) à l'API Lichess. */
export async function api(path, { accept = 'application/json', params } = {}) {
  const headers = { Accept: accept };
  if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
  const url = `${HOST}${path}${params ? '?' + new URLSearchParams(params) : ''}`;
  let res;
  try { res = await fetch(url, { headers }); } catch { throw new LichessError('Impossible de joindre lichess.org.'); }
  if (res.status === 401) {
    if (settings.token) { saveSettings({ token: '' }); store(ACCOUNT_KEY, null); }
    throw new LichessError('Session Lichess expirée : reconnectez-vous.');
  }
  if (res.status === 429) throw new LichessError('Trop de requêtes vers Lichess, réessayez dans une minute.');
  if (res.status === 404) throw new LichessError('Introuvable sur Lichess.');
  if (!res.ok) throw new LichessError(`Erreur Lichess ${res.status}`);
  return res;
}

/** Compte mémorisé (affichage immédiat au démarrage), ou null. */
export const cachedAccount = () => (settings.token ? restore(ACCOUNT_KEY, null) : null);

export async function refreshAccount() {
  const acc = await (await api('/api/account')).json();
  const slim = { id: acc.id, username: acc.username, url: acc.url, perfs: acc.perfs || {} };
  store(ACCOUNT_KEY, slim);
  return slim;
}

/**
 * Elo représentatif du joueur pour les cadences choisies : la cadence la plus jouée l'emporte.
 * Renvoie {speed, rating, games} ou null.
 */
export function mainRating(account, speeds = settings.speeds) {
  const list = speeds
    .map((s) => ({ speed: s, ...(account.perfs[s] || {}) }))
    .filter((p) => p.rating && p.games > 0 && !p.prov);
  if (!list.length) return null;
  return list.sort((a, b) => b.games - a.games)[0];
}
