// Analyse de la structure de pions et génération d'un plan concret (surtout pour les pions).
import { Chess } from 'chess.js';
import { FILES, SIDE, opp, sq, fr, onBoard, pieceMap, attackTable, seeOn, findKing, material, isLight, chessWithTurn } from './core.js';

const has = (map, s, color, type = 'p') => map[s] && map[s].color === color && map[s].type === type;
const fwd = (color) => (color === 'w' ? 1 : -1);
// Rang « relatif » (1 = rangée de départ du camp).
const relRank = (color, r) => (color === 'w' ? r + 1 : 8 - r);

export function pawnFacts(map) {
  const P = { w: [], b: [] };
  for (const s in map) if (map[s].type === 'p') P[map[s].color].push(s);
  const byFile = (color) => { const a = Array.from({ length: 8 }, () => []); for (const s of P[color]) a[fr(s)[0]].push(fr(s)[1]); return a; };
  const files = { w: byFile('w'), b: byFile('b') };
  const facts = { w: {}, b: {} };
  for (const color of ['w', 'b']) {
    const enemy = opp(color);
    const F = files[color], E = files[enemy];
    const isolated = [], doubled = [], passed = [], backward = [];
    for (const s of P[color]) {
      const [f, r] = fr(s);
      const adj = [f - 1, f + 1].filter((x) => x >= 0 && x < 8);
      if (adj.every((x) => !F[x].length)) isolated.push(s);
      if (F[f].length > 1 && !doubled.some((d) => fr(d)[0] === f)) doubled.push(s);
      const ahead = (y) => (color === 'w' ? y > r : y < r);
      if ([f, ...adj].every((x) => !E[x].some(ahead))) passed.push(s);
      // Arriéré : aucun pion voisin à hauteur ou derrière, case d'arrêt contrôlée par un pion adverse.
      const behindOrLevel = (y) => (color === 'w' ? y <= r : y >= r);
      const stopR = r + fwd(color);
      if (!isolated.includes(s) && adj.every((x) => !F[x].some(behindOrLevel)) && onBoard(f, stopR)) {
        const stopAttacked = adj.some((x) => onBoard(x, stopR + fwd(color)) && has(map, sq(x, stopR + fwd(color)), enemy));
        if (stopAttacked && !E[f].some(ahead)) backward.push(s);
      }
    }
    let islands = 0;
    for (let f = 0; f < 8; f++) if (F[f].length && (f === 0 || !F[f - 1].length)) islands++;
    const qs = [0, 1, 2, 3].reduce((n, f) => n + F[f].length, 0);
    const ks = [4, 5, 6, 7].reduce((n, f) => n + F[f].length, 0);
    Object.assign(facts[color], { pawns: P[color], files: F, isolated, doubled, passed, backward, islands, qs, ks });
  }
  return facts;
}

/** Cases fortes (avant-postes) pour `color` : non attaquables par un pion adverse, soutenues par un pion. */
export function outposts(map, color) {
  const enemy = opp(color);
  const res = [];
  for (let f = 1; f < 7; f++) {
    for (let r = 0; r < 8; r++) {
      const rr = relRank(color, r);
      if (rr < 4 || rr > 6) continue;
      const s = sq(f, r);
      if (map[s] && map[s].type === 'p') continue;
      // Un pion adverse sur une colonne voisine, « devant » la case, pourrait la chasser.
      let attackable = false;
      for (const x of [f - 1, f + 1]) {
        for (let y = 0; y < 8; y++) {
          const ahead = color === 'w' ? y > r : y < r;
          if (ahead && has(map, sq(x, y), enemy)) attackable = true;
        }
      }
      if (attackable) continue;
      const support = [f - 1, f + 1].some((x) => onBoard(x, r - fwd(color)) && has(map, sq(x, r - fwd(color)), color));
      if (support) res.push(s);
    }
  }
  // Priorité aux cases centrales et avancées
  return res.sort((a, b) => Math.abs(3.5 - fr(a)[0]) - Math.abs(3.5 - fr(b)[0]) || relRank(color, fr(b)[1]) - relRank(color, fr(a)[1]));
}

