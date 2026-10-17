// Scanner de position : détecte instantanément les motifs tactiques et les faiblesses.
// Chaque constat indique à qui il profite (`for`), sa gravité et des flèches à dessiner.
import { Chess } from 'chess.js';
import {
  VALUE, NAME, NAME_CAP, SIDE, opp, sq, fr, onBoard, dirsFor, pieceMap, attacksFrom, attackTable,
  seeOn, chessWithTurn, findKing,
} from './core.js';

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

export function scan(fen) {
  const chess = new Chess(fen);
  const map = pieceMap(chess);
  const table = attackTable(map);
  const turn = chess.turn();
  const out = [];
  const ctx = { fen, chess, map, table, turn, out };

  for (const side of ['w', 'b']) {
    const c = side === turn ? chess : chessWithTurn(fen, side);
    if (!c) continue;
    // Si le camp qui n'a pas le trait est en échec, la position « inversée » est illégale.
    if (side !== turn && chess.inCheck()) {
      mateThreats(ctx, side, null);
      continue;
    }
    mateThreats(ctx, side, c);
    moveMotifs(ctx, side, c);
  }
  for (const color of ['w', 'b']) {
    hanging(ctx, color);
    staticLines(ctx, color);
    overloaded(ctx, color);
    trapped(ctx, color);
    backRank(ctx, color);
    kingSafety(ctx, color);
  }
  if (!chess.isGameOver()) forcingMoves(ctx);

  // Dédoublonnage par titre et tri par urgence (camp au trait d'abord).
  const seen = new Set();
  const uniq = out.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  uniq.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.for === turn ? -1 : 1) - (b.for === turn ? -1 : 1));
  return uniq;
}

function push(ctx, f) {
  f.key ||= f.kind + ':' + f.title;
  f.shapes ||= [];
  f.now = f.for === ctx.turn; // exploitable immédiatement ?
  ctx.out.push(f);
}

const label = (map, s) => `${NAME[map[s].type]} ${s}`;
const brushFor = (side) => (side === 'w' ? 'green' : 'red');

// --- Mats en 1 (immédiats ou menacés) --------------------------------------
function mateThreats(ctx, side, c) {
  if (!c) return;
  for (const m of c.moves({ verbose: true })) {
    if (!m.san.includes('#')) continue;
    const now = side === ctx.turn;
    push(ctx, {
      kind: 'mate', severity: 'high', for: side,
      title: now ? `Mat en 1 : ${m.san} !` : `Menace de mat : ${m.san}`,
      text: now
        ? `${SIDE[side]} peuvent mater immédiatement avec ${m.san}.`
        : `Si rien n'est fait, ${SIDE[side]} matent avec ${m.san}. ${SIDE[opp(side)]} doivent parer en priorité (couvrir la case, créer une case de fuite, éliminer la pièce).`,
      shapes: [{ orig: m.from, dest: m.to, brush: now ? 'green' : 'red' }],
      move: m.san,
    });
  }
}

