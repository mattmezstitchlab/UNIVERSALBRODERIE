import { validateProject } from './validation.mjs';

// Le fichier JSON contient le projet canonique, et non un état d'interface ou une image.
// Les métriques ne sont pas dupliquées : elles se recalculent depuis la grille à l'import.
export function serializeProject(project, { allowEmpty = false } = {}) {
  const report = validateProject(project, { allowEmpty });
  if (!report.valid) throw new Error(`Projet incomplet : ${report.errors.join(' ')}`);
  return JSON.stringify(project, null, 2);
}

export function parseProject(text, { allowEmpty = false } = {}) {
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error('Le fichier ne contient pas un JSON valide.'); }
  const report = validateProject(result, { allowEmpty });
  if (!report.valid) throw new Error(`Patron à corriger : ${report.errors.join(' ')}`);
  return result;
}

export function assertProjectRoundTrip(project, json = serializeProject(project)) {
  const imported = parseProject(json);
  // Le JSON conserve aussi bien les cases vides que les identifiants et les types de points.
  if (JSON.stringify(imported) !== JSON.stringify(project)) {
    throw new Error('Export différent de la grille source.');
  }
  return imported;
}
