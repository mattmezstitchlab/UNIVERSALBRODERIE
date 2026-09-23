import { createProject, regenerateTemplate, resizeGrid, setCell, TEMPLATES, BASE_PALETTE, MAX_GRID_AXIS } from './project.mjs';
import { calculateMetrics } from './calculations.mjs';
import { renderGrid2D, assertGridViewMatchesProject, GRID_GUTTER } from './grid-view.mjs';
import { EmbroideryScene } from './three-scene.mjs';
import { serializeAtelierProject, parseAtelierProject, assertAtelierRoundTrip } from './atelier-io.mjs';
import { saveLocalProject, restoreLocalProject } from './storage.mjs';
import { validateProject } from './validation.mjs';
import { buildSheetHTML } from './sheet.mjs';
import { progressAt, setProgress, calculateProgress } from './progress.mjs';
import { applyCellChanges, fillConnected, rectangleBetween, copyRegion, pasteRegion } from './editing.mjs';
import { createHistory } from './history.mjs';
import { selectVisibleStitches } from './view-filters.mjs';

const $ = id => document.getElementById(id);
const countFormat = new Intl.NumberFormat('fr-FR');
const cmFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const f = n => cmFormat.format(n);
const counts = n => countFormat.format(n);
let loadError = '', hadSavedProject = false;
let project;
try {
  const restored = restoreLocalProject();
  hadSavedProject = restored !== null;
  project = restored ?? createProject();
} catch (error) {
  loadError = `Sauvegarde locale illisible ou indisponible : ${error.message}`;
  project = createProject();
}
const history = createHistory(project);
let scene3d = null, threeDirty = true, view = '2d', presentation = 'tilt';
let selected = null, region = null, zoneAnchor = null, pendingRegionAction = null;
let gridZoom = null, gridCache = null, editorMode = 'pattern', tool = 'brush';
let activeThreadId = project.palette[0].threadId, highlightedThreadId = null, progressBrush = 'done';
let reveal = 100, showGrid = true, showStitches = true, gridEdited = hadSavedProject;
let realisationFilter = 'all', readingRange = null, drag = null, suppressClickUntil = 0;
let toastTimeout;

function toast(message) {
  const el = $('toast');
  el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3300);
}

function persist() {
  // Cette sauvegarde ne quitte jamais l'appareil ; elle peut échouer en navigation privée.
  try {
    saveLocalProject(project);
    $('saveState').textContent = 'Enregistré sur cet appareil';
    $('saveState').classList.remove('problem');
  } catch (error) {
    $('saveState').textContent = 'Enregistrement local indisponible';
    $('saveState').classList.add('problem');
    toast(`Enregistrement impossible : ${error.message}`);
  }
}

function renderThreadList(metrics, progress) {
  const list = $('threadList'); list.replaceChildren();
  for (const thread of project.palette) {
    const line = document.createElement('button'); line.type = 'button';
    const focused = thread.threadId === highlightedThreadId;
    line.className = `thread-row${thread.threadId === activeThreadId ? ' active' : ''}${focused ? ' focused' : ''}${highlightedThreadId && !focused ? ' muted' : ''}`;
    line.setAttribute('aria-pressed', String(focused));
    const symbol = document.createElement('span');
    symbol.className = 'thread-symbol'; symbol.textContent = thread.symbol;
    symbol.style.borderColor = thread.color;
    const info = document.createElement('span'); info.className = 'thread-info';
    const name = document.createElement('strong'); name.textContent = thread.name;
    const ref = document.createElement('small');
    ref.textContent = `${thread.reference} · ${thread.referenceStatus}`;
    info.append(name, ref);
    const quantity = document.createElement('span'); quantity.className = 'thread-quantity';
    const count = metrics.countsByThread[thread.threadId] ?? 0;
    quantity.textContent = `${counts(count)} croix`;
    const part = document.createElement('span');
    part.textContent = `${f(metrics.crossCount ? 100 * count / metrics.crossCount : 0)} % · ${counts(progress.doneByThread[thread.threadId] ?? 0)} faites`;
    quantity.appendChild(part);
    line.append(symbol, info, quantity);
    line.title = `${thread.name} : ${counts(count)} croix, ${f(metrics.crossCount ? 100 * count / metrics.crossCount : 0)} % du patron. Cliquer pour focaliser ; re-cliquer pour tout afficher.`;
    line.addEventListener('click', () => {
      highlightedThreadId = focused ? null : thread.threadId;
      activeThreadId = thread.threadId; $('activeThread').value = activeThreadId;
      if (tool === 'erase') setTool('brush');
      renderThreadList(calculateMetrics(project), calculateProgress(project));
      renderGrid(); $('clearThreadFocus').hidden = !highlightedThreadId;
    });
    list.appendChild(line);
  }
  $('paletteMeta').textContent = `${metrics.usedColorCount} utilisées · ${project.palette.length} disponibles`;
  $('clearThreadFocus').hidden = !highlightedThreadId;
}

function renderSelection() {
  const cell = selected && project.grid[selected.row]?.[selected.column];
  if (!selected) {
    $('selectionInfo').textContent = 'Sélectionnez une cellule de la grille.';
    $('coordinateBar').textContent = 'Grille : L — · C —';
    return;
  }
  const thread = cell && project.palette.find(item => item.threadId === cell.threadId);
  const status = cell ? { todo: 'À FAIRE', 'in-progress': 'EN COURS', done: 'FAIT' }[progressAt(project, selected.row, selected.column)] : '';
  $('selectionInfo').textContent = `Ligne ${selected.row + 1} · Colonne ${selected.column + 1} — ${thread ? `${thread.symbol} ${thread.name} · point de croix · ${status}` : 'cellule vide'}`;
  $('gotoRow').value = selected.row + 1; $('gotoColumn').value = selected.column + 1;
  $('coordinateBar').textContent = `L ${selected.row + 1} · C ${selected.column + 1}${region ? ` · zone ${region.bottom - region.top + 1} × ${region.right - region.left + 1}` : ''}`;
}

