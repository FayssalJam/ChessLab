"""Construit la base locale de l'explorateur d'ouvertures à partir d'un dump mensuel Lichess.

Source : https://database.lichess.org (toutes les parties classées du mois, en .pgn.zst).
Le dump est lu en flux (téléchargement et décompression à la volée) : rien n'est écrit sur le disque
à part la base. Seuls les `--max-ply` premiers demi-coups de chaque partie sont comptés, et les
positions vues dans moins de `--min-games` parties sont supprimées (l'appli interroge alors Lichess).

Exemples :
    python build.py                                # mois précédent, toutes les parties
    python build.py --month 2026-09 --max-games 5000000
    python build.py --file lichess_db_standard_rated_2026-09.pgn.zst
"""
import argparse
import io
import multiprocessing as mp
import os
import re
import shutil
import signal
import sqlite3
import sys
import tempfile
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path

import chess
import zstandard

from common import DEFAULT_DB, band_of, pos_key, speed_of

DUMP_URL = 'https://database.lichess.org/standard/lichess_db_standard_rated_{}.pgn.zst'
OPENINGS_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/{}.tsv'
RESULTS = {'1-0': 0, '1/2-1/2': 1, '0-1': 2}
COMMENT = re.compile(r'\{[^}]*\}')
BATCH = 2000          # parties envoyées d'un coup à un processus de calcul
FLUSH_AT = 1_500_000  # entrées agrégées en mémoire (par processus) avant écriture sur disque

RAW_SCHEMA = 'CREATE TABLE IF NOT EXISTS raw (pos INTEGER, band INTEGER, speed INTEGER, uci TEXT, w INTEGER, d INTEGER, b INTEGER, r INTEGER)'


def previous_month():
    t = date.today().replace(day=1)
    return f'{t.year - 1}-12' if t.month == 1 else f'{t.year}-{t.month - 1:02d}'


# --- Lecture du dump -----------------------------------------------------------

def open_source(args):
    """Flux texte du PGN, depuis une URL ou un fichier (.pgn ou .pgn.zst)."""
    if args.file:
        raw = open(args.file, 'rb')
        name = args.file
    else:
        url = args.url or DUMP_URL.format(args.month)
        req = urllib.request.Request(url, headers={'User-Agent': 'ChessLab explorer-db'})
        raw = urllib.request.urlopen(req, timeout=60)
        name = url
    compressed = name.endswith('.zst')
    stream = zstandard.ZstdDecompressor().stream_reader(raw, read_size=1 << 20) if compressed else raw
    return io.TextIOWrapper(stream, encoding='utf-8', errors='replace', newline=''), name


def read_games(text, max_ply):
    """Parties sous forme compacte : (tranche, cadence, résultat, Elo moyen, coups, coups_complets).
    Les coups sont coupés juste après les `max_ply` premiers demi-coups pour alléger les échanges."""
    cut_tag = f' {max_ply // 2 + 1}. '
    hdr = {}
    moves = []

    def emit():
        res = RESULTS.get(hdr.get('Result'))
        if res is None or 'FEN' in hdr:
            return None
        try:
            avg = (int(hdr['WhiteElo']) + int(hdr['BlackElo'])) // 2
        except (KeyError, ValueError):
            return None
        speed = speed_of(hdr.get('TimeControl', ''))
        if speed is None:
            return None
        mt = ' '.join(moves)
        i = mt.find(cut_tag)
        complete = i < 0
        return band_of(avg), speed, res, avg, mt if complete else mt[:i], complete

    for line in text:
        if line.startswith('['):
            if moves:
                g = emit()
                if g:
                    yield g
                hdr, moves = {}, []
            sp = line.find(' ')
            hdr[line[1:sp]] = line[sp + 2:line.rfind('"')]
        elif line.strip():
            moves.append(line.strip())
        elif moves:
            g = emit()
            if g:
                yield g
            hdr, moves = {}, []
    if moves:
        g = emit()
        if g:
            yield g


# --- Calcul (processus fils) -----------------------------------------------------

