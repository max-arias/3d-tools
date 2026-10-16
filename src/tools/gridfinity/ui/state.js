import { createStore } from "../../../shell/store.js";
import { defaultProject } from "../model/defaults.js";
import { createProjectStore } from "../model/history.js";
import { loadStored, projectFromHash, saveStored } from "../model/persist.js";
import { computeGrid } from "../layout/grid.js";
import { planTiles } from "../layout/split.js";
import { run } from "../geom/client.js";

const PREF = "3dtools.gridfinity.";
const pref = {
  get(key, fallback) {
    try {
      return localStorage.getItem(PREF + key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREF + key, value);
    } catch {}
  },
};

// ---- project: URL hash, then localStorage, then defaults -----------------------------

function initialProject() {
  const fromHash = projectFromHash(location.hash);
  if (fromHash) {
    history.replaceState(null, "", location.pathname + location.search);
    return { project: fromHash, lost: false, fromLink: true };
  }
  const stored = loadStored();
  return { project: stored.project ?? defaultProject(), lost: stored.lost };
}

const start = initialProject();
export const openedFromLink = !!projectFromHash(location.hash) || start.fromLink;
export const projects = createProjectStore(start.project);

// ---- UI state --------------------------------------------------------------------------

export const ui = createStore({
  selected: null, // bin id, or null = ALL BINS
  view: "assembled", // assembled | exploded | plates
  dockTab: pref.get("tab", "drawer"),
  advanced: pref.get("advanced", "0") === "1",
  showBins: true,
  showBase: true,
  result: null, // last successful generation
  busy: false,
  error: null,
  partHover: null, // part name
  partSel: null,
  notice: start.lost
    ? "Your last drawer could not be opened, so a new one was started. A copy is kept in this browser."
    : null,
  helpOpen: false,
  mobileView: "top",
  guideStep: -1,
  exports: 0,
  sheet: "half", // phone dock: peek | half | full
  frameNonce: 0,
});

export const setUi = (patch) => ui.set(patch);
export { pref };
export const setDockTab = (tab) => {
  pref.set("tab", tab);
  ui.set({ dockTab: tab });
};
export const setAdvanced = (on) => {
  pref.set("advanced", on ? "1" : "0");
  ui.set({ advanced: on });
};

let noticeTimer;
export function notify(message, ms = 4000) {
  ui.set({ notice: message });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ui.set({ notice: null }), ms);
}

export const selectedBin = () => {
  const { selected } = ui.get();
  return selected ? (projects.get().bins.find((b) => b.id === selected) ?? null) : null;
};

// ---- layout (cheap, main thread) ------------------------------------------------------------

let layoutKey = "";
let layoutValue = null;

/** Grid and tile plan for the current project, or { error } when the drawer cannot be laid out. */
export function getLayout(project = projects.get()) {
  const key = JSON.stringify([project.drawer, project.printer, project.grid]);
  if (key === layoutKey) return layoutValue;
  layoutKey = key;
  try {
    const grid = computeGrid(project);
    layoutValue = { grid, plan: planTiles(grid, project.printer) };
  } catch (e) {
    layoutValue = { error: e.message };
  }
  return layoutValue;
}

// ---- geometry generation -------------------------------------------------------------------------

let seq = 0;
let timer;

function generate() {
  const mine = ++seq;
  ui.set({ busy: true });
  run("drawer", projects.get()).then(
    (result) => {
      if (mine === seq) ui.set({ result, busy: false, error: null });
    },
    (e) => {
      if (mine === seq) ui.set({ busy: false, error: e.message });
    },
  );
}

export function startApp() {
  projects.subscribe((project) => {
    saveStored(project);
    clearTimeout(timer);
    timer = setTimeout(generate, 250);
    // Drop the selection if the bin is gone (undo, delete, share link).
    const { selected } = ui.get();
    if (selected && !project.bins.some((b) => b.id === selected)) ui.set({ selected: null });
  });
  addEventListener("hashchange", () => {
    const p = projectFromHash(location.hash);
    if (!p) return;
    history.replaceState(null, "", location.pathname + location.search);
    projects.replace(p);
    ui.set({ selected: null, frameNonce: ui.get().frameNonce + 1 });
  });
  generate();
}