function updateSceneBadge(metrics) {
  if (view !== '3d') {
    $('sceneBadge').textContent = `${counts(metrics.positionCount)} positions · ${counts(metrics.crossCount)} croix`;
  } else if (!showStitches) {
    $('sceneBadge').textContent = `${counts(metrics.crossCount)} croix masquées (vue 3D seulement)`;
  } else {
    $('sceneBadge').textContent = `${counts(scene3d?.stitchCount ?? 0)} visibles / ${counts(metrics.crossCount)} croix du patron${reveal < 100 ? ' · aperçu partiel' : ''}`;
  }
}

function renderDetails(metrics) {
  const progress = calculateProgress(project);
  $('projectName').textContent = project.name;
  $('sceneTitle').textContent = project.name;
  $('sceneSubtitle').textContent = `Motif ${project.widthStitches} × ${project.heightStitches} · toile ${project.fabric.type} · ${f(project.fabric.stitchesPerCm)} points/cm`;
  $('overviewIcon').textContent = TEMPLATES[project.template]?.icon ?? '✳';
  $('overviewName').textContent = project.name;
  $('overviewMeta').textContent = `${project.fabric.type} · point de croix · ${f(project.fabric.stitchesPerCm)} pts/cm`;
  $('positionCount').textContent = counts(metrics.positionCount);
  $('gridPositions').textContent = `${counts(project.widthStitches)} × ${counts(project.heightStitches)}`;
  $('stitchCount').textContent = counts(metrics.crossCount);
  $('emptyCount').textContent = counts(metrics.emptyCount);
  $('colorCount').textContent = counts(metrics.usedColorCount);
  $('motifSize').textContent = `${f(metrics.motifWidthCm)} × ${f(metrics.motifHeightCm)}`;
  $('fabricSize').textContent = `${f(metrics.canvasWidthCm)} × ${f(metrics.canvasHeightCm)}`;
  $('surfaceNote').textContent = `Surface du motif : ${f(metrics.motifAreaCm2)} cm² · surface de toile : ${f(metrics.canvasAreaCm2)} cm². Marges : H ${f(project.fabric.marginsCm.top)}, B ${f(project.fabric.marginsCm.bottom)}, G ${f(project.fabric.marginsCm.left)}, D ${f(project.fabric.marginsCm.right)} cm.`;
  $('progressPercent').textContent = `${f(progress.percent)} %`;
  $('progressFill').style.width = `${progress.percent}%`;
  $('progressCounts').textContent = `${counts(progress.done)} faites · ${counts(progress.inProgress)} en cours · ${counts(progress.remaining)} restantes (en cours incluses)`;
  $('revealValue').textContent = `${reveal} %`;
  $('statusLine').textContent = 'Ce curseur ne marque aucune croix faite. La fiche et l’export contiennent toujours le patron complet.';
  renderThreadList(metrics, progress);
  renderSelection();
  updateSceneBadge(metrics);
}

