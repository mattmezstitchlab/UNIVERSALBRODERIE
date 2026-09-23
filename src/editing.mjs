import { SUPPORTED_STITCH_TYPES } from './project.mjs';
import { progressKey } from './progress.mjs';

const same = (a, b) => a === null && b === null || a && b &&
  a.threadId === b.threadId && a.stitchType === b.stitchType;

export function rectangleBetween(a, b) {
  if (![a?.row, a?.column, b?.row, b?.column].every(Number.isSafeInteger)) throw new RangeError('Coordonnées de zone invalides.');
  return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row),
    left: Math.min(a.column, b.column), right: Math.max(a.column, b.column) };
}

export function validateRectangle(project, rect) {
  if (!rect || ![rect.top, rect.left, rect.bottom, rect.right].every(Number.isSafeInteger) ||
      rect.top < 0 || rect.left < 0 || rect.bottom < rect.top || rect.right < rect.left ||
      rect.bottom >= project.heightStitches || rect.right >= project.widthStitches) {
    throw new RangeError('Zone hors grille.');
  }
  return rect;
}

// Une opération = un nouveau modèle = une entrée d'historique (même pour 40 000 cases).
export function applyCellChanges(project, changes) {
  const edits = new Map();
  const threads = new Set(project.palette.map(thread => thread.threadId));
  for (const { row, column, cell } of changes) {
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
        row >= project.heightStitches || column >= project.widthStitches) throw new RangeError('Coordonnées hors grille.');
    if (cell !== null && (!cell || !threads.has(cell.threadId) || !SUPPORTED_STITCH_TYPES.includes(cell.stitchType))) {
      throw new RangeError('Fil ou type de point inconnu.');
    }
    edits.set(progressKey(row, column), { row, column, cell }); // la dernière écriture prévaut en cas de chevauchement
  }
  const grid = project.grid.slice(), copiedRows = new Set();
  const progressCells = project.progress ? { ...project.progress.cells } : null;
  let changedCount = 0;
  for (const [key, { row, column, cell }] of edits) {
    if (same(project.grid[row][column], cell)) continue;
    if (!copiedRows.has(row)) { grid[row] = grid[row].slice(); copiedRows.add(row); }
    grid[row][column] = cell === null ? null : { threadId: cell.threadId, stitchType: cell.stitchType };
    if (progressCells) delete progressCells[key];
    changedCount++;
  }
  if (!changedCount) return { project, changedCount: 0 };
  return { project: { ...project, grid,
    ...(project.progress ? { progress: { ...project.progress, cells: progressCells } } : {}) }, changedCount };
}

export function fillConnected(project, row, column, cell) {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
      row >= project.heightStitches || column >= project.widthStitches) throw new RangeError('Coordonnées hors grille.');
  const source = project.grid[row][column];
  if (same(source, cell)) return { project, changedCount: 0 };
  const width = project.widthStitches, height = project.heightStitches;
  const seen = new Uint8Array(width * height), queue = [row * width + column], changes = [];
  seen[queue[0]] = 1;
  for (let index = 0; index < queue.length; index++) {
    const pos = queue[index], r = Math.floor(pos / width), c = pos % width;
    if (!same(project.grid[r][c], source)) continue;
    changes.push({ row: r, column: c, cell });
    for (const [nextR, nextC] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (nextR < 0 || nextR >= height || nextC < 0 || nextC >= width) continue;
      const next = nextR * width + nextC;
      if (!seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  return applyCellChanges(project, changes);
}

export function copyRegion(project, rect) {
  validateRectangle(project, rect);
  const cells = [];
  for (let row = rect.top; row <= rect.bottom; row++) {
    cells.push(project.grid[row].slice(rect.left, rect.right + 1).map(cell => cell === null ? null : { ...cell }));
  }
  return { width: rect.right - rect.left + 1, height: rect.bottom - rect.top + 1, cells };
}

export function pasteRegion(project, region, top, left, { moveFrom = null } = {}) {
  if (!region || !Array.isArray(region.cells) || !Number.isSafeInteger(top) || !Number.isSafeInteger(left) ||
      top < 0 || left < 0 || top + region.height > project.heightStitches ||
      left + region.width > project.widthStitches || region.cells.length !== region.height ||
      region.cells.some(row => !Array.isArray(row) || row.length !== region.width)) {
    throw new RangeError('Destination hors grille ou zone invalide.');
  }
  const changes = [];
  if (moveFrom) {
    validateRectangle(project, moveFrom);
    if (region.width !== moveFrom.right - moveFrom.left + 1 || region.height !== moveFrom.bottom - moveFrom.top + 1) {
      throw new RangeError('La zone déplacée ne correspond pas à la sélection.');
    }
    for (let r = moveFrom.top; r <= moveFrom.bottom; r++) for (let c = moveFrom.left; c <= moveFrom.right; c++) {
      changes.push({ row: r, column: c, cell: null });
    }
  }
  let overwrites = 0;
  for (let r = 0; r < region.height; r++) for (let c = 0; c < region.width; c++) {
    const row = top + r, column = left + c, current = project.grid[row][column], incoming = region.cells[r][c];
    if (current !== null && !same(current, incoming) &&
        (!moveFrom || row < moveFrom.top || row > moveFrom.bottom || column < moveFrom.left || column > moveFrom.right)) {
      overwrites++;
    }
    changes.push({ row, column, cell: incoming });
  }
  return { ...applyCellChanges(project, changes), overwrites };
}