// --- Motifs créés par un coup : fourchettes, clouages, enfilades -----------
function moveMotifs(ctx, side, c) {
  const enemy = opp(side);
  for (const m of c.moves({ verbose: true })) {
    if (m.san.includes('#')) continue;
    const after = new Chess(c.fen());
    after.move(m);
    const map = pieceMap(after);
    const table = attackTable(map);
    const to = m.to;
    const piece = map[to];
    const vp = VALUE[piece.type];
    // La pièce qui frappe doit être en sécurité, sinon le motif échoue.
    if (seeOn(map, table, to, enemy) > 0) continue;
    const gainCapture = m.captured ? VALUE[m.captured] : 0;

    // Fourchette / double attaque
    const targets = attacksFrom(map, to).filter((t) => {
      const p = map[t];
      if (!p || p.color !== enemy) return false;
      if (p.type === 'k') return true;
      if (p.type === 'p') return false;
      return VALUE[p.type] > vp || !(table[enemy][t] || []).length;
    });
    if (targets.length >= 2) {
      const hasK = targets.some((t) => map[t].type === 'k');
      const hasQ = targets.some((t) => map[t].type === 'q');
      const kind = piece.type === 'n' || piece.type === 'p' ? 'Fourchette' : 'Double attaque';
      push(ctx, {
        kind: 'fork', severity: hasK || hasQ ? 'high' : 'medium', for: side,
        title: `${kind} ${m.san} : ${targets.map((t) => label(map, t)).join(' + ')}`,
        text: `Le ${NAME[piece.type]} en ${to} attaque ${targets.length} cibles à la fois${hasK ? ' dont le roi (échec : l\'adversaire doit répondre)' : ''}. ${side === ctx.turn ? 'À jouer maintenant si la case est sûre.' : 'Menace adverse : anticipez en déplaçant une cible ou en contrôlant ' + to + '.'}`,
        shapes: [{ orig: m.from, dest: to, brush: brushFor(side) }, ...targets.map((t) => ({ orig: to, dest: t, brush: 'yellow' }))],
        move: m.san,
      });
    }

    // Clouages et enfilades créés par une pièce à longue portée
    if (!dirsFor(piece.type).length) continue;
    const [f0, r0] = fr(to);
    for (const [df, dr] of dirsFor(piece.type)) {
      const line = [];
      let x = f0 + df, y = r0 + dr;
      while (onBoard(x, y) && line.length < 2) {
        const s = sq(x, y);
        if (map[s]) line.push(s);
        x += df; y += dr;
      }
      if (line.length < 2) continue;
      const [a, b] = line;
      const pa = map[a], pb = map[b];
      if (pa.color !== enemy || pb.color !== enemy) continue;
      // Enfilade : la pièce de devant vaut plus que celle de derrière (souvent le roi).
      if ((pa.type === 'k' || VALUE[pa.type] > VALUE[pb.type]) && pb.type !== 'p' &&
          (pa.type === 'k' || VALUE[pa.type] > vp) &&
          (VALUE[pb.type] >= vp || !(table[enemy][b] || []).length)) {
        push(ctx, {
          kind: 'skewer', severity: pa.type === 'k' || pa.type === 'q' ? 'high' : 'medium', for: side,
          title: `Enfilade ${m.san} : ${label(map, a)} puis ${label(map, b)}`,
          text: `La ${NAME[pa.type]} en ${a} doit s'écarter et la pièce derrière (${label(map, b)}) tombe.`,
          shapes: [{ orig: m.from, dest: to, brush: brushFor(side) }, { orig: to, dest: b, brush: 'yellow' }],
          move: m.san,
        });
      } else if (pa.type !== 'k' && (pb.type === 'k' || (pb.type === 'q' && VALUE[pa.type] < 9)) && VALUE[pa.type] >= 3 && gainCapture < VALUE[pa.type]) {
        push(ctx, {
          kind: 'pin', severity: pb.type === 'k' ? 'medium' : 'medium', for: side,
          title: `Clouage ${m.san} : ${label(map, a)} cloué sur ${label(map, b)}`,
          text: `Après ${m.san}, le ${NAME[pa.type]} ${a} ${pb.type === 'k' ? 'ne peut plus bouger (clouage absolu)' : 'ne peut bouger sans perdre la dame'}. Exploitez : attaquez-le une 2e fois, idéalement avec un pion.`,
          shapes: [{ orig: m.from, dest: to, brush: brushFor(side) }, { orig: to, dest: b, brush: 'blue' }],
          move: m.san,
        });
      }
    }
  }
}

