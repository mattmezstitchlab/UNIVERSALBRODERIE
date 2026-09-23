import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, emptyGrid, regenerateTemplate, resizeGrid, setCell, symbolForCell, MAX_GRID_AXIS } from '../src/project.mjs';
import { calculateMetrics } from '../src/calculations.mjs';
import { progressAt, setProgress, calculateProgress } from '../src/progress.mjs';
import { applyCellChanges, fillConnected, rectangleBetween, copyRegion, pasteRegion } from '../src/editing.mjs';
import { createHistory } from '../src/history.mjs';
import { selectVisibleStitches } from '../src/view-filters.mjs';
import { serializeProject } from '../src/io.mjs';
import { serializeAtelierProject, parseAtelierProject, assertAtelierRoundTrip } from '../src/atelier-io.mjs';
import { saveLocalProject, restoreLocalProject, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../src/storage.mjs';
import { validateProject } from '../src/validation.mjs';
import { buildSheetHTML } from '../src/sheet.mjs';

const cross = threadId => ({ threadId, stitchType: 'cross' });
const blank = (width = 4, height = 3) => ({ ...createProject('heart', 36, 'test-blank'),
  template: null, widthStitches: width, heightStitches: height, grid: emptyGrid(width, height) });
const clone = value => JSON.parse(JSON.stringify(value));

test('progression initiale nulle, séparée des 866 croix et du curseur de révélation', () => {
  const project = createProject('heart', 36, 'unmarked');
  const before = JSON.stringify(project.grid);
  assert.equal(calculateMetrics(project).crossCount, 866);
  assert.deepEqual({ ...calculateProgress(project), doneByThread: null },
    { total: 866, done: 0, inProgress: 0, remaining: 866, todo: 866, percent: 0, doneByThread: null });
  assert.equal(selectVisibleStitches(project, { reveal: 35 }).length, Math.floor(866 * .35));
  assert.equal(calculateProgress(project).done, 0);
  assert.equal(JSON.stringify(project.grid), before);
});

test('trois états réels, todo implicite et pourcentage fondé seulement sur les marques faites', () => {
  let project = createProject('heart', 36, 'real-progress');
  const originalGrid = project.grid;
  assert.equal(progressAt(project, 0, 5), 'todo');
  project = setProgress(project, 0, 5, 'in-progress');
  project = setProgress(project, 0, 6, 'done');
  assert.strictEqual(project.grid, originalGrid);
  assert.deepEqual(project.progress.cells, { '0:5': 'in-progress', '0:6': 'done' });
  const p = calculateProgress(project);
  assert.equal(p.done, 1); assert.equal(p.inProgress, 1);
  assert.equal(p.remaining, 865); assert.equal(p.todo, 864);
  assert.equal(p.percent, 100 / 866);
  assert.equal(p.doneByThread[project.grid[0][6].threadId], 1);
  const undoneMark = setProgress(project, 0, 6, 'todo');
  assert.equal(progressAt(undoneMark, 0, 6), 'todo');
  assert.equal(Object.hasOwn(undoneMark.progress.cells, '0:6'), false);
  assert.strictEqual(setProgress(undoneMark, 0, 6, 'todo'), undoneMark);
  assert.throws(() => setProgress(undoneMark, 0, 0, 'done'), /croix existante/);
  assert.throws(() => setProgress(undoneMark, 0, 5, 'unknown'), /inconnu/);
});

test('édition de cellule, effacement, recadrage et régénération nettoient seulement les marques devenues incohérentes', () => {
  let project = createProject('heart', 36, 'mark-prune');
  project = setProgress(setProgress(project, 0, 5, 'done'), 0, 6, 'in-progress');
  assert.strictEqual(setCell(project, 0, 5, project.grid[0][5]), project);
  project = setCell(project, 0, 5, cross('thread-007'));
  assert.equal(progressAt(project, 0, 5), 'todo');
  assert.equal(progressAt(project, 0, 6), 'in-progress');
  project = setCell(project, 0, 6, null);
  assert.deepEqual(project.progress.cells, {});
  const marked = setProgress(project, 0, 5, 'done');
  const resized = resizeGrid(marked, 3, 3);
  assert.deepEqual(resized.progress.cells, {});
  assert.equal(calculateProgress(resized).done, 0);
  const regenerated = regenerateTemplate(marked, 'flower', 28);
  assert.deepEqual(regenerated.progress.cells, {});
  assert.equal(calculateProgress(regenerated).done, 0);
  assert.equal(marked.progress.cells['0:5'], 'done'); // aucun changement rétroactif
});

test('symbole du fil résolu depuis la palette, sans symbole autonome dans la cellule', () => {
  const p = setCell(createProject('heart', 36, 'symbols'), 0, 0, cross('thread-006'));
  assert.deepEqual(Object.keys(p.grid[0][0]).sort(), ['stitchType', 'threadId']);
  assert.equal(symbolForCell(p, 0, 0), '✦');
  assert.equal(symbolForCell(p, 35, 35), null);
  const changedPalette = { ...p, palette: p.palette.map(thread => thread.threadId === 'thread-006'
    ? { ...thread, symbol: '☆' } : thread) };
  assert.equal(symbolForCell(changedPalette, 0, 0), '☆');
  assert.equal(p.grid[0][0].threadId, changedPalette.grid[0][0].threadId);
});

test('remplissage connexe orthogonal, sans sauter la barrière ni modifier le modèle original', () => {
  let p = blank();
  for (let row = 0; row < 3; row++) p = setCell(p, row, 1, cross('thread-002'));
  const original = clone(p);
  const { project: filled, changedCount } = fillConnected(p, 0, 0, cross('thread-003'));
  assert.equal(changedCount, 3);
  assert.equal(filled.grid[2][0].threadId, 'thread-003');
  assert.equal(filled.grid[0][2], null);
  assert.equal(filled.grid[0][1].threadId, 'thread-002');
  assert.deepEqual(p, original);
  assert.equal(fillConnected(filled, 0, 0, cross('thread-003')).changedCount, 0);
  assert.throws(() => fillConnected(p, 0, -1, null), /hors grille/);
});

test('pinceau groupé, gomme et historique : un geste = une entrée, redo invalidé par un nouveau geste', () => {
  const first = blank();
  const h = createHistory(first, 2);
  const stroke = applyCellChanges(first, [
    { row: 0, column: 0, cell: cross('thread-001') },
    { row: 1, column: 0, cell: cross('thread-001') },
    { row: 2, column: 0, cell: cross('thread-001') }
  ]);
  assert.equal(stroke.changedCount, 3);
  h.commit(stroke.project);
  assert.equal(calculateMetrics(h.project).crossCount, 3);
  assert.deepEqual(h.undo(), first);
  assert.equal(h.canUndo, false); assert.equal(h.canRedo, true);
  assert.equal(calculateMetrics(h.redo()).crossCount, 3);
  const erased = applyCellChanges(h.project, [{ row: 0, column: 0, cell: null }]);
  h.commit(erased.project);
  assert.equal(calculateMetrics(h.project).crossCount, 2);
  h.undo(); assert.equal(calculateMetrics(h.project).crossCount, 3);
  h.commit(applyCellChanges(h.project, [{ row: 2, column: 0, cell: null }]).project);
  assert.equal(h.canRedo, false);
  assert.throws(() => applyCellChanges(first, [{ row: 3, column: 0, cell: null }]), /hors grille/);
  assert.throws(() => applyCellChanges(first, [{ row: 0, column: 0, cell: cross('inconnu') }]), /inconnu/);
});

test('zone rectangulaire copiée avec cellules vides et duplication à destination explicite', () => {
  let p = blank(5, 3);
  p = setCell(setCell(p, 0, 0, cross('thread-001')), 1, 1, cross('thread-002'));
  const rect = rectangleBetween({ row: 1, column: 1 }, { row: 0, column: 0 });
  assert.deepEqual(rect, { top: 0, bottom: 1, left: 0, right: 1 });
  const snapshot = copyRegion(p, rect);
  assert.deepEqual(snapshot.cells, [[cross('thread-001'), null], [null, cross('thread-002')]]);
  const { project: duplicated, changedCount, overwrites } = pasteRegion(p, snapshot, 1, 3);
  assert.equal(changedCount, 2); assert.equal(overwrites, 0);
  assert.equal(duplicated.grid[0][0].threadId, 'thread-001');
  assert.equal(duplicated.grid[1][3].threadId, 'thread-001');
  assert.equal(duplicated.grid[2][4].threadId, 'thread-002');
  assert.equal(duplicated.grid[1][4], null);
  assert.deepEqual(copyRegion(p, rect), snapshot); // source conservée
});

test('déplacement de zone chevauchante : photographie avant mouvement et Undo / Redo atomiques', () => {
  let p = blank(4, 1);
  p = setCell(setCell(setCell(p, 0, 0, cross('thread-001')), 0, 1, cross('thread-002')),
    0, 3, cross('thread-003'));
  p = setProgress(setProgress(p, 0, 0, 'done'), 0, 3, 'in-progress');
  const rect = { top: 0, bottom: 0, left: 0, right: 1 };
  const h = createHistory(p);
  const moved = pasteRegion(p, copyRegion(p, rect), 0, 1, { moveFrom: rect });
  assert.equal(moved.changedCount, 3);
  h.commit(moved.project);
  assert.deepEqual(h.project.grid[0], [null, cross('thread-001'), cross('thread-002'), cross('thread-003')]);
  assert.equal(progressAt(h.project, 0, 1), 'todo');
  assert.equal(progressAt(h.project, 0, 3), 'in-progress');
  assert.deepEqual(h.undo(), p); assert.deepEqual(h.redo(), moved.project);
  assert.equal(moved.overwrites, 0); // chevauchement de la source ≠ écrasement externe
  assert.throws(() => pasteRegion(p, copyRegion(p, rect), 0, 3), /Destination hors grille/);
  assert.throws(() => rectangleBetween({ row: 0, column: NaN }, { row: 1, column: 1 }), /invalides/);
});

test('la lecture par vraies lignes et les filtres 3D ne changent ni le patron ni la réalisation', () => {
  let p = createProject('heart', 36, 'filters');
  p = setProgress(setProgress(p, 0, 5, 'done'), 0, 6, 'in-progress');
  const before = JSON.stringify(p);
  assert.equal(selectVisibleStitches(p, { filter: 'done' }).length, 1);
  assert.equal(selectVisibleStitches(p, { filter: 'remaining' }).length, 865);
  const range = selectVisibleStitches(p, { rowRange: { start: 0, end: 1 }, reveal: 100 });
  assert.equal(range.length, p.grid.slice(0, 2).flat().filter(Boolean).length);
  assert.ok(range.every(stitch => stitch.row === 0 || stitch.row === 1));
  assert.equal(selectVisibleStitches(p, { filter: 'done', rowRange: { start: 1, end: 2 } }).length, 0);
  assert.equal(selectVisibleStitches(p, { filter: 'done', reveal: 0 }).length, 0);
  assert.equal(JSON.stringify(p), before);
  assert.throws(() => selectVisibleStitches(p, { filter: 'fiction' }), /inconnu/);
});

test('export V2 autonome, 6 sections, palette facultative et aller-retour complet incluant la progression', () => {
  let p = createProject('moon', 44, 'v2-identity');
  const row = p.grid.findIndex(line => line.some(Boolean));
  const col = p.grid[row].findIndex(Boolean);
  p = setProgress(p, row, col, 'done');
  p = { ...p, extensions: { relations: { sourceImageId: null, memoryId: null } } };
  const json = serializeAtelierProject(p);
  const doc = JSON.parse(json);
  assert.deepEqual(Object.keys(doc), ['schemaVersion', 'project', 'canvas', 'palette', 'grid', 'progress']);
  assert.equal(doc.schemaVersion, 2);
  assert.equal(doc.project.id, 'v2-identity');
  assert.equal(doc.palette[0].brand, 'DMC');
  assert.equal(doc.palette[0].code, '321');
  assert.equal(doc.palette[0].source, null);
  assert.equal(doc.palette[0].verifiedAt, null);
  assert.equal(doc.palette[0].referenceStatus, 'À CONFIRMER');
  assert.equal(doc.progress.cells[`${row}:${col}`], 'done');
  assert.deepEqual(parseAtelierProject(json), p);
  assert.deepEqual(assertAtelierRoundTrip(p, json), p);
  assert.equal(calculateProgress(parseAtelierProject(json)).done, 1);
});

test('compatibilité JSON plat V1 ; stockage V1 migrable vers V2 sans perte ni réinitialisation silencieuse', () => {
  let p = createProject('heart', 36, 'legacy-exchange');
  p = setCell(p, 0, 0, cross('thread-006'));
  const legacy = serializeProject(p);
  assert.deepEqual(parseAtelierProject(legacy), p);
  const data = new Map([[LEGACY_STORAGE_KEY, legacy]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(restoreLocalProject(storage), p);
  p = setProgress(p, 0, 0, 'done');
  saveLocalProject(p, storage);
  assert.equal(JSON.parse(data.get(STORAGE_KEY)).schemaVersion, 2);
  assert.deepEqual(restoreLocalProject(storage), p);
  assert.equal(data.get(LEGACY_STORAGE_KEY), legacy); // l’ancienne clé n’est pas effacée
  data.set(STORAGE_KEY, '{broken');
  assert.throws(() => restoreLocalProject(storage), /JSON valide/); // ne masque pas un fichier V2 corrompu
  assert.equal(data.get(STORAGE_KEY), '{broken');
});

test('import V2 et validation rejettent les dimensions, symboles, fils, états et schémas trompeurs', () => {
  let p = createProject('heart', 36, 'rejections');
  p = setProgress(p, 0, 5, 'done');
  const cases = [
    [doc => { doc.schemaVersion = 3; }, /Format de projet inconnu/],
    [doc => { delete doc.progress; }, /Export incomplet/],
    [doc => { doc.project.widthStitches = 35; }, /incohérente/],
    [doc => { doc.palette[0].symbol = ''; }, /symbole/],
    [doc => { doc.grid[0][5].threadId = 'absent'; }, /threadId/],
    [doc => { doc.progress.cells['0:5'] = 'todo'; }, /Progression/],
    [doc => { doc.progress.cells['0:0'] = 'done'; }, /croix absente/],
    [doc => { doc.palette[0].verifiedAt = '2026-09-23T10:00:00Z'; }, /incompatible avec À CONFIRMER/],
    [doc => { doc.estimateHours = 2; }, /Champs inconnus/]
  ];
  for (const [breakDocument, reason] of cases) {
    const doc = JSON.parse(serializeAtelierProject(p)); breakDocument(doc);
    assert.throws(() => parseAtelierProject(JSON.stringify(doc)), reason);
  }
  assert.equal(validateProject(p).label, 'VALIDE');
  assert.throws(() => serializeAtelierProject({ ...p, fictiveSkeins: 2 }), /Métadonnées non exportables/);
  assert.throws(() => parseAtelierProject('{'), /JSON valide/);
  assert.throws(() => parseAtelierProject('{}'), /inconnu/);
});

test('fiche A4 enrichie : couverture, dimensions physiques, légende, progression marquée, grilles conservées', () => {
  const p = setProgress(createProject('heart', 36, 'sheet-v2'), 0, 5, 'done');
  const html = buildSheetHTML(p);
  assert.match(html, /couverture, données physiques & légende/);
  assert.match(html, /MÉTRAGE : À CALCULER/);
  assert.match(html, /1 \/ 865 · 0,12 % fait/);
  assert.match(html, /16,55 × 16,55 cm/);
  assert.match(html, /Références|référence\(s\).*À CONFIRMER/i);
  assert.match(html, /data-progress="done"/);
  assert.equal((html.match(/class="page chart-page"/g) ?? []).length, 4);
  assert.equal((html.match(/class="chart-cell"/g) ?? []).length, 1296);
  const other = buildSheetHTML(resizeGrid(createProject('flower', 36, 'sheet-rect'), 100, 80));
  assert.equal((other.match(/class="page chart-page"/g) ?? []).length, 16);
  assert.equal((other.match(/class="chart-cell"/g) ?? []).length, 8000);
});

test('borne actuelle 200 × 200 maintenue : 40 000 positions, sans montée implicite', () => {
  const p = resizeGrid(createProject('heart', 36, 'limit'), MAX_GRID_AXIS, MAX_GRID_AXIS);
  assert.equal(calculateMetrics(p).positionCount, 40000);
  assert.equal(validateProject(p).valid, true);
  assert.throws(() => resizeGrid(p, MAX_GRID_AXIS + 1, 1), /Dimensions de grille invalides/);
  assert.equal(calculateProgress(p).total, 866);
});