def worker(queue, shard, max_ply):
    """Rejoue les premiers coups de chaque partie et agrège (position, tranche, cadence, coup) → V/N/D.
    Un coup vide '' marque une partie terminée dans cette position (pour le total de la position)."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)  # Ctrl+C : c'est le processus principal qui arrête la lecture
    db = sqlite3.connect(shard)
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute(RAW_SCHEMA)
    agg = {}
    start_key = pos_key(chess.Board())

    def flush():
        db.executemany('INSERT INTO raw VALUES (?,?,?,?,?,?,?,?)', ((*k, *v) for k, v in agg.items()))
        db.commit()
        agg.clear()

    def add(k, res, avg):
        e = agg.get(k)
        if e is None:
            agg[k] = e = [0, 0, 0, 0]
        e[res] += 1
        e[3] += avg

    while True:
        batch = queue.get()
        if batch is None:
            break
        for band, speed, res, avg, text, complete in batch:
            if '{' in text:
                text = COMMENT.sub(' ', text)
            board = chess.Board()
            key = start_key
            ply = 0
            ended = True  # la liste de coups a été lue jusqu'au bout
            for tok in text.split():
                c = tok[0]
                if c.isdigit() or c == '$' or c == '*':
                    continue  # numéro de coup, résultat ou annotation
                if ply >= max_ply:
                    ended = False
                    break
                try:
                    mv = board.push_san(tok.rstrip('?!'))
                except ValueError:
                    ended = False
                    break
                add((key, band, speed, mv.uci()), res, avg)
                key = pos_key(board)
                ply += 1
            if ended and complete and ply < max_ply:
                add((key, band, speed, ''), res, avg)
        if len(agg) >= FLUSH_AT:
            flush()
    flush()
    db.close()


# --- Ouvertures nommées ------------------------------------------------------------

def load_openings():
    """Noms d'ouvertures Lichess (lichess-org/chess-openings) indexés par clé de position."""
    rows = {}
    for part in 'abcde':
        req = urllib.request.Request(OPENINGS_URL.format(part), headers={'User-Agent': 'ChessLab explorer-db'})
        with urllib.request.urlopen(req, timeout=30) as f:
            lines = f.read().decode('utf-8').splitlines()
        for line in lines[1:]:
            eco, name, pgn = line.split('\t')[:3]
            board = chess.Board()
            try:
                for tok in pgn.split():
                    if not tok[0].isdigit():
                        board.push_san(tok)
            except ValueError:
                continue
            rows[pos_key(board)] = (eco, name)
    return [(k, eco, name) for k, (eco, name) in rows.items()]


# --- Programme principal -------------------------------------------------------------

# Sous Windows, un fichier peut rester verrouillé un instant (serveur en pleine requête, antivirus) : on réessaie.
def replace_with_retry(src, dst):
    for _ in range(50):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            time.sleep(0.2)
    os.replace(src, dst)


def remove_dir(path):
    for _ in range(50):
        shutil.rmtree(path, ignore_errors=True)
        if not path.exists():
            return
        time.sleep(0.2)
    print(f'Dossier temporaire à supprimer à la main : {path}', flush=True)