// --- Pièces en prise / mal défendues ---------------------------------------
function hanging(ctx, color) {
  const { map, table } = ctx;
  const enemy = opp(color);
  for (const s in map) {
    const p = map[s];
    if (p.color !== color || p.type === 'k') continue;
    const atk = table[enemy][s] || [];
    const def = table[color][s] || [];
    const gain = seeOn(map, table, s, enemy);
    if (atk.length && gain > 0) {
      const cheapest = atk.reduce((a, b) => (VALUE[map[a].type] <= VALUE[map[b].type] ? a : b));
      push(ctx, {
        kind: 'hanging', severity: gain >= 3 ? 'high' : 'medium', for: enemy,
        title: `${NAME_CAP[p.type]} ${s} en prise (≈ +${gain})`,
        text: def.length
          ? `Attaqué par ${atk.length} pièce(s), défendu ${def.length} fois, ou attaqué par une pièce de moindre valeur : l'échange en ${s} rapporte environ ${gain} point(s) à ${SIDE[enemy]}.`
          : `Aucune défense ! ${SIDE[enemy]} gagnent ${NAME[p.type]} ${s} gratuitement (${label(map, cheapest)} prend).`,
        shapes: [{ orig: cheapest, dest: s, brush: brushFor(enemy) }, { orig: s, brush: 'red' }],
      });
    } else if (!atk.length && !def.length && p.type !== 'p' && fr(s)[1] !== (color === 'w' ? 0 : 7)) {
      push(ctx, {
        kind: 'loose', severity: 'low', for: enemy,
        title: `${NAME_CAP[p.type]} ${s} non défendu`,
        text: `« Les pièces non défendues tombent » (LPDO) : c'est une cible naturelle pour une double attaque ou une fourchette.`,
        shapes: [{ orig: s, brush: 'yellow' }],
      });
    }
  }
}

// --- Clouages existants et découvertes possibles ---------------------------
function staticLines(ctx, color) {
  const { map, table } = ctx;
  const enemy = opp(color);
  for (const s in map) {
    const p = map[s];
    if (p.color !== color || !dirsFor(p.type).length) continue;
    const [f0, r0] = fr(s);
    for (const [df, dr] of dirsFor(p.type)) {
      const line = [];
      let x = f0 + df, y = r0 + dr;
      while (onBoard(x, y) && line.length < 2) {
        const t = sq(x, y);
        if (map[t]) line.push(t);
        x += df; y += dr;
      }
      if (line.length < 2) continue;
      const [a, b] = line;
      const pa = map[a], pb = map[b];
      // Clouage existant d'une pièce adverse
      if (pa.color === enemy && pb.color === enemy && pa.type !== 'k' &&
          (pb.type === 'k' || VALUE[pb.type] > VALUE[pa.type]) && VALUE[pb.type] > VALUE[p.type] - (pb.type === 'k' ? 100 : 0)) {
        const levers = pawnAttackers(ctx, color, a);
        push(ctx, {
          kind: 'pinned', severity: levers.length || (table[color][a] || []).length >= 2 ? 'high' : 'medium', for: color,
          title: `${NAME_CAP[pa.type]} ${a} cloué ${pb.type === 'k' ? 'sur le roi' : 'sur ' + label(map, b)}`,
          text: `Cloué par ${label(map, s)}. ${levers.length ? `Exploitez-le : ${levers.join(' ou ')} attaque la pièce clouée qui ne peut pas fuir.` : 'Exploitez-le en ajoutant des attaquants sur la pièce clouée (« attaquez ce qui est cloué »).'}`,
          shapes: [{ orig: s, dest: b, brush: 'blue' }, { orig: a, brush: 'red' }],
        });
      }
      // Découverte possible : une de nos pièces masque notre pièce à longue portée
      if (pa.color === color && pb.color === enemy && (pb.type === 'k' || pb.type === 'q' || (VALUE[pb.type] > VALUE[p.type]) ||
          (pb.type !== 'p' && !(table[enemy][b] || []).length))) {
        const c = chessWithTurn(ctx.fen, color);
        const canMove = c && !(color !== ctx.turn && ctx.chess.inCheck()) && c.moves({ square: a, verbose: true }).length > 0;
        if (!canMove) continue;
        push(ctx, {
          kind: 'discovery', severity: pb.type === 'k' || pb.type === 'q' ? 'high' : 'medium', for: color,
          title: `${pb.type === 'k' ? 'Échec' : 'Attaque'} à la découverte possible (${label(map, a)})`,
          text: `En déplaçant le ${NAME[pa.type]} ${a}, ${label(map, s)} frappe ${label(map, b)}. Cherchez un coup du ${NAME[pa.type]} qui crée une 2e menace (échec, capture, attaque de la dame).`,
          shapes: [{ orig: s, dest: b, brush: color === ctx.turn ? 'green' : 'red' }, { orig: a, brush: 'yellow' }],
        });
      }
    }
  }
}

