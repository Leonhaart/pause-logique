# Pause Logique

Application de jeux de logique (PWA, JavaScript natif, aucune dépendance, aucun build).

## Lancer en local

    node tools/serve.mjs        # http://localhost:8080
    npm test                    # tests unitaires (node:test)
    node tools/gen-sw-assets.mjs  # à relancer après tout ajout ou changement de fichier

Le service worker pré-cache tous les fichiers listés dans `sw-assets.js` (généré).
Un test échoue si ce fichier n'est plus à jour.

## Publier (pour l'installer sur téléphone)

Il faut une adresse HTTPS.

- **Netlify Drop** : glisser le dossier du projet sur app.netlify.com/drop. Aucun compte Git requis.
- **GitHub Pages** : pousser le dossier dans un dépôt, puis Settings > Pages > Source : GitHub Actions.
  Copier `tools/pages.yml` vers `.github/workflows/pages.yml` : il publie à chaque push sur `main`.

Sur téléphone : ouvrir l'adresse, puis "Ajouter à l'écran d'accueil" (iOS : Partager, Android : menu du navigateur).

## Structure

    js/core/     rng à graine, minuteur, stats, sauvegardes, réglages, i18n, routeur
    js/ui/       accueil, niveaux, écran de jeu (coque), feuilles, icônes
    js/games/    registre + un dossier par jeu
    js/i18n/     fr.js, en.js (mêmes clés, vérifié par test)

## Sudoku

- Solveur par techniques (candidats uniques, paires, triplets, intersections, X-Wing, Swordfish, XY-Wing) : `js/games/sudoku/solver.js`.
- Niveau = technique la plus difficile requise : facile (candidats uniques), moyen (paires, intersections), difficile (X-Wing, XY-Wing, Swordfish).
- Banque de 100 grilles (25 faciles, 50 moyennes, 25 difficiles) dans `js/games/sudoku/bank.js`, variées à l'infini par transformations qui conservent la difficulté.
- Pour régénérer la banque : `node tools/gen-bank-sudoku.mjs`, puis `node tools/gen-sw-assets.mjs`.

## Ajouter un jeu

1. Créer `js/games/<id>/index.js` : `export default { mount(container, ctx) { ...; return { destroy() {} }; } }`
2. Passer `ready: true` pour ce jeu dans `js/games/registry.js`.
3. Textes dans `js/i18n/fr.js` et `en.js` (nom, description, règles).

`ctx` fourni par la coque :

- `ctx.level` (`easy|medium|hard`), `ctx.seed`, `ctx.rng` : même graine, même grille
- `ctx.restore` : état sauvegardé ou `null` ; `ctx.save(state)` à appeler à chaque coup
- `ctx.complete()` : fin de partie (stats, dialogue de victoire)
- `ctx.settings()` et `ctx.onSettings(fn)` : `errors` (`never|ask|live`), `hints`, `timer`
- `ctx.isPaused()`

Les erreurs ne sont jamais punies : le réglage `errors` ne change que l'affichage.

## Star Battle

- Règles : 1 étoile par ligne, colonne et région, jamais deux étoiles voisines.
- 3 tailles (8×8, 10×10, 12×12), 3 difficultés. Niveau dans l'URL : `hard-12`.
- Banque : `js/games/starbattle/bank.js`, 100 grilles par taille (25/50/25). Régénération : `node tools/gen-bank-starbattle.mjs` (environ 3 minutes).
- Stock local : une grille terminée est consommée, un worker (`worker.js`) refabrique seulement celles qui manquent, stockées dans le navigateur.
- Difficulté : mesurée par un solveur à techniques (`solver.js`), jamais au hasard. Facile : déductions simples. Moyen : ensembles de 2 zones et peu d'essais logiques. Difficile : beaucoup d'essais logiques ou ensembles de 3 zones et plus. Seuils par taille dans `generator.js`.

## Nonogram

- Tailles 5×5, 10×10, 15×15, difficultés par techniques de déduction (niveau dans l'URL : `medium-10`).
- Techniques : 1 recouvrement des blocs, 2 bornes (en tenant compte des croix), 3 ligne complète, 4 essai logique. Facile : niveau 1 seulement. Moyen : jusqu'au niveau 3 avec peu d'étapes. Difficile : beaucoup d'étapes de niveau 3 ou essai logique. Seuils par taille dans `js/games/nonogram/generator.js`.
- Banque : `js/games/nonogram/bank.js`, 100 grilles par taille (25/50/25). Régénération : `node tools/gen-bank-nonogram.mjs`.
- Images : les motifs 10×10 et 15×15 viennent d'emoji Noto (Google, licence Apache 2.0, voir `THIRD_PARTY_NOTICES.md`), réduits à des silhouettes. Source : `tools/nonogram-images.json`. Si ce fichier existe (`{ "10": [{ "name": "...", "bits": "hex" }], "15": [...] }`), le générateur les utilise comme motifs au lieu des motifs symétriques.

## Takuzu

- Tailles 6, 8 et 10. Le niveau s'écrit `<difficulté>-<taille>` (ex. `hard-8`).
- Difficulté selon les techniques : facile (paires, trous, quota), moyen (toutes les complétions d'une ligne, lignes uniques), difficile (essai logique).
- Banque de 100 grilles par taille (25 faciles, 50 moyennes, 25 difficiles) : `node tools/gen-bank-takuzu.mjs`. Stock reconstruit en arrière-plan après chaque partie.
- Appui : vide, ● (1), ○ (0), vide. Glisser pour peindre plusieurs cases.