function svgRect(attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function updateGridOverlays(svg, size) {
  if (gridCache?.selected) {
    svg.querySelector(`[data-row="${gridCache.selected.row}"][data-column="${gridCache.selected.column}"]`)
      ?.setAttribute('aria-selected', 'false');
  }
  if (selected) svg.querySelector(`[data-row="${selected.row}"][data-column="${selected.column}"]`)
    ?.setAttribute('aria-selected', 'true');
  svg.querySelector('.cell-selection')?.remove();
  svg.querySelector('.region-selection')?.remove();
  if (region) svg.appendChild(svgRect({ x: GRID_GUTTER + region.left * size + 1,
    y: GRID_GUTTER + region.top * size + 1,
    width: (region.right - region.left + 1) * size - 2,
    height: (region.bottom - region.top + 1) * size - 2,
    class: 'region-selection', 'pointer-events': 'none' }));
  if (selected) svg.appendChild(svgRect({ x: GRID_GUTTER + selected.column * size + 1,
    y: GRID_GUTTER + selected.row * size + 1, width: size - 2, height: size - 2,
    class: 'cell-selection', 'pointer-events': 'none' }));
  gridCache.selected = selected && { ...selected };
}

function renderGrid({ force = false } = {}) {
  if (view !== '2d') return;
  const host = $('gridView'), left = host.scrollLeft, top = host.scrollTop;
  const fit = Math.floor(Math.min((host.clientWidth - 75) / project.widthStitches,
    (host.clientHeight - 205) / project.heightStitches));
  const size = gridZoom ?? Math.max(11, Math.min(25, fit));
  const cache = gridCache;
  const fresh = force || !cache || cache.grid !== project.grid || cache.palette !== project.palette ||
    cache.progress !== project.progress || cache.width !== project.widthStitches ||
    cache.height !== project.heightStitches || cache.size !== size || cache.showGrid !== showGrid ||
    cache.highlight !== highlightedThreadId || cache.mode !== editorMode ||
    cache.readStart !== readingRange?.start || cache.readEnd !== readingRange?.end;
  if (!fresh) {
    updateGridOverlays(cache.svg, size);
    return;
  }
  const svg = renderGrid2D(project, { selected, cellSize: size, showGrid,
    highlightThreadId: highlightedThreadId, region, rowRange: readingRange,
    mode: editorMode === 'stitch' ? 'stitch' : 'pattern' });
  host.replaceChildren(svg);
  host.scrollLeft = left; host.scrollTop = top;
  gridCache = { svg, grid: project.grid, palette: project.palette, progress: project.progress,
    width: project.widthStitches, height: project.heightStitches, size, showGrid,
    highlight: highlightedThreadId, mode: editorMode,
    readStart: readingRange?.start, readEnd: readingRange?.end,
    selected: selected && { ...selected } };
  assertGridViewMatchesProject(svg, project);
}

function renderThree(metrics) {
  if (!scene3d || view !== '3d') { threeDirty = true; return; }
  scene3d.update(project, reveal, { filter: realisationFilter, rowRange: readingRange });
  const visible = selectVisibleStitches(project, { filter: realisationFilter, rowRange: readingRange, reveal });
  if (scene3d.stitchCount !== visible.length) throw new Error('La vue 3D et la grille ne contiennent pas les mêmes points visibles.');
  const byThread = Object.create(null);
  for (const cell of visible) byThread[cell.threadId] = (byThread[cell.threadId] ?? 0) + 1;
  for (const [threadId, count] of Object.entries(byThread)) {
    if ((scene3d.renderedCountsByThread[threadId] ?? 0) !== count) {
      throw new Error(`Le rendu 3D et la grille divergent pour le fil ${threadId}.`);
    }
  }
  if (!readingRange && realisationFilter === 'all' && reveal === 100 && scene3d.stitchCount !== metrics.crossCount) {
    throw new Error('Le rendu 3D et le motif complet divergent.');
  }
  threeDirty = false;
}

function refreshInputs() {
  $('patternName').value = project.name;
  $('sizeSelect').value = project.widthStitches === project.heightStitches && [28, 36, 44].includes(project.widthStitches)
    ? String(project.widthStitches) : 'custom';
  $('widthInput').value = project.widthStitches;
  $('heightInput').value = project.heightStitches;
  $('fabricType').value = project.fabric.type;
  $('densityInput').value = project.fabric.stitchesPerCm;
  for (const side of ['top', 'bottom', 'left', 'right']) {
    $('margin' + side[0].toUpperCase() + side.slice(1)).value = project.fabric.marginsCm[side];
  }
  document.querySelectorAll('.mini-card').forEach(btn => btn.classList.toggle('selected', btn.dataset.pattern === project.template));
  const previous = activeThreadId;
  const options = project.palette.map(thread => {
    const item = document.createElement('option'); item.value = thread.threadId;
    item.textContent = `${thread.symbol} ${thread.name}`; return item;
  });
  $('activeThread').replaceChildren(...options);
  activeThreadId = project.palette.some(thread => thread.threadId === previous) ? previous : project.palette[0]?.threadId;
  $('activeThread').value = activeThreadId;
  $('gotoRow').max = $('readStart').max = $('readEnd').max = project.heightStitches;
  $('gotoColumn').max = project.widthStitches;
  $('gotoRow').value = (selected?.row ?? 0) + 1;
  $('gotoColumn').value = (selected?.column ?? 0) + 1;
  $('readStart').value = readingRange ? readingRange.start + 1 : 1;
  $('readEnd').value = readingRange ? readingRange.end + 1 : Math.min(10, project.heightStitches);
}

function updateUIState() {
  $('undoBtn').disabled = !history.canUndo;
  $('redoBtn').disabled = !history.canRedo;
  $('gridEditBar').hidden = view !== '2d' || editorMode !== 'pattern';
  $('atelierTools').hidden = view !== '2d';
  $('threeOptions').hidden = view !== '3d';
  $('zoomTools').hidden = view !== '2d';
  $('coordinateBar').hidden = view !== '2d';
  $('patternTools').hidden = editorMode !== 'pattern';
  $('stitchHint').hidden = editorMode !== 'stitch';
  $('scene').parentElement.classList.toggle('stitch-mode', editorMode === 'stitch');
  for (const [id, active] of [['patternMode', editorMode === 'pattern'], ['stitchMode', editorMode === 'stitch'],
    ['brushTool', tool === 'brush'], ['fillTool', tool === 'fill'], ['zoneTool', tool === 'select'], ['panTool', tool === 'pan']]) {
    $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active));
  }
  $('eraseTool').classList.toggle('active', tool === 'erase');
  $('eraseTool').setAttribute('aria-pressed', String(tool === 'erase'));
  for (const button of document.querySelectorAll('[data-progress-state]')) {
    button.classList.toggle('active', button.dataset.progressState === progressBrush);
    button.setAttribute('aria-pressed', String(button.dataset.progressState === progressBrush));
  }
  for (const button of document.querySelectorAll('[data-presentation]')) {
    button.classList.toggle('active', button.dataset.presentation === presentation);
    button.setAttribute('aria-pressed', String(button.dataset.presentation === presentation));
  }
  $('rearNote').hidden = presentation !== 'back';
  $('regionActions').hidden = !region || editorMode !== 'pattern';
  if (region) $('regionSummary').textContent = `Zone : L ${region.top + 1}–${region.bottom + 1} · C ${region.left + 1}–${region.right + 1}`;
  $('readingInfo').textContent = readingRange
    ? `Lignes ${readingRange.start + 1} à ${readingRange.end + 1} atténuant les autres dans la grille, filtrées en 3D. Patron et progression inchangés.`
    : 'Toutes les lignes affichées. Lecture visuelle seulement : aucune croix masquée dans le patron.';
  $('gridView').classList.toggle('pan-active', tool === 'pan' && editorMode === 'pattern');
}

function renderAll({ controls = false } = {}) {
  if (controls) refreshInputs();
  const metrics = calculateMetrics(project);
  renderDetails(metrics);
  renderGrid();
  renderThree(metrics);
  updateSceneBadge(metrics);
  updateUIState();
  const validation = validateProject(project);
  $('validationChip').textContent = validation.label;
  $('validationChip').classList.toggle('invalid', !validation.valid);
  $('validationBox').classList.toggle('invalid', !validation.valid);
  $('validationTitle').textContent = validation.valid ? 'VALIDE · grille cohérente' : 'À CORRIGER';
  $('validationDetails').textContent = [...validation.errors, ...validation.warnings].join(' ') ||
    'Grille, palette et toile cohérentes.';
  $('exportBtn').disabled = !validation.valid;
  $('printBtn').disabled = !validation.valid;
}

