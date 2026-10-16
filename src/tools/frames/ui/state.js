import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import { loadProject, sanitize, saveProject } from "../model/project.js";

export const project = createStore(loadProject());
export const result = createStore({ status: "loading", part: null, error: null });
export const view = createStore({ bed: 256 });

/** Apply an edit function to a copy of the project; the result is clamped by `sanitize`. */
export function update(fn) {
  const next = structuredClone(project.get());
  fn(next);
  project.set(sanitize(next));
}

let seq = 0;
let timer;
function generate() {
  const mine = ++seq;
  result.set({ status: "loading" });
  run("generate", project.get()).then(
    (part) => mine === seq && result.set({ status: "ok", part, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export function startApp() {
  project.subscribe((p) => {
    saveProject(p);
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  });
  generate();
}
