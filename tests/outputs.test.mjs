import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, emptyGrid, resizeGrid, setCell } from '../src/project.mjs';
import { calculateMetrics } from '../src/calculations.mjs';
import { serializeProject, parseProject, assertProjectRoundTrip } from '../src/io.mjs';
import { STORAGE_KEY, saveLocalProject, restoreLocalProject } from '../src/storage.mjs';
import { validateProject } from '../src/validation.mjs';
import { buildSheetHTML } from '../src/sheet.mjs';

const copy = project => JSON.parse(JSON.stringify(project));

test('export → import → identité du projet pour les 3 motifs, les 3 tailles et une grille modifiée', () => {
  for (const kind of ['heart', 'flower', 'moon']) for (const size of [28, 36, 44]) {
    const project = createProject(kind, size, `test-${kind}-${size}`);
    const json = serializeProject(project);
    assert.deepEqual(parseProject(json), project);
    assert.deepEqual(assertProjectRoundTrip(project, json), project);
    assert.equal(JSON.parse(json).grid.length, size);
  }
  let project = resizeGrid(createProject('heart', 36, 'stable-id'), 100, 80);
  project = setCell(project, 79, 99, { threadId: 'thread-007', stitchType: 'cross' });
  project.fabric.marginsCm = { top: 1, bottom: 2, left: 3, right: 4 };
  const imported = parseProject(serializeProject(project));
  assert.deepEqual(imported, project);
  assert.equal(imported.id, 'stable-id');
  assert.deepEqual(imported.grid[79][99], { threadId: 'thread-007', stitchType: 'cross' });
  assert.equal(calculateMetrics(imported).crossCount, calculateMetrics(project).crossCount);
  assert.equal(calculateMetrics(imported).canvasWidthCm, 100 / 5.5 + 7);
});

test('export après modification et suppression : exactement la cellule affichable, sans état UI', () => {
  const p = createProject('heart', 36, 'mutable-export');
  const added = setCell(p, 0, 0, { threadId: 'thread-006', stitchType: 'cross' });
  assert.deepEqual(parseProject(serializeProject(added)).grid[0][0], added.grid[0][0]);
  assert.equal(calculateMetrics(parseProject(serializeProject(added))).crossCount, 867);
  const erased = setCell(added, 0, 0, null);
  assert.equal(parseProject(serializeProject(erased)).grid[0][0], null);
  assert.equal(calculateMetrics(parseProject(serializeProject(erased))).crossCount, 866);
  for (const forbidden of ['progress', 'reveal', 'timeEstimate', 'skeins']) {
    assert.ok(!Object.hasOwn(JSON.parse(serializeProject(erased)), forbidden));
  }
});

test('sauvegarde locale et restauration d’un brouillon momentanément vide', () => {
  const data = new Map();
  const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) ?? null };
  assert.equal(restoreLocalProject(storage), null);
  const project = createProject('flower', 44, 'persisted');
  project.name = 'Motif modifié';
  project.fabric.stitchesPerCm = 6.4;
  project.fabric.marginsCm.left = 3.5;
  saveLocalProject(project, storage);
  assert.deepEqual(restoreLocalProject(storage), project);
  assert.ok(data.has(STORAGE_KEY));
  const draft = resizeGrid(project, 1, 1);
  draft.grid = emptyGrid(1, 1);
  assert.equal(validateProject(draft).valid, false);
  saveLocalProject(draft, storage);
  assert.deepEqual(restoreLocalProject(storage), draft);
  assert.throws(() => serializeProject(draft), /aucune croix/);
});