function clampSelection() {
  if (selected && (selected.row >= project.heightStitches || selected.column >= project.widthStitches)) selected = null;
  if (region && (region.bottom >= project.heightStitches || region.right >= project.widthStitches)) region = null;
  if (readingRange && readingRange.end >= project.heightStitches) readingRange = null;
  if (highlightedThreadId && !project.palette.some(thread => thread.threadId === highlightedThreadId)) highlightedThreadId = null;
  pendingRegionAction = null; zoneAnchor = null;
}

function commit(next, { controls = false, edited = false } = {}) {
  if (next === project) { renderGrid(); renderSelection(); return false; }
  const report = validateProject(next, { allowEmpty: true });
  if (!report.valid) {
    toast(`Modification refusée : ${report.errors.join(' ')}`);
    if (controls) refreshInputs();
    return false;
  }
  history.commit(next);
  project = history.project;
  if (edited) gridEdited = true;
  clampSelection();
  threeDirty = true;
  renderAll({ controls });
  persist();
  return true;
}

function goHistory(direction) {
  if (!(direction === 'undo' ? history.canUndo : history.canRedo)) return;
  project = direction === 'undo' ? history.undo() : history.redo();
  gridEdited = true;
  clampSelection();
  threeDirty = true;
  renderAll({ controls: true }); persist();
  toast(direction === 'undo' ? 'Dernière modification annulée.' : 'Modification rétablie.');
}

function setTool(next) {
  if (!['brush', 'erase', 'fill', 'select', 'pan'].includes(next)) return;
  tool = next;
  zoneAnchor = null;
  pendingRegionAction = null;
  if (next !== 'select') region = null;
  updateUIState(); renderGrid(); renderSelection();
}

function editAt(row, column, forceErase = false) {
  selected = { row, column };
  const current = project.grid[row][column];
  const newCell = forceErase || tool === 'erase' ||
    current?.threadId === activeThreadId && current?.stitchType === $('stitchType').value
      ? null : { threadId: activeThreadId, stitchType: $('stitchType').value };
  commit(setCell(project, row, column, newCell), { edited: true });
  $('gridView').querySelector('svg')?.focus({ preventScroll: true });
}

function selectOnly(row, column) {
  selected = { row, column };
  renderGrid(); renderSelection();
  $('gridView').querySelector('svg')?.focus({ preventScroll: true });
}

function setProgressBrush(status, applySelected = false) {
  progressBrush = status;
  updateUIState();
  if (applySelected && selected && project.grid[selected.row]?.[selected.column]) {
    commit(setProgress(project, selected.row, selected.column, status));
  }
}

function actionAt(row, column, { shiftKey = false } = {}) {
  if (shiftKey) { selectOnly(row, column); return; }
  selected = { row, column };
  if (editorMode === 'stitch') {
    if (project.grid[row][column] === null) {
      toast('Case vide : seul un point du patron peut être marqué comme réalisé.');
      selectOnly(row, column); return;
    }
    commit(setProgress(project, row, column, progressBrush)); return;
  }
  if (pendingRegionAction && region) {
    const old = region;
    try {
      const result = pasteRegion(project, copyRegion(project, old), row, column,
        pendingRegionAction === 'move' ? { moveFrom: old } : {});
      if (result.overwrites && !window.confirm(`${counts(result.overwrites)} croix à destination seront remplacées. Continuer ?`)) return;
      const kind = pendingRegionAction;
      pendingRegionAction = null;
      region = { top: row, left: column,
        bottom: row + old.bottom - old.top, right: column + old.right - old.left };
      if (commit(result.project, { edited: true })) toast(`${kind === 'move' ? 'Déplacement' : 'Duplication'} : ${counts(result.changedCount)} cases modifiées. Une étape d’historique.`);
      else { renderGrid(); updateUIState(); }
    } catch (error) { toast(error.message); }
    return;
  }
  if (tool === 'select') {
    if (!zoneAnchor) {
      zoneAnchor = { row, column }; region = null;
      toast('Premier coin choisi. Cliquez le coin opposé ou glissez pour sélectionner une zone.');
    } else {
      region = rectangleBetween(zoneAnchor, { row, column }); zoneAnchor = null;
      toast(`Zone ${region.bottom - region.top + 1} × ${region.right - region.left + 1} sélectionnée.`);
    }
    renderGrid(); renderSelection(); updateUIState(); return;
  }
  if (tool === 'pan') { selectOnly(row, column); return; }
  if (tool === 'fill') {
    try {
      const result = fillConnected(project, row, column, { threadId: activeThreadId, stitchType: 'cross' });
      if (result.changedCount > 500 && !window.confirm(`Remplir ${counts(result.changedCount)} cases connexes en une opération ?`)) return;
      if (commit(result.project, { edited: true })) toast(`${counts(result.changedCount)} cases connexes remplies. Annuler restaure le patron.`);
    } catch (error) { toast(error.message); }
    return;
  }
  editAt(row, column);
}

function showView(next) {
  if (next === '3d' && !scene3d) { toast('Vue 3D indisponible sur cet appareil. La grille 2D reste utilisable.'); return; }
  const changed = view !== next;
  view = next;
  $('view3d').classList.toggle('active', view === '3d');
  $('viewFlat').classList.toggle('active', view === '2d');
  $('gridView').hidden = view !== '2d';
  $('stitchToggle').disabled = view !== '3d';
  $('resetCamera').disabled = view !== '3d';
  $('sceneHint').textContent = view === '3d'
    ? 'Glissez pour tourner · molette pour zoomer · relief illustratif'
    : editorMode === 'stitch' ? 'Broder : choisissez un état puis cliquez une croix'
      : tool === 'select' ? 'Zone : cliquez deux coins ou tracez un rectangle'
        : 'Patron : cliquez pour placer · flèches pour se déplacer';
  scene3d?.setVisible(view === '3d');
  if (view === '3d' && (changed || threeDirty)) renderThree(calculateMetrics(project));
  if (view === '2d') renderGrid({ force: changed });
  updateUIState(); updateSceneBadge(calculateMetrics(project));
}

