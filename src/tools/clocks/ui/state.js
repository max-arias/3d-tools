import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import { createProjectStore } from "../model/history.js";
import { geomKey, loadProject, projectFromHash, sanitize, saveProject } from "../model/project.js";

const shared = projectFromHash(location.hash);

/** The working design, with undo/redo. */
export const project = createProjectStore(shared ?? loadProject());
export const result = createStore({ status: "loading", clock: null, error: null });
/**
 * mode: front | back | side | stack (hand-stack section) | plates. `time`: live or frozen at 10:10.
 * `placing`: the hub is being dragged (the stage shows the move before the rebuild).
 */
export const view = createStore({ mode: "front", wire: false, time: "live", placing: false });

/** Apply an edit function to the project; the result is clamped by `sanitize`. */
export function update(fn, key = null) {
  return project.update((draft) => {
    fn(draft);
    Object.assign(draft, sanitize(draft));
  }, key);
}

/** Replace the whole design (JSON, share link, gallery): one undo step. */
export function replaceProject(next) {
  project.replace(sanitize(next));
}

let seq = 0;
let timer;
let lastKey = null;
function generate() {
  const mine = ++seq;
  result.set({ status: "loading" });
  run("generate", project.get()).then(
    (clock) => mine === seq && result.set({ status: "ok", clock, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  lastKey = geomKey(project.get());
  project.subscribe((p) => {
    saveProject(p);
    const key = geomKey(p);
    if (key === lastKey) return; // colours and printer only repaint
    lastKey = key;
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  });
  generate();
}
