// Ready-made packs (a box, its bins and its label) and the box-size suggestion. Pack text is in
// the UI strings (pack.<id>.name / .desc), so this file is data only.
import { boxDims, MAX, MIN } from "../geom/dims.js";
import { fitsBed } from "./project.js";

const row = (y, ws, d = 1, extra = {}) => {
  let x = 0;
  return ws.map((w) => {
    const b = { x, y, w, d, ...extra };
    x += w;
    return b;
  });
};

export const PACKS = [
  {
    id: "m3",
    grid: { x: 5, y: 4, u: 6 },
    label: { title: "M3", lines: ["Bolts", "Nuts", "Washers", "Heat-set inserts"] },
    bins: [
      ...row(3, [1, 1, 1, 1, 1]),
      ...row(2, [1, 1, 1, 1, 1]),
      ...row(1, [1, 1, 3]),
      ...row(0, [2, 3]),
    ],
  },
  {
    id: "metric",
    grid: { x: 5, y: 4, u: 6 },
    label: { title: "M2–M5", lines: ["Bolts", "Nuts", "Washers"] },
    bins: [
      ...row(3, [1, 1, 1, 1, 1]),
      ...row(2, [1, 1, 1, 1, 1]),
      ...row(1, [1, 1, 1, 1, 1]),
      ...row(0, [1, 1, 1, 1, 1]),
    ],
  },
  {
    id: "electronics",
    grid: { x: 5, y: 4, u: 6 },
    label: { title: "Electronics", lines: [] },
    bins: [
      ...row(3, [1, 1, 1, 1, 1]),
      ...row(2, [1, 1, 1, 1, 1]),
      ...row(1, [2, 1, 2], 1, { dividersX: 1 }),
      ...row(0, [2, 3], 1, { scoop: true }),
    ],
  },
  {
    id: "resistors",
    grid: { x: 5, y: 4, u: 6 },
    label: { title: "Resistors", lines: ["Pots"] },
    bins: [...row(1, [5], 3, { dividersX: 4, dividersY: 2 }), ...row(0, [5], 1, { dividersX: 1 })],
  },
  {
    id: "bits",
    grid: { x: 5, y: 4, u: 6 },
    label: { title: "Bits", lines: ["Drivers", "Sockets"] },
    bins: [...row(0, [1, 1, 1, 1, 1], 4, { scoop: true })],
  },
  {
    id: "small",
    grid: { x: 4, y: 3, u: 6 },
    label: { title: "Small parts", lines: [] },
    bins: [...row(2, [1, 1, 1, 1]), ...row(1, [1, 1, 1, 1]), ...row(0, [2, 2], 1, { scoop: true })],
  },
  {
    id: "deep",
    grid: { x: 5, y: 4, u: 12 },
    label: { title: "Tools", lines: [] },
    bins: [...row(2, [2, 3], 2), ...row(0, [2, 3], 2, { scoop: true })],
  },
];

export const packById = (id) => PACKS.find((p) => p.id === id) ?? null;

/** Project patch that loads a pack (box size, bins and label; the rest of the project stays). */
export function packPatch(pack) {
  return {
    grid: { ...pack.grid },
    label: structuredClone(pack.label),
    bins: structuredClone(pack.bins),
    pack: pack.id,
  };
}

/**
 * Place bins [{ w, d, ...}] on an x by y grid, turning them when that helps. Exact search,
 * largest bins first, each into the first free cell in reading order. Returns placed bins or null.
 */
export function packBins(bins, x, y, maxSteps = 20000) {
  const order = bins
    .map((b, i) => ({ ...b, i }))
    .sort((a, b) => b.w * b.d - a.w * a.d || b.w - a.w);
  const area = order.reduce((s, b) => s + b.w * b.d, 0);
  if (area > x * y) return null;
  const free = new Uint8Array(x * y).fill(1);
  const out = new Array(order.length);
  let steps = 0;
  const fits = (cx, cy, w, d) => {
    if (cx + w > x || cy + d > y) return false;
    for (let i = cx; i < cx + w; i++)
      for (let j = cy; j < cy + d; j++) if (!free[j * x + i]) return false;
    return true;
  };
  const mark = (cx, cy, w, d, v) => {
    for (let i = cx; i < cx + w; i++) for (let j = cy; j < cy + d; j++) free[j * x + i] = v;
  };
  const place = (k) => {
    if (k === order.length) return true;
    if (++steps > maxSteps) return false;
    const b = order[k];
    const shapes =
      b.w === b.d
        ? [[b.w, b.d]]
        : [
            [b.w, b.d],
            [b.d, b.w],
          ];
    for (let cy = 0; cy < y; cy++) {
      for (let cx = 0; cx < x; cx++) {
        if (!free[cy * x + cx]) continue;
        for (const [w, d] of shapes) {
          if (!fits(cx, cy, w, d)) continue;
          mark(cx, cy, w, d, 0);
          out[k] = { ...b, x: cx, y: cy, w, d };
          if (place(k + 1)) return true;
          mark(cx, cy, w, d, 1);
        }
      }
    }
    return false;
  };
  if (!place(0)) return null;
  return out.sort((a, b) => a.i - b.i).map(({ i: _i, ...b }) => b);
}

/**
 * Smallest box that holds `bins` (and is at least `minU` tall) and whose base fits `build`.
 * Smallest footprint wins, then the squarer one. Returns { grid, bins, fill } or null.
 */
export function suggestBox(bins, build, minU = MIN.u) {
  const candidates = [];
  for (let x = MIN.x; x <= MAX.x; x++) {
    for (let y = MIN.y; y <= Math.min(MAX.y, x); y++) {
      const d = boxDims({ x, y, u: minU });
      if (!fitsBed([d.W, d.D], build) || d.baseH > build.z) continue;
      candidates.push({ x, y });
    }
  }
  candidates.sort((a, b) => a.x * a.y - b.x * b.y || Math.abs(a.x - a.y) - Math.abs(b.x - b.y));
  const cells = bins.reduce((s, b) => s + b.w * b.d, 0);
  for (const { x, y } of candidates) {
    if (cells > x * y) continue;
    const placed = packBins(bins, x, y);
    if (placed)
      return { grid: { x, y, u: Math.max(minU, MIN.u) }, bins: placed, fill: cells / (x * y) };
  }
  return null;
}

/**
 * Filament (g) and print time (min) for a part list. Calibrated on Pred's sliced 5x4x6U sample
 * (PrusaSlicer, PETG, 2 perimeters, 15 % infill): the base used 63 % of its solid volume and took
 * 10 h 15 m at 0.3 mm, the lid 84 % in 5 h 48 m, the small parts about 95 % at 0.2 mm.
 */
export function printEstimate(parts, density = 1.27) {
  const share = { base: 0.63, lid: 0.84, bin: 0.85 };
  const rate = { 0.3: 0.28, 0.2: 0.12 }; // cm3 per minute
  let grams = 0;
  let minutes = 0;
  for (const p of parts) {
    const cm3 = (p.volume / 1000) * (share[p.kind] ?? 0.95) * p.qty;
    grams += cm3 * density;
    minutes += cm3 / (rate[p.print?.layer] ?? 0.2);
  }
  return { grams, minutes };
}
