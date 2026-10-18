"""Petit serveur HTTP local qui répond comme l'explorateur Lichess, à partir de explorer.sqlite.

    python serve.py                 # http://127.0.0.1:8765
    python serve.py --port 9000 --db autre.sqlite

GET /lichess?fen=…&ratings=1400,1600&speeds=blitz,rapid&moves=15
    même réponse que explorer.lichess.org/lichess, ou 404 si la position n'est pas dans la base
    (trop profonde ou trop rare) : l'appli interroge alors Lichess.
GET /status
    informations sur la base (mois, nombre de parties, profondeur…).
"""
import argparse
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import chess

from common import BANDS, DEFAULT_DB, SPEED_INDEX, pos_key

DB_PATH = DEFAULT_DB


def connect():
    # Une connexion par requête : la base peut être remplacée par build.py pendant que le serveur tourne.
    if not DB_PATH.exists():
        return None
    return sqlite3.connect(f'file:{DB_PATH.as_posix()}?mode=ro', uri=True)


def status():
    db = connect()
    if db is None:
        return 503, {'error': f'base absente : lancez build.py ({DB_PATH.name})'}
    with db:
        meta = dict(db.execute('SELECT k, v FROM meta'))
    db.close()
    for k in ('games', 'positions', 'rows', 'maxPly', 'minGames'):
        if k in meta:
            meta[k] = int(meta[k])
    return 200, meta


def explore(q):
    try:
        board = chess.Board(q.get('fen', [chess.STARTING_FEN])[0])
    except ValueError:
        return 400, {'error': 'FEN invalide'}
    ratings = [int(x) for x in ','.join(q.get('ratings', [])).split(',') if x.strip().isdigit()] or BANDS
    speeds = [SPEED_INDEX[s] for s in ','.join(q.get('speeds', [])).split(',') if s in SPEED_INDEX] or list(SPEED_INDEX.values())
    limit = int(q.get('moves', ['12'])[0] or 12)
    key = pos_key(board)
    db = connect()
    if db is None:
        return 503, {'error': 'base absente'}
    try:
        if not db.execute('SELECT 1 FROM moves WHERE pos = ? LIMIT 1', (key,)).fetchone():
            return 404, {'error': 'position absente de la base locale'}
        sql = (f'SELECT uci, SUM(w), SUM(d), SUM(b), SUM(r) FROM moves WHERE pos = ? '
               f'AND band IN ({",".join("?" * len(ratings))}) AND speed IN ({",".join("?" * len(speeds))}) GROUP BY uci')
        rows = db.execute(sql, (key, *ratings, *speeds)).fetchall()
        opening = db.execute('SELECT eco, name FROM openings WHERE pos = ?', (key,)).fetchone()
    finally:
        db.close()
    white = sum(r[1] for r in rows)
    draws = sum(r[2] for r in rows)
    black = sum(r[3] for r in rows)
    moves = []
    for uci, w, d, b, r in sorted((r for r in rows if r[0]), key=lambda r: -(r[1] + r[2] + r[3]))[:limit]:
        mv = chess.Move.from_uci(uci)
        moves.append({'uci': uci, 'san': board.san(mv), 'white': w, 'draws': d, 'black': b, 'averageRating': r // (w + d + b)})
    return 200, {
        'white': white, 'draws': draws, 'black': black, 'moves': moves,
        'opening': {'eco': opening[0], 'name': opening[1]} if opening else None,
        'source': 'local',
    }


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send(204, {})

    def do_GET(self):
        url = urlparse(self.path)
        try:
            if url.path == '/lichess':
                self.send(*explore(parse_qs(url.query)))
            elif url.path == '/status':
                self.send(*status())
            else:
                self.send(404, {'error': 'route inconnue'})
        except sqlite3.Error as e:
            self.send(503, {'error': f'base illisible : {e}'})

    def log_message(self, fmt, *args):
        pass  # silencieux : une requête par position affichée


def main():
    global DB_PATH
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--host', default='127.0.0.1')
    p.add_argument('--db', default=str(DEFAULT_DB))
    args = p.parse_args()
    DB_PATH = Path(args.db).resolve()
    code, info = status()
    print(f'Base : {DB_PATH}' + (f" ({info.get('source')}, {info.get('games', 0):_} parties)".replace('_', ' ') if code == 200 else ' — absente pour le moment'))
    print(f'Serveur prêt : http://{args.host}:{args.port}  (Ctrl+C pour arrêter)')
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
