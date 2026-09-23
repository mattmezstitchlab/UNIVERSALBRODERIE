import { symbolForCell } from './project.mjs';
import { progressAt } from './progress.mjs';

const SVG = 'http://www.w3.org/2000/svg';
export const GRID_GUTTER = 35;
export const axisInterval = (project, cellSize) => cellSize >= 19 ? 1 : project.widthStitches > 80 ? 10 : 5;
const element = (tag, attributes = {}, text = null) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

const inkFor = color => {
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const light = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return light[0] * .2126 + light[1] * .7152 + light[2] * .0722 > .26 ? '#24342d' : '#ffffff';
};

export function renderGrid2D(project, { selected = null, cellSize = 22, showGrid = true,
  highlightThreadId = null, region = null, rowRange = null, mode = 'pattern' } = {}) {
  const margin = GRID_GUTTER, width = margin + project.widthStitches * cellSize + 7;
  const height = margin + project.heightStitches * cellSize + 7;
  const svg = element('svg', {
    xmlns: SVG, viewBox: `0 0 ${width} ${height}`, width, height,
    role: 'grid', tabindex: '0', class: `chart${showGrid ? '' : ' no-lines'}`,
    'aria-label': `Grille de ${project.widthStitches} colonnes et ${project.heightStitches} lignes`,
    'data-positions': project.widthStitches * project.heightStitches,
    'data-cell-size': cellSize, 'data-axis-step': axisInterval(project, cellSize)
  });
  svg.appendChild(element('rect', { x: margin, y: margin, width: project.widthStitches * cellSize,
    height: project.heightStitches * cellSize, fill: '#fffefa' }));
  const labelInterval = axisInterval(project, cellSize);
  for (let col = 0; col < project.widthStitches; col++) {
    if (col % labelInterval && col !== project.widthStitches - 1) continue;
    svg.appendChild(element('text', { x: margin + (col + .5) * cellSize, y: margin - 10,
      'text-anchor': 'middle', class: 'axis-label' }, String(col + 1)));
  }
  for (let row = 0; row < project.heightStitches; row++) {
    if (row % labelInterval && row !== project.heightStitches - 1) continue;
    svg.appendChild(element('text', { x: margin - 11, y: margin + (row + .5) * cellSize + 3,
      'text-anchor': 'end', class: 'axis-label' }, String(row + 1)));
  }
  const threads = new Map(project.palette.map(thread => [thread.threadId, thread]));
  for (let row = 0; row < project.heightStitches; row++) {
    for (let column = 0; column < project.widthStitches; column++) {
      const cell = project.grid[row][column];
      const thread = cell && threads.get(cell.threadId);
      const x = margin + column * cellSize, y = margin + row * cellSize;
      const status = cell ? progressAt(project, row, column) : '';
      const outside = rowRange && (row < rowRange.start || row > rowRange.end);
      const classes = [
        highlightThreadId && thread ? thread.threadId === highlightThreadId ? 'cell-focused' : 'cell-muted' : '',
        outside ? 'cell-outside-reading' : '',
        mode === 'stitch' && status !== 'todo' && status ? `cell-${status}` : ''
      ].filter(Boolean).join(' ');
      const group = element('g', {
        'data-row': row, 'data-column': column, class: classes,
        'data-thread-id': cell?.threadId ?? '', 'data-stitch-type': cell?.stitchType ?? '',
        'data-symbol': symbolForCell(project, row, column) ?? '', 'data-progress': status,
        'data-in-reading-range': outside ? 'false' : 'true', role: 'gridcell',
        'aria-selected': selected?.row === row && selected?.column === column ? 'true' : 'false',
        'aria-label': `Ligne ${row + 1}, colonne ${column + 1} : ${thread ? `${thread.name}, symbole ${thread.symbol}, point de croix${status === 'done' ? ', fait' : status === 'in-progress' ? ', en cours' : ', à faire'}` : 'vide'}`
      });
      group.appendChild(element('rect', { x, y, width: cellSize, height: cellSize,
        fill: thread?.color ?? '#fffefa', class: 'grid-cell' }));
      if (thread) group.appendChild(element('text', { x: x + cellSize / 2, y: y + cellSize / 2 + cellSize * .13,
        'text-anchor': 'middle', 'font-size': Math.max(9, cellSize * .55),
        fill: inkFor(thread.color), class: 'grid-symbol', 'pointer-events': 'none' }, thread.symbol));
      if (thread && mode === 'stitch' && status !== 'todo') {
        group.appendChild(element('text', { x: x + cellSize - 2, y: y + Math.max(7, cellSize * .41),
          'text-anchor': 'end', 'font-size': Math.max(6, cellSize * .38),
          fill: status === 'done' ? '#12613f' : '#90580e', 'font-weight': '900',
          class: 'grid-progress-icon', 'pointer-events': 'none' }, status === 'done' ? '✓' : '•'));
      }
      svg.appendChild(group);
    }
  }
  if (showGrid) {
    const major = element('g', { class: 'major-lines', 'pointer-events': 'none' });
    for (let col = 0; col <= project.widthStitches; col += 10) {
      const x = margin + col * cellSize;
      major.appendChild(element('line', { x1: x, x2: x, y1: margin, y2: margin + project.heightStitches * cellSize }));
    }
    for (let row = 0; row <= project.heightStitches; row += 10) {
      const y = margin + row * cellSize;
      major.appendChild(element('line', { x1: margin, x2: margin + project.widthStitches * cellSize, y1: y, y2: y }));
    }
    svg.appendChild(major);
  }
  if (region && region.top >= 0 && region.left >= 0 && region.bottom < project.heightStitches &&
      region.right < project.widthStitches) {
    svg.appendChild(element('rect', {
      x: margin + region.left * cellSize + 1, y: margin + region.top * cellSize + 1,
      width: (region.right - region.left + 1) * cellSize - 2,
      height: (region.bottom - region.top + 1) * cellSize - 2,
      class: 'region-selection', 'pointer-events': 'none'
    }));
  }
  if (selected && selected.row >= 0 && selected.row < project.heightStitches &&
      selected.column >= 0 && selected.column < project.widthStitches) {
    svg.appendChild(element('rect', {
      x: margin + selected.column * cellSize + 1, y: margin + selected.row * cellSize + 1,
      width: cellSize - 2, height: cellSize - 2,
      class: 'cell-selection', 'pointer-events': 'none'
    }));
  }
  return svg;
}