function pawnAttackers(ctx, color, target) {
  // Coups de pion de `color` qui attaqueraient la case cible.
  const c = chessWithTurn(ctx.fen, color);
  if (!c || (color !== ctx.turn && ctx.chess.inCheck())) return [];
  const res = [];
  for (const m of c.moves({ verbose: true })) {
    if (m.piece !== 'p' || m.captured) continue;
    const [f, r] = fr(m.to);
    const dr = color === 'w' ? 1 : -1;
    for (const df of [-1, 1]) if (onBoard(f + df, r + dr) && sq(f + df, r + dr) === target) res.push(m.san);
  }
  return res;
}

// --- Défenseurs surchargés -------------------------------------------------
function overloaded(ctx, color) {
  const { map, table } = ctx;
  const enemy = opp(color);
  const duty = {};
  for (const s in map) {
    const p = map[s];
    if (p.color !== color || p.type === 'k' || p.type === 'p') continue;
    const atk = table[enemy][s] || [];
    const def = table[color][s] || [];
    if (atk.length && def.length === 1) (duty[def[0]] ||= []).push(s);
  }
  for (const d in duty) {
    if (duty[d].length < 2) continue;
    push(ctx, {
      kind: 'overload', severity: 'medium', for: enemy,
      title: `${NAME_CAP[map[d].type]} ${d} surchargé`,
      text: `Il est le seul défenseur de ${duty[d].map((s) => label(map, s)).join(' et ')}. Prenez l'une des pièces : s'il reprend, l'autre tombe.`,
      shapes: duty[d].map((s) => ({ orig: d, dest: s, brush: 'yellow' })),
    });
  }
}

// --- Pièces piégées --------------------------------------------------------
function trapped(ctx, color) {
  const { map, table } = ctx;
  const enemy = opp(color);
  const c = chessWithTurn(ctx.fen, color);
  if (!c || (color !== ctx.turn && ctx.chess.inCheck())) return;
  for (const s in map) {
    const p = map[s];
    if (p.color !== color || !['n', 'b', 'r', 'q'].includes(p.type)) continue;
    if (seeOn(map, table, s, enemy) <= 0) continue;
    const moves = c.moves({ square: s, verbose: true });
    const escape = moves.some((m) => {
      if (m.captured && VALUE[m.captured] >= VALUE[p.type]) return true;
      const a = new Chess(c.fen());
      a.move(m);
      const mp = pieceMap(a);
      return seeOn(mp, attackTable(mp), m.to, enemy) <= 0;
    });
    if (escape) continue;
    push(ctx, {
      kind: 'trapped', severity: 'high', for: enemy,
      title: `${NAME_CAP[p.type]} ${s} piégé`,
      text: `Attaqué et sans case de fuite sûre : ${SIDE[enemy]} vont le gagner. Les pièces au bord (cavalier en a/h, fou en a7/h7) sont souvent concernées.`,
      shapes: [{ orig: s, brush: 'red' }],
    });
  }
}

// --- Rangée arrière ---------------------------------------------------------
function backRank(ctx, color) {
  const { map, table } = ctx;
  const enemy = opp(color);
  const k = findKing(map, color);
  if (!k) return;
  const [f, r] = fr(k);
  const home = color === 'w' ? 0 : 7;
  if (r !== home) return;
  const hasHeavy = Object.keys(map).some((s) => map[s].color === enemy && (map[s].type === 'r' || map[s].type === 'q'));
  if (!hasHeavy) return;
  // Tant que des pièces mineures sont encore sur la rangée de départ, le danger est théorique.
  if (Object.keys(map).some((s) => map[s].color === color && (map[s].type === 'n' || map[s].type === 'b') && fr(s)[1] === home)) return;
  const dr = color === 'w' ? 1 : -1;
  const exits = [];
  for (let df = -1; df <= 1; df++) {
    const x = f + df, y = r + dr;
    if (!onBoard(x, y)) continue;
    const s = sq(x, y);
    if ((!map[s] || map[s].color === enemy) && !(table[enemy][s] || []).length) exits.push(s);
  }
  if (exits.length) return;
  // Rangée arrière défendue par une tour/dame alliée ?
  const guarded = Object.keys(map).some((s) => map[s].color === color && (map[s].type === 'r' || map[s].type === 'q') && fr(s)[1] === home);
  push(ctx, {
    kind: 'backrank', severity: guarded ? 'medium' : 'high', for: enemy,
    title: `Rangée arrière faible (roi ${k})`,
    text: `Le roi ${SIDE[color].toLowerCase()} n'a aucune case de fuite. ${guarded ? 'La rangée est encore gardée : déviez ou surchargez la tour défensive.' : 'Une tour ou dame adverse sur la ' + (home + 1) + 'e rangée peut mater.'} Pour se protéger : « faire un trou » (h3/h6, g3/g6).`,
    shapes: [{ orig: k, brush: 'red' }],
  });
}

