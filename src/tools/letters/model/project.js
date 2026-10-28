import LZString from "lz-string";
import { CUSTOM_FONT, FONTS } from "./fonts.js";
import { EFFECT_KEYS } from "./effects.js";
import { CHIPS, CHIP_IDS, DENSITIES, PSU_SIZES } from "./strips.js";

export const SOURCES = ["text", "svg"];
export const MAX_TEXT = 16;
/** Longest SVG outline list kept in a project (points over all rings). */
export const MAX_SVG_POINTS = 40000;

const num = (v, lo, hi, d) =>
  Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, +v)) : d;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

export function defaultProject() {
  return {
    v: 1,
    source: { kind: "text", text: "LED", font: "anton", customName: "", tracking: 4, svg: null },
    size: { height: 120, depth: 35, wall: 2.4, base: 2 },
    lid: { on: true, rebate: 2, ledge: 1.2, thickness: 1.5, clearance: 0.3 },
    hole: { on: true, d: 6, at: "center" },
    leds: {
      mode: "rows",
      chip: "ws2812b",
      density: 60,
      stripWidth: 10,
      spacing: 25,
      dir: "auto",
      margin: 1,
    },
    power: { margin: 20, psuA: null },
    wled: {
      gpio: 16,
      bri: 128,
      presets: ["solid", "rainbow", "fire", "breathe", "wipe", "waves", "meteor"],
    },
    printer: "bambu-p1s",
    build: { x: 256, y: 256, z: 256 },
  };
}

/** SVG outlines: [{ rule: "NonZero" | "EvenOdd", rings: [[[x, y], ...], ...] }], within the point cap. */
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

/** Clamp every field of a raw project (storage, share link, JSON or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const height = num(r.size?.height, 20, 400, d.size.height);
  const depth = num(r.size?.depth, 10, 150, d.size.depth);
  const wall = num(r.size?.wall, 1, 6, d.size.wall);
  const base = num(r.size?.base, 0.8, 6, d.size.base);
  // The ledge may not leave a lip thinner than 0.8 mm, and the rebate must leave room for LEDs.
  const ledge = Math.min(num(r.lid?.ledge, 0.4, 4, d.lid.ledge), Math.max(wall - 0.8, 0.4));
  const rebate = Math.min(
    num(r.lid?.rebate, 0.8, 8, d.lid.rebate),
    Math.max(depth - base - 5, 0.8),
  );
  const text = String(r.source?.text ?? d.source.text)
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEXT);
  return {
    v: 1,
    source: {
      kind: oneOf(r.source?.kind, SOURCES, d.source.kind),
      text,
      font: oneOf(r.source?.font, [...FONTS.map((f) => f.id), CUSTOM_FONT], d.source.font),
      customName: String(r.source?.customName ?? "").slice(0, 80),
      tracking: num(r.source?.tracking, -20, 40, d.source.tracking),
      svg: cleanSvg(r.source?.svg),
    },
    size: { height, depth, wall, base },
    lid: {
      on: bool(r.lid?.on, d.lid.on),
      rebate,
      ledge,
      thickness: num(r.lid?.thickness, 0.6, 6, d.lid.thickness),
      clearance: num(r.lid?.clearance, 0.1, 1, d.lid.clearance),
    },
    hole: {
      on: bool(r.hole?.on, d.hole.on),
      d: num(r.hole?.d, 3, 12, d.hole.d),
      at: oneOf(r.hole?.at, ["center", "start"], d.hole.at),
    },
    leds: {
      mode: oneOf(r.leds?.mode, ["rows", "perimeter"], d.leds.mode),
      chip: oneOf(r.leds?.chip, CHIP_IDS, d.leds.chip),
      density: DENSITIES.includes(+r.leds?.density) ? +r.leds.density : d.leds.density,
      stripWidth: num(
        r.leds?.stripWidth,
        4,
        30,
        CHIPS[r.leds?.chip]?.stripWidth ?? d.leds.stripWidth,
      ),
      spacing: num(r.leds?.spacing, 8, 80, d.leds.spacing),
      dir: oneOf(r.leds?.dir, ["auto", "h", "v"], d.leds.dir),
      margin: num(r.leds?.margin, 0, 6, d.leds.margin),
    },
    power: {
      margin: num(r.power?.margin, 0, 50, d.power.margin),
      psuA: PSU_SIZES.includes(+r.power?.psuA) ? +r.power.psuA : null,
    },
    wled: {
      gpio: Math.round(num(r.wled?.gpio, 0, 48, d.wled.gpio)),
      bri: Math.round(num(r.wled?.bri, 1, 255, d.wled.bri)),
      presets: Array.isArray(r.wled?.presets)
        ? [...new Set(r.wled.presets.filter((k) => EFFECT_KEYS.includes(k)))]
        : d.wled.presets,
    },
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
export const geomKey = (p) => JSON.stringify([p.source, p.size, p.lid, p.hole, p.leds]);

const KEY = "3dtools.letters.project";

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
  JSON.stringify({ app: "3dtools-letters", ...project }, null, 2);

export function fromSettingsJson(text) {
  const raw = JSON.parse(text);
  if (raw?.app !== "3dtools-letters") throw new Error("Not a Letters settings file");
  return sanitize(raw);
}

/** Whether a part footprint [x, y] fits the build plate, turned 90 degrees if that helps. */
export function fitsBed(size, build) {
  const [w, h] = size;
  return (w <= build.x && h <= build.y) || (h <= build.x && w <= build.y);
}