// Vérification DOM → données, appelée après chaque rendu (et dans les tests navigateur).
export function assertGridViewMatchesProject(svg, project) {
  const cells = svg.querySelectorAll('[data-row][data-column]');
  if (cells.length !== project.widthStitches * project.heightStitches) {
    throw new Error('La vue 2D ne couvre pas toutes les positions de la grille.');
  }
  const threads = new Map(project.palette.map(thread => [thread.threadId, thread]));
  for (const node of cells) {
    const row = Number(node.getAttribute('data-row')), column = Number(node.getAttribute('data-column'));
    const cell = project.grid[row]?.[column] ?? null;
    if (node.getAttribute('data-thread-id') !== (cell?.threadId ?? '') ||
        node.getAttribute('data-stitch-type') !== (cell?.stitchType ?? '') ||
        node.getAttribute('data-symbol') !== (symbolForCell(project, row, column) ?? '') ||
        node.getAttribute('data-progress') !== (cell ? progressAt(project, row, column) : '') ||
        node.querySelector('.grid-cell')?.getAttribute('fill') !== (cell ? threads.get(cell.threadId)?.color : '#fffefa')) {
      throw new Error(`Différence grille/données à la ligne ${row + 1}, colonne ${column + 1}.`);
    }
  }
  return true;
}
