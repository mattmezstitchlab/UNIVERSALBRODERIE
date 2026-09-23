import { clearProgressAt, pruneProgress } from './progress.mjs';
import { DMC_PALETTE } from './dmc-palette.mjs';

// Une cellule du patron correspond à une position de point de croix sur la toile.
// Les indices de tableau sont (ligne, colonne), à partir de zéro, depuis le coin haut gauche.
export const MODEL_VERSION = 1;
// Borne technique de l'éditeur SVG interactif, visible dans les champs et dans les erreurs.
export const MAX_GRID_AXIS = 200;
export const SUPPORTED_STITCH_TYPES = Object.freeze(['cross']);

export const TEMPLATES = Object.freeze({
  heart: { name: 'Cœur sauvage', icon: '♥' },
  flower: { name: 'Fleur des champs', icon: '✿' },
  moon: { name: 'Jardin de lune', icon: '☾' }
});

// Palette complète de références DMC disponibles pour le moteur d'import image.
// Les valeurs sont destinées au rendu écran et au calcul de proximité ; elles restent À CONFIRMER
// comme correspondance physique fabricant.
export const BASE_PALETTE = DMC_PALETTE;

const cross = index => ({ threadId: BASE_PALETTE[index].threadId, stitchType: 'cross' });

// Les équations du cœur, des pétales et du croissant sont celles du prototype.
// Seule l'écriture des cellules a changé : null ou { threadId, stitchType }.
export function buildPattern(kind, n) {
  if (!Object.hasOwn(TEMPLATES, kind)) throw new RangeError('Motif inconnu.');
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_GRID_AXIS) throw new RangeError('Taille de grille invalide.');
  const grid = Array.from({ length: n }, () => Array(n).fill(null));
  const mid = (n - 1) / 2;
  if (kind === 'heart') {
    const scale = n * .43;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = (c - mid) / scale, y = (mid - r) / scale;
      const q = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
      if (q <= 0) {
        const edge = Math.abs(q) < .2 || q > -.14;
        if (edge) grid[r][c] = cross(0);
        else if (x < -.28 && y > .16) grid[r][c] = cross(2);
        else if (x > .35 && y < -.12) grid[r][c] = cross(1);
        else grid[r][c] = cross(Math.abs(x) + Math.abs(y) > .82 ? 1 : 2);
      }
    }
    // Brins végétaux autour du cœur, comme dans le générateur original.
    for (let k = 0; k < 7; k++) {
      const r = Math.floor(n * .39 + k * .62), left = Math.floor(n * .20 + k * .4), right = n - 1 - left;
      if (r < n - 2) {
        grid[r][left] = cross(k % 2 ? 3 : 4);
        grid[r][right] = cross(k % 2 ? 4 : 3);
      }
    }
  } else if (kind === 'flower') {
    const cx = mid, cy = mid, scale = n * .29;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const dx = (c - cx) / scale, dy = (r - cy) / scale, rad = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const petal = .64 + .27 * Math.cos(a * 8);
      if (rad < petal) grid[r][c] = cross(rad < .18 ? 5 : (rad > .5 ? 6 : 1));
      const stemX = mid + Math.sin(r * .14) * 2;
      if (r > mid + 4 && Math.abs(c - stemX) < 1.35) grid[r][c] = cross(3);
      if (r > mid + 5 && r < mid + 12 && (Math.abs(c - (mid - 5)) < 1.5 || Math.abs(c - (mid + 5)) < 1.5)) grid[r][c] = cross(4);
    }
  } else {
    const cx = mid - 2, cy = mid;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = (c - cx) / (n * .31), y = (r - cy) / (n * .34);
      const moon = Math.hypot(x, y) < 1 && Math.hypot(x - .43, y - .02) > .79;
      if (moon) grid[r][c] = cross(Math.hypot(x, y) > .84 ? 5 : 6);
      const starPoints = [[.22, .18], [-.48, -.42], [.5, -.5], [-.58, .42], [.35, .58]];
      for (const [sx, sy] of starPoints) if (Math.abs((c - mid) / n - sx) < .025 && Math.abs((r - mid) / n - sy) < .025) grid[r][c] = cross(2);
      if (r > n * .72 && r < n * .84 && Math.abs(c - mid) < 3) grid[r][c] = cross(3);
      if (r > n * .76 && (Math.abs(c - mid - 5) < 2 || Math.abs(c - mid + 5) < 2)) grid[r][c] = cross(4);
    }
  }
  return grid;
}