test('validation : dimensions, grille, palette, fils, symboles, références et points', () => {
  const p = createProject('heart', 36, 'valid');
  assert.equal(validateProject(p).label, 'VALIDE');
  assert.ok(validateProject(p).warnings[0].includes('À CONFIRMER'));
  const cases = [
    [x => { x.widthStitches = 35; }, /Largeur incohérente/],
    [x => { x.heightStitches = 35; }, /Hauteur incohérente/],
    [x => { x.grid[0].push(null); }, /hors grille/],
    [x => { x.grid = []; }, /Grille vide/],
    [x => { x.grid[0][0] = { threadId: 'inconnu', stitchType: 'cross' }; }, /threadId inexistant/],
    [x => { x.grid[0][0] = { threadId: 'thread-001', stitchType: 'backstitch' }; }, /type de point inconnu/],
    [x => { x.grid[0][0] = { threadId: 'thread-001', stitchType: 'cross', row: 99 }; }, /coordonnées hors grille/],
    [x => { x.palette[0].color = ''; }, /couleur hexadécimale/],
    [x => { x.palette[0].symbol = ''; }, /symbole de grille/],
    [x => { x.palette[0].threadId = x.palette[1].threadId; }, /threadId en double/],
    [x => { x.palette[0].reference = ''; }, /référence manquante/],
    [x => { x.palette[0].referenceStatus = 'VÉRIFIÉE'; }, /source de vérification/],
    [x => { x.fabric.stitchesPerCm = 0; }, /Densité invalide/],
    [x => { x.fabric.marginsCm.left = -2; }, /Marge left invalide/],
    [x => { x.version = 999; }, /Version du modèle/],
    [x => { delete x.fabric; }, /toile, densité et marges manquants/]
  ];
  for (const [mutate, reason] of cases) {
    const broken = copy(p); mutate(broken);
    const report = validateProject(broken);
    assert.equal(report.valid, false, reason.source);
    assert.match(report.errors.join(' '), reason);
    assert.throws(() => parseProject(JSON.stringify(broken)), /à corriger/);
  }
  assert.throws(() => parseProject('{'), /JSON valide/);
  assert.throws(() => parseProject('{}'), /incompatible/);
  const verified = copy(p);
  verified.palette[0].referenceStatus = 'VÉRIFIÉE';
  verified.palette[0].referenceSource = 'Source vérifiée explicitement par l’utilisatrice';
  assert.equal(validateProject(verified).valid, true);
  assert.ok(validateProject(verified).warnings[0].startsWith('6 référence'));
});

test('la fiche vient du projet, légende, coordonnées et grilles paginées exploitables', () => {
  const p = createProject('heart', 36, 'sheet');
  const html = buildSheetHTML(p);
  assert.match(html, /36 × 36 positions/);
  assert.match(html, /866/);
  assert.match(html, /16,55 × 16,55 cm/);
  assert.match(html, /Légende et comptage par fil/);
  assert.match(html, /DMC 321/);
  assert.match(html, /À CONFIRMER/);
  assert.equal((html.match(/class="chart-page"/g) ?? []).length, 0); // pages ont deux classes
  assert.equal((html.match(/class="page chart-page"/g) ?? []).length, 4);
  assert.equal((html.match(/class="chart-cell"/g) ?? []).length, 1296);
  assert.equal((html.match(/class="glyph"/g) ?? []).length, 866); // symboles imprimés = croix réelles
  assert.ok(html.includes('width="544" height="544"')); // même taille des cases sur chaque page A4
  assert.ok(html.includes('data-row="0" data-column="0"'));
  assert.ok(html.includes('data-row="35" data-column="35"'));
  assert.ok(!html.includes('échev.'));
  const rect = resizeGrid(p, 100, 80);
  assert.equal((buildSheetHTML(rect).match(/class="page chart-page"/g) ?? []).length, 16);
  assert.equal((buildSheetHTML(rect).match(/class="chart-cell"/g) ?? []).length, 8000);
});

test('nom et symbole non fiables sont échappés dans la fiche imprimable', () => {
  const p = createProject('flower', 28, 'html-safe');
  p.name = '<script>danger</script>';
  p.palette[0].symbol = '<img onerror=alert(1)>';
  const html = buildSheetHTML(p);
  assert.ok(html.includes('&lt;script&gt;danger&lt;/script&gt;'));
  assert.ok(!html.includes('<script>danger</script>'));
  assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
});
