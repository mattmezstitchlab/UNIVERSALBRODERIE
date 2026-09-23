import { stitchesIn } from './project.mjs';
import { progressAt } from './progress.mjs';

// Les filtres concernent uniquement la représentation, jamais grid/progress.
// 'remaining' comprend à faire et en cours : seule une marque « fait » est réalisée.
export function selectVisibleStitches(project, { filter = 'all', rowRange = null, reveal = 100 } = {}) {
  if (!['all', 'done', 'remaining'].includes(filter)) throw new RangeError('Filtre de réalisation inconnu.');
  const stitches = stitchesIn(project).filter(({ row, column }) =>
    (!rowRange || row >= rowRange.start && row <= rowRange.end) &&
    (filter === 'all' || (progressAt(project, row, column) === 'done') === (filter === 'done')));
  return stitches.slice(0, Math.floor(stitches.length * Math.min(100, Math.max(0, reveal)) / 100));
}
