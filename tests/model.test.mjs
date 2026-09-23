import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BASE_PALETTE, MODEL_VERSION, buildPattern, createProject, regenerateTemplate, resizeGrid, setCell, stitchesIn } from '../src/project.mjs';
import { calculateMetrics, cellCenterCm } from '../src/calculations.mjs';

// Empreintes du tableau NUMÉRIQUE du prototype antérieur à la migration.
// Le numérique n'est utilisé QUE dans ce test de non-régression, jamais dans le modèle.
const legacy = {
  heart: {
    28: ['4f7ededa3cc227beead982cb6c6c86b564519cdde200ea4d4dd82cd82871d075', [278, 51, 187, 6, 6, 0, 0]],
    36: ['c5eff560c32f1ef9aff00a7970d789d20feb818b1fa989591071c3cf036f1e9c', [452, 82, 324, 4, 4, 0, 0]],
    44: ['1b772005c189022508fa0c1626ffe7413a22c8127fed263da5dea41784ace097', [670, 117, 489, 6, 6, 0, 0]]
  },
  flower: {
    28: ['697724b4f66540a04f0a4100bb23b132af68b85c9bf887dbea96da59d5c54b1a', [0, 40, 0, 27, 28, 4, 44]],
    36: ['c25d5dac3427e49c58e99886c755932fcd7985c6c055b02b7f6c2b0aee99b85b', [0, 58, 0, 35, 28, 12, 55]],
    44: ['39b915dd5a825d7404b7f71a775521f066e7f9c5e376d542c6fa464eca27cbe4', [0, 96, 0, 46, 28, 16, 108]]
  },
  moon: {
    28: ['82f4f6e223a6fac1fc53c43fcd823c77b089dc50960e3ed5518ead8fac1ddba1', [0, 0, 6, 18, 48, 40, 67]],
    36: ['2e9a5cbc254d1f8a2a156f22522533beed88e7aec3dd78e3f7cb257bf34437aa', [0, 0, 7, 30, 64, 70, 104]],
    44: ['2af1ee167868676f8471fd54557e91c7983d2a567db0eb7355849c6cd338c7ad', [0, 0, 11, 30, 80, 104, 158]]
  }
};

for (const kind of ['heart', 'flower', 'moon']) for (const size of [28, 36, 44]) {
  test(`motif ${kind} ${size} × ${size} : mêmes cellules que le prototype et vrais comptes`, () => {
    const project = createProject(kind, size, `test-${kind}-${size}`);
    assert.equal(project.version, MODEL_VERSION);
    assert.equal(project.grid.length, size);
    assert.ok(project.grid.every(row => row.length === size));
    const oldValues = buildPattern(kind, size).map(row => row.map(cell =>
      cell === null ? -1 : BASE_PALETTE.findIndex(thread => thread.threadId === cell.threadId)));
    assert.equal(createHash('sha256').update(JSON.stringify(oldValues)).digest('hex'), legacy[kind][size][0]);
    const metrics = calculateMetrics(project);
    assert.equal(metrics.positionCount, size * size);
    assert.equal(metrics.crossCount + metrics.emptyCount, size * size);
    assert.deepEqual(BASE_PALETTE.map(thread => metrics.countsByThread[thread.threadId]), legacy[kind][size][1]);
    assert.equal(stitchesIn(project).length, metrics.crossCount);
    assert.equal(metrics.usedColorCount, 5);
  });
}

test('36 × 36 : 1 296 positions, 866 croix, 430 vides (aucun compteur statique)', () => {
  const result = calculateMetrics(createProject('heart', 36, 'test'));
  assert.deepEqual([result.positionCount, result.crossCount, result.emptyCount], [1296, 866, 430]);
});

test('100 × 80 à 5,5 pts/cm : motif, marges, toile et surfaces réelles', () => {
  const project = resizeGrid(createProject('heart', 36, 'rectangle'), 100, 80);
  project.fabric.marginsCm = { top: 2, bottom: 4, left: 3, right: 5 };
  const m = calculateMetrics(project);
  assert.equal(m.positionCount, 8000);
  assert.equal(m.crossCount, 866);
  assert.equal(m.emptyCount, 7134);
  assert.equal(m.motifWidthCm, 100 / 5.5);
  assert.equal(m.motifHeightCm, 80 / 5.5);
  assert.equal(m.canvasWidthCm, 100 / 5.5 + 8);
  assert.equal(m.canvasHeightCm, 80 / 5.5 + 6);
  assert.equal(m.motifAreaCm2, m.motifWidthCm * m.motifHeightCm);
  assert.equal(m.canvasAreaCm2, m.canvasWidthCm * m.canvasHeightCm);
  assert.deepEqual(cellCenterCm(project, 0, 0), { x: 3 + .5 / 5.5, y: 2 + .5 / 5.5 });
  assert.deepEqual(cellCenterCm(project, 79, 99), { x: 3 + 99.5 / 5.5, y: 2 + 79.5 / 5.5 });
  assert.throws(() => cellCenterCm(project, 80, 0), /hors grille/);
});