// --- Sécurité du roi -------------------------------------------------------
function kingSafety(ctx, color) {
  const { map, table, chess } = ctx;
  const enemy = opp(color);
  const k = findKing(map, color);
  if (!k) return;
  const [kf, kr] = fr(k);
  const dr = color === 'w' ? 1 : -1;
  const enemyQueen = Object.keys(map).some((s) => map[s].color === enemy && map[s].type === 'q');
  const moveNo = +ctx.fen.split(' ')[5];

  // Roi au centre
  if ((kf === 3 || kf === 4) && moveNo >= 9 && enemyQueen) {
    const rights = chess.getCastlingRights(color);
    push(ctx, {
      kind: 'center-king', severity: 'medium', for: enemy,
      title: `Roi ${SIDE[color].toLowerCase()} resté au centre`,
      text: `${rights.k || rights.q ? 'Il peut encore roquer : c\'est souvent prioritaire.' : 'Il a perdu le droit de roquer.'} L'adversaire doit ouvrir le centre (poussées de pions centraux, tours sur les colonnes d/e).`,
      shapes: [{ orig: k, brush: 'red' }],
    });
  }

  // Bouclier de pions et colonnes ouvertes près du roi roqué
  if (kf <= 2 || kf >= 5) {
    let missing = 0;
    const holes = [];
    for (let df = -1; df <= 1; df++) {
      const x = kf + df;
      if (x < 0 || x > 7) continue;
      const s1 = sq(x, kr + dr), s2 = onBoard(x, kr + 2 * dr) ? sq(x, kr + 2 * dr) : null;
      const shield = (s) => s && map[s] && map[s].type === 'p' && map[s].color === color;
      if (!shield(s1) && !shield(s2)) { missing++; holes.push(s1); }
    }
    if (missing >= 2 && enemyQueen) {
      push(ctx, {
        kind: 'shield', severity: 'medium', for: enemy,
        title: `Bouclier de pions affaibli devant le roi ${k}`,
        text: `${missing} pions du roque manquent ou sont trop avancés. Amenez dame + pièces vers ${holes.join(', ')} et cherchez des sacrifices d'ouverture.`,
        shapes: holes.map((s) => ({ orig: s, brush: 'red' })),
      });
    }
    // Fianchetto sans fou : cases faibles
    const gFile = kf >= 5 ? 6 : 1;
    const gPawn = sq(gFile, kr + dr), gAdv = sq(gFile, kr + 2 * dr);
    if (map[gAdv] && map[gAdv].type === 'p' && map[gAdv].color === color && !map[gPawn]) {
      const holeColorLight = (gFile + kr + dr) % 2 === 1; // couleur des cases f/h de la 2e rangée
      const bishopOnColor = Object.keys(map).some((s) => map[s].color === color && map[s].type === 'b' && ((fr(s)[0] + fr(s)[1]) % 2 === 1) === holeColorLight);
      if (!bishopOnColor) {
        const h1 = sq(gFile - 1, kr + dr), h2 = sq(gFile + 1, kr + dr);
        push(ctx, {
          kind: 'fianchetto-holes', severity: 'medium', for: enemy,
          title: `Cases faibles ${h1}/${h2} (fianchetto sans fou)`,
          text: `Le pion ${gFile === 6 ? 'g' : 'b'} a avancé et le fou de cette couleur a disparu : ${h1} et ${h2} sont des trous. Installez-y dame, cavalier ou un pion (h5-h6 / f5-f6).`,
          shapes: [{ orig: h1, brush: 'red' }, { orig: h2, brush: 'red' }],
        });
      }
    }
    for (let df = -1; df <= 1; df++) {
      const x = kf + df;
      if (x < 0 || x > 7) continue;
      let own = false;
      for (let y = 0; y < 8; y++) { const s = sq(x, y); if (map[s] && map[s].type === 'p' && map[s].color === color) own = true; }
      const heavy = Object.keys(map).some((s) => map[s].color === enemy && (map[s].type === 'r' || map[s].type === 'q'));
      if (!own && heavy) {
        push(ctx, {
          kind: 'open-file-king', severity: 'medium', for: enemy,
          title: `Colonne ${'abcdefgh'[x]} ouverte vers le roi ${k}`,
          text: `Aucun pion ${SIDE[color].toLowerCase().slice(0, -1)} sur la colonne ${'abcdefgh'[x]} : placez-y tours et dame.`,
          shapes: [{ orig: sq(x, color === 'w' ? 7 : 0), dest: sq(x, kr), brush: 'paleRed' }],
        });
      }
    }
  }

  // Point faible f2/f7 défendu seulement par le roi
  const fsq = color === 'w' ? 'f2' : 'f7';
  if (map[fsq] && map[fsq].color === color && map[fsq].type === 'p') {
    const atk = table[enemy][fsq] || [];
    const def = table[color][fsq] || [];
    if (atk.length && def.length === 1 && def[0] === k) {
      push(ctx, {
        kind: 'f7', severity: atk.length >= 2 ? 'high' : 'medium', for: enemy,
        title: `Point faible ${fsq} sous pression`,
        text: `${fsq} n'est défendu que par le roi et attaqué ${atk.length} fois. Classique en début de partie (fou en c4/c5 + cavalier en g5/g4 ou dame en h5/h4).`,
        shapes: atk.map((a) => ({ orig: a, dest: fsq, brush: 'red' })),
      });
    }
  }

  // Pression sur la zone du roi
  let pressure = 0;
  const zone = [];
  for (const [df, d2] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (!onBoard(kf + df, kr + d2)) continue;
    const s = sq(kf + df, kr + d2);
    const n = (table[enemy][s] || []).length;
    if (n) { pressure += n; zone.push(s); }
  }
  if (pressure >= 5) {
    push(ctx, {
      kind: 'king-pressure', severity: 'high', for: enemy,
      title: `Forte pression sur le roi ${k} (${pressure} attaques)`,
      text: `Beaucoup de pièces adverses visent la zone du roi : cherchez un sacrifice (Fxh7+, Cxf7, Txg7…) et calculez échecs et captures.`,
      shapes: zone.map((s) => ({ orig: s, brush: 'paleRed' })),
    });
  }
}

