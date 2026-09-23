# L’Atelier Universel de Broderie

Un **atelier de point de croix** : patron éditable, grille symbolisée, suivi réel de la broderie, aperçu 3D illustratif, fiche A4 et JSON autonome. La phase 2 **enrichit** la phase 1 ; elle ne remplace ni ses trois générateurs, ni sa 3D, ni ses mesures, ni sa persistance.

## Démarrer

```sh
npm start          # serveur statique de développement sur 0.0.0.0:8000
npm test           # tests Node 20+ : socle conservé et phase 2
npm run build      # assemble le site statique pour Vercel dans dist/
```

**Premier déploiement Vercel :** voir [DEPLOIEMENT_VERCEL.md](DEPLOIEMENT_VERCEL.md) pour les réglages précis, la branche à choisir et le transfert des ouvrages enregistrés localement.

Ouvrir `http://localhost:8000` dans un navigateur prenant en charge SVG, modules ES et, facultativement, WebGL. Ne pas ouvrir le fichier avec `file://`. Aucune installation npm n'est nécessaire. Three.js 0.152.2 et OrbitControls sont fournis dans `vendor/` avec leur licence MIT : pas de CDN, pas de service distant. Sans WebGL, la grille 2D, le JSON et la fiche restent utilisables.

## Mode Patron : grille, légende et outils

1. Choisir **Cœur sauvage**, **Fleur des champs** ou **Jardin de lune**, en 28, 36 ou 44 points. Ce sont les **formules historiques**, inchangées. Un changement qui effacerait des cellules ou marques de réalisation demande confirmation.
2. Indiquer la toile, sa densité en **points/cm** et les quatre marges en **cm**. Départ modifiable : Aïda, 5,5 points/cm et 5 cm par côté. Saisir une largeur et une hauteur indépendantes (1 à **200** chacune), puis « Adapter la grille » : les cellules conservées ne changent pas de coordonnées ; les cellules hors cadre sont supprimées après confirmation.
3. La **légende cliquable** présente symbole, nombre de croix, part du patron et croix marquées faites par fil. Cliquer un fil le sélectionne et le focalise dans la grille ; les autres sont atténués. Recliquer ou « Afficher tous les fils » retire le focus. Les symboles sont distincts indépendamment des couleurs, y compris à l'impression en gris.
4. **Pinceau** : cliquer une case vide place une croix ; cliquer une croix du même fil la retire ; un autre fil la remplace. Glisser peint/gomme plusieurs cases **en une opération**. **Gomme** et Suppr effacent. **Remplir** colore une composante contiguë par les **quatre côtés**, jamais en diagonale ; confirmation au-delà de 500 cellules.
5. **Zone** : cliquer deux coins opposés ou glisser pour tracer un rectangle. **Dupliquer… / Déplacer…** demandent ensuite un clic sur la **destination (coin haut gauche)**. La copie comprend les cellules vides ; un recouvrement hors source demande confirmation. « Effacer la zone » est disponible. Une opération de zone vaut **un seul** Annuler/Rétablir. Échap désélectionne ; Maj-clic choisit une case sans modifier le patron.
6. Flèches pour naviguer, Entrée/Espace pour appliquer l'outil. **Ctrl/⌘ + Z** annule ; **Ctrl/⌘ + Maj + Z** ou **Ctrl + Y** rétablit. L’historique est borné à **40 opérations dans la session** et n’est pas reconstruit après fermeture ; le projet, lui, est enregistré.
7. Pour les grandes grilles : **+ / −** et **Ctrl/⌘ + molette** zooment ; « Déplacer la vue » permet le glissé, le défilement ordinaire reste possible. Axes et traits renforcés tous les 10 points restent sur le SVG ; le repère sélection/survol reste visible. « Aller à une coordonnée » centre une **ligne et colonne à partir de 1**. « Lire par plages de lignes » atténue les autres lignes en 2D et limite les points visibles en 3D ; le patron et l'export restent **complets**. « Tout » désactive ce filtre de lecture.

