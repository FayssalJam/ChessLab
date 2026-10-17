// Contenu pédagogique. Les exercices sont vérifiés par `npm run validate` (chess.js + Stockfish).
//
// Exercice :
//   fen | moves (coups depuis la position initiale)
//   type: 'line'  → suite exacte ; solution = [moi, adversaire, moi, ...] en SAN
//         'best'  → un seul coup, accepté s'il est presque aussi bon que celui du moteur
//         'play'  → on joue contre Stockfish ; goal: 'mate' | 'win' | 'draw' ; maxMoves
//   theme : clé de motif (sert aux statistiques d'entraînement)

export const LESSONS = [
  // ======================= MÉTHODE ========================================
  {
    id: 'method-think', cat: 'Méthode', title: 'Avant chaque coup : la routine en 4 questions',
    body: `
      <p>La plupart des parties en dessous de 2000 se décident sur une pièce laissée en prise ou une tactique simple. Une routine fixe fait gagner plus de points que n'importe quelle ouverture.</p>
      <ol>
        <li><b>Que menace le dernier coup adverse ?</b> Qu'attaque la pièce qui vient de bouger ? Quelle ligne s'est ouverte derrière elle ?</li>
        <li><b>Échecs, captures, menaces</b>, pour moi d'abord, puis pour l'adversaire. Le scanner les liste sous « À calculer ».</li>
        <li><b>Mes pièces non défendues</b> (« les pièces non défendues tombent ») et mon roi : y a-t-il un mat du couloir, un clouage, une fourchette de cavalier possible contre moi ?</li>
        <li><b>Plan</b> : s'il n'y a rien de tactique, améliorez votre plus mauvaise pièce ou jouez la rupture de pions de votre structure (onglet Scanner &amp; Plan).</li>
      </ol>
      <p><b>Vérification anti-gaffe :</b> avant de lâcher la pièce, regardez le coup choisi « avec les yeux de l'adversaire » : que puis-je capturer ou attaquer après ce coup ?</p>`,
  },
  {
    id: 'method-tree', cat: 'Méthode', title: 'Construire son arbre d\'ouvertures par niveau',
    body: `
      <p>L'idée : ne pas apprendre la théorie des grands maîtres, mais <b>ce qui se joue vraiment à votre niveau</b>, et y répondre avec <b>ce qui marche aux niveaux supérieurs</b>.</p>
      <ol>
        <li>Réglez votre Elo (⚙). L'outil interroge la base Lichess pour votre tranche (« mon niveau ») et les tranches au-dessus (« supérieur »).</li>
        <li><b>À votre tour</b>, choisissez le coup qui marque le plus chez les joueurs plus forts tout en restant bon à votre niveau (badge ★).</li>
        <li><b>Au tour adverse</b>, ne préparez que les réponses fréquentes chez vos adversaires (80 % des parties suffisent). Repérez celles qui ont un mauvais score (« erreur fréquente ») : c'est là que vous gagnerez des parties, apprenez la punition.</li>
        <li>Onglet <b>Mon répertoire</b> : la construction automatique fait tout cela d'un coup. Exportez en PGN et révisez avec la répétition espacée.</li>
        <li>Quand la théorie s'arrête, passez au <b>Scanner &amp; Plan</b> : il vous dit quoi faire avec vos pions selon la structure obtenue.</li>
      </ol>
      <p>Conseil : un répertoire <i>étroit et compris</i> vaut mieux qu'un large et récité. Préférez des ouvertures dont vous connaissez les plans de pions (voir les cours de Stratégie).</p>`,
  },

  // ======================= TACTIQUE ========================================
  {
    id: 'fork', cat: 'Tactique', title: 'La fourchette (double attaque)',
    body: `
      <p>Une pièce attaque <b>deux cibles à la fois</b> ; l'adversaire ne peut en sauver qu'une. Le cavalier est le roi de la fourchette car son attaque ne peut pas être bloquée.</p>
      <h3>Comment la repérer instantanément</h3>
      <ul>
        <li>Deux pièces adverses <b>non défendues</b>, ou plus précieuses que votre attaquant.</li>
        <li>Roi et dame (ou roi et tour) <b>à un saut de cavalier</b> d'une même case : cherchez les cases c7/f7 (c2/f2), e6, d5…</li>
        <li>Roi et dame sur la <b>même couleur</b> : fourchette de cavalier potentielle.</li>
        <li>Deux pièces côte à côte sur la rangée devant un de vos pions : <b>fourchette de pion</b>.</li>
        <li>Une capture qui <b>attire</b> une pièce sur la case visée (truc « prise + fourchette »).</li>
      </ul>`,
    exercises: [
      { theme: 'fork', title: 'Fourchette royale', fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1', type: 'line', solution: ['Nxc7+', 'Kd7', 'Nxa8'], hint: 'Cherchez une case où le cavalier attaque le roi ET la tour a8.' },
      { theme: 'fork', title: 'Le truc de la fourchette de pion', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Nc3', type: 'line', solution: ['Nxe4', 'Nxe4', 'd5'], hint: 'Une capture qui semble perdre une pièce… puis un pion attaque deux pièces.' },
      { theme: 'fork', title: 'Double attaque de dame', fen: '4k3/8/8/8/1r6/8/5PPP/3Q2K1 w - - 0 1', type: 'best', hint: 'Un échec qui attaque aussi la tour non défendue.' },
    ],
  },
  {
    id: 'pin', cat: 'Tactique', title: 'Le clouage',
    body: `
      <p>Une pièce ne peut pas bouger sans exposer une pièce plus importante derrière elle. <b>Clouage absolu</b> : derrière, c'est le roi (la pièce ne peut légalement pas bouger). <b>Relatif</b> : c'est la dame ou une tour.</p>
      <h3>Comment l'exploiter</h3>
      <ul>
        <li><b>Attaquez ce qui est cloué</b>, surtout avec un pion : la pièce ne peut pas fuir.</li>
        <li>Ajoutez des attaquants : une pièce clouée ne compte plus comme défenseur.</li>
        <li>Méfiez-vous du <b>faux clouage</b> (clouage relatif) : la pièce clouée peut bouger si cela crée une menace plus forte (mat de Légal, piège de l'éléphant).</li>
      </ul>
      <h3>Signaux</h3>
      <ul><li>Roi et dame sur la même ligne, colonne ou diagonale, avec une seule pièce entre eux et votre fou/tour.</li><li>Fou en g5/b5 (g4/b4) face au cavalier qui protège la dame ou le roi.</li></ul>`,
    exercises: [
      { theme: 'pin', title: 'Attaquer la pièce clouée', fen: '7k/pp2pp1p/5n2/8/6P1/8/PB3P1P/6K1 w - - 0 1', type: 'line', solution: ['g5'], hint: 'Le cavalier f6 ne peut pas bouger. Qui peut l\'attaquer ?' },
      { theme: 'pin', title: 'Le mat de Légal (faux clouage)', moves: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6', type: 'line', solution: ['Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'], hint: 'Le cavalier f3 est-il vraiment cloué ? Sacrifiez la dame !' },
      { theme: 'pin', title: 'Le piège de l\'éléphant', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5', type: 'line', solution: ['Nxd5', 'Bxd8', 'Bb4+', 'Qd2', 'Bxd2+', 'Kxd2', 'Kxd8'], hint: 'Le cavalier f6 n\'est cloué que sur la dame… et vous avez un échec intermédiaire.' },
    ],
  },
  {
    id: 'skewer', cat: 'Tactique', title: 'L\'enfilade (clouage inversé)',
    body: `
      <p>Comme un clouage, mais la pièce <b>la plus précieuse est devant</b> : elle doit s'écarter et celle de derrière tombe. Très fréquent en finale avec tours et fous.</p>
      <ul><li>Signal : roi et dame/tour adverses alignés sur une rangée, colonne ou diagonale <b>libre</b>.</li><li>Un échec sur le roi qui « traverse » vers une pièce non défendue.</li></ul>`,
    exercises: [
      { theme: 'skewer', title: 'Enfilade sur la rangée', fen: '8/8/q2k4/8/8/8/1K6/7R w - - 0 1', type: 'line', solution: ['Rh6+', 'Kc5', 'Rxa6'], hint: 'Le roi et la dame noirs sont sur la même rangée.' },
    ],
  },
  {
    id: 'discovery', cat: 'Tactique', title: 'Découverte et échec double',
    body: `
      <p>Une pièce bouge et <b>démasque</b> une pièce à longue portée derrière elle : deux menaces en un coup. Si la pièce démasquée donne échec, c'est un <b>échec à la découverte</b>, et la pièce qui bouge peut aller n'importe où, même en prise, pour attaquer la dame.</p>
      <p><b>Échec double</b> : les deux pièces donnent échec ; seule la fuite du roi est possible.</p>
      <ul><li>Signal : votre fou/tour/dame vise le roi ou la dame adverse <b>à travers une de vos pièces</b>. Le scanner signale « découverte possible ».</li><li>Défense : ne jamais laisser son roi et sa dame alignés avec une batterie adverse.</li></ul>`,
    exercises: [
      { theme: 'discovery', title: 'Le piège de la défense Petrov', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6', type: 'line', solution: ['Nc6+', 'Be7', 'Nxd8'], hint: 'La dame e2 regarde le roi e8 à travers le cavalier.' },
      { theme: 'doubleCheck', title: 'Réti–Tartakower (1910) : sacrifice et échec double', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Qd3 e5 dxe5 Qa5+ Bd2 Qxe5 O-O-O Nxe4', type: 'line', solution: ['Qd8+', 'Kxd8', 'Bg5+', 'Kc7', 'Bd8#'], hint: 'Attirez le roi sur la colonne d, puis double échec.' },
    ],
  },
  {
    id: 'backrank', cat: 'Tactique', title: 'Le mat du couloir (rangée arrière)',
    body: `
      <p>Le roi roqué, enfermé par ses propres pions, se fait mater par une tour ou une dame sur la dernière rangée.</p>
      <ul>
        <li>Signal : roi sur la 1re/8e rangée, pions f-g-h non bougés, peu de défenseurs sur la rangée. Le scanner l'indique.</li>
        <li>Armes : <b>déviation</b> du défenseur, <b>surcharge</b> (le défenseur garde deux choses), sacrifice de dame.</li>
        <li>Prévention : un « trou » (h3/h6) au bon moment.</li>
      </ul>`,
    exercises: [
      { theme: 'backRankMate', title: 'Mat en 1', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', type: 'line', solution: ['Rd8#'] },
      { theme: 'backRankMate', title: 'Sacrifice de dame et mat', fen: '3r2k1/2q2ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1', type: 'line', solution: ['Qxd8+', 'Qxd8', 'Rxd8#'], hint: 'La tour d8 n\'a qu\'un défenseur et vous en avez deux.' },
    ],
  },
  {
    id: 'smothered', cat: 'Tactique', title: 'Le mat étouffé',
    body: `
      <p>Le roi est entouré de ses propres pièces ; un cavalier le mate. Motif typique : roi en h8, tour en g8, pions g7-h7, cavalier en f7.</p>
      <p>Version complète (« legs de Philidor ») : échec de dame en g8 qui force la tour à prendre, puis Cf7#.</p>`,
    exercises: [
      { theme: 'smotheredMate', title: 'Mat étouffé en 1', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', type: 'line', solution: ['Nf7#'] },
      { theme: 'smotheredMate', title: 'Le piège Blackburne Shilling', moves: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1', type: 'line', solution: ['Qxe4+', 'Be2', 'Nf3#'], hint: 'Un échec de dame, puis le cavalier d4 frappe.' },
    ],
  },
  {
    id: 'greek', cat: 'Tactique', title: 'Le sacrifice grec (Fxh7+)',
    body: `
      <p>Sacrifice du fou en h7 suivi de Cg5+ et Dh5 : attaque de mat sur le roi roqué.</p>
      <h3>Conditions (à vérifier avant de sacrifier)</h3>
      <ul>
        <li>Fou sur la diagonale b1-h7, cavalier pouvant aller en g5, dame pouvant aller en h5 (ou g4).</li>
        <li>Pas de cavalier noir en f6 (souvent chassé par e5), pas de fou noir contrôlant g5 (Fe7 !).</li>
        <li>Le pion e5 blanc enlève f6 et d6 aux pièces noires.</li>
      </ul>`,
    exercises: [
      { theme: 'attackingF2F7', title: 'Le sacrifice classique', fen: 'r1bq1rk1/ppbn1ppp/2p1p3/3pP3/3P4/2PB1N2/PP3PPP/R1BQK2R w KQ - 0 1', type: 'line', solution: ['Bxh7+'], hint: 'Toutes les conditions sont réunies : aucun fou noir ne contrôle g5 et le cavalier ne peut pas aller en f6.' },
    ],
  },
  {
    id: 'trapped', cat: 'Tactique', title: 'La pièce piégée',
    body: `
      <p>Une pièce sans case de fuite peut être capturée. Victimes fréquentes : fou en b3/a4 face à …c5-c4, cavalier au bord, dame trop gourmande (…Dxb2).</p>
      <ul><li>Signal : une pièce adverse dont toutes les cases sont contrôlées. Le scanner affiche « pièce piégée ».</li></ul>`,
    exercises: [
      { theme: 'trappedPiece', title: 'L\'arche de Noé (Espagnole)', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4', type: 'line', solution: ['c5', 'Qd5', 'Be6', 'Qc6+', 'Bd7', 'Qd5', 'c4'], hint: 'Chassez la dame avec gain de temps, puis enfermez le fou b3.' },
    ],
  },
  {
    id: 'underpromo', cat: 'Tactique', title: 'Coups intermédiaires et sous-promotion',
    body: `
      <p>Avant de reprendre « automatiquement », cherchez un <b>coup intermédiaire</b> (échec, menace plus forte). Et pensez que la promotion en cavalier peut donner échec.</p>`,
    exercises: [
      { theme: 'underPromotion', title: 'Le piège de Lasker (contre-gambit Albin)', moves: 'd4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4', type: 'line', solution: ['exf2+', 'Ke2', 'fxg1=N+'], hint: 'Échec d\'abord. Et une promotion en dame se ferait prendre…' },
    ],
  },
  {
    id: 'defense', cat: 'Tactique', title: 'Défendre contre les attaques précoces',
    body: `
      <p>À votre niveau, beaucoup d'adversaires jouent Dh5/Fc4 visant f7 (« mat du berger ») ou Cg5. Réponses types :</p>
      <ul><li>Contre Dh5+Fc4 : …g6 ou …De7 (pas …Cf6 qui laisse Dxf7#).</li><li>Le point f7 n'est défendu que par le roi : ne le laissez pas attaqué deux fois.</li><li>Développez avec menace : chasser la dame fait gagner des temps.</li></ul>`,
    exercises: [
      { theme: 'defensiveMove', title: 'Parer le mat du berger', moves: 'e4 e5 Bc4 Nc6 Qh5', type: 'best', hint: 'Deux pièces visent f7. Bloquez la ligne de la dame ou défendez f7.' },
    ],
  },

  // ======================= STRATÉGIE ========================================
  {
    id: 'opening-principles', cat: 'Stratégie', title: 'Principes d\'ouverture',
    body: `
      <ol>
        <li><b>Centre</b> : pions e/d et pièces vers d4, e4, d5, e5.</li>
        <li><b>Développement</b> : cavaliers avant les fous, une pièce = un coup, pas de dame dehors trop tôt.</li>
        <li><b>Roque</b> rapide, puis connectez les tours et placez-les sur les colonnes ouvertes.</li>
        <li>Ne prenez pas un pion si cela coûte 2-3 temps de développement (sauf si vous calculez que c'est sûr).</li>
        <li>Chaque coup de pion crée une faiblesse définitive : poussez-les avec un but (rupture, espace, case).</li>
      </ol>`,
  },
  {
    id: 'iqp', cat: 'Stratégie', title: 'Le pion isolé de la dame (PID)',
    example: 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 Bd3 O-O O-O Nc6 Re1',
    body: `
      <p>Un pion d4 (ou d5) sans pion voisin sur c et e. Il donne <b>espace et activité</b> mais devient une <b>faiblesse en finale</b>.</p>
      <table class="tbl" style="font-size:.85rem"><thead><tr><th>Avec le PID</th><th>Contre le PID</th></tr></thead><tbody>
        <tr><td style="text-align:left;white-space:normal">Attaquez le roi (Fd3/Dc2 vers h7, Te1-e3-h3)</td><td style="text-align:left;white-space:normal">Bloquez en d5 (cavalier idéal)</td></tr>
        <tr><td style="text-align:left;white-space:normal">Cavaliers en e5 et c5</td><td style="text-align:left;white-space:normal">Échangez les pièces mineures</td></tr>
        <tr><td style="text-align:left;white-space:normal">Rupture d4-d5 au bon moment</td><td style="text-align:left;white-space:normal">Tours sur la colonne d contre le pion</td></tr>
        <tr><td style="text-align:left;white-space:normal">Évitez les échanges</td><td style="text-align:left;white-space:normal">Visez la finale</td></tr>
      </tbody></table>`,
  },
  {
    id: 'carlsbad', cat: 'Stratégie', title: 'Structure Carlsbad et attaque de minorité',
    example: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7 Qc2 O-O Nf3 Re8 O-O',
    body: `
      <p>Après cxd5 exd5 au Gambit Dame. Les Blancs ont 2 pions (a, b) contre 3 (a, b, c) à l'aile dame.</p>
      <ul>
        <li><b>Plan blanc</b> : <b>b4-b5</b> (attaque de minorité). Après bxc6, le pion c6 ou d5 devient faible et la colonne c s'ouvre.</li>
        <li><b>Plan noir</b> : jeu à l'aile roi (Ce4, Tf8-e8, f5) ou contre-jeu au centre ; répondre à b5 par …c5 si possible.</li>
      </ul>`,
  },
  {
    id: 'chains', cat: 'Stratégie', title: 'Chaînes de pions : attaquez la base',
    example: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2',
    body: `
      <p>Une chaîne (d4-e5) pointe vers une aile : <b>son propriétaire attaque de ce côté</b> ; l'adversaire attaque la <b>base</b> de la chaîne (le pion le plus en arrière).</p>
      <ul>
        <li>Française avance : les Noirs frappent d4 par …c5, …Cc6, …Db6, puis e5 par …f6.</li>
        <li>Les Blancs attaquent à l'aile roi (f4-f5, Dg4) et maintiennent d4.</li>
        <li>Le « mauvais fou » (celui bloqué par ses propres pions) : à échanger ou à sortir devant la chaîne.</li>
      </ul>`,
  },
  {
    id: 'kid', cat: 'Stratégie', title: 'Centre fermé : la course sur les ailes',
    example: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
    body: `
      <p>Quand le centre est bloqué (d5-e4 contre d6-e5), chaque camp joue <b>du côté où pointe sa chaîne</b>.</p>
      <ul><li>Blancs : c4-c5, b4, Cd2-c4 : percée à l'aile dame.</li><li>Noirs : …Ce8/…Cd7, …f5-f4, …g5-g4 : attaque sur le roi.</li><li>C'est une course : ne perdez pas de temps à défendre, attaquez plus vite.</li></ul>`,
  },
  {
    id: 'opposite-castling', cat: 'Stratégie', title: 'Roques opposés : la tempête de pions',
    example: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 O-O-O',
    body: `
      <p>Quand les rois sont de côtés opposés, <b>avancez les pions vers le roi adverse</b> : ils ouvrent des colonnes sans affaiblir votre propre roi.</p>
      <ul><li>Attaque Yougoslave contre le Dragon : h4-h5, Fh6 pour échanger le fou g7, g4, Dh6.</li><li>Les Noirs : …Tc8, sacrifice …Txc3, …b5-b4.</li><li>Règle : le temps compte plus que le matériel ; ouvrez des lignes.</li></ul>`,
  },
  {
    id: 'maroczy', cat: 'Stratégie', title: 'L\'étau de Maroczy',
    example: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Bg7 Be3 Nf6 Nc3 O-O Be2 d6 O-O',
    body: `<p>Les pions c4+e4 contrôlent d5 : les Noirs manquent d'espace et cherchent la rupture …b5 ou …d5. Les Blancs jouent la prophylaxie (a4, Tc1, f3) et gagnent du terrain lentement. Le camp qui manque d'espace doit <b>échanger des pièces</b>.</p>`,
  },
  {
    id: 'outposts', cat: 'Stratégie', title: 'Avant-postes, trous et cavaliers',
    body: `
      <p>Un <b>avant-poste</b> est une case dans le camp adverse qui ne peut plus être attaquée par un pion ennemi et qui est soutenue par l'un de vos pions. Un cavalier y vaut souvent une tour.</p>
      <ul><li>Chaque coup de pion crée des <b>trous</b> derrière lui.</li><li>Après …e5 et …d6 (Sicilienne), d5 est l'avant-poste blanc typique.</li><li>Le scanner liste vos avant-postes et les trous adverses.</li></ul>`,
  },
  {
    id: 'bishops', cat: 'Stratégie', title: 'Bon fou, mauvais fou, paire de fous',
    body: `
      <ul>
        <li><b>Mauvais fou</b> : ses propres pions centraux sont sur sa couleur. Placez vos pions sur la couleur opposée à votre fou restant.</li>
        <li><b>Paire de fous</b> : avantage dans les positions ouvertes ; ouvrez le jeu.</li>
        <li><b>Fous de couleurs opposées</b> : favorisent l'attaquant en milieu de partie, très nuls en finale.</li>
      </ul>`,
  },
  {
    id: 'files', cat: 'Stratégie', title: 'Colonnes ouvertes et 7e rangée',
    body: `<ul><li>Tours sur les colonnes ouvertes (sans pions) ou semi-ouvertes (face à un pion adverse).</li><li>Doublez les tours, puis pénétrez en 7e rangée : elles y attaquent les pions et enferment le roi.</li><li>Une tour en 7e vaut souvent un pion.</li></ul>`,
  },
  {
    id: 'majority', cat: 'Stratégie', title: 'Majorités et pion passé',
    body: `
      <ul>
        <li>Une majorité de pions sur une aile permet de créer un <b>pion passé</b> : poussez d'abord le pion <b>sans vis-à-vis</b> (le candidat).</li>
        <li>La majorité à l'aile dame est précieuse en finale : le pion passé sera loin des rois (« pion passé éloigné »).</li>
        <li>Les pions passés doivent avancer ; ceux de l'adversaire doivent être <b>bloqués</b> (cavalier devant).</li>
      </ul>`,
  },
  {
    id: 'prophylaxis', cat: 'Stratégie', title: 'Prophylaxie et règle des deux faiblesses',
    body: `<ul><li>Avant chaque coup : « que veut faire mon adversaire ? » ; empêchez sa rupture ou son meilleur coup.</li><li>Une faiblesse se défend ; <b>deux faiblesses éloignées</b> font craquer la défense. Créez-en une seconde de l'autre côté.</li><li>Ne vous pressez pas quand l'adversaire n'a pas de contre-jeu.</li></ul>`,
  },
  {
    id: 'exchanges', cat: 'Stratégie', title: 'Quand échanger ?',
    body: `<ul><li>Avec un avantage matériel : échangez les <b>pièces</b>, pas les pions.</li><li>Sous attaque ou à l'étroit : échangez pour respirer.</li><li>Échangez les pièces qui défendent les faiblesses adverses, et vos pièces passives contre ses pièces actives.</li><li>Ne pas échanger quand vous attaquez ou avez plus d'espace.</li></ul>`,
  },

  // ======================= FINALES ========================================
  {
    id: 'kq-k', cat: 'Finales', title: 'Mat roi + dame contre roi',
    body: `<p>Technique de la « boîte » : la dame se place à un saut de cavalier du roi adverse pour réduire sa zone, sans jamais le laisser pat. Une fois le roi au bord, approchez votre roi puis matez.</p><p><b>Danger n°1 : le pat.</b> Après chaque coup de dame, vérifiez que le roi adverse a encore une case.</p>`,
    exercises: [{ theme: 'endgame', title: 'Matez en moins de 15 coups', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1', type: 'play', goal: 'mate', maxMoves: 15 }],
  },
  {
    id: 'kr-k', cat: 'Finales', title: 'Mat roi + tour contre roi',
    body: `<p>La tour coupe le roi adverse sur une rangée ; votre roi vient en <b>opposition</b> ; à ce moment la tour donne échec et repousse le roi d'une rangée. Si le roi adverse n'est pas en opposition, faites un coup d'attente avec la tour.</p>`,
    exercises: [{ theme: 'endgame', title: 'Matez en moins de 25 coups', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', type: 'play', goal: 'mate', maxMoves: 25 }],
  },
  {
    id: 'square', cat: 'Finales', title: 'La règle du carré',
    body: `<p>Tracez le carré entre le pion passé et sa case de promotion. Si le roi défenseur peut entrer dans ce carré (en tenant compte du trait), il rattrape le pion.</p>`,
    exercises: [{ theme: 'pawnEndgame', title: 'Rattrapez le pion', fen: '7k/8/8/8/p7/8/8/4K3 w - - 0 1', type: 'play', goal: 'draw', maxMoves: 6, hint: 'Entrez dans le carré a4-d4-d1-a1.' }],
  },
  {
    id: 'opposition', cat: 'Finales', title: 'L\'opposition (roi + pion contre roi)',
    body: `
      <ul>
        <li><b>Opposition</b> : les rois face à face avec une case entre eux ; celui qui n'a PAS le trait « a l'opposition ».</li>
        <li>Attaquant : placez votre roi <b>devant</b> votre pion. Roi en 6e rangée devant le pion = gain (sauf pion tour).</li>
        <li>Défenseur : restez devant le pion et prenez l'opposition ; reculez <b>tout droit</b>.</li>
      </ul>`,
    exercises: [
      { theme: 'pawnEndgame', title: 'Gagnez (allez à dame)', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', type: 'play', goal: 'win', maxMoves: 12 },
      { theme: 'pawnEndgame', title: 'Annulez avec les Noirs', fen: '8/4k3/8/8/4K3/4P3/8/8 b - - 0 1', type: 'play', goal: 'draw', maxMoves: 12, hint: 'Prenez l\'opposition.' },
    ],
  },
  {
    id: 'breakthrough', cat: 'Finales', title: 'La percée de pions',
    body: `<p>Trois pions contre trois face à face en 5e rangée : le sacrifice du pion central crée un pion passé imparable si le roi adverse est loin.</p>`,
    exercises: [{ theme: 'pawnEndgame', title: 'Percée !', fen: '7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1', type: 'line', solution: ['b6', 'cxb6', 'a6', 'bxa6', 'c6'], hint: 'Sacrifiez le pion du milieu.' }],
  },
  {
    id: 'lucena', cat: 'Finales', title: 'Position de Lucena : construire le pont',
    body: `<p>Tour + pion en 7e contre tour, roi adverse coupé. Méthode : 1) tour en 4e rangée (« le pont »), 2) sortir le roi de devant le pion, 3) interposer la tour contre les échecs.</p>`,
    exercises: [{ theme: 'rookEndgame', title: 'Gagnez la Lucena', fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1', type: 'play', goal: 'win', maxMoves: 25, hint: 'Tc4 (le pont) puis le roi sort.' }],
  },
  {
    id: 'philidor', cat: 'Finales', title: 'Position de Philidor : la défense en 3e rangée',
    body: `<p>Le défenseur garde sa tour sur la 3e rangée (6e pour les Noirs) pour empêcher le roi adverse d'avancer. Dès que le pion avance sur cette rangée, la tour va derrière et donne des échecs depuis l'arrière.</p>`,
    exercises: [{ theme: 'rookEndgame', title: 'Annulez la Philidor', fen: '3k4/8/r7/3PK3/8/8/8/7R b - - 0 1', type: 'play', goal: 'draw', maxMoves: 12, hint: 'Gardez la tour sur la 6e rangée.' }],
  },
  {
    id: 'endgame-principles', cat: 'Finales', title: 'Principes de finale',
    body: `<ul><li><b>Roi actif</b> : en finale le roi est une pièce d'attaque, centralisez-le.</li><li><b>Tours derrière les pions passés</b> (les vôtres comme ceux de l'adversaire).</li><li>Pion tour + fou de mauvaise couleur : nulle si le roi défenseur atteint la case de promotion.</li><li>Fous de couleurs opposées : souvent nulle même avec 1-2 pions de moins.</li><li><b>Triangulation</b> : perdre un temps avec le roi pour donner le trait à l'adversaire.</li><li>Avec un pion de plus : échangez les pièces, pas les pions.</li></ul>`,
  },
];

export const ALL_EXERCISES = LESSONS.flatMap((l) => (l.exercises || []).map((e, i) => ({ ...e, id: `${l.id}#${i}`, lesson: l.id, cat: l.cat })));