// --- Coups forcés à examiner (méthode « échecs, captures, menaces ») -------
function forcingMoves(ctx) {
  const moves = ctx.chess.moves({ verbose: true });
  const checks = moves.filter((m) => m.san.includes('+'));
  const caps = moves.filter((m) => m.captured);
  if (!checks.length && !caps.length) return;
  push(ctx, {
    kind: 'cct', severity: 'low', for: ctx.turn,
    title: `À calculer : ${checks.length} échec(s), ${caps.length} capture(s)`,
    text: `Échecs : ${checks.map((m) => m.san).join(', ') || '—'}. Captures : ${caps.map((m) => m.san).join(', ') || '—'}. Examinez-les toujours en premier, pour vous ET pour l'adversaire.`,
    shapes: checks.slice(0, 6).map((m) => ({ orig: m.from, dest: m.to, brush: 'paleGreen' })),
  });
}

export const KIND_LABEL = {
  mate: 'Mat', fork: 'Fourchette', skewer: 'Enfilade', pin: 'Clouage', pinned: 'Clouage', discovery: 'Découverte',
  hanging: 'Pièce en prise', loose: 'Non défendue', overload: 'Surcharge', trapped: 'Pièce piégée', backrank: 'Rangée arrière',
  'center-king': 'Roi au centre', shield: 'Roque affaibli', 'fianchetto-holes': 'Cases faibles', 'open-file-king': 'Colonne ouverte',
  f7: 'f7/f2', 'king-pressure': 'Attaque du roi', cct: 'Coups forcés',
};