Une cellule = **une position de point de croix**. Le motif 36 × 36 initial a **1 296 positions, 866 croix et 430 cases vides** : les chiffres affichés découlent toujours du modèle.

## Mode Broder : réalisation indépendante

Passer en **Broder** et choisir **À FAIRE**, **EN COURS** ou **FAIT** : le bouton applique cet état à une croix déjà sélectionnée, puis les clics suivants appliquent l'état choisi. Une case vide ne peut pas être marquée. Une croix non marquée est implicitement **à faire** ; seuls `in-progress` et `done` sont enregistrés dans `progress.cells`, avec clés `ligne:colonne` (indices à partir de 0).

- **Faites** = nombre explicitement marqué `done`. **En cours** = nombre marqué `in-progress`. **Restantes** = toutes les croix du patron moins les faites, **en cours incluses**. Pourcentage = faites ÷ croix × 100. Aucune marque initiale : **0 %**, même si la 3D montre tout le motif.
- Remplacer/effacer une croix supprime sa marque devenue incohérente ; redimensionner conserve celles des croix toujours présentes ; régénérer un modèle les remet à zéro après confirmation. Annuler/Rétablir restaure **aussi** la progression.
- Le curseur « Aperçu partiel de la 3D » n’est **pas** une progression et ne change aucun état. Focus d'un fil, lecture par lignes, zoom et masquage 3D ne changent pas non plus les comptes.

`src/progress.mjs` contient l’état séparé ; `src/editing.mjs` les transactions de grille ; `src/history.mjs` les versions pour Annuler/Rétablir ; `src/view-filters.mjs` les filtres exclusivement visuels.

## Aperçu 3D illustratif

La scène conserve **matériaux, texture de toile, éclairage, caméra orbitale, ombres et deux barrettes croisées par cellule** du prototype. Sa géométrie suit les dimensions physiques et les marges, même asymétriques ; la grille de données est son **unique source**. Vues : **Incliné** (cadrage historique), **Face** (dessus), **Arrière · illustratif** (toile retournée, un repère par position occupée). Le verso ne montre **pas** le trajet réel du fil au dos, ni des brins physiques ou des instructions machine. Filtres **Tout / Fait seulement / Non fait** à partir des marques réelles ; « Non fait » inclut « en cours ». Grille, Croix et Révéler ne modifient pas le projet.

La grille SVG recoupe après rendu chaque cellule/couleur/symbole/état avec le projet ; la 3D vérifie les croix visibles **par fil** avec la sélection issue du même projet.

## Fiche A4 et échanges JSON

**Fiche** ouvre une couverture avec dimensions, surfaces, marges et densité déclarées, le décompte de réalisation marqué, puis la légende (symboles, références, statut, croix et part). Suit une grille paginée par blocs **25 × 25** avec coordonnées globales, pages numérotées et traits renforcés tous les dix points. Les symboles sont noirs et distincts en gris. La fiche porte **« MÉTRAGE : À CALCULER »** et n'invente ni échevettes ni temps. L'impression/PDF conserve **5 pages** pour 36 × 36 et **17 pages** pour 100 × 80, couverture incluse.

**Exporter JSON** émet une enveloppe complète et réimportable :

```text
schemaVersion: 2
project: { version: 1, id, name, template, widthStitches, heightStitches, extensions? }
canvas: { type, stitchesPerCm, marginsCm: { top, bottom, left, right } }
palette: [ { threadId, name, reference, referenceStatus, color, symbol,
             brand?, code?, source?, verifiedAt? }, … ]
grid: [ [ null | { threadId, stitchType: "cross" }, … ], … ]
progress: { cells: { "ligne:colonne": "in-progress" | "done", … } }
```

Ce schéma est **descriptif**, pas un fichier JSON à importer tel quel. `schemaVersion: 2` versionne **l'enveloppe d'échange** ; `project.version: 1` désigne le modèle interne stable. `src/atelier-io.mjs` sérialise, valide et contrôle l'aller-retour des sections. Les fonctions `serializeProject` / `parseProject` du **JSON plat V1** restent disponibles, et l'interface importe **V1 et V2** (10 Mo max.). Les champs non reconnus hors `project.extensions` sont signalés plutôt que perdus silencieusement.

