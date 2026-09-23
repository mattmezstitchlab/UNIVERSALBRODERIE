import { validateProject } from './validation.mjs';
import { parseProject } from './io.mjs';

export const ATELIER_SCHEMA_VERSION = 2;
const fields = new Set(['version', 'id', 'name', 'template', 'widthStitches', 'heightStitches',
  'fabric', 'palette', 'grid', 'progress', 'extensions']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Enveloppe V2 : les données du motif ne sont présentes qu'UNE fois dans le fichier.
// serializeProject/parseProject (format plat V1) restent disponibles pour les anciens patrons.
export function serializeAtelierProject(project, { allowEmpty = false } = {}) {
  const report = validateProject(project, { allowEmpty });
  if (!report.valid) throw new Error(`Projet incomplet : ${report.errors.join(' ')}`);
  const unknown = Object.keys(project).filter(key => !fields.has(key));
  if (unknown.length) throw new Error(`Métadonnées non exportables : ${unknown.join(', ')}. Placer les futures données dans extensions.`);
  const meta = { version: project.version, id: project.id, name: project.name,
    template: project.template ?? null, widthStitches: project.widthStitches, heightStitches: project.heightStitches };
  if (project.extensions !== undefined) meta.extensions = project.extensions;
  const document = { schemaVersion: ATELIER_SCHEMA_VERSION, project: meta,
    canvas: project.fabric, palette: project.palette, grid: project.grid,
    progress: project.progress ?? { cells: {} } };
  return JSON.stringify(document, null, 2);
}

export function parseAtelierProject(text, { allowEmpty = false } = {}) {
  let document;
  try { document = JSON.parse(text); }
  catch { throw new Error('Le fichier ne contient pas un JSON valide.'); }
  if (object(document) && document.version === 1 && !Object.hasOwn(document, 'schemaVersion')) {
    return parseProject(text, { allowEmpty }); // anciens exports plats, sans migration destructive
  }
  if (!object(document) || document.schemaVersion !== ATELIER_SCHEMA_VERSION) {
    throw new Error(`Format de projet inconnu : schemaVersion ${ATELIER_SCHEMA_VERSION} attendu.`);
  }
  if (!object(document.project) || !object(document.canvas) || !Array.isArray(document.palette) ||
      !Array.isArray(document.grid) || !object(document.progress) || !object(document.progress.cells)) {
    throw new Error('Export incomplet : projet, toile, palette, grille ou progression manquants.');
  }
  const required = ['version', 'id', 'name', 'template', 'widthStitches', 'heightStitches'];
  if (required.some(key => !Object.hasOwn(document.project, key))) {
    throw new Error('Export incomplet : identifiant, nom ou dimensions du projet manquants.');
  }
  if (Object.keys(document).some(key => !['schemaVersion', 'project', 'canvas', 'palette', 'grid', 'progress'].includes(key)) ||
      Object.keys(document.project).some(key => !['version', ...required, 'extensions'].includes(key))) {
    throw new Error('Champs inconnus dans le format V2 : utiliser extensions ou une nouvelle version de schéma.');
  }
  const project = { version: document.project.version, id: document.project.id, name: document.project.name,
    template: document.project.template, widthStitches: document.project.widthStitches,
    heightStitches: document.project.heightStitches, fabric: document.canvas,
    palette: document.palette, grid: document.grid };
  if (document.project.extensions !== undefined) project.extensions = document.project.extensions;
  if (Object.keys(document.progress.cells).length || Object.keys(document.progress).length > 1) {
    project.progress = document.progress;
  }
  const report = validateProject(project, { allowEmpty });
  if (!report.valid) throw new Error(`Patron à corriger : ${report.errors.join(' ')}`);
  return project;
}

export function assertAtelierRoundTrip(project, json = serializeAtelierProject(project)) {
  const restored = parseAtelierProject(json);
  // Comparaison des six sections canoniques après reconstruction, y compris la
  // progression et les métadonnées d'extensions (absences de statut = à faire).
  if (serializeAtelierProject(restored) !== serializeAtelierProject(project)) {
    throw new Error('Export différent du motif ou de sa progression.');
  }
  return restored;
}