/** Reconnaît les structures classiques. Chaque entrée : {id, name, owner, plan:{w:[], b:[]}} */
export function recognize(map, facts) {
  const S = [];
  const P = (s, c) => has(map, s, c);
  const noFile = (c, f) => !facts[c].files[FILES.indexOf(f)].length;

  for (const c of ['w', 'b']) {
    const e = opp(c);
    const R = (n) => (c === 'w' ? n : 9 - n); // rang miroir
    const s = (f, n) => f + R(n);
    const me = SIDE[c], them = SIDE[e];

    // Pion isolé de la dame (PID)
    const dPawn = facts[c].isolated.find((x) => x[0] === 'd' && (relRank(c, fr(x)[1]) === 4 || relRank(c, fr(x)[1]) === 5));
    if (dPawn && noFile(e, 'd')) {
      S.push({
        id: 'iqp', owner: c, name: `Pion isolé de la dame (${dPawn}) chez les ${me}`,
        plan: {
          [c]: [
            `Jouez l'attaque : le pion ${dPawn} vous donne de l'espace et les cases ${s('e', 5)}/${s('c', 5)} pour vos cavaliers.`,
            `Visez le roque adverse (dame + fou sur la diagonale vers h7/h2, tour en ${s('e', 3)}→${s('g', 3)}).`,
            `Préparez la poussée ${s('d', 5)} au bon moment pour ouvrir le jeu quand vos pièces sont prêtes.`,
            `Évitez les échanges : chaque échange rapproche une finale où le pion isolé sera faible.`,
          ],
          [e]: [
            `Bloquez le pion : installez un cavalier en ${dPawn[0]}${+dPawn[1] + fwd(c)} (case de blocage idéale).`,
            `Échangez les pièces, surtout les pièces mineures actives adverses : la finale vous est favorable.`,
            `Attaquez le pion ${dPawn} avec tours et dame sur la colonne d.`,
          ],
        },
      });
    }

    // Pions pendants c+d
    const cP = facts[c].pawns.find((x) => x[0] === 'c'), dP = facts[c].pawns.find((x) => x[0] === 'd');
    if (cP && dP && cP[1] === dP[1] && noFile(c, 'b') && noFile(c, 'e') && noFile(e, 'c') && noFile(e, 'd')) {
      S.push({
        id: 'hanging', owner: c, name: `Pions pendants ${cP}/${dP} (${me})`,
        plan: {
          [c]: [`Gardez-les côte à côte et poussez l'un d'eux (${s('d', 5)} ou ${s('c', 5)}) au moment où cela ouvre des lignes pour vos pièces.`, `Ils contrôlent beaucoup d'espace : jouez activement, évitez les finales.`],
          [e]: [`Mettez-les sous pression (tours sur c/d, fous sur la grande diagonale) pour provoquer une avance qui laissera un pion faible derrière.`, `Une fois l'un avancé, bloquez-le et attaquez l'autre (pion arriéré).`],
        },
      });
    }

    // Carlsbad : c a d4(+e3) sans pion c ; adversaire d5+c6 sans pion e
    if (P(s('d', 4), c) && noFile(c, 'c') && P(s('d', 5), e) && P(s('c', 6), e) && noFile(e, 'e')) {
      S.push({
        id: 'carlsbad', owner: c, name: `Structure Carlsbad (Gambit Dame variante d'échange)`,
        plan: {
          [c]: [`Attaque de minorité : ${s('b', 4)}–${s('b', 5)} (soutenu par ${s('a', 4)} et Tour en ${s('b', 1)}) pour créer un pion faible en ${s('c', 6)} adverse.`, `Alternative : ${s('f', 3)} puis ${s('e', 4)} pour gagner le centre (plan Botvinnik).`, `Placez un cavalier en ${s('e', 5)} si possible.`],
          [e]: [`Jouez à l'aile roi : cavalier en ${s('e', 4)} adverse (côté ${them}), tours sur la colonne e, …f5–f4 ou attaque de pièces.`, `Répondez à b5 par …cxb5 ou …c5 pour éviter un pion c6 arriéré.`],
        },
      });
    }

    // Chaîne française : c a e5+d4 ; adversaire e6+d5
    if (P(s('e', 5), c) && P(s('d', 4), c) && P(s('e', 6), e) && P(s('d', 5), e)) {
      S.push({
        id: 'french', owner: c, name: `Chaîne de pions type Française (${s('d', 4)}-${s('e', 5)} contre ${s('d', 5)}-${s('e', 6)})`,
        plan: {
          [c]: [`Votre chaîne pointe vers l'aile roi adverse : attaquez-y (${s('f', 4)}–${s('f', 5)}, dame en ${s('g', 4)}, fou en ${s('d', 3)}).`, `Maintenez la base ${s('d', 4)} (pions ${s('c', 3)}, cavalier en ${s('f', 3)}).`],
          [e]: [`Attaquez la BASE de la chaîne : …c5 (contre ${s('d', 4)}), puis …f6 (contre ${s('e', 5)}).`, `Pression sur ${s('d', 4)} : …Cc6, …Db6, …Cge7–f5.`, `Votre mauvais fou de cases blanches : échangez-le (…b6/…Fa6) ou sortez-le avant …e6.`],
        },
      });
    }

    // Chaîne Est-indienne : c a d5+e4 ; adversaire d6+e5
    if (P(s('d', 5), c) && P(s('e', 4), c) && P(s('d', 6), e) && P(s('e', 5), e)) {
      S.push({
        id: 'kid', owner: c, name: `Centre fermé type Est-Indienne (${s('d', 5)}-${s('e', 4)} contre ${s('d', 6)}-${s('e', 5)})`,
        plan: {
          [c]: [`Jouez à l'aile dame, vers où pointe votre chaîne : ${s('c', 4)}–${s('c', 5)}, ${s('b', 4)}, cavalier vers ${s('c', 4)}/${s('d', 3)}.`, `Ouvrez la colonne c et attaquez la base ${s('d', 6)}.`],
          [e]: [`Attaque à l'aile roi : …Ce8/…Cd7, …f5, …f4, …g5–g4. C'est une course : chaque tempo compte.`, `Ne pas ouvrir le centre : la course se joue sur les ailes.`],
        },
      });
    }

    // Maroczy : c a c4+e4 sans pion d ; adversaire sans pion c
    if (P(s('c', 4), c) && P(s('e', 4), c) && noFile(c, 'd') && noFile(e, 'c')) {
      const hedgehog = P(s('b', 6), e) && P(s('d', 6), e) && P(s('e', 6), e);
      S.push({
        id: hedgehog ? 'hedgehog' : 'maroczy', owner: c,
        name: hedgehog ? 'Structure Hérisson' : `Étau de Maroczy (${s('c', 4)}+${s('e', 4)})`,
        plan: {
          [c]: [`Gardez le contrôle de ${s('d', 5)} et empêchez les ruptures …b5 et …d5 adverses (prophylaxie : ${s('a', 4)}, Cc3, Tf/Td1).`, `Gagnez de l'espace petit à petit ; échangez les pièces qui défendent les ruptures.`],
          [e]: [`Préparez la rupture …b5 ou …d5 : c'est votre seule respiration.`, hedgehog ? `Hérisson : restez compact (…Fb7, …Cd7, …Tc8, …Db8) puis frappez par …b5 ou …d5 dès que l'adversaire se surétend.` : `Échangez des pièces (vous manquez d'espace) et visez la case ${s('d', 4)}/${s('c', 5)}.`],
        },
      });
    }

    // Sicilienne ouverte : c a e4, pas de pion d ; adversaire pas de pion c, pion d ou e présent
    if (P(s('e', 4), c) && noFile(c, 'd') && noFile(e, 'c') && !noFile(e, 'd') && !P(s('c', 4), c)) {
      S.push({
        id: 'open-sicilian', owner: c, name: `Structure de Sicilienne ouverte`,
        plan: {
          [c]: [`Vous avez l'avance de développement et l'espace : jouez à l'aile roi (${s('f', 4)}, ${s('g', 4)}–${s('g', 5)} ou ${s('f', 3)}+${s('g', 4)} si roques opposés).`, `Le cavalier central en ${s('d', 4)} est fort ; la case ${s('d', 5)} est un objectif.`],
          [e]: [`La colonne c semi-ouverte est à vous : tour en c8, sacrifice d'échange …Txc3 typique.`, `Avancez votre majorité centrale/aile dame : …b5–b4 pour chasser le cavalier c3, puis …d5 libérateur.`],
        },
      });
    }

    // Stonewall
    if (P(s('d', 4), c) && P(s('e', 3), c) && P(s('f', 4), c)) {
      S.push({
        id: 'stonewall', owner: c, name: `Stonewall (${s('d', 4)}-${s('e', 3)}-${s('f', 4)})`,
        plan: {
          [c]: [`Cavalier en ${s('e', 5)}, fou en ${s('d', 3)}, puis attaque à l'aile roi (Tf3–h3, g4).`],
          [e]: [`La case ${s('e', 4)} est un trou : installez-y un cavalier. Échangez le fou de cases noires adverse et jouez …c5.`],
        },
      });
    }
  }

  // Centre bloqué / ouvert
  const dBlocked = ['d', 'e'].filter((f) => {
    for (let r = 0; r < 7; r++) if (has(map, f + (r + 1), 'w') && has(map, f + (r + 2), 'b')) return true;
    return false;
  });
  const centerPawns = ['d', 'e'].reduce((n, f) => n + facts.w.files[FILES.indexOf(f)].length + facts.b.files[FILES.indexOf(f)].length, 0);
  if (dBlocked.length === 2 && !S.some((x) => x.id === 'french' || x.id === 'kid')) {
    S.push({ id: 'closed', owner: null, name: 'Centre bloqué', plan: generic('Centre fermé : jouez sur l\'aile vers laquelle pointent vos pions (la chaîne indique le côté de l\'attaque) et attaquez la base de la chaîne adverse. Les cavaliers sont meilleurs que les fous.') });
  } else if (centerPawns === 0) {
    S.push({ id: 'open', owner: null, name: 'Centre ouvert', plan: generic('Centre ouvert : développement et activité priment. Roquez, centralisez les tours sur d/e, les fous (et la paire de fous) sont forts. Attention aux tactiques sur le roi resté au centre.') });
  }
  return S;
}
const generic = (t) => ({ w: [t], b: [t] });

