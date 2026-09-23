# Déployer l’atelier sur Vercel — réglages de départ

L’atelier est un **site statique** (HTML, modules JavaScript et Three.js local). Il n’a ni API, ni base de données, ni cloud. `npm start` et le serveur Python servent **uniquement au développement local** : Vercel publie les fichiers produits dans `dist/`.

## Avant le premier déploiement : la bonne branche

Le travail complet de cette session est sur **`arena/01a0cc09-universalbroderie`**. Le dépôt GitHub utilise **`main`** comme branche de production par défaut ; tant que cette version n’a pas été fusionnée dans `main`, importer le dépôt et déployer `main` publierait **l’ancienne version**, pas l’atelier décrit ici.

**Chemin recommandé :** vérifier la [Pull Request #1](https://github.com/mattmezstitchlab/UNIVERSALBRODERIE/pull/1) de `arena/01a0cc09-universalbroderie` vers `main`, la fusionner sur GitHub, puis créer le projet Vercel. Ne pas sélectionner un sous-dossier comme racine. Si vous voulez d’abord un aperçu sans fusion, connecter le dépôt à Vercel et utiliser le déploiement **Preview** de cette branche ; n’associez pas de domaine public à l’éventuel premier déploiement de l’ancien `main`. Sur Vercel, la production suit `main` par défaut ; une autre branche peut être choisie dans **Settings → Environments → Production → Branch Tracking**, si vous décidez expressément de déployer cette branche en production.

## Créer le projet

1. Aller sur **[vercel.com/new](https://vercel.com/new)** et choisir **Import Git Repository**. Connecter GitHub si nécessaire, puis choisir `mattmezstitchlab/UNIVERSALBRODERIE`.
2. Dans **Configure Project**, utiliser les réglages suivants (également fixés dans `vercel.json`) :

   | Réglage Vercel | Valeur |
   | --- | --- |
   | **Framework Preset** | **Other** |
   | **Root Directory** | Racine du dépôt : `./` |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |
   | **Install Command** | Laisser par défaut ; aucune dépendance npm à installer |
   | **Node.js Version** | **22.x** (version testée ; 24.x est également prise en charge par Vercel) |
   | **Environment Variables** | **Aucune** |

   Si l’interface affiche un interrupteur **Override**, l’activer pour la commande de build et le dossier de sortie si leurs valeurs n’apparaissent pas déjà. `vercel.json` fixe ces valeurs côté dépôt et prend le dessus sur les champs équivalents du tableau de bord. Ne renseignez **ni `npm start` ni `python3 -m http.server`** comme Build Command ; ne choisissez pas `src/` ou `vendor/` comme Root Directory. Il n’y a ni fonction Vercel, ni rewrite SPA nécessaire.
3. Cliquer **Deploy** et attendre « Ready ». L’adresse `*.vercel.app` créée par Vercel permet de commencer sans acheter de domaine. Un domaine personnalisé pourra être ajouté ensuite depuis **Settings → Domains**, en suivant les instructions DNS affichées par Vercel.

## Vérifications après déploiement

- La page d’accueil `/` affiche la grille **36 × 36**, soit **1 296 positions / 866 croix** et « VALIDE ».
- Les fichiers `/src/app.mjs`, `/src/three-scene.mjs` et `/vendor/three.module.min.js` sont servis ; la console du navigateur ne signale pas d’erreur de chargement de module.
- Le clic dans la grille, le mode **Broder**, le passage en **3D**, la fiche et l’export/import JSON fonctionnent. Les tests et documents du dépôt ne figurent **pas** dans `dist/`.
- Si une modification a été faite sur cette branche sans fusion dans `main`, elle apparaît dans un **Preview**, pas sur l’URL de production de `main`. Une fois la PR fusionnée, un nouveau déploiement de production est déclenché depuis `main`.

## Conservation de vos ouvrages : point important

Le projet et sa progression sont enregistrés en `localStorage` **sur le navigateur et le domaine utilisés**, pas dans Vercel. Changer de `localhost`, d’URL Preview, de domaine `*.vercel.app` ou de domaine personnalisé **ne transfère pas automatiquement** les ouvrages. Sur l’ancien site, faire **Exporter JSON**, puis sur la nouvelle adresse faire **Réimporter un patron JSON**. Conserver ces exports comme sauvegardes ; effacer les données du navigateur efface aussi le stockage local. Aucun compte, base de données, variable secrète ou synchronisation cloud n’est prévu dans cette version.

## Vérifier localement exactement ce qui sera publié

```sh
npm test
npm run build
python3 -m http.server 8001 --bind 0.0.0.0 --directory dist
# puis ouvrir http://localhost:8001/
```

Le script `scripts/build.mjs` copie uniquement `index.html`, les modules du navigateur, les deux bibliothèques 3D et leur licence. Il contrôle les imports relatifs pour éviter qu’un nouveau module soit oublié. `dist/` est généré et ignoré par Git : Vercel le reconstruit à chaque déploiement.

**Documentation officielle Vercel :** [1](https://vercel.com/docs/builds/configure-a-build) (Framework/Build/Output), [2](https://vercel.com/docs/git) (branches Git), [3](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) (versions Node).
