import LZString from "lz-string";
import { sanitizeArt } from "../../tapas/model/project.js"; // same stored art format (TDT-33 dedupes)
import { CUTOUTS } from "../dial/cutouts.js";
import { HAND_STYLES } from "../dial/hands.js";
import { NUMERALS, TICKS } from "../dial/markers.js";
import { PRESET_IDS } from "../dial/outline.js";
import { MOVEMENTS, MOVEMENT_IDS, movementById } from "./movements.js";

export const SHAPE_KINDS = ["preset", "svg", "art"];
export const BORDERS = ["none", "flat", "double"];
export const TYPES = ["wall", "desk", "wallDesk", "magnet", "twoSided"];
export const STYLES = ["flat", "relief", "ribs"];
export const DECOR = ["inlay", "raised"];
export const FINISHES = ["inlay", "raised", "engraved", "through"];
export const BACKS = ["none", "housing", "rim"];
export const HANGERS = ["keyhole", "two", "movement"];
export const STANDS = ["cradle", "foot"];
export const FONTS = ["anton", "archivo"];
export const MAX_SLOTS = 8;
/** Longest SVG outline kept in a project (points over all rings). */
export const MAX_SVG_POINTS = 40000;

const num = (v, lo, hi, d) =>
  Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, +v)) : d;
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const hex = (v, d) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);

/** The editable sizes of a movement preset. */
export const movementFields = (m) => ({
  preset: m.id,
  body: [...m.body],
  dialHole: m.dialHole,
  maxDial: m.maxDial,
  hour: m.hour,
  minute: m.minute,
  minuteFlat: m.minuteFlat,
  hourAt: m.hourAt,
  minuteAt: m.minuteAt,
  secondAt: m.secondAt,
  torque: m.torque,
  clearance: 0.4,
});

export function defaultProject() {
  return {
    v: 1,
    shape: {
      kind: "preset",
      preset: "circle",
      svg: null,
      width: 200,
      border: { kind: "flat", w: 6 },
      hub: [0, 0],
    },
    art: null,
    artPlace: { size: 0, x: 0, y: 0, rot: 0 },
    type: "wall",
    style: "flat",
    face: { thickness: 4, decor: "inlay", inlay: 0.6, raised: 1, ribPitch: 9 },
    back: {
      kind: "housing",
      hanger: "keyhole",
      magnet: { d: 10, h: 3, n: 4 },
      stand: "cradle",
      angle: 12,
    },
    markers: {
      numerals: "arabic",
      hours: 12,
      reverse: false,
      orient: "upright",
      font: "anton",
      size: 0,
      ticks: "lines",
      minutes: false,
      path: "circle",
      inset: 6,
      finish: "inlay",
      text: "",
      textSize: 7,
    },
    hands: {
      print: true,
      style: "spade",
      thickness: 1.8,
      hour: { length: 0, width: 0 },
      minute: { length: 0, width: 0 },
      second: false,
      tail: true,
      glow: false,
      fit: 0,
    },
    cutouts: { kind: "none", seed: 7, count: 24, size: 14 },
    colors: {
      slots: ["#f2efe8", "#d6453d", "#5b3a29", "#1f1f22"],
      face: 0,
      border: 1,
      markers: 3,
      hands: 2,
      glow: 0,
      art: [],
    },
    movement: movementFields(MOVEMENTS[0]),
    leds: { halo: false, chip: "ws2812b", density: 60, stripWidth: 10 },
    twoSided: { arm: 110 },
    printer: "bambu-p1s",
    build: { x: 256, y: 256, z: 256 },
  };
}

/** SVG outline rings [{ rule, rings }] (file units, y down) within the point cap, or null. */
function cleanSvg(raw) {
  if (!Array.isArray(raw)) return null;
  let points = 0;
  const out = [];
  for (const entry of raw) {
    const rings = [];
    for (const ring of Array.isArray(entry?.rings) ? entry.rings : []) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const pts = ring.map((p) => [+p?.[0], +p?.[1]]);
      if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
      points += pts.length;
      if (points > MAX_SVG_POINTS) return null;
      rings.push(pts);
    }
    if (rings.length) out.push({ rule: entry.rule === "EvenOdd" ? "EvenOdd" : "NonZero", rings });
  }
  return out.length ? out : null;
}