test('placer, modifier puis effacer une cellule actualise comptes et grille des deux rendus', () => {
  const original = createProject('heart', 36, 'mutable');
  assert.equal(original.grid[0][0], null);
  const added = setCell(original, 0, 0, { threadId: 'thread-006', stitchType: 'cross' });
  assert.equal(original.grid[0][0], null); // ne mute pas l'ancien modèle
  assert.equal(added.grid[0][0].threadId, 'thread-006');
  assert.equal(calculateMetrics(added).crossCount, 867);
  assert.equal(calculateMetrics(added).usedColorCount, 6);
  assert.ok(stitchesIn(added).some(cell => cell.row === 0 && cell.column === 0 && cell.threadId === 'thread-006'));
  const changed = setCell(added, 0, 0, { threadId: 'thread-007', stitchType: 'cross' });
  assert.equal(calculateMetrics(changed).crossCount, 867);
  assert.equal(calculateMetrics(changed).countsByThread['thread-006'], 0);
  assert.equal(calculateMetrics(changed).countsByThread['thread-007'], 1);
  const erased = setCell(changed, 0, 0, null);
  assert.equal(calculateMetrics(erased).crossCount, 866);
  assert.equal(calculateMetrics(erased).usedColorCount, 5);
  assert.equal(erased.grid[0][0], null);
  assert.ok(!stitchesIn(erased).some(cell => cell.row === 0 && cell.column === 0));
});

test('redimensionnement libre : rectangulaire, sans rééchantillonnage ni perte dans le cadre', () => {
  const project = setCell(createProject('heart', 36, 'resize'), 0, 0,
    { threadId: 'thread-006', stitchType: 'cross' });
  const wider = resizeGrid(project, 100, 80);
  assert.equal(wider.template, null);
  assert.deepEqual(wider.grid[0][0], project.grid[0][0]);
  assert.equal(wider.grid[79][99], null);
  assert.equal(calculateMetrics(wider).crossCount, 867);
  const smaller = resizeGrid(wider, 1, 1);
  assert.equal(calculateMetrics(smaller).crossCount, 1);
  assert.equal(smaller.grid[0][0].threadId, 'thread-006');
});

test('taille du même modèle : nom, fil et référence personnalisés conservés', () => {
  const project = createProject('heart', 36, 'custom-name');
  project.name = 'Mon propre cœur';
  project.palette[0].color = '#123456';
  project.palette[0].referenceStatus = 'VÉRIFIÉE';
  project.palette[0].referenceSource = 'Source explicitement renseignée';
  const bigger = regenerateTemplate(project, 'heart', 44);
  assert.equal(bigger.name, 'Mon propre cœur');
  assert.equal(bigger.id, project.id);
  assert.equal(bigger.palette[0].color, '#123456');
  assert.equal(bigger.palette[0].referenceStatus, 'VÉRIFIÉE');
  assert.equal(bigger.palette[0].referenceSource, 'Source explicitement renseignée');
  assert.equal(calculateMetrics(bigger).crossCount, 1288);
  const flower = regenerateTemplate(project, 'flower', 36);
  assert.equal(flower.name, 'Fleur des champs');
  assert.equal(flower.palette[0].color, '#123456');
});

test('coordonnées, fil et type de point inconnus sont refusés par le modèle', () => {
  const p = createProject('heart', 36, 'constraints');
  assert.throws(() => setCell(p, 36, 0, null), /hors grille/);
  assert.throws(() => setCell(p, 0, -1, null), /hors grille/);
  assert.throws(() => setCell(p, 0, 0, { threadId: 'inconnu', stitchType: 'cross' }), /inconnu/);
  assert.throws(() => setCell(p, 0, 0, { threadId: 'thread-001', stitchType: 'knot' }), /inconnu/);
});