function resetReveal() {
  reveal = 100; $('revealRange').value = 100;
  $('revealValue').textContent = '100 %';
}

function resetTransientView() {
  selected = null; region = null; zoneAnchor = null; pendingRegionAction = null;
  highlightedThreadId = null; readingRange = null; gridCache = null;
  resetReveal();
}

function paletteNeedsReset() {
  return BASE_PALETTE.some(seed => !project.palette.some(thread => thread.threadId === seed.threadId));
}

function confirmationForRegeneration(message) {
  const hasMarks = Object.keys(project.progress?.cells ?? {}).length > 0;
  return !gridEdited && !paletteNeedsReset() && !hasMarks || window.confirm(
    `${message}${hasMarks ? ' Les marques de réalisation du modèle précédent seront également effacées.' : ''} Continuer ?`);
}

function positionFromPointer(event) {
  const svg = $('gridView').querySelector('svg');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const scale = box.width / Number(svg.getAttribute('width'));
  const size = Number(svg.dataset.cellSize || gridCache?.size);
  const column = Math.floor((event.clientX - box.left - GRID_GUTTER * scale) / (size * scale));
  const row = Math.floor((event.clientY - box.top - GRID_GUTTER * scale) / (size * scale));
  return row >= 0 && row < project.heightStitches && column >= 0 && column < project.widthStitches
    ? { row, column } : null;
}

function showHover(position) {
  if (!position || drag) return;
  $('coordinateBar').textContent = `Survol : L ${position.row + 1} · C ${position.column + 1}${selected ? ` · choisie L ${selected.row + 1} C ${selected.column + 1}` : ''}`;
}

// Pinceau par glissé, sélection rectangulaire par glissé, déplacement de la vue.
// Les cases du geste sont appliquées en un seul nouveau projet => un seul Undo.
$('gridView').addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.shiftKey || view !== '2d' || editorMode !== 'pattern' || pendingRegionAction) return;
  if (!['brush', 'erase', 'select', 'pan'].includes(tool)) return;
  const at = positionFromPointer(event);
  if (!at && tool !== 'pan') return;
  const svg = $('gridView').querySelector('svg');
  drag = { pointerId: event.pointerId, kind: tool, anchor: at, last: at,
    x: event.clientX, y: event.clientY, left: $('gridView').scrollLeft,
    top: $('gridView').scrollTop, moved: false, visited: new Map(), previews: [], svg };
  if (at && (tool === 'brush' || tool === 'erase')) {
    const current = project.grid[at.row][at.column];
    drag.cell = tool === 'erase' || current?.threadId === activeThreadId && current?.stitchType === 'cross'
      ? null : { threadId: activeThreadId, stitchType: 'cross' };
    drag.visited.set(`${at.row}:${at.column}`, at);
  }
  $('gridView').setPointerCapture(event.pointerId);
  if (tool === 'pan') event.preventDefault();
});

function previewCell(state, at) {
  const key = `${at.row}:${at.column}`;
  if (state.visited.has(key)) return;
  state.visited.set(key, at);
  const size = gridCache.size;
  const rect = svgRect({ x: GRID_GUTTER + at.column * size + 1,
    y: GRID_GUTTER + at.row * size + 1, width: size - 2, height: size - 2,
    class: `drag-preview${state.cell === null ? ' erase' : ''}` });
  state.svg.appendChild(rect); state.previews.push(rect);
}

$('gridView').addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) { showHover(positionFromPointer(event)); return; }
  const state = drag;
  if (state.kind === 'pan') {
    const dx = state.x - event.clientX, dy = state.y - event.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.moved = true;
    $('gridView').scrollLeft = state.left + dx;
    $('gridView').scrollTop = state.top + dy;
    return;
  }
  const at = positionFromPointer(event);
  if (!at || !state.last) return;
  if (at.row === state.last.row && at.column === state.last.column) return;
  state.moved = true;
  if (state.kind === 'select') {
    state.svg.querySelector('#dragZone')?.remove();
    const bounds = rectangleBetween(state.anchor, at), size = gridCache.size;
    state.svg.appendChild(svgRect({ id: 'dragZone', class: 'region-selection',
      'pointer-events': 'none', x: GRID_GUTTER + bounds.left * size + 1,
      y: GRID_GUTTER + bounds.top * size + 1,
      width: (bounds.right - bounds.left + 1) * size - 2,
      height: (bounds.bottom - bounds.top + 1) * size - 2 }));
  } else {
    // Interpoler le segment pour ne pas sauter de cases quand le pointeur va vite.
    const steps = Math.max(Math.abs(at.row - state.last.row), Math.abs(at.column - state.last.column));
    if (state.visited.size === 1) {
      const first = state.anchor; state.visited.delete(`${first.row}:${first.column}`); previewCell(state, first);
    }
    for (let i = 1; i <= steps; i++) previewCell(state, {
      row: Math.round(state.last.row + (at.row - state.last.row) * i / steps),
      column: Math.round(state.last.column + (at.column - state.last.column) * i / steps)
    });
  }
  state.last = at;
});