/** Coups de pion qui créent un contact avec un pion adverse (ruptures). */
export function pawnBreaks(fen, map, color) {
  const c = chessWithTurn(fen, color);
  if (!c) return [];
  const enemy = opp(color);
  const res = [];
  let moves;
  try { moves = c.moves({ verbose: true }); } catch { return []; }
  for (const m of moves) {
    if (m.piece !== 'p') continue;
    const [f, r] = fr(m.to);
    const hits = [-1, 1].map((df) => (onBoard(f + df, r + fwd(color)) ? sq(f + df, r + fwd(color)) : null)).filter((t) => t && has(map, t, enemy));
    const cap = m.captured === 'p';
    if (!hits.length && !cap) continue;
    const after = new Chess(c.fen());
    after.move(m);
    const mp = pieceMap(after);
    const safe = seeOn(mp, attackTable(mp), m.to, enemy) <= 0;
    res.push({ san: m.san, from: m.from, to: m.to, hits, cap, safe });
  }
  return res;
}

/** Plan complet pour `me` (et prophylaxie face à l'adversaire). */
export function buildPlan(fen, me) {
  const chess = new Chess(fen);
  const map = pieceMap(chess);
  const facts = pawnFacts(map);
  const enemy = opp(me);
  const structures = recognize(map, facts);
  const mat = material(map);
  const steps = { pawns: [], pieces: [], targets: [], prophylaxis: [], structure: [] };

  for (const st of structures) {
    const lines = st.plan[me] || [];
    steps.structure.push({ name: st.name, lines });
  }

  // Ruptures de pions
  const br = pawnBreaks(fen, map, me);
  for (const b of br.slice(0, 6)) {
    steps.pawns.push(`${b.san} : rupture ${b.cap ? '(prise de pion)' : `contre ${b.hits.join(', ')}`}${b.safe ? '' : ' — attention, la case n\'est pas sûre pour l\'instant, préparez-la'}.`);
  }

  // Majorités et pions passés
  const F = facts[me], E = facts[enemy];
  if (F.qs > E.qs) steps.pawns.push(`Majorité à l'aile dame (${F.qs} contre ${E.qs}) : avancez-la pour créer un pion passé, en poussant d'abord le pion sans vis-à-vis (le « candidat »). Idéal en finale.`);
  if (F.ks > E.ks) steps.pawns.push(`Majorité à l'aile roi (${F.ks} contre ${E.ks}) : avancez-la (f-e puis g) pour gagner de l'espace et créer un pion passé ou attaquer.`);
  if (F.qs < E.qs && F.qs >= 2) steps.pawns.push(`Minorité à l'aile dame : l'attaque de minorité (pions a/b contre a/b/c) crée une faiblesse chez l'adversaire.`);
  for (const p of F.passed) steps.pawns.push(`Pion passé ${p} : « les pions passés doivent avancer » (Nimzowitsch). Soutenez-le, placez une tour DERRIÈRE lui.`);

  // Roques opposés → tempête de pions
  const myK = findKing(map, me), opK = findKing(map, enemy);
  if (myK && opK) {
    const wing = (k) => (fr(k)[0] <= 2 ? 'q' : fr(k)[0] >= 5 ? 'k' : 'c');
    if (wing(myK) !== 'c' && wing(opK) !== 'c' && wing(myK) !== wing(opK)) {
      const filesOp = wing(opK) === 'k' ? ['f', 'g', 'h'] : ['a', 'b', 'c'];
      const stormers = F.pawns.filter((p) => filesOp.includes(p[0]));
      steps.pawns.unshift(`Roques opposés : TEMPÊTE DE PIONS vers le roi adverse (${opK}). Avancez ${stormers.length ? stormers.join(', ') : 'vos pions de cette aile'} pour ouvrir des colonnes ; la vitesse compte plus que le matériel.`);
    }
  }

  // Pièces : avant-postes, colonnes, fous
  const ops = outposts(map, me);
  if (ops.length) {
    const occupied = ops.filter((s) => map[s] && map[s].color === me && map[s].type === 'n');
    steps.pieces.push(occupied.length ? `Cavalier déjà sur l'avant-poste ${occupied.join(', ')} : excellent, gardez-le.` : `Avant-poste(s) pour un cavalier : ${ops.slice(0, 3).join(', ')} (aucun pion adverse ne peut le chasser).`);
  }
  const openFiles = [], semiOpen = [];
  for (let f = 0; f < 8; f++) {
    if (!F.files[f].length && !E.files[f].length) openFiles.push(FILES[f]);
    else if (!F.files[f].length && E.files[f].length) semiOpen.push(FILES[f]);
  }
  if (openFiles.length) steps.pieces.push(`Colonne(s) ouverte(s) ${openFiles.join(', ')} : doublez-y vos tours, visez la 7e rangée.`);
  if (semiOpen.length) steps.pieces.push(`Colonne(s) semi-ouverte(s) ${semiOpen.join(', ')} : tour en face du pion adverse pour le mettre sous pression.`);

  const bishops = (c) => Object.keys(map).filter((s) => map[s].color === c && map[s].type === 'b');
  if (bishops(me).length === 2 && bishops(enemy).length < 2) steps.pieces.push(`Vous avez la paire de fous : ouvrez la position et évitez de l'échanger.`);
  if (bishops(enemy).length === 2 && bishops(me).length < 2) steps.prophylaxis.push(`L'adversaire a la paire de fous : gardez la position fermée, échangez un fou si possible.`);
  for (const b of bishops(me)) {
    const light = isLight(b);
    const same = F.pawns.filter((p) => isLight(p) === light && ['c', 'd', 'e', 'f'].includes(p[0])).length;
    if (same >= 3) steps.pieces.push(`Fou ${b} « mauvais » (${same} pions centraux sur sa couleur) : échangez-le, sortez-le devant la chaîne, ou placez vos pions sur l'autre couleur.`);
  }
  const ob = bishops(me), eb = bishops(enemy);
  if (ob.length === 1 && eb.length === 1 && isLight(ob[0]) !== isLight(eb[0])) steps.pieces.push(`Fous de couleurs opposées : favorise l'attaquant en milieu de partie, très nulle en finale.`);

  // Cibles chez l'adversaire
  for (const p of E.isolated) steps.targets.push(`Pion isolé ${p} : bloquez la case devant lui, attaquez-le avec les tours.`);
  for (const p of E.backward) steps.targets.push(`Pion arriéré ${p} : la case devant lui est un trou → cavalier ; pression frontale.`);
  for (const p of E.doubled) steps.targets.push(`Pions doublés sur la colonne ${p[0]} : ils se défendent mal, surtout en finale.`);
  if (E.islands > F.islands) steps.targets.push(`L'adversaire a ${E.islands} îlots de pions contre ${F.islands} : simplifiez vers la finale.`);
  const holes = outposts(map, me).filter((s) => !(map[s] && map[s].color === me));
  if (holes.length) steps.targets.push(`Trous dans le camp adverse : ${holes.slice(0, 4).join(', ')}.`);

  // Prophylaxie
  const ebr = pawnBreaks(fen, map, enemy).filter((b) => b.safe);
  if (ebr.length) steps.prophylaxis.push(`Ruptures adverses à surveiller : ${ebr.slice(0, 4).map((b) => b.san).join(', ')}. Demandez-vous « que veut l'adversaire ? » avant chaque coup.`);
  for (const p of E.passed) steps.prophylaxis.push(`Pion passé adverse ${p} : bloquez-le (idéalement avec un cavalier) avant qu'il n'avance.`);
  for (const p of F.isolated) steps.prophylaxis.push(`Votre pion isolé ${p} : gardez des pièces actives, évitez les échanges.`);
  for (const p of F.backward) steps.prophylaxis.push(`Votre pion arriéré ${p} : poussez-le si possible ou contrôlez la case devant lui.`);

  const diff = mat[me] - mat[enemy];
  const materialNote = diff > 0 ? `Vous avez +${diff} : simplifiez (échangez les pièces, pas les pions).` : diff < 0 ? `Vous avez ${diff} : cherchez la complication, gardez des pièces, attaquez le roi.` : 'Matériel égal.';
  return { structures, steps, facts, materialNote };
}
