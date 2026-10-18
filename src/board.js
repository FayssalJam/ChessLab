// Plateau interactif (chessground) piloté par chess.js.
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { QUALITY, TARGET, REL, REL_UNKNOWN } from './colors.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';

const COLOR = { w: 'white', b: 'black' };

export function legalDests(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

export class Board {
  constructor(el, { onMove }) {
    this.onMove = onMove;
    this.orientation = 'white';
    this.cg = Chessground(el, {
      orientation: 'white',
      animation: { enabled: true, duration: 160 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: {
        enabled: true,
        brushes: {
          green: { key: 'g', color: '#15781B', opacity: 0.85, lineWidth: 10 },
          red: { key: 'r', color: '#d32f2f', opacity: 0.85, lineWidth: 10 },
          blue: { key: 'b', color: '#1565c0', opacity: 0.85, lineWidth: 10 },
          yellow: { key: 'y', color: '#e6a100', opacity: 0.9, lineWidth: 10 },
          paleBlue: { key: 'pb', color: '#003088', opacity: 0.4, lineWidth: 15 },
          paleGreen: { key: 'pg', color: '#15781B', opacity: 0.4, lineWidth: 15 },
          paleRed: { key: 'pr', color: '#d32f2f', opacity: 0.35, lineWidth: 15 },
          paleGrey: { key: 'pgr', color: '#4a4a4a', opacity: 0.35, lineWidth: 15 },
          target: { key: 'tg', color: TARGET, opacity: 0.85, lineWidth: 9 },
          // Une brosse par niveau de qualité (rouge → vert) pour les flèches de l'explorateur
          ...Object.fromEntries(QUALITY.map((c, i) => ['q' + i, { key: 'q' + i, color: c, opacity: 0.88, lineWidth: 10 }])),
          // Couleurs relatives de l'explorateur (comparé aux autres coups), et gris « trop peu de parties »
          ...Object.fromEntries(REL.map((c, i) => ['r' + i, { key: 'r' + i, color: c, opacity: 0.88, lineWidth: 10 }])),
          rx: { key: 'rx', color: REL_UNKNOWN, opacity: 0.8, lineWidth: 10 },
        },
      },
      movable: { free: false, showDests: true, events: { after: (o, d) => this._after(o, d) } },
    });
    this.fen = null;
  }

  /** Affiche une position. interactive: false | 'turn' (camp au trait) | 'w' | 'b' */
  set(fen, { lastMove, interactive = 'turn' } = {}) {
    this.fen = fen;
    const chess = new Chess(fen);
    const turn = chess.turn();
    const canMove = interactive === 'turn' || interactive === turn;
    this.cg.set({
      fen,
      turnColor: COLOR[turn],
      check: chess.inCheck() ? COLOR[turn] : false,
      lastMove: lastMove || undefined,
      movable: {
        color: canMove && !chess.isGameOver() ? COLOR[turn] : undefined,
        dests: canMove ? legalDests(chess) : new Map(),
      },
    });
    this.cg.setAutoShapes([]);
  }

  async _after(orig, dest) {
    const chess = new Chess(this.fen);
    const piece = chess.get(orig);
    let promotion;
    if (piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
      promotion = await askPromotion(piece.color);
    }
    this.onMove(orig + dest + (promotion || ''));
  }

  shapes(list) { this.cg.setAutoShapes(list || []); }
  flip() { this.cg.toggleOrientation(); this.orientation = this.cg.state.orientation; }
  setOrientation(color) { this.cg.set({ orientation: COLOR[color] || color }); this.orientation = this.cg.state.orientation; }
  get orientationColor() { return this.cg.state.orientation === 'white' ? 'w' : 'b'; }
}

/** Petite boîte de dialogue pour choisir la pièce de promotion. */
export function askPromotion(color) {
  const dlg = document.getElementById('promo-dlg');
  const glyph = color === 'w' ? { q: '♕', r: '♖', b: '♗', n: '♘' } : { q: '♛', r: '♜', b: '♝', n: '♞' };
  dlg.innerHTML = `<p>Promotion :</p><div class="row promo-row">${Object.entries(glyph).map(([k, g]) => `<button data-p="${k}">${g}</button>`).join('')}</div>`;
  return new Promise((resolve) => {
    dlg.querySelectorAll('button').forEach((b) => (b.onclick = () => { dlg.close(); resolve(b.dataset.p); }));
    dlg.oncancel = () => resolve('q');
    dlg.showModal();
  });
}
