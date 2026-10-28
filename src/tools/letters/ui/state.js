import { createStore } from "../../../shell/store.js";
import { loadCustomFont, saveCustomFont } from "../lib/customFont.js";
import { run } from "../lib/client.js";
import { createProjectStore } from "../model/history.js";
import { geomKey, loadProject, projectFromHash, sanitize, saveProject } from "../model/project.js";

const shared = projectFromHash(location.hash);

/** The working design, with undo/redo. */
export const project = createProjectStore(shared ?? loadProject());
export const result = createStore({ status: "loading", part: null, error: null });
/** mode: assembled | plates. `lid` shows the lids, `wire` draws the mesh, `leds` previews effect `fx`. */
export const view = createStore({
  mode: "assembled",
  lid: false,
  wire: false,
  leds: false,
  fx: "rainbow",
  speed: null,
});

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

/** Give the worker an uploaded font, remember it, and switch the project to it. */
export async function useCustomFont(file) {
  const bytes = await file.arrayBuffer();
  await run("font", null, bytes.slice(0)); // throws when the file is not a font
  await saveCustomFont(bytes);
  update((d) => {
    d.source.font = "custom";
    d.source.customName = file.name;
  });
}

let seq = 0;
let timer;
let lastKey = null;
function generate() {
  const mine = ++seq;
  result.set({ status: "loading" });
  run("generate", project.get()).then(
    (part) => mine === seq && result.set({ status: "ok", part, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export async function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  const bytes = await loadCustomFont();
  if (bytes) await run("font", null, bytes).catch(() => {});
  lastKey = geomKey(project.get());
  project.subscribe((p) => {
    saveProject(p);
    const key = geomKey(p);
    if (key === lastKey) return; // printer and build size do not change the geometry
    lastKey = key;
    clearTimeout(timer);
    timer = setTimeout(generate, 120);
  });
  generate();
}
