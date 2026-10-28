import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import { houseFromHash, loadHouse, newItem, saveHouse, sanitizeHouse } from "../model/house.js";
import { geometryKey, placementKey } from "./drag.js";
import { markEdited } from "../model/provenance.js";
import { projectFromHash, sanitize } from "../model/project.js";
import { t } from "../lib/i18n.js";

// A shared `#h=` link replaces the house in memory; a shared `#p=` cover is added as a new item.
function boot() {
  const shared = houseFromHash(location.hash);
  if (shared) return shared;
  const house = loadHouse();
  const single = projectFromHash(location.hash);
  if (single) {
    const item = newItem(single, t("sharedName"));
    house.items.push(item);
    house.active = item.id;
  }
  return house;
}

const start = boot();
export const house = createStore(start);
export const project = createStore(start.items.find((i) => i.id === start.active).project);
export const result = createStore({ status: "loading", part: null, error: null });
export const view = createStore({ copies: 1, mode: "3d", stock: false });

/** Apply an edit function to a copy of the project; the result is clamped by `sanitize`. */
export function update(fn, { preset = false } = {}) {
  const before = project.get();
  const next = structuredClone(before);
  fn(next);
  // A value you change becomes yours (measured); loading a preset sets its sources itself.
  if (!preset) next.src = markEdited(before, next);
  project.set(sanitize(next));
}

const activeItem = () => house.get().items.find((i) => i.id === house.get().active);

/** Keep the active cover's saved copy in step with the editor. */
function syncActive() {
  const { items, active } = house.get();
  house.set({ items: items.map((i) => (i.id === active ? { ...i, project: project.get() } : i)) });
}

export function selectItem(id) {
  syncActive();
  const item = house.get().items.find((i) => i.id === id);
  if (!item) return;
  house.set({ active: id });
  project.set(structuredClone(item.project));
}

/** Add a cover. `copyCurrent` duplicates the open one; otherwise it starts from defaults. */
export function addItem(copyCurrent) {
  syncActive();
  const base = copyCurrent ? structuredClone(project.get()) : undefined;
  const name = copyCurrent
    ? `${activeItem().name} (2)`
    : `${t("coverName")} ${house.get().items.length + 1}`;
  const item = newItem(base, name.slice(0, 40));
  house.set({ items: [...house.get().items, item], active: item.id });
  project.set(structuredClone(item.project));
}

export function removeItem(id) {
  const { items, active } = house.get();
  if (items.length < 2) return;
  const rest = items.filter((i) => i.id !== id);
  house.set({ items: rest, active: id === active ? rest[0].id : active });
  if (id === active) project.set(structuredClone(rest[0].project));
}

export function patchItem(id, patch) {
  house.set({ items: house.get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export const setHouse = (raw) => {
  const next = sanitizeHouse(raw);
  house.set(next);
  project.set(structuredClone(next.items.find((i) => i.id === next.active).project));
};

// Builds are latest-wins: the worker cannot cancel a job, so while one runs we only remember that
// another is wanted and start it when the first finishes. Dragging holds builds until you let go.
let timer;
let running = false;
let again = false;
let held = false;
let wanted = false;

function generate() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  again = false;
  const snapshot = project.get();
  const geo = geometryKey(snapshot);
  const built = placementKey(snapshot); // what the finished build will contain, for the live preview
  result.set({ status: "loading" });
  run("generate", snapshot)
    .then(
      (part) => result.set({ status: "ok", part, built, geo, error: null }),
      (error) => result.set({ status: "error", error: error.message }),
    )
    .finally(() => {
      running = false;
      if (again && !held) generate();
    });
}

function schedule() {
  if (held) {
    wanted = true;
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(generate, 350); // the live preview covers the wait
}

/** While held, edits do not start builds; releasing starts one straight away if anything changed. */
export function holdGeneration(on) {
  held = on;
  if (!on && wanted) {
    wanted = false;
    clearTimeout(timer);
    generate();
  }
}

export function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  project.subscribe(() => {
    syncActive();
    schedule();
  });
  house.subscribe((h) => saveHouse({ items: h.items, active: h.active }));
  saveHouse(house.get());
  generate();
}
