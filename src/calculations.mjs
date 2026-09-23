// Toutes les valeurs physiques dérivent de la densité déclarée dans le projet.
// Les surfaces décrivent le rectangle du motif et la pièce de toile, pas la surface de fil.
export function calculateMetrics(project) {
  const { widthStitches: width, heightStitches: height, grid, palette, fabric } = project;
  const density = fabric?.stitchesPerCm;
  const margins = fabric?.marginsCm;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      !Number.isFinite(density) || density <= 0 || !margins ||
      !['top', 'bottom', 'left', 'right'].every(side => Number.isFinite(margins[side]) && margins[side] >= 0) ||
      !Array.isArray(grid) || grid.length !== height || !Array.isArray(palette)) {
    throw new RangeError('Dimensions ou structure de projet invalides.');
  }
  const countsByThread = Object.fromEntries(palette.map(thread => [thread.threadId, 0]));
  let crossCount = 0, emptyCount = 0;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== width) throw new RangeError('Grille non rectangulaire.');
    for (const cell of row) {
      if (cell === null) { emptyCount++; continue; }
      if (!cell || cell.stitchType !== 'cross' || !Object.hasOwn(countsByThread, cell.threadId)) {
        throw new RangeError('Cellule ou fil inconnu.');
      }
      crossCount++;
      countsByThread[cell.threadId]++;
    }
  }
  const positionCount = width * height;
  const motifWidthCm = width / density, motifHeightCm = height / density;
  const canvasWidthCm = motifWidthCm + margins.left + margins.right;
  const canvasHeightCm = motifHeightCm + margins.top + margins.bottom;
  return {
    positionCount, crossCount, emptyCount, countsByThread,
    usedColorCount: Object.values(countsByThread).filter(count => count > 0).length,
    motifWidthCm, motifHeightCm, canvasWidthCm, canvasHeightCm,
    motifAreaCm2: motifWidthCm * motifHeightCm,
    canvasAreaCm2: canvasWidthCm * canvasHeightCm
  };
}

// Coordonnées physiques, en cm : origine = coin haut gauche de la pièce de toile.
// (0,0) est la première cellule du motif, décalée des marges gauche et haute.
export function cellCenterCm(project, row, column) {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
      row >= project.heightStitches || column >= project.widthStitches) {
    throw new RangeError('Coordonnées hors grille.');
  }
  const pitch = 1 / project.fabric.stitchesPerCm;
  return {
    x: project.fabric.marginsCm.left + (column + .5) * pitch,
    y: project.fabric.marginsCm.top + (row + .5) * pitch
  };
}
