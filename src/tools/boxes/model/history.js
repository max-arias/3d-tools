// Copied from src/tools/letters/model/history.js (TDT-33 dedupes).
const MAX_HISTORY = 100;
const COALESCE_MS = 1000;

/**
 * Project state with undo/redo.
 * `update(fn, key)` edits a clone; edits sharing a key within 1 s merge into one undo step.
 */
export function createProjectStore(initial, now = Date.now) {
  let project = initial;
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(project));

  const set = (next) => {
    project = next;
    emit();
  };

  return {
    get: () => project,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update(fn, key = null) {
      const draft = structuredClone(project);
      fn(draft);
      if (JSON.stringify(draft) === JSON.stringify(project)) return false;
      const t = now();
      const merge = key !== null && key === lastKey && t - lastAt < COALESCE_MS;
      if (!merge) {
        past.push(project);
        if (past.length > MAX_HISTORY) past.shift();
      }
      lastKey = key;
      lastAt = t;
      future = [];
      set(draft);
      return true;
    },
    /** Undoable whole-project replacement (share link applied while editing). */
    replace(next) {
      past.push(project);
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
      lastKey = null;
      set(next);
    },
    /** Fresh start: history cleared. */
    load(next) {
      past = [];
      future = [];
      lastKey = null;
      set(next);
    },
    undo() {
      if (!past.length) return;
      future.push(project);
      lastKey = null;
      set(past.pop());
    },
    redo() {
      if (!future.length) return;
      past.push(project);
      lastKey = null;
      set(future.pop());
    },
  };
}
