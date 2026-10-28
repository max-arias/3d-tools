import LZString from "lz-string";
import { PHOTO_IDS, PHOTO_SIZES } from "./presets.js";
import { PROFILE_IDS } from "../geom/profiles.js";

export const SHAPES = ["rect", "rounded", "oval", "circle", "arch", "polygon"];
export const TEXTURES = ["none", "woodgrain", "hammered", "linen", "reeded"];
export const MAT_EDGES = ["straight", "scalloped", "perforated"];
export const RETENTIONS = ["clip", "slide"];
export const MOUNTS = ["none", "stand", "hanger", "magnets"];

const num = (v, lo, hi, d) =>
  Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, +v)) : d;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);

export function defaultProject() {
  return {
    v: 1,
    photo: { size: "4x6", w: 102, h: 152, landscape: false, overlap: 3 },
    shape: { type: "rect", radius: 10, sides: 6 },
    moulding: { profile: "curve", width: 20, height: 12 },
    rabbet: { clearance: 0.4, lip: 2 },
    stack: { glass: 0, photo: 0.6, back: 2, gap: 0 },
    mat: {
      on: false,
      border: 12,
      thickness: 1.6,
      edge: "straight",
      rows: 1,
      cols: 1,
      gap: 6,
      backer: false,
    },
    retention: "clip",
    mount: { type: "stand", angle: 20, magnetD: 10, magnetH: 2 },
    texture: { type: "none", depth: 0.25, scale: 1, seed: 1 },
    litho: { on: false, min: 0.8, max: 3, invert: false },
    colors: { frame: "#c9a06a", mat: "#f3efe6", back: "#8a6a45" },
    print: { printer: "bambu-p1s", x: 256, y: 256, tol: 0.15 },
  };
}

/** Clamp every field of a raw project (from storage, a share link or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const size = oneOf(r.photo?.size, PHOTO_IDS, d.photo.size);
  const preset = size === "custom" ? null : PHOTO_SIZES[size];
  const shapeType = oneOf(r.shape?.type, SHAPES, d.shape.type);
  const boxy = shapeType === "rect" || shapeType === "rounded";
  const pw = preset ? preset.w : num(r.photo?.w, 10, 600, d.photo.w);
  const ph = preset ? preset.h : num(r.photo?.h, 10, 600, d.photo.h);
  const overlap = num(r.photo?.overlap, 0.8, 15, d.photo.overlap);
  const border = num(r.mat?.border, 2, 80, d.mat.border);
  const small = Math.min(pw, ph);
  const mat = {
    on: !!r.mat?.on,
    border: Math.max(Math.min(border, Math.max(small / 2 - 4, 2)), overlap + 0.8),
    thickness: num(r.mat?.thickness, 0.4, 6, d.mat.thickness),
    edge: oneOf(r.mat?.edge, MAT_EDGES, d.mat.edge),
    rows: boxy ? Math.round(num(r.mat?.rows, 1, 6, 1)) : 1,
    cols: boxy ? Math.round(num(r.mat?.cols, 1, 6, 1)) : 1,
    gap: num(r.mat?.gap, 2, 40, d.mat.gap),
    backer: !!r.mat?.backer,
  };
  return {
    v: 1,
    photo: { size, w: pw, h: ph, landscape: !!r.photo?.landscape, overlap },
    shape: {
      type: shapeType,
      radius: num(r.shape?.radius, 1, 100, d.shape.radius),
      sides: Math.round(num(r.shape?.sides, 3, 12, d.shape.sides)),
    },
    moulding: {
      profile: oneOf(r.moulding?.profile, PROFILE_IDS, d.moulding.profile),
      width: num(r.moulding?.width, 3, 80, d.moulding.width),
      height: num(r.moulding?.height, 4, 60, d.moulding.height),
    },
    rabbet: {
      clearance: num(r.rabbet?.clearance, 0, 2, d.rabbet.clearance),
      lip: num(r.rabbet?.lip, 0.8, 6, d.rabbet.lip),
    },
    stack: {
      glass: num(r.stack?.glass, 0, 4, d.stack.glass),
      photo: num(r.stack?.photo, 0.1, 4, d.stack.photo),
      back: num(r.stack?.back, 1, 6, d.stack.back),
      gap: num(r.stack?.gap, 0, 20, d.stack.gap),
    },
    mat,
    // Slide-in needs a straight top rail to cut the slot through.
    retention: shapeType === "rect" ? oneOf(r.retention, RETENTIONS, d.retention) : "clip",
    mount: {
      type: oneOf(r.mount?.type, MOUNTS, d.mount.type),
      angle: num(r.mount?.angle, 10, 40, d.mount.angle),
      magnetD: num(r.mount?.magnetD, 3, 20, d.mount.magnetD),
      magnetH: num(r.mount?.magnetH, 1, 6, d.mount.magnetH),
    },
    texture: {
      type: oneOf(r.texture?.type, TEXTURES, d.texture.type),
      depth: num(r.texture?.depth, 0.05, 1, d.texture.depth),
      scale: num(r.texture?.scale, 0.3, 4, d.texture.scale),
      seed: Math.round(num(r.texture?.seed, 1, 999, d.texture.seed)),
    },
    litho: {
      on: !!r.litho?.on,
      min: num(r.litho?.min, 0.4, 2, d.litho.min),
      max: num(r.litho?.max, 1.2, 5, d.litho.max),
      invert: !!r.litho?.invert,
    },
    colors: {
      frame: hex(r.colors?.frame, d.colors.frame),
      mat: hex(r.colors?.mat, d.colors.mat),
      back: hex(r.colors?.back, d.colors.back),
    },
    print: {
      printer:
        typeof r.print?.printer === "string" ? r.print.printer.slice(0, 40) : d.print.printer,
      x: num(r.print?.x, 40, 1000, d.print.x),
      y: num(r.print?.y, 40, 1000, d.print.y),
      tol: num(r.print?.tol, 0, 0.5, d.print.tol),
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

const KEY = "3dtools.frames.project";

export function loadProject() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY)));
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
