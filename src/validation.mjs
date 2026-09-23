import { MODEL_VERSION, MAX_GRID_AXIS, SUPPORTED_STITCH_TYPES } from './project.mjs';
import { PROGRESS_STATES } from './progress.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const MAX_ERRORS = 24;

// Contrôle central utilisé par l'interface, les imports, les exports et la fiche.
// Une grille sans croix peut être conservée en brouillon local, mais pas exportée comme patron.
export function validateProject(project, { allowEmpty = false } = {}) {
  const errors = [], warnings = [];
  const error = message => { if (errors.length < MAX_ERRORS) errors.push(message); };
  if (!object(project)) return { valid: false, label: 'À CORRIGER', errors: ['Le projet doit être un objet.'], warnings };
  if (project.version !== MODEL_VERSION) error(`Version du modèle absente ou incompatible (attendu : ${MODEL_VERSION}).`);
  if (!nonempty(project.id)) error('Identifiant de projet manquant.');
  if (!nonempty(project.name)) error('Nom du motif manquant.');
  const width = project.widthStitches, height = project.heightStitches;
  if (!Number.isSafeInteger(width) || width < 1 || width > MAX_GRID_AXIS) error(`Largeur invalide : 1 à ${MAX_GRID_AXIS} points entiers.`);
  if (!Number.isSafeInteger(height) || height < 1 || height > MAX_GRID_AXIS) error(`Hauteur invalide : 1 à ${MAX_GRID_AXIS} points entiers.`);
  if (!object(project.fabric)) error('Type de toile, densité et marges manquants.');
  else {
    if (!nonempty(project.fabric.type)) error('Type de toile manquant.');
    const density = project.fabric.stitchesPerCm;
    if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0 || density > 100) {
      error('Densité invalide : renseigner des points/cm positifs (maximum 100).');
    }
    const margins = project.fabric.marginsCm;
    if (!object(margins)) error('Marges de la toile manquantes.');
    else for (const side of ['top', 'bottom', 'left', 'right']) {
      if (typeof margins[side] !== 'number' || !Number.isFinite(margins[side]) || margins[side] < 0 || margins[side] > 100) {
        error(`Marge ${side} invalide : 0 à 100 cm.`);
      }
    }
  }

  const ids = new Set(), symbols = new Set(), unverified = [];
  if (!Array.isArray(project.palette) || project.palette.length === 0) error('Palette de fils absente ou vide.');
  else for (let i = 0; i < project.palette.length; i++) {
    const thread = project.palette[i], label = `Fil ${i + 1}`;
    if (!object(thread)) { error(`${label} invalide.`); continue; }
    if (!nonempty(thread.threadId)) error(`${label} : threadId manquant.`);
    else if (ids.has(thread.threadId)) error(`${label} : threadId en double (${thread.threadId}).`);
    else ids.add(thread.threadId);
    if (!nonempty(thread.name)) error(`${label} : nom manquant.`);
    if (!nonempty(thread.reference)) error(`${label} : référence manquante (ne pas en inventer).`);
    if (!/^#[0-9a-fA-F]{6}$/.test(thread.color ?? '')) error(`${label} : couleur hexadécimale absente ou invalide.`);
    if (!nonempty(thread.symbol)) error(`${label} : symbole de grille manquant.`);
    else if (symbols.has(thread.symbol)) error(`${label} : symbole ${thread.symbol} déjà utilisé.`);
    else symbols.add(thread.symbol);
    if (!['À CONFIRMER', 'VÉRIFIÉE'].includes(thread.referenceStatus)) error(`${label} : statut de référence absent ou inconnu.`);
    if (thread.brand != null && !nonempty(thread.brand)) error(`${label} : marque de fil invalide.`);
    if (thread.code != null && !nonempty(thread.code)) error(`${label} : code de fil invalide.`);
    if (thread.source != null && !nonempty(thread.source)) error(`${label} : source de référence invalide.`);
    if (thread.verifiedAt != null && (typeof thread.verifiedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T/.test(thread.verifiedAt) || Number.isNaN(Date.parse(thread.verifiedAt)))) {
      error(`${label} : date de vérification invalide.`);
    }
    if (thread.referenceStatus === 'VÉRIFIÉE' && !nonempty(thread.source) && !nonempty(thread.referenceSource)) {
      error(`${label} : source de vérification de la référence manquante.`);
    }
    if (thread.referenceStatus === 'À CONFIRMER' && thread.verifiedAt != null) {
      error(`${label} : date de vérification incompatible avec À CONFIRMER.`);
    }
    if (thread.referenceStatus === 'À CONFIRMER') unverified.push(thread.name ?? label);
  }
  if (unverified.length) warnings.push(`${unverified.length} référence(s) de fil À CONFIRMER : ${unverified.join(', ')}.`);

  let occupied = 0;
  if (!Array.isArray(project.grid) || project.grid.length === 0) error('Grille vide ou absente.');
  else {
    if (Number.isSafeInteger(height) && project.grid.length !== height) {
      error(`Hauteur incohérente : ${project.grid.length} ligne(s) pour ${height} attendue(s) ; coordonnées hors grille possibles.`);
    }
    for (let row = 0; row < project.grid.length && row < MAX_GRID_AXIS; row++) {
      const line = project.grid[row];
      if (!Array.isArray(line)) { error(`Ligne ${row + 1} invalide.`); continue; }
      if (Number.isSafeInteger(width) && line.length !== width) {
        error(`Largeur incohérente ligne ${row + 1} : ${line.length} cellule(s) pour ${width} attendue(s) ; coordonnées hors grille possibles.`);
      }
      for (let column = 0; column < line.length && column < MAX_GRID_AXIS; column++) {
        if (!Object.hasOwn(line, column)) { error(`Cellule absente ligne ${row + 1}, colonne ${column + 1}.`); continue; }
        const cell = line[column];
        if (cell === null) continue;
        occupied++;
        const location = `Ligne ${row + 1}, colonne ${column + 1}`;
        if (!object(cell)) { error(`${location} : cellule invalide.`); continue; }
        if (!nonempty(cell.threadId) || !ids.has(cell.threadId)) error(`${location} : threadId inexistant ou manquant.`);
        if (!SUPPORTED_STITCH_TYPES.includes(cell.stitchType)) error(`${location} : type de point inconnu (${String(cell.stitchType)}).`);
        if ((Object.hasOwn(cell, 'row') && cell.row !== row) ||
            (Object.hasOwn(cell, 'column') && cell.column !== column)) error(`${location} : coordonnées hors grille ou incohérentes.`);
        if (Object.hasOwn(cell, 'order') && (!Number.isSafeInteger(cell.order) || cell.order < 1)) {
          error(`${location} : ordre de réalisation invalide.`);
        }
      }
    }
  }
  if (project.progress !== undefined) {
    if (!object(project.progress) || !object(project.progress.cells)) error('Progression invalide : cellules de réalisation manquantes.');
    else for (const [key, status] of Object.entries(project.progress.cells)) {
      const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
      const row = match ? Number(match[1]) : -1, col = match ? Number(match[2]) : -1;
      if (!match || !Number.isSafeInteger(row) || !Number.isSafeInteger(col) ||
          row >= height || col >= width || project.grid?.[row]?.[col] == null) {
        error(`Progression ${key} : coordonnées hors grille ou croix absente.`);
      }
      if (!PROGRESS_STATES.includes(status) || status === 'todo') {
        error(`Progression ${key} : état inconnu (utiliser en cours ou fait ; à faire est implicite).`);
      }
    }
  }
  if (project.extensions !== undefined && !object(project.extensions)) error('Extensions du projet invalides.');
  if (!allowEmpty && occupied === 0 && Array.isArray(project.grid) && project.grid.length > 0) {
    error('La grille ne contient aucune croix : ajoutez un point avant de produire un patron.');
  }
  if (errors.length === MAX_ERRORS) errors.push('Autres anomalies possibles ; corriger d’abord celles ci-dessus.');
  return { valid: errors.length === 0, label: errors.length ? 'À CORRIGER' : 'VALIDE', errors, warnings };
}
