import { defaultBinDefaults, defaultProject, WALLS } from "./defaults.js";

const num = (v, lo, hi, fallback) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const int = (v, lo, hi, fallback) => Math.round(num(v, lo, hi, fallback));
const half = (v, lo, hi, fallback) => Math.round(num(v, lo, hi, fallback) * 2) / 2;
const bool = (v, fallback) => (typeof v === "boolean" ? v : fallback);
const oneOf = (v, options, fallback) => (options.includes(v) ? v : fallback);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_BINS = 2500;

// Field rules for one bin-parameter set. A missing key means "not set" (kept off overrides).
const BIN_RULES = {
  units: (v, d) => int(v, 2, 60, d),
  heightMm: (v, d) => (v === 0 ? 0 : int(v, 10, 500, d)),
  wall: (v, d) => num(v, 0.8, 3, d),
  floor: (v, d) => num(v, 0.6, 5, d),
  lip: bool,
  magnets: bool,
  dividersX: (v, d) => int(v, 0, 20, d),
  dividersY: (v, d) => int(v, 0, 20, d),
  dividerPct: (v, d) => num(v, 10, 100, d),
  label: (v, d) => oneOf(v, ["none", "front", "full"], d),
  labelWall: (v, d) => oneOf(v, WALLS, d),
  split: bool,
  floorSeam: (v, d) => oneOf(v, ["butt", "lap"], d),
  seamJoint: (v, d) => oneOf(v, ["none", "hkey", "magnets"], d),
  wallPattern: (v, d) => oneOf(v, ["solid", "honeycomb", "slots"], d),
  lid: (v, d) => oneOf(v, ["none", "dropin", "stackable", "sliding", "hinged"], d),
  lidThickness: (v, d) => num(v, 1.2, 4, d),
  lidFit: (v, d) => num(v, 0.1, 0.6, d),
  lidHandle: (v, d) => oneOf(v, ["none", "dip", "tab", "knob"], d),
  lidSide: (v, d) => oneOf(v, WALLS, d),
};
const GRAB_RULES = {
  notch: bool,
  notchW: (v, d) => num(v, 5, 200, d),
  notchD: (v, d) => num(v, 2, 150, d),
  notchR: (v, d) => num(v, 1, 100, d),
  scoop: bool,
  scoopR: (v, d) => num(v, 2, 60, d),
  lower: bool,
  lowerPct: (v, d) => num(v, 10, 95, d),
};

function cleanFields(rules, raw, base) {
  const out = {};
  for (const [key, rule] of Object.entries(rules)) out[key] = rule(raw[key], base[key]);
  return out;
}

function cleanGrabs(raw, base) {
  const out = {};
  for (const wall of WALLS) out[wall] = cleanFields(GRAB_RULES, obj(raw[wall]), base[wall]);
  return out;
}

function cleanBinDefaults(raw, base) {
  return { ...cleanFields(BIN_RULES, raw, base), grab: cleanGrabs(obj(raw.grab), base.grab) };
}

/** Overrides keep only keys that were actually set, validated against the defaults. */
function cleanOverrides(raw, defaults) {
  raw = obj(raw);
  const out = {};
  for (const [key, rule] of Object.entries(BIN_RULES)) {
    if (key in raw) out[key] = rule(raw[key], defaults[key]);
  }
  if (raw.grab && typeof raw.grab === "object") {
    const grab = {};
    for (const wall of WALLS) {
      const src = obj(raw.grab[wall]);
      const walls = {};
      for (const [key, rule] of Object.entries(GRAB_RULES)) {
        if (key in src) walls[key] = rule(src[key], defaults.grab[wall][key]);
      }
      if (Object.keys(walls).length) grab[wall] = walls;
    }
    if (Object.keys(grab).length) out.grab = grab;
  }
  return out;
}

/** Remove override values that equal the defaults, and empty override objects. */
export function pruneOverrides(overrides, defaults) {
  const out = {};
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (key === "grab") continue;
    if (value !== defaults[key]) out[key] = value;
  }
  const grab = {};
  for (const wall of WALLS) {
    const walls = {};
    for (const [key, value] of Object.entries(overrides?.grab?.[wall] ?? {})) {
      if (value !== defaults.grab[wall][key]) walls[key] = value;
    }
    if (Object.keys(walls).length) grab[wall] = walls;
  }
  if (Object.keys(grab).length) out.grab = grab;
  return out;
}

