// L'avancement est distinct de la grille : aucune croix réalisée ne modifie le patron.
// Clés creuses « ligne:colonne » (indices 0-based). Absence = à faire.
export const PROGRESS_STATES = Object.freeze(['todo', 'in-progress', 'done']);
export const progressKey = (row, column) => `${row}:${column}`;

export function progressAt(project, row, column) {
  return project.progress?.cells?.[progressKey(row, column)] ?? 'todo';
}

export function setProgress(project, row, column, status) {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
      row >= project.heightStitches || column >= project.widthStitches || project.grid[row]?.[column] == null) {
    throw new RangeError('La progression doit désigner une croix existante dans la grille.');
  }
  if (!PROGRESS_STATES.includes(status)) throw new RangeError('État de progression inconnu.');
  if (progressAt(project, row, column) === status) return project;
  const cells = { ...project.progress?.cells };
  if (status === 'todo') delete cells[progressKey(row, column)];
  else cells[progressKey(row, column)] = status;
  return { ...project, progress: { cells } };
}

// Après un changement de motif ou de cellule, on ne conserve jamais une réalisation
// liée à une croix effacée ou remplacée par un autre fil.
export function clearProgressAt(project, row, column) {
  const key = progressKey(row, column);
  if (!Object.hasOwn(project.progress?.cells ?? {}, key)) return project.progress;
  const cells = { ...project.progress.cells };
  delete cells[key];
  return { ...project.progress, cells };
}

export function pruneProgress(project, grid) {
  if (!project.progress) return undefined;
  const cells = {};
  for (const [key, status] of Object.entries(project.progress.cells ?? {})) {
    const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
    if (!match) continue;
    const row = Number(match[1]), col = Number(match[2]);
    if (grid[row]?.[col] != null) cells[key] = status;
  }
  return { ...project.progress, cells };
}

export function calculateProgress(project) {
  let total = 0, done = 0, inProgress = 0;
  const doneByThread = Object.fromEntries(project.palette.map(thread => [thread.threadId, 0]));
  for (let row = 0; row < project.heightStitches; row++) {
    for (let column = 0; column < project.widthStitches; column++) {
      const cell = project.grid[row][column];
      if (cell === null) continue;
      total++;
      const status = progressAt(project, row, column);
      if (status === 'done') { done++; doneByThread[cell.threadId]++; }
      else if (status === 'in-progress') inProgress++;
    }
  }
  return { total, done, inProgress, remaining: total - done, todo: total - done - inProgress,
    percent: total ? 100 * done / total : 0, doneByThread };
}