function finishDrag(event, canceled = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const state = drag; drag = null;
  if ($('gridView').hasPointerCapture(event.pointerId)) $('gridView').releasePointerCapture(event.pointerId);
  state.svg.querySelector('#dragZone')?.remove();
  state.previews.forEach(node => node.remove());
  if (canceled) return;
  suppressClickUntil = Date.now() + 500;
  if (!state.moved) {
    if (state.anchor) actionAt(state.anchor.row, state.anchor.column, event);
    return;
  }
  if (state.kind === 'select') {
    region = rectangleBetween(state.anchor, state.last);
    selected = state.last; zoneAnchor = null;
    renderGrid(); renderSelection(); updateUIState();
    toast(`Zone ${region.bottom - region.top + 1} × ${region.right - region.left + 1} sélectionnée.`);
  } else if (state.kind === 'brush' || state.kind === 'erase') {
    selected = state.last;
    const edits = [...state.visited.values()].map(at => ({ ...at, cell: state.cell }));
    const result = applyCellChanges(project, edits);
    if (commit(result.project, { edited: true })) toast(`${counts(result.changedCount)} cases modifiées en un coup de pinceau.`);
    else { renderGrid(); renderSelection(); }
  }
}
$('gridView').addEventListener('pointerup', event => finishDrag(event));
$('gridView').addEventListener('pointercancel', event => finishDrag(event, true));
$('gridView').addEventListener('click', event => {
  if (Date.now() <= suppressClickUntil) { suppressClickUntil = 0; return; }
  const target = event.target.closest('[data-row][data-column]');
  if (!target) return;
  actionAt(Number(target.dataset.row), Number(target.dataset.column), event);
});

