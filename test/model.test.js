import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { defaultProject } from "../src/tools/gridfinity/model/defaults.js";
import { effectiveBin } from "../src/tools/gridfinity/model/effective.js";
import { createProjectStore } from "../src/tools/gridfinity/model/history.js";
import {
  BACKUP_KEY,
  decodeShare,
  encodeShare,
  importJson,
  exportJson,
  loadStored,
  saveStored,
  STORAGE_KEY,
} from "../src/tools/gridfinity/model/persist.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m };
};

test("sanitize clamps ranges, snaps cells to halves and drops invalid bins", () => {
  const p = sanitize({
    drawer: { w: 99999, d: -5, h: "x" },
    bins: [
      { id: "a", x: 0.26, y: 0, w: 0, d: 1000 },
      { id: "a", x: 1, y: 1, w: 1, d: 1 },
      { id: "bad id!", x: 0, y: 0, w: 1, d: 1 },
    ],
  });
  expect(p.drawer).toMatchObject({ w: 3000, d: 50, h: 180 });
  expect(p.bins).toEqual([{ id: "a", x: 0.5, y: 0, w: 0.5, d: 200 }]);
});

test("overrides equal to defaults are pruned; effective params merge per wall", () => {
  const p = sanitize({
    bins: [
      {
        id: "a",
        x: 0,
        y: 0,
        w: 2,
        d: 2,
        overrides: { units: 6, lip: false, grab: { front: { notch: true, notchD: 15 } } },
      },
    ],
  });
  expect(p.bins[0].overrides).toEqual({ lip: false, grab: { front: { notch: true } } });
  const eff = effectiveBin(p, p.bins[0]);
  expect(eff.lip).toBe(false);
  expect(eff.grab.front).toMatchObject({ notch: true, notchW: 20 });
  expect(eff.grab.back.notch).toBe(false);
});

test("custom grid mode derives height in mm from units", () => {
  const p = sanitize({
    grid: { mode: "custom" },
    bins: [{ id: "a", x: 0, y: 0, w: 1, d: 1, overrides: { units: 4 } }],
  });
  expect(effectiveBin(p, p.bins[0]).heightMm).toBe(28);
});

test("share link round-trips and only encodes differences", () => {
  const p = sanitize({ drawer: { w: 400 }, bins: [{ id: "b1", x: 0, y: 0, w: 2, d: 2 }] });
  expect(decodeShare(encodeShare(p))).toEqual(p);
  expect(encodeShare(defaultProject()).length).toBeLessThan(20);
});

test("opens a real Fitforge share link", () => {
  const hash = readFileSync(new URL("./fixtures/fitforge-example.hash", import.meta.url), "utf8");
  const p = decodeShare(hash);
  expect(p.bins).toHaveLength(13);
  expect(p.drawer.w).toBe(560);
  const b5 = p.bins.find((b) => b.id === "b5");
  expect(b5.overrides).toMatchObject({ dividersX: 2, dividersY: 1, label: "front" });
  expect(b5.overrides.grab.front).toEqual({ notch: true, notchD: 12, notchR: 5, scoop: true });
});

test("unreadable stored project is backed up, not lost", () => {
  const s = memory();
  s.setItem(STORAGE_KEY, "{not json");
  expect(loadStored(s)).toEqual({ project: null, lost: true });
  expect(s._m.get(BACKUP_KEY)).toBe("{not json");
  const p = defaultProject();
  saveStored(p, s);
  expect(loadStored(s).project).toEqual(p);
});

test("project file round-trips", () => {
  const p = sanitize({ printer: { x: 300, y: 300, preset: "custom" } });
  expect(importJson(exportJson(p))).toEqual(p);
});

test("undo/redo with 1 s coalescing of keyed edits", () => {
  let t = 0;
  const store = createProjectStore(defaultProject(), () => t);
  store.update((p) => {
    p.drawer.w = 500;
  }, "dw");
  t = 400;
  store.update((p) => {
    p.drawer.w = 510;
  }, "dw");
  t = 5000;
  store.update((p) => {
    p.drawer.w = 520;
  }, "dw");
  expect(
    store.update((p) => {
      p.drawer.w = 520;
    }, "dw"),
  ).toBe(false);
  store.undo();
  expect(store.get().drawer.w).toBe(510);
  store.undo();
  expect(store.get().drawer.w).toBe(560);
  store.redo();
  expect(store.get().drawer.w).toBe(510);
  store.update((p) => {
    p.drawer.d = 300;
  });
  expect(store.canRedo()).toBe(false);
});
