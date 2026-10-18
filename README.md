# ♞ ChessLab

Application web pour progresser aux échecs :

1. **Arbres d'ouvertures visuels.** Choisissez votre plage Elo avec un curseur (et un « niveau cible » à comparer). L'arbre pousse depuis la position de départ : la ligne jouée forme un tronc blanc lumineux, chaque coup est une sphère dont la taille indique la popularité et la couleur le résultat comparé aux autres coups de la même position (vert = meilleur, gris = équivalent, rouge = moins bon). En mode comparaison, deux arbres en miroir montrent ce qui se joue à votre niveau et chez les plus forts. Sur l'échiquier, les 3 coups les plus joués (ou les meilleurs) s'affichent en flèches avec leur pourcentage, et vous jouez le coup de votre choix. Une **bibliothèque** de 34 ouvertures donne pour chacune un mini-échiquier, sa popularité et son score à votre niveau. La vue **🎯 Étudier** prend une ouverture (choisie dans la liste, cliquée dans la bibliothèque, ou reconnue dès que vous la jouez) et affiche d'un coup toutes ses branches : chaque réponse adverse jouée à votre niveau, votre meilleur coup face à elle, les réponses à préparer en priorité (⚠), les erreurs adverses à punir (🎁), la ligne principale et le plan de pions de la structure. Un clic l'ajoute à « Mon répertoire ».
2. **Répertoire automatique.** À votre tour, le coup qui marque le plus chez les plus forts. Au tour adverse, les réponses qui couvrent 80 % des parties à votre niveau. Export PGN et révision par répétition espacée.
3. **Scanner de position.** Il repère tout de suite fourchettes, clouages, enfilades, découvertes, pièces en prise ou piégées, défenseurs surchargés, rangée arrière faible, roque affaibli, f7/f2 et mats en 1 (pour vous ET contre vous).
4. **Plan de jeu.** Il reconnaît la structure de pions (pion isolé, Carlsbad, chaîne française, Est-indienne, Maroczy, Hérisson, Sicilienne ouverte, Stonewall, pions pendants, centre ouvert ou fermé) et dit **quoi faire avec vos pions** : ruptures, majorités, attaque de minorité, tempête de pions, avant-postes, faiblesses adverses et prophylaxie.
5. **Cours et exercices.** Méthode de réflexion, tactique (fourchette, clouage, enfilade, découverte, échec double, mat du couloir, mat étouffé, sacrifice grec, pièce piégée, sous-promotion), stratégie (12 thèmes) et finales (mats de base, carré, opposition, percée, Lucena, Philidor). Chaque exercice est **vérifié par Stockfish** (`npm run validate`).
6. **Entraînement.** Reconnaissance éclair chronométrée, puzzles Lichess par thème, partie contre Stockfish à Elo réglable avec un coach qui signale opportunités et dangers, revue de partie qui relie chaque erreur au motif manqué, et statistiques par thème.

Stockfish 19 (WASM) tourne **dans votre navigateur**. Aucun serveur n'est nécessaire. Une **base locale** facultative rend les arbres d'ouverture quasi instantanés (voir plus bas).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
```

Version statique : `npm run build` produit `dist/`, servi par n'importe quel serveur web (`npm run preview` pour tester).

## Base locale de l'explorateur (recommandé)

Sans base locale, chaque position affichée est une requête à l'explorateur Lichess. Lichess impose un rythme lent (une requête à la fois) et une pause d'une minute en cas d'excès, donc un arbre complet peut mettre plusieurs minutes à se charger. La base locale règle ce problème. Elle est construite une fois par mois à partir du [dump mensuel Lichess](https://database.lichess.org) (toutes les parties classées du mois), puis un petit serveur local la sert en quelques millisecondes par position.

- Seuls les **20 premiers demi-coups** de chaque partie sont comptés (réglable avec `--max-ply`), c'est-à-dire la zone de l'ouverture.
- Les positions vues dans moins de 3 parties sont supprimées (`--min-games`).
- Une position absente de la base (trop profonde ou trop rare) est demandée à Lichess, comme avant. Les réponses de Lichess sont gardées 90 jours dans le navigateur (IndexedDB).
- La barre du haut indique la source des données : **🗄 Base locale · AAAA-MM**, **☁ Lichess en direct**, ou **⏳ Limite Lichess · reprise dans N s** pendant une pause imposée par Lichess.

Installation (Python 3.10 ou plus récent, une seule fois) :

```powershell
cd explorer-db
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