$('gridView').addEventListener('keydown', event => {
  const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
  if (move) {
    event.preventDefault();
    selected = { row: Math.max(0, Math.min(project.heightStitches - 1, (selected?.row ?? 0) + move[0])),
      column: Math.max(0, Math.min(project.widthStitches - 1, (selected?.column ?? 0) + move[1])) };
    renderGrid(); renderSelection();
    $('gridView').querySelector('svg')?.focus({ preventScroll: true });
    $('gridView').querySelector(`[data-row="${selected.row}"][data-column="${selected.column}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (selected && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault(); actionAt(selected.row, selected.column);
  } else if (selected && (event.key === 'Delete' || event.key === 'Backspace') && editorMode === 'pattern') {
    event.preventDefault(); editAt(selected.row, selected.column, true);
  }
});
window.addEventListener('keydown', event => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input,select,textarea') || target.isContentEditable)) return;
  if (event.key === 'Escape' && (pendingRegionAction || zoneAnchor || region)) {
    pendingRegionAction = null; zoneAnchor = null; region = null;
    renderGrid(); renderSelection(); updateUIState(); toast('Zone désélectionnée.');
  }
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
    event.preventDefault(); goHistory(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
  }
});
$('undoBtn').addEventListener('click', () => goHistory('undo'));
$('redoBtn').addEventListener('click', () => goHistory('redo'));

$('activeThread').addEventListener('change', event => {
  activeThreadId = event.target.value;
  if (tool === 'erase') setTool('brush');
  renderThreadList(calculateMetrics(project), calculateProgress(project));
});
$('clearThreadFocus').addEventListener('click', () => {
  highlightedThreadId = null;
  renderThreadList(calculateMetrics(project), calculateProgress(project)); renderGrid();
});
$('stitchType').addEventListener('change', event => {
  if (event.target.value !== 'cross') { event.target.value = 'cross'; toast('Seul le point de croix est pris en charge.'); }
});
$('eraseTool').addEventListener('click', () => {
  setTool(tool === 'erase' ? 'brush' : 'erase');
  toast(tool === 'erase' ? 'Gomme active : cliquez ou glissez pour effacer.' : 'Gomme désactivée.');
});
for (const [id, kind] of [['brushTool', 'brush'], ['fillTool', 'fill'], ['zoneTool', 'select'], ['panTool', 'pan']]) {
  $(id).addEventListener('click', () => {
    setTool(kind);
    showView('2d');
    if (kind === 'select') toast('Zone : cliquez deux coins, ou glissez pour tracer le rectangle.');
    if (kind === 'pan') toast('Déplacez la grille par glissé ; zoom avec + / − ou Ctrl + molette.');
  });
}
$('patternMode').addEventListener('click', () => {
  editorMode = 'pattern'; renderGrid(); updateUIState(); showView('2d');
});
$('stitchMode').addEventListener('click', () => {
  editorMode = 'stitch'; pendingRegionAction = null; zoneAnchor = null; region = null;
  renderGrid(); updateUIState(); showView('2d');
});
for (const button of document.querySelectorAll('[data-progress-state]')) {
  button.addEventListener('click', () => setProgressBrush(button.dataset.progressState, editorMode === 'stitch'));
}
$('view3d').addEventListener('click', () => showView('3d'));
$('viewFlat').addEventListener('click', () => showView('2d'));
$('resetCamera').addEventListener('click', () => scene3d?.resetCamera());
for (const button of document.querySelectorAll('[data-presentation]')) button.addEventListener('click', () => {
  presentation = button.dataset.presentation;
  scene3d?.setPresentation(presentation);
  updateUIState();
  if (presentation === 'back') toast('Arrière illustratif : repères des croix, pas leur trajet au dos.');
});
$('realisationFilter').addEventListener('change', event => {
  realisationFilter = event.target.value;
  renderThree(calculateMetrics(project));
  updateSceneBadge(calculateMetrics(project));
});
$('gridToggle').addEventListener('click', event => {
  showGrid = !showGrid;
  event.currentTarget.classList.toggle('active', showGrid);
  renderGrid(); scene3d?.setGridVisible(showGrid);
});
$('stitchToggle').addEventListener('click', event => {
  showStitches = !showStitches;
  event.currentTarget.classList.toggle('active', showStitches);
  scene3d?.setStitchesVisible(showStitches);
  updateSceneBadge(calculateMetrics(project));
  toast(showStitches ? 'Croix visibles en 3D.' : 'Croix masquées uniquement dans l’aperçu 3D.');
});
window.addEventListener('resize', () => {
  if (view === '2d' && gridZoom === null) renderGrid();
});

function zoomBy(delta) {
  const host = $('gridView'), svg = host.querySelector('svg');
  const oldSize = Number(svg?.dataset.cellSize ?? gridZoom ?? 16);
  const next = Math.max(7, Math.min(38, oldSize + delta));
  if (oldSize === next || !svg) return;
  const viewBox = host.getBoundingClientRect(), box = svg.getBoundingClientRect();
  const cx = viewBox.left + host.clientWidth / 2, cy = viewBox.top + host.clientHeight / 2;
  const cellX = (cx - box.left - GRID_GUTTER) / oldSize;
  const cellY = (cy - box.top - GRID_GUTTER) / oldSize;
  gridZoom = next; renderGrid();
  const newer = host.querySelector('svg')?.getBoundingClientRect();
  if (newer) host.scrollBy({ left: newer.left + GRID_GUTTER + cellX * next - cx,
    top: newer.top + GRID_GUTTER + cellY * next - cy });
}
$('zoomIn').addEventListener('click', () => zoomBy(3));
$('zoomOut').addEventListener('click', () => zoomBy(-3));
$('gridView').addEventListener('wheel', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault(); zoomBy(event.deltaY < 0 ? 2 : -2);
}, { passive: false });
$('revealRange').addEventListener('input', event => {
  reveal = Number(event.target.value);
  $('revealValue').textContent = `${reveal} %`;
  if (view === '3d') {
    renderThree(calculateMetrics(project)); updateSceneBadge(calculateMetrics(project));
  } else threeDirty = true;
});

$('gotoBtn').addEventListener('click', () => {
  const row = Number($('gotoRow').value) - 1, column = Number($('gotoColumn').value) - 1;
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
      row >= project.heightStitches || column >= project.widthStitches) {
    toast('Ligne ou colonne hors grille.'); return;
  }
  showView('2d'); selectOnly(row, column);
  const host = $('gridView'), cell = host.querySelector(`[data-row="${row}"][data-column="${column}"]`);
  if (cell) {
    const rect = cell.getBoundingClientRect(), viewRect = host.getBoundingClientRect();
    host.scrollBy({ left: rect.left - viewRect.left - host.clientWidth / 2,
      top: rect.top - viewRect.top - host.clientHeight / 2, behavior: 'smooth' });
  }
});
for (const id of ['gotoRow', 'gotoColumn']) $(id).addEventListener('keydown', event => {
  if (event.key === 'Enter') $('gotoBtn').click();
});
$('applyRead').addEventListener('click', () => {
  const start = Number($('readStart').value), end = Number($('readEnd').value);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 ||
      end < start || end > project.heightStitches) {
    toast(`Indiquez des lignes de 1 à ${project.heightStitches}, dans l’ordre.`); return;
  }
  readingRange = { start: start - 1, end: end - 1 };
  renderGrid(); renderThree(calculateMetrics(project));
  updateSceneBadge(calculateMetrics(project)); updateUIState();
  toast(`Lecture : lignes ${start} à ${end} (patron complet conservé).`);
});
$('readAll').addEventListener('click', () => {
  readingRange = null;
  renderGrid(); renderThree(calculateMetrics(project));
  updateSceneBadge(calculateMetrics(project)); updateUIState();
});

$('duplicateRegion').addEventListener('click', () => {
  setTool('select'); pendingRegionAction = 'copy';
  toast('Cliquez la destination : nouveau coin haut gauche de la zone à dupliquer.');
});
$('moveRegion').addEventListener('click', () => {
  setTool('select'); pendingRegionAction = 'move';
  toast('Cliquez la destination : la zone sera déplacée en une opération.');
});
$('eraseRegion').addEventListener('click', () => {
  if (!region || !window.confirm('Effacer toutes les croix de la zone sélectionnée ? Annuler reste disponible.')) return;
  const edits = [];
  for (let row = region.top; row <= region.bottom; row++) for (let column = region.left; column <= region.right; column++) {
    edits.push({ row, column, cell: null });
  }
  const result = applyCellChanges(project, edits);
  if (commit(result.project, { edited: true })) toast(`${counts(result.changedCount)} croix effacées dans la zone.`);
});
$('cancelRegion').addEventListener('click', () => {
  region = null; zoneAnchor = null; pendingRegionAction = null;
  renderGrid(); renderSelection(); updateUIState();
});

document.querySelectorAll('.mini-card').forEach(btn => btn.addEventListener('click', () => {
  const kind = btn.dataset.pattern;
  if (kind === project.template && !gridEdited) return;
  if (!confirmationForRegeneration(paletteNeedsReset()
    ? 'Charger ce modèle remplacera la grille et la palette importée.'
    : 'Charger ce modèle remplacera la grille éditée.')) return;
  const size = [28, 36, 44].includes(project.widthStitches) && project.widthStitches === project.heightStitches ? project.widthStitches : 36;
  const next = regenerateTemplate(project, kind, size);
  resetTransientView(); activeThreadId = 'thread-001';
  if (commit(next, { controls: true, edited: false })) gridEdited = false;
  toast(`Modèle ${TEMPLATES[kind].name} chargé depuis ses cellules.`);
}));
$('sizeSelect').addEventListener('change', event => {
  const n = Number(event.target.value);
  if (event.target.value === 'custom') { $('widthInput').focus(); return; }
  if (n === project.widthStitches && n === project.heightStitches) return;
  if (project.template && !confirmationForRegeneration(paletteNeedsReset()
    ? 'Changer la taille reconstruira le motif et la palette importée.'
    : 'Changer la taille du modèle reconstruira son dessin et remplacera les modifications.')) {
    refreshInputs(); return;
  }
  const next = project.template ? regenerateTemplate(project, project.template, n) : resizeGrid(project, n, n);
  resetTransientView();
  if (commit(next, { controls: true })) gridEdited = !project.template;
  toast(`Grille ${n} × ${n} positions.`);
});
$('resizeBtn').addEventListener('click', () => {
  const width = Number($('widthInput').value), height = Number($('heightInput').value);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_GRID_AXIS || height > MAX_GRID_AXIS) {
    toast(`Largeur et hauteur : entiers compris entre 1 et ${MAX_GRID_AXIS} points.`); return;
  }
  if (width === project.widthStitches && height === project.heightStitches) return;
  if ((width < project.widthStitches || height < project.heightStitches) &&
      !window.confirm('Réduire la grille supprime les points et marques de réalisation hors du nouveau cadre. Continuer ?')) return;
  const next = resizeGrid(project, width, height);
  resetTransientView();
  if (commit(next, { controls: true, edited: true })) toast(`Grille ajustée à ${width} × ${height}.`);
});
$('patternName').addEventListener('change', event => {
  const name = event.target.value.trim();
  if (!name) { toast('Le nom du motif est obligatoire.'); event.target.value = project.name; return; }
  event.target.value = name;
  if (name !== project.name) commit({ ...project, name });
});
$('fabricType').addEventListener('change', event => {
  const type = event.target.value.trim();
  if (!type) { toast('Indiquez le type de toile.'); event.target.value = project.fabric.type; return; }
  event.target.value = type;
  if (type !== project.fabric.type) commit({ ...project, fabric: { ...project.fabric, type } });
});
$('densityInput').addEventListener('change', event => {
  const value = Number(event.target.value);
  if (event.target.value === '' || !Number.isFinite(value) || value <= 0 || value > 100) {
    toast('La densité doit être positive (points/cm).'); event.target.value = project.fabric.stitchesPerCm; return;
  }
  if (value !== project.fabric.stitchesPerCm) commit({ ...project, fabric: { ...project.fabric, stitchesPerCm: value } });
});
for (const side of ['top', 'bottom', 'left', 'right']) {
  const input = $('margin' + side[0].toUpperCase() + side.slice(1));
  input.addEventListener('change', () => {
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      toast('Une marge doit être comprise entre 0 et 100 cm.'); input.value = project.fabric.marginsCm[side]; return;
    }
    if (value !== project.fabric.marginsCm[side]) commit({ ...project, fabric: { ...project.fabric,
      marginsCm: { ...project.fabric.marginsCm, [side]: value } } });
  });
}
$('newProject').addEventListener('click', () => {
  if (!window.confirm('Créer un nouveau projet remplacera le projet local actuel. Exportez son JSON pour le conserver. Continuer ?')) return;
  const next = createProject();
  resetTransientView(); activeThreadId = next.palette[0].threadId; gridZoom = null;
  if (commit(next, { controls: true })) gridEdited = false;
  toast('Nouveau projet de broderie créé.');
});

function filename(extension) {
  const slug = project.name.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'broderie';
  return `${slug}-patron.${extension}`;
}
function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportBtn').addEventListener('click', () => {
  try {
    const json = serializeAtelierProject(project);
    assertAtelierRoundTrip(project, json);
    download(json, 'application/json;charset=utf-8', filename('json'));
    toast('Patron et marques de réalisation exportés en JSON V2, aller-retour vérifié.');
  } catch (error) { toast(`Export refusé : ${error.message}`); }
});
$('printBtn').addEventListener('click', () => {
  try {
    const html = buildSheetHTML(project);
    const popup = window.open('', '_blank');
    if (popup) {
      popup.opener = null;
      popup.document.open(); popup.document.write(html); popup.document.close();
      toast('Fiche et grilles paginées ouvertes. Utilisez Imprimer / PDF.');
    } else {
      download(html, 'text/html;charset=utf-8', filename('html'));
      toast('Fenêtre bloquée : fiche HTML téléchargée, ouvrable et imprimable.');
    }
  } catch (error) { toast(`Fiche refusée : ${error.message}`); }
});
function showImportError(message) {
  $('importError').textContent = message;
  $('importError').hidden = !message;
  if (message) toast(message);
}
async function importFile(file) {
  if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      throw new Error('Importer un fichier .json de broderie, pas une image ou un PDF.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (maximum 10 Mo).');
    const imported = parseAtelierProject(await file.text());
    assertAtelierRoundTrip(imported);
    resetTransientView(); gridZoom = null;
    activeThreadId = imported.palette[0].threadId;
    showImportError(''); $('fileName').textContent = `✓ ${file.name}`;
    if (commit(imported, { controls: true, edited: true })) {
      showView('2d'); toast('Patron réimporté : grille, fils, toile et réalisation restaurés.');
    }
  } catch (error) { showImportError(`Import refusé : ${error.message}`); }
}
$('fileInput').addEventListener('change', event => {
  importFile(event.target.files?.[0]); event.target.value = '';
});
const dropZone = $('dropZone');
for (const name of ['dragenter', 'dragover']) dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.add('dragging');
});
for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.remove('dragging');
});
dropZone.addEventListener('drop', event => importFile(event.dataTransfer?.files?.[0]));

try {
  scene3d = new EmbroideryScene($('scene'));
  scene3d.setVisible(false);
} catch (error) {
  console.error('WebGL indisponible :', error);
  toast('Vue 3D indisponible : la grille 2D et le patron restent accessibles.');
}
refreshInputs(); renderAll(); showView('2d');
if (loadError) {
  $('saveState').textContent = 'Enregistrement local illisible · non écrasé';
  $('saveState').classList.add('problem');
  showImportError(loadError);
} else if (hadSavedProject) {
  $('saveState').textContent = 'Projet restauré depuis cet appareil';
} else persist();