const size2 = (r, d) => ({
  length: num(r?.length, 0, 400, d.length),
  width: num(r?.width, 0, 30, d.width),
});

/** Clamp every field of a raw project (storage, share link, JSON or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const width = num(r.shape?.width, 60, 600, d.shape.width);
  const art = sanitizeArt(r.art);
  const svg = cleanSvg(r.shape?.svg);
  let kind = oneOf(r.shape?.kind, SHAPE_KINDS, d.shape.kind);
  if ((kind === "svg" && !svg) || (kind === "art" && !art)) kind = "preset";
  const hub = Array.isArray(r.shape?.hub) ? r.shape.hub : d.shape.hub;
  const slots = (Array.isArray(r.colors?.slots) ? r.colors.slots : d.colors.slots)
    .slice(0, MAX_SLOTS)
    .map((c, i) => hex(c, d.colors.slots[i] ?? "#888888"));
  if (!slots.length) slots.push(...d.colors.slots);
  const slot = (v, dv) => int(v, 0, slots.length - 1, Math.min(dv, slots.length - 1));
  const thickness = num(r.face?.thickness, 1.6, 12, d.face.thickness);
  const mv = movementById(r.movement?.preset);
  const m = r.movement ?? {};
  const body = Array.isArray(m.body) ? m.body : mv.body;
  return {
    v: 1,
    shape: {
      kind,
      preset: oneOf(r.shape?.preset, PRESET_IDS, d.shape.preset),
      svg,
      width,
      border: {
        kind: oneOf(r.shape?.border?.kind, BORDERS, d.shape.border.kind),
        w: num(r.shape?.border?.w, 2, 30, d.shape.border.w),
      },
      hub: [num(hub[0], -width / 2, width / 2, 0), num(hub[1], -width, width, 0)],
    },
    art,
    artPlace: {
      size: num(r.artPlace?.size, 0, 600, 0),
      x: num(r.artPlace?.x, -300, 300, 0),
      y: num(r.artPlace?.y, -300, 300, 0),
      rot: num(r.artPlace?.rot, -180, 180, 0),
    },
    type: oneOf(r.type, TYPES, d.type),
    style: oneOf(r.style, STYLES, d.style),
    face: {
      thickness,
      decor: oneOf(r.face?.decor, DECOR, d.face.decor),
      // Leave at least 1 mm of face under an inlay.
      inlay: Math.min(num(r.face?.inlay, 0.2, 3, d.face.inlay), thickness - 1),
      raised: num(r.face?.raised, 0.2, 6, d.face.raised),
      ribPitch: num(r.face?.ribPitch, 3, 40, d.face.ribPitch),
    },
    back: {
      kind: oneOf(r.back?.kind, BACKS, d.back.kind),
      hanger: oneOf(r.back?.hanger, HANGERS, d.back.hanger),
      magnet: {
        d: num(r.back?.magnet?.d, 3, 30, d.back.magnet.d),
        h: num(r.back?.magnet?.h, 1, 10, d.back.magnet.h),
        n: int(r.back?.magnet?.n, 1, 8, d.back.magnet.n),
      },
      stand: oneOf(r.back?.stand, STANDS, d.back.stand),
      angle: num(r.back?.angle, 0, 30, d.back.angle),
    },
    markers: {
      numerals: oneOf(r.markers?.numerals, NUMERALS, d.markers.numerals),
      hours: [12, 24].includes(+r.markers?.hours) ? +r.markers.hours : 12,
      reverse: bool(r.markers?.reverse, false),
      orient: oneOf(r.markers?.orient, ["upright", "radial"], d.markers.orient),
      font: oneOf(r.markers?.font, FONTS, d.markers.font),
      size: num(r.markers?.size, 0, 80, 0),
      ticks: oneOf(r.markers?.ticks, TICKS, d.markers.ticks),
      minutes: bool(r.markers?.minutes, false),
      path: oneOf(r.markers?.path, ["circle", "outline"], d.markers.path),
      inset: num(r.markers?.inset, 0, 60, d.markers.inset),
      finish: oneOf(r.markers?.finish, FINISHES, d.markers.finish),
      text: String(r.markers?.text ?? "").slice(0, 24),
      textSize: num(r.markers?.textSize, 3, 40, d.markers.textSize),
    },
    hands: {
      print: bool(r.hands?.print, true),
      style: oneOf(r.hands?.style, HAND_STYLES, d.hands.style),
      thickness: num(r.hands?.thickness, 0.8, 4, d.hands.thickness),
      hour: size2(r.hands?.hour, d.hands.hour),
      minute: size2(r.hands?.minute, d.hands.minute),
      second: bool(r.hands?.second, false),
      tail: bool(r.hands?.tail, true),
      glow: bool(r.hands?.glow, false),
      fit: num(r.hands?.fit, -0.4, 0.4, 0),
    },
    cutouts: {
      kind: oneOf(r.cutouts?.kind, CUTOUTS, d.cutouts.kind),
      seed: int(r.cutouts?.seed, 0, 99999, d.cutouts.seed),
      count: int(r.cutouts?.count, 1, 80, d.cutouts.count),
      size: num(r.cutouts?.size, 3, 60, d.cutouts.size),
    },
    colors: {
      slots,
      face: slot(r.colors?.face, d.colors.face),
      border: slot(r.colors?.border, d.colors.border),
      markers: slot(r.colors?.markers, d.colors.markers),
      hands: slot(r.colors?.hands, d.colors.hands),
      glow: slot(r.colors?.glow, d.colors.glow),
      art: (art?.layers ?? []).map((_, i) =>
        slot(r.colors?.art?.[i], Math.min(i + 1, slots.length - 1)),
      ),
    },
    movement: {
      preset: MOVEMENT_IDS.includes(m.preset) ? m.preset : mv.id,
      body: [
        num(body[0], 20, 120, mv.body[0]),
        num(body[1], 20, 120, mv.body[1]),
        num(body[2], 5, 50, mv.body[2]),
      ],
      dialHole: num(m.dialHole, 3, 16, mv.dialHole),
      maxDial: num(m.maxDial, 1, 25, mv.maxDial),
      hour: num(m.hour, 2, 10, mv.hour),
      minute: num(m.minute, 1, 8, mv.minute),
      minuteFlat: num(m.minuteFlat, 0, 8, mv.minuteFlat),
      hourAt: num(m.hourAt, 2, 40, mv.hourAt),
      minuteAt: num(m.minuteAt, 2, 40, mv.minuteAt),
      secondAt: num(m.secondAt, 2, 40, mv.secondAt),
      torque: oneOf(m.torque, ["std", "high"], mv.torque),
      clearance: num(m.clearance, 0, 2, 0.4),
    },
    leds: {
      halo: bool(r.leds?.halo, false),
      chip: oneOf(r.leds?.chip, ["ws2812b", "sk6812rgbw", "ws2815"], d.leds.chip),
      density: [30, 60, 144].includes(+r.leds?.density) ? +r.leds.density : d.leds.density,
      stripWidth: num(r.leds?.stripWidth, 4, 16, d.leds.stripWidth),
    },
    twoSided: { arm: num(r.twoSided?.arm, 40, 300, d.twoSided.arm) },
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

/** The fields that change the geometry; colours, time and printer only repaint. */
export const geomKey = (p) =>
  JSON.stringify([
    p.shape,
    p.art,
    p.artPlace,
    p.type,
    p.style,
    p.face,
    p.back,
    p.markers,
    p.hands,
    p.cutouts,
    p.movement,
    p.leds,
    p.twoSided,
    // Which elements share a slot decides how bodies merge.
    [p.colors.face, p.colors.border, p.colors.markers, p.colors.hands, p.colors.glow, p.colors.art],
  ]);

const KEY = "3dtools.clocks.project";

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
  JSON.stringify({ app: "3dtools-clocks", ...project }, null, 2);

export function fromSettingsJson(text) {
  const raw = JSON.parse(text);
  if (raw?.app !== "3dtools-clocks") throw new Error("Not a Clocks settings file");
  return sanitize(raw);
}

/** Nearest palette slot to a colour, or a new slot when none is close and there is room. */
export function slotFor(slots, color) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const c = rgb(color);
  let best = 0;
  let bestD = Infinity;
  slots.forEach((s, i) => {
    const d = rgb(s).reduce((n, v, k) => n + (v - c[k]) ** 2, 0);
    if (d < bestD) [best, bestD] = [i, d];
  });
  if (bestD > 40 ** 2 && slots.length < MAX_SLOTS) {
    slots.push(color);
    return slots.length - 1;
  }
  return best;
}
