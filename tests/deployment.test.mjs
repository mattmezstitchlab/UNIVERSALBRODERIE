import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const filesIn = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? filesIn(full) : [relative(output, full).replaceAll('\\', '/')];
});

test('Vercel livre seulement le site statique complet, sans tests, serveur ni documentation', () => {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, timeout: 30_000 });
  const actual = filesIn(output).sort();
  assert.deepEqual(actual, [
    'index.html', 'src/app.mjs', 'src/atelier-io.mjs', 'src/calculations.mjs',
    'src/editing.mjs', 'src/grid-view.mjs', 'src/history.mjs', 'src/io.mjs',
    'src/progress.mjs', 'src/project.mjs', 'src/sheet.mjs', 'src/storage.mjs',
    'src/three-scene.mjs', 'src/validation.mjs', 'src/view-filters.mjs',
    'vendor/LICENSE', 'vendor/OrbitControls.js', 'vendor/three.module.min.js'
  ].sort());
  const html = readFileSync(join(output, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\.\/src\/app\.mjs"><\/script>/);
  assert.match(html, /"three":"\.\/vendor\/three\.module\.min\.js"/);
  assert.equal(existsSync(join(output, 'tests')), false);
  assert.equal(existsSync(join(output, 'README.md')), false);
  assert.equal(existsSync(join(output, 'package.json')), false);
  assert.equal(existsSync(join(output, '.env.local')), false);
});
