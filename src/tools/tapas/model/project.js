import LZString from "lz-string";
import { MODULES, MODULE_IDS } from "./modules.js";
import { PRESETS, presetById } from "./presets.js";
import { SHAPE_IDS } from "../geom/shapes.js";
import { PATTERN_IDS } from "../geom/patterns.js";
import { ICON_IDS } from "../geom/icons.js";

export const PATTERN_MODES = ["inlay", "engraved", "cutthrough", "raised"];
export const PRODUCTS = ["overlay", "tapa", "keycap", "frame"];

const STORE_KEY = "3dtools.tapas.project";

export function defaultProject() {
  const p = presetById("cambre-xxi");
  return {
    v: 1,
    product: "overlay",
    preset: p.id,
    plate: { ...p.plate },
    mods: { pitch: 22.5, slots: p.slots, margin: 0.6 },
    groups: [["tecla", "tecla", "tecla"]],
    overlay: { shape: "rounded", corner: 6, wall: 2.4, face: 2, clearance: 0.3 },
    printer: { x: 256, y: 256 },
    frame: { h: 8 },
    tapa: {
      face: 3,
      skirt: 6,
      wall: 2,
      boxW: 71,
      boxH: 114,
      clearance: 0.25,
      bump: 0.5,
      winMargin: 0,
    },
    keycap: {
      w: 19,
      l: 38,
      h: 5,
      r: 2.5,
      wall: 1.6,
      face: 1.6,
      clearance: 0.25,
      style: "bevel",
      icon: "none",
      text: "1",
      iconMode: "inlay",
      iconSize: 12,
      iconDepth: 0.6,
    },
    pattern: { id: "none", mode: "inlay", scale: 10, weight: 0.5, rot: 0, margin: 2.5, depth: 0.8 },
    color: "#e9e4d8",
    color2: "#c9442f",
    wall: "#b9c4cc",
  };
}

const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** Clamp every field into a range the geometry can handle; unknown input falls back to defaults. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const plate = r.plate ?? {};
  const mods = r.mods ?? {};
  const ov = r.overlay ?? {};
  const slots = Math.round(num(mods.slots, 1, 6, d.mods.slots));
  const groupCount = Array.isArray(r.groups) ? Math.min(3, Math.max(1, r.groups.length)) : 1;
  const groups = Array.from({ length: groupCount }, (_, i) =>
    (Array.isArray(r.groups?.[i]) ? r.groups[i] : d.groups[0])
      .map((m) => oneOf(m, MODULE_IDS, "tecla"))
      .slice(0, 6),
  );
  const fr = r.frame ?? {};
  const tp = r.tapa ?? {};
  const kc = r.keycap ?? {};
  return {
    v: 1,
    product: oneOf(r.product, PRODUCTS, "overlay"),
    preset: oneOf(
      r.preset,
      PRESETS.map((p) => p.id),
      d.preset,
    ),
    plate: {
      w: num(plate.w, 30, 300, d.plate.w),
      h: num(plate.h, 30, 300, d.plate.h),
      d: num(plate.d, 2, 30, d.plate.d),
      r: num(plate.r, 0, 30, d.plate.r),
    },
    mods: {
      pitch: num(mods.pitch, 15, 40, d.mods.pitch),
      slots,
      margin: num(mods.margin, 0, 3, d.mods.margin),
    },
    groups,
    overlay: {
      shape: oneOf(ov.shape, SHAPE_IDS, d.overlay.shape),
      corner: num(ov.corner, 0, 40, d.overlay.corner),
      wall: num(ov.wall, 1.2, 8, d.overlay.wall),
      face: num(ov.face, 1, 6, d.overlay.face),
      clearance: num(ov.clearance, 0, 1.5, d.overlay.clearance),
    },
    printer: {
      x: num(r.printer?.x, 50, 1000, d.printer.x),
      y: num(r.printer?.y, 50, 1000, d.printer.y),
    },
    frame: { h: num(fr.h, 2, 30, d.frame.h) },
    tapa: {
      face: num(tp.face, 1.6, 8, d.tapa.face),
      skirt: num(tp.skirt, 2, 20, d.tapa.skirt),
      wall: num(tp.wall, 1.2, 5, d.tapa.wall),
      boxW: num(tp.boxW, 30, 200, d.tapa.boxW),
      boxH: num(tp.boxH, 30, 250, d.tapa.boxH),
      clearance: num(tp.clearance, 0, 1, d.tapa.clearance),
      bump: num(tp.bump, 0, 1.2, d.tapa.bump),
      winMargin: num(tp.winMargin, -1, 2, d.tapa.winMargin),
    },
    keycap: {
      w: num(kc.w, 8, 60, d.keycap.w),
      l: num(kc.l, 8, 80, d.keycap.l),
      h: num(kc.h, 2, 20, d.keycap.h),
      r: num(kc.r, 0, 15, d.keycap.r),
      wall: num(kc.wall, 1.2, 4, d.keycap.wall),
      face: num(kc.face, 1, 5, d.keycap.face),
      clearance: num(kc.clearance, 0, 1, d.keycap.clearance),
      style: oneOf(kc.style, ["flat", "bevel"], "bevel"),
      icon: oneOf(kc.icon, ["none", ...ICON_IDS], "none"),
      text: String(kc.text ?? d.keycap.text).slice(0, 6),
      iconMode: oneOf(kc.iconMode, PATTERN_MODES, "inlay"),
      iconSize: num(kc.iconSize, 4, 40, d.keycap.iconSize),
      iconDepth: num(kc.iconDepth, 0.4, 1.6, d.keycap.iconDepth),
    },
    pattern: {
      id: oneOf(r.pattern?.id, ["none", ...PATTERN_IDS], "none"),
      mode: oneOf(r.pattern?.mode, PATTERN_MODES, "inlay"),
      scale: num(r.pattern?.scale, 4, 40, d.pattern.scale),
      weight: num(r.pattern?.weight, 0.15, 0.85, d.pattern.weight),
      rot: num(r.pattern?.rot, 0, 180, 0),
      margin: num(r.pattern?.margin, 1, 8, d.pattern.margin),
      depth: num(r.pattern?.depth, 0.4, 1.6, d.pattern.depth),
    },
    color: hex(r.color, d.color),
    color2: hex(r.color2, d.color2),
    wall: hex(r.wall, d.wall),
  };
}

/** Slots used by one group's modules. */
export const usedSlots = (group) => group.reduce((n, m) => n + MODULES[m].span, 0);

export function loadProject() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORE_KEY)));
  } catch {
    return defaultProject();
  }
}

export function saveProject(project) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(project));
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