Un ouvrage actif est enregistré dans **`localStorage['universalbroderie.project.v2']` sur cet appareil**, sans compte ni cloud. Si cette clé n'existe pas, `storage.mjs` lit **`universalbroderie.project.v1`** ; la prochaine sauvegarde écrit V2 sans effacer automatiquement V1. Une sauvegarde corrompue n'est pas écrasée au chargement. Une grille temporairement vide est sauvable comme **brouillon** mais reste « À CORRIGER » pour fiche/export.

## Modèle, calculs et validation

`src/project.mjs` garde une grille **exactement rectangulaire** `heightStitches × widthStitches`. Une cellule est `null` ou `{ "threadId": "thread-001", "stitchType": "cross" }`. Le symbole est résolu **depuis la palette** par `threadId`, pas copié dans chaque cellule. Les indices internes commencent à 0 en haut à gauche, les coordonnées affichées et imprimées à 1. D'autres types de points ne sont pas implémentés.

`src/calculations.mjs` déduit des cellules les croix/vides/comptes par fil. Motif = largeur/densité × hauteur/densité en cm ; toile = motif + marges gauche/droite et haut/bas ; surfaces = produit des dimensions. Exemple **100 × 80 à 5,5 points/cm** : **8 000 positions**, motif **18,18 × 14,55 cm**, toile **28,18 × 24,55 cm** avec les marges initiales. Le nombre de croix dépend des cases occupées.

`src/validation.mjs` distingue « VALIDE » et « À CORRIGER » ; il rejette une grille absente/non rectangulaire, dimensions hors limite ou incohérentes, fil/point inconnu, symbole/couleur manquant, progression orpheline, source de vérification manquante, etc. `src/grid-view.mjs`, `src/three-scene.mjs` et `src/sheet.mjs` lisent la même grille ; **aucun outil 3D ne modifie directement le patron**.

## Provenance et limites honnêtes

- Les références **« DMC … » proviennent du prototype et restent « À CONFIRMER »**. `brand` et `code` sont repris de ces libellés historiques, **pas** d'une vérification fabricant ; `source` et `verifiedAt` restent `null`. La couleur hexadécimale est indicative, sans garantie de correspondance colorimétrique DMC. Le JSON n'accepte le statut « VÉRIFIÉE » qu'avec une source explicite (`source` ou ancien `referenceSource`). Aucune référence n'a été vérifiée ici.
- Pas de calcul honnête du métrage, des échevettes, du temps, des brins réels ni du trajet au verso sans calibration. Pas de conversion automatique photographie/PDF → grille, de format machine, de programmation de brodeuse ou d'ordonnancement des points. La 3D est une **visualisation illustrative**.
- **Borne actuelle : 200 × 200** (40 000 positions), appliquée au modèle, à l’édition, à l’import et à la validation. Pour l'augmenter sans risque : d'abord un rendu 2D virtualisé/par tuiles, des historiques et opérations mesurés en mémoire, des essais WebGL à forte densité, une pagination PDF éprouvée et des tests de navigation clavier/mobile. La borne n'est pas relevée tacitement.
- `project.extensions` réserve de futures relations **par identifiants** (source d'image, note de mémoire, événement…). Une éventuelle image→grille doit produire une grille validable ; un export machine exige une spécification matérielle. Aucun parcours mémoire/mariage, réseau social ni donnée fictive n'est simulé dans cet atelier.

## Vérifications

`npm test` conserve les **23 tests initiaux** et couvre en plus progression séparée, outils de zone et recouvrement, undo/redo atomique, symboles, filtres, JSON V2 + V1, migration de sauvegarde, fiche et borne 200. Les neuf combinaisons de motifs historiques (3 motifs × 3 tailles) restent inchangées. Des essais Chromium desktop/mobile ont couvert clic, glissé, duplication/déplacement, import V1/V2, restauration après rechargement, 3D filtrée/retournée, grande grille et PDF de **5 et 17 pages**.
