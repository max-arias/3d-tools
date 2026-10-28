import LZString from "lz-string";
import { boxDims, clampGrid, LATCH_COUNTS, MAX, MIN } from "../geom/dims.js";

export const HINGES = ["pin", "screw"];
export const HANDLE_FIX = ["bolt", "pin"];
export const MAX_LABEL = 24;
export const MAX_LINES = 4;
export const MAX_DIVIDERS = 5;

const num = (v, lo, hi, d) =>
  Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, +v)) : d;
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const text = (v, max) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .slice(0, max);

export function defaultProject() {
  return {
    v: 1,
    grid: { x: 5, y: 4, u: 6 },
    latches: 2,
    hinge: "pin",
    handle: { on: true, fix: "bolt" },
    label: { title: "", lines: [] },
    bins: [],
    pack: null,
    fit: { tolerance: 0 },
    printer: "bambu-p1s",
    build: { x: 256, y: 256, z: 256 },
  };
}

/** Whole-cell bins inside the grid; a bin that overlaps an earlier one is dropped. */
export function cleanBins(raw, grid) {
  const out = [];
  const taken = new Set();
  let id = 1;
  for (const b of Array.isArray(raw) ? raw : []) {
    const w = int(b?.w, 1, grid.x, 1);
    const d = int(b?.d, 1, grid.y, 1);
    const x = int(b?.x, 0, grid.x - w, 0);
    const y = int(b?.y, 0, grid.y - d, 0);
    const cells = [];
    for (let i = x; i < x + w; i++) for (let j = y; j < y + d; j++) cells.push(`${i},${j}`);
    if (cells.some((c) => taken.has(c))) continue;
    cells.forEach((c) => taken.add(c));
    out.push({
      id: id++,
      x,
      y,
      w,
      d,
      dividersX: int(b?.dividersX, 0, MAX_DIVIDERS, 0),
      dividersY: int(b?.dividersY, 0, MAX_DIVIDERS, 0),
      scoop: bool(b?.scoop, false),
      label: bool(b?.label, false),
    });
  }
  return out;
}

/** Clamp every field of a raw project (storage, share link, JSON or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const grid = clampGrid({ ...d.grid, ...r.grid });
  return {
    v: 1,
    grid,
    latches: LATCH_COUNTS.includes(+r.latches) ? +r.latches : d.latches,
    hinge: oneOf(r.hinge, HINGES, d.hinge),
    handle: {
      on: bool(r.handle?.on, d.handle.on),
      fix: oneOf(r.handle?.fix, HANDLE_FIX, d.handle.fix),
    },
    label: {
      title: text(r.label?.title, MAX_LABEL),
      lines: (Array.isArray(r.label?.lines) ? r.label.lines : [])
        .slice(0, MAX_LINES)
        .map((l) => text(l, MAX_LABEL)),
    },
    bins: cleanBins(r.bins, grid),
    pack: typeof r.pack === "string" ? r.pack : null,
    fit: { tolerance: num(r.fit?.tolerance, -0.2, 0.4, d.fit.tolerance) },
    printer: typeof r.printer === "string" ? r.printer : d.printer,
    build: {
      x: num(r.build?.x, 50, 1000, d.build.x),
      y: num(r.build?.y, 50, 1000, d.build.y),
      z: num(r.build?.z, 50, 1000, d.build.z),
    },
  };
}

/** Deep-merge `patch` into a copy of `base` (objects merge, everything else replaces). */
export function merge(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(out[k] ?? {}, v) : v;
  }
  return out;
}

/** The fields that change the geometry; edits that leave this key alone skip the worker. */
export const geomKey = (p) =>
  JSON.stringify([p.grid, p.latches, p.hinge, p.handle, p.label, p.bins, p.fit]);

/** Whether a footprint [x, y] fits the plate, turned 90 degrees if that helps. */
export function fitsBed(size, build) {
  const [w, h] = size;
  return (w <= build.x && h <= build.y) || (h <= build.x && w <= build.y);
}

/** The base is the biggest print: does it fit this printer, and how tall does the box get? */
export function boxFits(project) {
  const d = boxDims(project.grid);
  return { base: fitsBed([d.W, d.D], project.build) && d.baseH <= project.build.z, dims: d };
}

/** Largest grid that still fits the plate, for the size controls. */
export function maxGrid(build) {
  const fit = (n) => Math.max(...[build.x, build.y].map((s) => Math.floor((s - 20) / 42))) >= n;
  let x = MIN.x;
  while (x < MAX.x && fit(x + 1)) x++;
  return { x, y: Math.min(MAX.y, Math.floor((Math.min(build.x, build.y) - 20) / 42)) };
}

const KEY = "3dtools.boxes.project";

export function loadProject() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? sanitize(JSON.parse(stored)) : defaultProject();
  } catch {
    return defaultProject();
  }
}

export function saveProject(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export const encodeShare = (project) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(project));

export function projectFromHash(hash) {
  const m = /^#p=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    return json ? sanitize(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

/** The settings file: the project plus a marker so a stray JSON is rejected. */
export const toSettingsJson = (project) =>
  JSON.stringify({ app: "3dtools-boxes", ...project }, null, 2);

export function fromSettingsJson(raw) {
  const p = JSON.parse(raw);
  if (p?.app !== "3dtools-boxes") throw new Error("Not a Boxes settings file");
  return sanitize(p);
}