export function emptyGrid(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_GRID_AXIS || height > MAX_GRID_AXIS) {
    throw new RangeError('Dimensions de grille invalides.');
  }
  return Array.from({ length: height }, () => Array(width).fill(null));
}

export function createProject(kind = 'heart', size = 36, id = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  if (!Object.hasOwn(TEMPLATES, kind)) throw new RangeError('Motif inconnu.');
  return {
    version: MODEL_VERSION,
    id,
    name: TEMPLATES[kind].name,
    template: kind,
    widthStitches: size,
    heightStitches: size,
    fabric: {
      type: 'Aïda',
      // Choix initial explicite et ajustable, non déduit d'une prétendue référence de toile.
      stitchesPerCm: 5.5,
      marginsCm: { top: 5, bottom: 5, left: 5, right: 5 }
    },
    palette: BASE_PALETTE.map(thread => ({ ...thread })),
    grid: buildPattern(kind, size)
  };
}

// Mise à jour immuable : l'ancienne grille ne change pas et aucune seconde grille n'est tenue en mémoire.
export function setCell(project, row, column, cell) {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 ||
      row >= project.heightStitches || column >= project.widthStitches) {
    throw new RangeError('Coordonnées hors grille.');
  }
  if (cell !== null && (!cell || !project.palette.some(thread => thread.threadId === cell.threadId) ||
      !SUPPORTED_STITCH_TYPES.includes(cell.stitchType))) {
    throw new RangeError('Fil ou type de point inconnu.');
  }
  const before = project.grid[row][column];
  if (before === null && cell === null || before && cell &&
      before.threadId === cell.threadId && before.stitchType === cell.stitchType) return project;
  const grid = project.grid.slice();
  grid[row] = grid[row].slice();
  grid[row][column] = cell === null ? null : { threadId: cell.threadId, stitchType: cell.stitchType };
  return { ...project, grid,
    ...(project.progress ? { progress: clearProgressAt(project, row, column) } : {}) };
}

// Le symbole appartient à la palette, jamais à une deuxième copie désynchronisable
// dans la cellule. Ce résolveur donne la représentation symbolique de chaque case.
export function symbolForCell(project, row, column) {
  const cell = project.grid[row]?.[column];
  return cell ? project.palette.find(thread => thread.threadId === cell.threadId)?.symbol ?? null : null;
}

// Redimensionner une grille éditée conserve les cellules aux mêmes coordonnées ; aucun rééchantillonnage fictif.
export function resizeGrid(project, width, height) {
  const grid = emptyGrid(width, height);
  for (let r = 0; r < Math.min(height, project.heightStitches); r++) {
    for (let c = 0; c < Math.min(width, project.widthStitches); c++) grid[r][c] = project.grid[r][c];
  }
  return { ...project, template: null, widthStitches: width, heightStitches: height, grid,
    ...(project.progress ? { progress: pruneProgress(project, grid) } : {}) };
}

export function regenerateTemplate(project, kind, size) {
  if (!Object.hasOwn(TEMPLATES, kind)) throw new RangeError('Motif inconnu.');
  // Conserver les personnalisations de palette et le nom lorsque le même modèle
  // change de taille. Si les fils requis sont absents (JSON étranger au modèle),
  // repartir de la palette du modèle : la confirmation est gérée par l'interface.
  const hasTemplateThreads = BASE_PALETTE.every(seed => project.palette.some(thread => thread.threadId === seed.threadId));
  const palette = hasTemplateThreads ? project.palette.map(thread => ({ ...thread })) :
    BASE_PALETTE.map(thread => ({ ...thread }));
  return { ...project, name: kind === project.template ? project.name : TEMPLATES[kind].name,
    template: kind, widthStitches: size, heightStitches: size, palette, grid: buildPattern(kind, size),
    ...(project.progress ? { progress: { cells: {} } } : {}) };
}

export function stitchesIn(project) {
  const stitches = [];
  project.grid.forEach((line, row) => line.forEach((cell, column) => {
    if (cell !== null) stitches.push({ row, column, threadId: cell.threadId, stitchType: cell.stitchType });
  }));
  return stitches;
}
