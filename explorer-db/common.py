"""Définitions partagées par build.py et serve.py (clé de position, tranches Elo, cadences)."""
from pathlib import Path

import chess
import chess.polyglot

HERE = Path(__file__).resolve().parent
DEFAULT_DB = HERE / 'explorer.sqlite'

# Tranches Elo de l'explorateur Lichess : chaque tranche va de sa borne à la suivante.
BANDS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]
# Cadences Lichess, stockées par leur indice.
SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence']
SPEED_INDEX = {s: i for i, s in enumerate(SPEEDS)}


def band_of(rating):
    """Tranche Elo (borne basse) d'une moyenne d'Elo."""
    band = 0
    for b in BANDS:
        if rating >= b:
            band = b
    return band


def speed_of(time_control):
    """Indice de cadence d'après l'en-tête TimeControl (« 180+2 », « - »), comme Lichess, ou None."""
    if time_control == '-':
        return SPEED_INDEX['correspondence']
    try:
        base, inc = time_control.split('+')
        est = int(base) + 40 * int(inc)
    except ValueError:
        return None
    if est < 30:
        return SPEED_INDEX['ultraBullet']
    if est < 180:
        return SPEED_INDEX['bullet']
    if est < 480:
        return SPEED_INDEX['blitz']
    if est < 1500:
        return SPEED_INDEX['rapid']
    return SPEED_INDEX['classical']


def pos_key(board):
    """Clé de position : hachage Zobrist (Polyglot) en entier signé 64 bits pour SQLite.
    Il ignore les compteurs de coups et ne tient compte de la prise en passant que si elle est jouable,
    donc deux FEN de la même position donnent la même clé."""
    h = chess.polyglot.zobrist_hash(board)
    return h - (1 << 64) if h >= 1 << 63 else h
