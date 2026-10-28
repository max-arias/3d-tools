import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import { createProjectStore } from "../model/history.js";
import { loadDesigns, saveDesigns } from "../model/library.js";
import { loadProject, projectFromHash, sanitize, saveProject } from "../model/project.js";

const shared = projectFromHash(location.hash);

/** The working design, with undo/redo. */
export const project = createProjectStore(shared ?? loadProject());
export const result = createStore({ status: "loading", part: null, error: null });
/** mode: shaded | wire | xray | section | lit | room. `origin` is the library/custom design opened. */
export const view = createStore({
  mode: "shaded",
  locks: { shape: false, ribs: false, holder: false },
  selected: 0,
  origin: null,
  unit: "mm",
});
export const designs = createStore({ list: loadDesigns() });

/** Apply an edit function to the project; the result is clamped by `sanitize`. */
export function update(fn, key = null) {
  return project.update((draft) => {
    fn(draft);
    Object.assign(draft, sanitize(draft));
  }, key);
}

/** Replace the whole design (library, saved design, random, JSON): one undo step. */
export function replaceProject(next, origin = null) {
  project.replace(sanitize(next));
  view.set({ origin, selected: 0 });
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
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  project.subscribe((p) => {
    saveProject(p);
    clearTimeout(timer);
    timer = setTimeout(generate, 120);
  });
  designs.subscribe(({ list }) => saveDesigns(list));
  generate();
}
