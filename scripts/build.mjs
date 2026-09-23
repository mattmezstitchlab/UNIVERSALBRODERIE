import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');

// Liste explicite : les tests, le rapport et les outils de développement ne sont
// pas publiés. Les chemins relatifs du site restent identiques à ceux du dépôt.
export const runtimeFiles = Object.freeze([
  'index.html',
  'src/app.mjs',
  'src/atelier-io.mjs',
  'src/calculations.mjs',
  'src/editing.mjs',
  'src/grid-view.mjs',
  'src/history.mjs',
  'src/io.mjs',
  'src/maya-image.mjs',
  'src/dmc-palette.mjs',
  'src/progress.mjs',
  'src/project.mjs',
  'src/sheet.mjs',
  'src/storage.mjs',
  'src/three-scene.mjs',
  'src/validation.mjs',
  'src/view-filters.mjs',
  'vendor/three.module.min.js',
  'vendor/OrbitControls.js',
  'vendor/LICENSE'
]);

// Empêche de déployer un nouvel import relatif sans son module correspondant.
const paths = new Set(runtimeFiles);
for (const file of runtimeFiles.filter(name => /\.(mjs|js)$/.test(name))) {
  const source = await readFile(join(root, file), 'utf8');
  for (const [, specifier] of source.matchAll(/\b(?:import|export)\s+(?:[^'\";]*?\s+from\s*)?['\"]([^'\"]+)['\"]/g)) {
    if (!specifier.startsWith('.')) continue; // « three » est résolu par l'import map HTML.
    const dependency = normalize(join(dirname(file), specifier));
    if (!paths.has(dependency)) throw new Error('Import ' + specifier + ' de ' + file + ' absent du déploiement : ' + dependency);
  }
}

await rm(output, { recursive: true, force: true });
for (const file of runtimeFiles) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await cp(join(root, file), join(output, file));
}
console.log('Site statique prêt dans dist/ (' + runtimeFiles.length + ' fichiers, aucun serveur requis).');
