# ♞ ChessLab

Application web pour progresser aux échecs :

1. **Arbres d'ouvertures visuels.** Choisissez votre plage Elo avec un curseur (et un « niveau cible » à comparer). L'arbre pousse depuis la position de départ : la ligne jouée forme un tronc lumineux, chaque coup est une sphère dont la taille indique la popularité et la couleur le score obtenu. En mode comparaison, deux arbres en miroir montrent ce qui se joue à votre niveau et chez les plus forts. Sur l'échiquier, les 3 coups les plus joués (ou les meilleurs) s'affichent en flèches avec leur pourcentage, et vous jouez le coup de votre choix. Une **bibliothèque** de 34 ouvertures donne pour chacune un mini-échiquier, sa popularité et son score à votre niveau.
2. **Répertoire automatique.** À votre tour, le coup qui marque le plus chez les plus forts. Au tour adverse, les réponses qui couvrent 80 % des parties à votre niveau. Export PGN et révision par répétition espacée.
3. **Scanner de position.** Il repère tout de suite fourchettes, clouages, enfilades, découvertes, pièces en prise ou piégées, défenseurs surchargés, rangée arrière faible, roque affaibli, f7/f2 et mats en 1 (pour vous ET contre vous).
4. **Plan de jeu.** Il reconnaît la structure de pions (pion isolé, Carlsbad, chaîne française, Est-indienne, Maroczy, Hérisson, Sicilienne ouverte, Stonewall, pions pendants, centre ouvert ou fermé) et dit **quoi faire avec vos pions** : ruptures, majorités, attaque de minorité, tempête de pions, avant-postes, faiblesses adverses et prophylaxie.
5. **Cours et exercices.** Méthode de réflexion, tactique (fourchette, clouage, enfilade, découverte, échec double, mat du couloir, mat étouffé, sacrifice grec, pièce piégée, sous-promotion), stratégie (12 thèmes) et finales (mats de base, carré, opposition, percée, Lucena, Philidor). Chaque exercice est **vérifié par Stockfish** (`npm run validate`).
6. **Entraînement.** Reconnaissance éclair chronométrée, puzzles Lichess par thème, partie contre Stockfish à Elo réglable avec un coach qui signale opportunités et dangers, revue de partie qui relie chaque erreur au motif manqué, et statistiques par thème.

Stockfish 19 (WASM) tourne **dans votre navigateur**. Aucun serveur n'est nécessaire.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
```

Version statique : `npm run build` produit `dist/`, servi par n'importe quel serveur web (`npm run preview` pour tester).

## Premier réglage

Dans l'onglet **Ouvertures**, réglez votre plage Elo (« Mon niveau ») et, si vous voulez comparer, le « Niveau cible ». Puis, dans **⚙ Réglages**, renseignez :

- les cadences et votre couleur principale.
- un **jeton d'API Lichess**, si l'explorateur exige une connexion. Créez-le sur <https://lichess.org/account/oauth/token> sans cocher aucune permission. Il reste dans votre navigateur (localStorage).

## Méthode de travail conseillée

1. **Ouvertures** : jouez vos premiers coups et regardez le badge ★ et les « pièges » adverses.
2. **Mon répertoire** → *Construire* (14 demi-coups, couverture 80 %) → exportez le PGN → *Entraînement* chaque jour.
3. Quand la théorie s'arrête : **Scanner & Plan**. Le plan vous dit quelles ruptures de pions jouer selon la structure obtenue.
4. Après chaque partie : collez le PGN (📋), puis *Analyser la partie*. Les motifs que vous ratez s'affichent ; travaillez-les dans **Entraînement**.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/core.js` | géométrie, tables d'attaques, échange statique (SEE) |
| `src/scanner.js` | détection des motifs tactiques et des faiblesses |
| `src/structures.js` | faits de pions, structures classiques, ruptures, plan |
| `src/tree-view.js` | arbre d'ouverture en SVG (mise en page compacte, sphères 3D, infobulles) |
| `src/openings.js` | bibliothèque des ouvertures |
| `src/components/range-slider.js` | curseur double de plage Elo |
| `src/explorer.js` | client de l'explorateur Lichess (cache, limite de débit, comparaison par niveau) |
| `src/repertoire.js` | construction de l'arbre, export PGN, répétition espacée |
| `src/engine.js` | Stockfish dans un Web Worker (MultiPV, Elo limité) |
| `src/lessons-data.js` | contenu des cours et exercices |
| `src/exercise.js` | moteur d'exercices (suite imposée, meilleur coup, partie contre le moteur) |
| `src/panels/*` | les cinq onglets |
| `scripts/validate-lessons.mjs` | vérification des exercices par chess.js et Stockfish |

Ajouter un exercice : complétez `src/lessons-data.js` puis lancez `npm run validate`.

## Sources de données

- [Lichess Opening Explorer](https://lichess.org/api#tag/Opening-Explorer) : parties Lichess filtrées par Elo et cadence, et parties de maîtres.
- [Lichess Puzzles](https://lichess.org/api#tag/Puzzles) : puzzles par thème.
- [Stockfish](https://stockfishchess.org/) 19 via [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3).
- [chess.js](https://github.com/jhlywa/chess.js) et [chessground](https://github.com/lichess-org/chessground) (GPLv3).

## Licence

GPL-3.0, imposée par Stockfish et chessground.