function cleanBins(raw, defaults) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const bins = [];
  for (const item of raw.slice(0, MAX_BINS)) {
    const b = obj(item);
    if (typeof b.id !== "string" || !ID_RE.test(b.id) || seen.has(b.id)) continue;
    seen.add(b.id);
    const bin = {
      id: b.id,
      x: half(b.x, 0, 199.5, 0),
      y: half(b.y, 0, 199.5, 0),
      w: half(b.w, 0.5, 200, 1),
      d: half(b.d, 0.5, 200, 1),
    };
    const overrides = pruneOverrides(cleanOverrides(b.overrides, defaults), defaults);
    if (Object.keys(overrides).length) bin.overrides = overrides;
    if (Array.isArray(b.labels)) {
      const labels = b.labels.slice(0, 24).map((x) =>
        [...String(x ?? "")]
          .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
          .join("")
          .slice(0, 40),
      );
      if (labels.some(Boolean)) bin.labels = labels;
    }
    bins.push(bin);
  }
  return bins;
}

/** Upgrade the legacy un-versioned shape to v1 (best effort). */
function migrate(raw) {
  raw = { ...raw };
  if (raw.binOptions && !raw.binDefaults) raw.binDefaults = raw.binOptions;
  const bp = obj(raw.baseplate);
  if (bp.floored !== undefined && bp.style === undefined)
    raw.baseplate = { ...bp, style: bp.floored ? "skeleton" : "thin" };
  const bd = obj(raw.binDefaults);
  if (bd.keys !== undefined && bd.seamJoint === undefined) {
    raw.binDefaults = { ...bd, seamJoint: bd.keys ? "hkey" : "none" };
  }
  return raw;
}

/** Validate and clamp any object into a complete v1 project. Never throws. */
export function sanitize(input) {
  const base = defaultProject();
  const raw = migrate(obj(input));
  const dr = obj(raw.drawer),
    pr = obj(raw.printer),
    gr = obj(raw.grid),
    bp = obj(raw.baseplate);
  const mg = obj(raw.magnet),
    jt = obj(raw.joint),
    ls = obj(raw.labelStyle);
  const binDefaults = cleanBinDefaults(obj(raw.binDefaults), defaultBinDefaults());

  return {
    v: 1,
    drawer: {
      w: num(dr.w, 50, 3000, base.drawer.w),
      d: num(dr.d, 50, 3000, base.drawer.d),
      h: num(dr.h, 10, 1000, base.drawer.h),
      cornerR: num(dr.cornerR, 0, 200, base.drawer.cornerR),
      tol: num(dr.tol, 0, 5, base.drawer.tol),
      topClearance: num(dr.topClearance, 0, 100, base.drawer.topClearance),
    },
    printer: {
      x: num(pr.x, 60, 2000, base.printer.x),
      y: num(pr.y, 60, 2000, base.printer.y),
      z: num(pr.z, 20, 2000, base.printer.z),
      margin: num(pr.margin, 0, 30, base.printer.margin),
      preset: typeof pr.preset === "string" ? pr.preset.slice(0, 40) : base.printer.preset,
    },
    grid: {
      mode: oneOf(gr.mode, ["gridfinity", "custom"], "gridfinity"),
      target: num(gr.target, 30, 60, 42),
      padX: oneOf(gr.padX, ["center", "start", "end"], "center"),
      padY: oneOf(gr.padY, ["center", "start", "end"], "center"),
      halfCells: bool(gr.halfCells, false),
    },
    baseplate: {
      style: oneOf(bp.style, ["thin", "skeleton", "weighted"], "thin"),
      peaks: bool(bp.peaks, true),
      magnets: bool(bp.magnets, false),
      keys: bool(bp.keys, false),
      clips: bool(bp.clips, false),
      keyEvery: int(bp.keyEvery, 1, 3, 2),
      clipEvery: int(bp.clipEvery, 1, 3, 1),
      tape: bool(bp.tape, false),
      chamfer: num(bp.chamfer, 0, 5, 0.8),
      halfSockets: oneOf(bp.halfSockets, ["ribs", "shared"], "ribs"),
    },
    magnet: { d: num(mg.d, 1, 20, 6.5), depth: num(mg.depth, 0.5, 6, 2.4) },
    joint: { clearance: num(jt.clearance, 0, 0.5, 0.15), taper: bool(jt.taper, false) },
    labelStyle: {
      kind: oneOf(ls.kind, ["raised", "engraved", "inlay"], "raised"),
      case: oneOf(ls.case, ["as", "upper"], "as"),
      autoFit: bool(ls.autoFit, true),
      maxMm: num(ls.maxMm, 3, 12, 7),
      depthMm: num(ls.depthMm, 0.2, 1.2, 0.6),
    },
    binPrint: oneOf(raw.binPrint, ["regular", "light", "superlight"], "regular"),
    binDefaults,
    bins: cleanBins(raw.bins, binDefaults),
  };
}