def fmt(n):
    return f'{n:,}'.replace(',', ' ')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group()
    src.add_argument('--month', default=previous_month(), help='mois du dump Lichess, AAAA-MM (défaut : mois précédent)')
    src.add_argument('--url', help='URL d\'un dump .pgn.zst')
    src.add_argument('--file', help='dump local (.pgn ou .pgn.zst)')
    p.add_argument('--out', default=str(DEFAULT_DB), help='base SQLite produite (défaut : explorer.sqlite)')
    p.add_argument('--max-ply', type=int, default=20, help='demi-coups comptés par partie (défaut : 20)')
    p.add_argument('--min-games', type=int, default=3, help='parties minimum pour garder une position (défaut : 3)')
    p.add_argument('--max-games', type=int, default=0, help='arrêter après N parties (0 = tout le dump)')
    p.add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 2) - 1), help='processus de calcul')
    p.add_argument('--no-openings', action='store_true', help='ne pas télécharger les noms d\'ouvertures')
    args = p.parse_args()

    out = Path(args.out).resolve()
    work = Path(tempfile.mkdtemp(prefix='chesslab-db-', dir=out.parent))
    shards = [work / f'shard{i}.sqlite' for i in range(args.workers)]
    text, source = open_source(args)
    print(f'Source : {source}\n{args.workers} processus, {args.max_ply} demi-coups par partie', flush=True)

    queue = mp.Queue(maxsize=args.workers * 4)
    procs = [mp.Process(target=worker, args=(queue, str(s), args.max_ply), daemon=True) for s in shards]
    for pr in procs:
        pr.start()

    t0 = time.time()
    last = t0
    n = 0
    batch = []
    try:
        for g in read_games(text, args.max_ply):
            batch.append(g)
            n += 1
            if len(batch) >= BATCH:
                queue.put(batch)
                batch = []
                now = time.time()
                if now - last > 10:
                    last = now
                    print(f'  {fmt(n):>12} parties  ({fmt(round(n / (now - t0)))}/s)', flush=True)
            if args.max_games and n >= args.max_games:
                break
    except KeyboardInterrupt:
        print('Interrompu : on construit la base avec les parties déjà lues.', flush=True)
    if batch:
        queue.put(batch)
    for _ in procs:
        queue.put(None)
    for pr in procs:
        pr.join()
    text.close()
    print(f'{fmt(n)} parties lues en {fmt(round(time.time() - t0))} s. Regroupement…', flush=True)

    # Regroupement des fragments, élagage des positions rares, écriture de la base finale.
    tmp_out = out.with_name(out.name + '.tmp')
    tmp_out.unlink(missing_ok=True)
    db = sqlite3.connect(work / 'work.sqlite')
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA cache_size=-1000000')
    db.execute(RAW_SCHEMA)
    for s in shards:
        db.execute('ATTACH ? AS s', (str(s),))
        db.execute('INSERT INTO raw SELECT * FROM s.raw')
        db.commit()
        db.execute('DETACH s')
        s.unlink()
    db.execute('CREATE TABLE keep (pos INTEGER PRIMARY KEY)')
    db.execute('INSERT INTO keep SELECT pos FROM raw GROUP BY pos HAVING SUM(w + d + b) >= ?', (args.min_games,))
    db.execute('ATTACH ? AS out', (str(tmp_out),))
    db.executescript('''
        CREATE TABLE out.moves (
            pos INTEGER, band INTEGER, speed INTEGER, uci TEXT, w INTEGER, d INTEGER, b INTEGER, r INTEGER,
            PRIMARY KEY (pos, band, speed, uci)) WITHOUT ROWID;
        CREATE TABLE out.openings (pos INTEGER PRIMARY KEY, eco TEXT, name TEXT);
        CREATE TABLE out.meta (k TEXT PRIMARY KEY, v TEXT);
    ''')
    db.execute('''INSERT INTO out.moves
        SELECT pos, band, speed, uci, SUM(w), SUM(d), SUM(b), SUM(r) FROM raw
        WHERE pos IN keep GROUP BY pos, band, speed, uci ORDER BY pos, band, speed, uci''')
    positions = db.execute('SELECT COUNT(*) FROM keep').fetchone()[0]
    rows = db.execute('SELECT COUNT(*) FROM out.moves').fetchone()[0]
    if not args.no_openings:
        try:
            db.executemany('INSERT INTO out.openings VALUES (?,?,?)', load_openings())
        except OSError as e:
            print(f'Noms d\'ouvertures indisponibles ({e}) : la base fonctionne sans.', flush=True)
    meta = {
        'source': args.month if not (args.file or args.url) else Path(args.file or args.url).name,
        'games': n, 'positions': positions, 'rows': rows, 'maxPly': args.max_ply, 'minGames': args.min_games,
        'built': datetime.now().isoformat(timespec='seconds'),
    }
    db.executemany('INSERT INTO out.meta VALUES (?,?)', [(k, str(v)) for k, v in meta.items()])
    db.commit()
    db.execute('DETACH out')
    db.close()
    replace_with_retry(tmp_out, out)
    remove_dir(work)
    size = out.stat().st_size / 1e6
    print(f'Base prête : {out} ({fmt(round(size))} Mo, {fmt(positions)} positions, {fmt(rows)} lignes).', flush=True)


if __name__ == '__main__':
    sys.exit(main())
