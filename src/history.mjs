// Historique de modèles immuables (pas de captures du DOM). Une opération de zone
// compte pour une seule étape. Borné pour respecter la mémoire sur de grandes grilles.
export function createHistory(initialProject, limit = 40) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Taille de l’historique invalide.');
  let current = initialProject, past = [], future = [];
  return {
    get project() { return current; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) {
      if (next === current) return current;
      past.push(current);
      if (past.length > limit) past.shift();
      current = next; future = [];
      return current;
    },
    undo() {
      if (!past.length) return current;
      future.push(current); current = past.pop();
      return current;
    },
    redo() {
      if (!future.length) return current;
      past.push(current); current = future.pop();
      return current;
    },
    reset(project) { current = project; past = []; future = []; return current; }
  };
}
