# Rapport final — phase 2 · Atelier de broderie

## CONSERVÉ

- Les **trois générateurs historiques** Cœur sauvage, Fleur des champs et Jardin de lune et leurs neuf combinaisons (28, 36, 44) ne sont pas remplacés. Le cœur 36 × 36 garde **1 296 positions, 866 croix, 430 vides**.
- Le modèle plat version 1, la grille rectangulaire, les cellules `null` / `{threadId, stitchType: "cross"}`, la palette et les mesures réelles restent la source unique des vues.
- Grille 2D éditable au clic, gomme, zoom, navigation clavier ; toile, marges et densité configurables ; rendu 3D avec matériau/toile, lumière/caméra et **deux brins croisés par croix** ; commande de révélation de l’aperçu.
- Fiche et grilles A4 paginées, JSON plat V1 réimportable, enregistrement `localStorage` sur cet appareil et limite **200 × 200**. Les **23 tests initiaux** restent présents.

## ENRICHI

- Symboles issus de la palette et non recopiés dans les cellules ; légende interactive par fil (focalisation/atténuation, nombre, part et croix faites), repère de coordonnées, accès direct ligne/colonne, zoom, déplacement et lecture visuelle par **plages de lignes réelles**.
- Pinceau par glissé, gomme, remplissage connexe orthogonal, sélection rectangulaire (deux clics ou glissé), duplication, déplacement et effacement de zone. Annuler/Rétablir borné à **40 opérations par session** ; un geste de zone = une opération. La progression devenue incohérente est nettoyée lors des éditions du patron.
- Mode **Broder** : états **À FAIRE / EN COURS / FAIT** séparés de `grid`, compte et pourcentage dérivés exclusivement des états effectivement marqués ; `todo` est implicite. Ni la lecture par lignes, ni les filtres, ni le curseur 3D ne marquent de croix.
- 3D enrichie de vues **Incliné / Face / Arrière illustratif** et filtres **Tout / Fait / Non fait**. Le verso montre des repères de positions, **pas** un trajet de fil réel ; la face conserve les brins croisés existants.
- Fiche avec couverture, données physiques, légende, décompte de réalisation réellement marqué et grille paginée complète. **« MÉTRAGE : À CALCULER »**, sans métrage, échevettes ou durée inventés.
- Échange autonome **`schemaVersion: 2`** avec `project`, `canvas`, `palette`, `grid`, `progress` ; vérification d’aller-retour. Import du JSON plat V1 préservé ; lecture de l’ancienne clé locale V1 et sauvegarde sous clé V2. Champs fil facultatifs `brand/code/source/verifiedAt` et `project.extensions` prévus sans données factices.

## TESTÉ

- `npm test` : **39/39 réussis** (23 tests initiaux + 16 nouveaux). Tests de progression distincte, nettoyage, zone/recouvrement, remplissage, historique atomique, symboles/focus, lecture et filtres, V1/V2, stockage, validation, fiche, borne 200 et distribution statique Vercel.
- Essais Chromium desktop : clic et glissé du pinceau ; remplissage ; zone copiée et déplacée avec Undo/Redo ; marquage FAIT/EN COURS/À FAIRE ; focus de fil ; lecture par lignes ; 3D filtrée/retournée ; export et restauration après rechargement ; import V1 et V2. **Aucune erreur JavaScript** observée dans ces parcours.
- Essai mobile **375 px** : pas de débordement horizontal de page ; marquage de réalisation, passage en 3D et vue Face accessibles.
- **200 × 200** : 40 000 groupes de grille, accès direct L150/C150 vérifié ; import d’une grille **entièrement brodée (40 000 croix)** et rendu 3D des 40 000 points sans erreur dans le navigateur d’essai.
- PDF navigateur A4 : **5 pages** pour le patron 36 × 36 et **17 pages** pour le 100 × 80, dont une couverture, sans perdre de case ni de page de grille.
- Distribution statique Vercel (`npm run build`) : **18 fichiers nécessaires** dans `dist/`, sans tests ni documentation publiés. La distribution a été servie en HTTP et vérifiée dans Chromium (grille SVG, suivi, JSON V2, 3D, absence d’erreurs). Réglages initiaux dans [DEPLOIEMENT_VERCEL.md](DEPLOIEMENT_VERCEL.md).

## VÉRIFIÉ

- Le patron, la fiche, le JSON, la légende et la 3D lisent le même projet. Concordance vérifiée cellule/couleur/symbole/état pour le SVG, par fil pour les croix 3D visibles ; aucune manipulation de la 3D ne modifie `grid`.
- V2 est réimporté avec les marques et métadonnées ; un ouvrage local restauré après fermeture conserve ses croix et ses marques. Le JSON V1 existant reste importable et l’ancienne clé locale n’est pas supprimée automatiquement.
- **100 × 80 à 5,5 points/cm** : **8 000 positions**, motif **18,18 × 14,55 cm**, toile **28,18 × 24,55 cm** avec les marges initiales de 5 cm. Les comptages de croix dépendent toujours des cellules.

## À CONFIRMER

- Les références historiques « DMC … » restent **« À CONFIRMER »** : ni source fabricant ni correspondance colorimétrique vérifiée. `brand/code` reprennent les libellés historiques, `source/verifiedAt` restent `null` tant qu’aucune vérification n’a lieu.
- Type/densité/marges de la toile sont des **déclarations modifiables** de l’ouvrage, pas des propriétés déduites d’une photo. Le métrage, les échevettes, la durée et la physique du verso restent non calculés. La 3D est illustrative ; la compatibilité WebGL et la performance maximale varient selon l’appareil.
- L’historique Undo/Redo ne traverse pas la fermeture de l’onglet (le projet et sa progression, oui). L'enregistrement est **local sur cet appareil**, pas un cloud.

## FUTUR

- **Image → grille**, après définition d’un import, d’une quantification des couleurs, d’une palette sourcée et d’une validation du patron obtenu ; aucune conversion n’est simulée actuellement.
- **Formats machine / point supplémentaires / instructions**, seulement après spécifications matérielles et algorithmes de tracé établis ; ne pas confondre les repères du verso avec un vrai parcours du fil.
- Relations facultatives **par identifiants** vers des notes de mémoire ou événements, sans transformer cet atelier en réseau social ni faire d’un mariage le produit principal.
- Évaluer une borne **supérieure à 200 × 200** uniquement après rendu 2D virtualisé, budgets mémoire et historique, essais WebGL sur ouvrages denses, pagination PDF et tests clavier/mobile dédiés. La borne livrée reste **200 × 200**.
