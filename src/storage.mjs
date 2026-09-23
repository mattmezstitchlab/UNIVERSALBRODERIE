import { parseAtelierProject, serializeAtelierProject } from './atelier-io.mjs';

// Un ouvrage actif sur cet appareil, sans cloud. L'ancienne clé reste lisible.
export const STORAGE_KEY = 'universalbroderie.project.v2';
export const LEGACY_STORAGE_KEY = 'universalbroderie.project.v1';

export function saveLocalProject(project, storage = globalThis.localStorage) {
  // Une grille vide est un brouillon local réparable, pas un patron exportable.
  storage.setItem(STORAGE_KEY, serializeAtelierProject(project, { allowEmpty: true }));
}

export function restoreLocalProject(storage = globalThis.localStorage) {
  const json = storage.getItem(STORAGE_KEY);
  if (json !== null) return parseAtelierProject(json, { allowEmpty: true });
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  return legacy === null ? null : parseAtelierProject(legacy, { allowEmpty: true });
}
