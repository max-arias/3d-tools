import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import { createProjectStore } from "../model/history.js";
import { geomKey, loadProject, projectFromHash, sanitize, saveProject } from "../model/project.js";

const shared = projectFromHash(location.hash);

/** The working design, with undo/redo. */
export const project = createProjectStore(shared ?? loadProject());
/** `data` is the last good { dims, parts, issues, scene } and stays while the next one builds. */
export const result = createStore({ status: "loading", data: null, error: null });
/** open: the lid is lifted off in the 3D view. */
export const view = createStore({ open: false });
/** The bin selected in the bin editor, by id. */
export const sel = createStore({ id: null });

/** Apply an edit function to the project; the result is clamped by `sanitize`. */
export function update(fn, key = null) {
  return project.update((draft) => {
    fn(draft);
    Object.assign(draft, sanitize(draft));
  }, key);
}

/** Replace the whole design (JSON, share link): one undo step. */
export function replaceProject(next) {
  project.replace(sanitize(next));
}

/** Remove a bin; the pack is no longer exactly the one that was loaded. */
export function removeBin(id) {
  update((d) => {
    d.bins = d.bins.filter((b) => b.id !== id);
    d.pack = null;
  });
  sel.set({ id: null });
}

// A selection that no longer exists (undo, a smaller grid) is dropped.
project.subscribe((p) => {
  const id = sel.get().id;
  if (id != null && !p.bins.some((b) => b.id === id)) sel.set({ id: null });
});

let seq = 0;
let timer;
let lastKey = null;
function generate() {
  const mine = ++seq;
  result.set({ status: "loading" });
  run("generate", project.get()).then(
    (data) => mine === seq && result.set({ status: "ok", data, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  lastKey = geomKey(project.get());
  project.subscribe((p) => {
    saveProject(p);
    const key = geomKey(p);
    if (key === lastKey) return; // printer and pack name do not change the geometry
    lastKey = key;
    clearTimeout(timer);
    timer = setTimeout(generate, 120);
  });
  generate();
}