Construction de la base, avec le dump du mois précédent lu en flux (rien n'est stocké à part la base) :

```powershell
.\.venv\Scripts\python build.py                          # mois complet (~100 M parties)
.\.venv\Scripts\python build.py --max-games 10000000     # échantillon de 10 M parties, bien plus rapide
.\.venv\Scripts\python build.py --month 2026-09          # un mois précis
.\.venv\Scripts\python build.py --file dump.pgn.zst      # un dump déjà téléchargé
```

Ordres de grandeur mesurés sur un PC à 16 cœurs : environ 19 000 parties/s, soit 1 h 30 environ pour un mois complet. Un échantillon de 300 000 parties donne une base de 39 Mo (146 000 positions) ; un mois complet fera plusieurs Go. Un échantillon de 10 à 20 M parties suffit pour des pourcentages et des scores fiables, mais les nombres de parties sont alors plus petits que sur Lichess. Ctrl+C pendant la lecture arrête proprement la lecture et construit la base avec les parties déjà lues.

Il n'y a rien d'autre à lancer : `npm run dev` (et `npm run preview`) démarre aussi le serveur de la base (`explorer-db/serve.py`, sur http://127.0.0.1:8765) et l'arrête en même temps. On peut aussi le lancer seul avec `.\.venv\Scripts\python serve.py`, par exemple pour servir la version `dist/` avec un autre serveur web.

L'adresse se règle dans **⚙ Réglages → Base locale de l'explorateur** (vide = toujours Lichess). La base peut être reconstruite pendant que le serveur tourne : il prend la nouvelle version tout seul.

**Mise à jour mensuelle automatique** : `update-monthly.ps1` reconstruit la base avec le mois précédent (les arguments sont transmis à `build.py`, et le journal est écrit dans `build.log`). Pour le lancer le 5 de chaque mois à 3 h, depuis le dossier `explorer-db` :

```powershell
schtasks /create /tn "ChessLab explorer" /sc monthly /d 5 /st 03:00 /tr "powershell -NoProfile -ExecutionPolicy Bypass -File $PWD\update-monthly.ps1"
```

## Premier réglage

Commencez par **Se connecter avec Lichess** (en haut à droite) : l'explorateur d'ouvertures de Lichess exige désormais un compte. La connexion passe par OAuth (PKCE) directement depuis le navigateur, sans aucune permission demandée. Depuis la fenêtre du compte, vous pouvez régler « Mon niveau » sur votre Elo. La vue **Ouvertures → 📊 Par niveau** montre, pour la position affichée, les coups les plus joués (et leur score) dans chaque tranche Elo, de moins de 1000 à 2500+.

Dans l'onglet **Ouvertures**, réglez votre plage Elo (« Mon niveau ») et, si vous voulez comparer, le « Niveau cible ». Puis, dans **⚙ Réglages**, renseignez :

- les cadences et votre couleur principale.
- (alternative à la connexion) un **jeton d'API Lichess** personnel, créé sur <https://lichess.org/account/oauth/token> sans cocher aucune permission. Il reste dans votre navigateur (localStorage).

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
| `src/lichess.js` | connexion OAuth Lichess (PKCE) et profil du joueur |
| `src/study.js`, `src/panels/study-view.js` | étude d'une ouverture : reconnaissance, arbre complet réponse adverse → meilleur coup |
| `src/explorer.js` | client de l'explorateur : base locale puis Lichess, limite de débit, comparaison par niveau |
| `src/idb-cache.js` | cache IndexedDB des réponses Lichess (90 jours) |
| `explorer-db/build.py` | construit la base locale (SQLite) à partir du dump mensuel Lichess |
| `explorer-db/serve.py` | serveur local qui répond comme l'explorateur Lichess |
| `src/repertoire.js` | construction de l'arbre, export PGN, répétition espacée |
| `src/engine.js` | Stockfish dans un Web Worker (MultiPV, Elo limité) |
| `src/lessons-data.js` | contenu des cours et exercices |
| `src/exercise.js` | moteur d'exercices (suite imposée, meilleur coup, partie contre le moteur) |
| `src/panels/*` | les cinq onglets |
| `scripts/validate-lessons.mjs` | vérification des exercices par chess.js et Stockfish |

Ajouter un exercice : complétez `src/lessons-data.js` puis lancez `npm run validate`.

## Sources de données

- [Lichess Opening Explorer](https://lichess.org/api#tag/Opening-Explorer) : parties Lichess filtrées par Elo et cadence, et parties de maîtres.
- [Lichess Database](https://database.lichess.org) : dumps mensuels des parties, pour la base locale. Noms d'ouvertures : [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings).
- [Lichess Puzzles](https://lichess.org/api#tag/Puzzles) : puzzles par thème.
- [Stockfish](https://stockfishchess.org/) 19 via [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3).
- [python-chess](https://github.com/niklasf/python-chess) (GPLv3) pour la base locale.
- [chess.js](https://github.com/jhlywa/chess.js) et [chessground](https://github.com/lichess-org/chessground) (GPLv3).

## Licence

GPL-3.0, imposée par Stockfish et chessground.
