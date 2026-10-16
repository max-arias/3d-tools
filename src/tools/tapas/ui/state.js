import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import {
  defaultProject,
  loadProject,
  projectFromHash,
  saveProject,
  sanitize,
} from "../model/project.js";

export const project = createStore(projectFromHash(location.hash) ?? loadProject());
export const result = createStore({ status: "loading", part: null, error: null });
export const view = createStore({ copies: 1, mode: "3d", stock: false });

/** Apply an edit function to a copy of the project; the result is clamped by `sanitize`. */
export function update(fn) {
  const next = structuredClone(project.get());
  fn(next);
  project.set(sanitize(next));
}

export const reset = () => project.set(defaultProject());

let seq = 0;
let timer;
function generate() {
  const mine = ++seq;
  result.set({ status: "loading" });
  run("overlay", project.get()).then(
    (part) => mine === seq && result.set({ status: "ok", part, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  project.subscribe((p) => {
    saveProject(p);
    clearTimeout(timer);
    timer = setTimeout(generate, 200);
  });
  generate();
}
