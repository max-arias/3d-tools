// Clock outlines as plain rings (mm, y up). Pure functions, no manifold, so the UI, the checks and
// the worker all read the same shape. Every outline is { shapes: [{ rule, rings }], cuts: [ring] }:
// `shapes` is the face area, `cuts` are holes through it (leaf slits, cheese bites).

const TAU = Math.PI * 2;
const circlePts = (r, cx = 0, cy = 0, n = 96) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((i / n) * TAU),
    cy + r * Math.sin((i / n) * TAU),
  ]);

/** Polygon of a shape seen from the origin: r(θ) is the farthest hit on any of `circles`. */
function polarUnion(circles, n = 360) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = 0;
    for (const [cx, cy, cr] of circles) {
      // Ray p = t·d against the circle: t² − 2t(d·c) + |c|² − r² = 0, farthest root.
      const b = dx * cx + dy * cy;
      const disc = b * b - (cx * cx + cy * cy - cr * cr);
      if (disc >= 0) r = Math.max(r, b + Math.sqrt(disc));
    }
    pts.push([r * dx, r * dy]);
  }
  return pts;
}

const polar = (fn, n = 360) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const r = fn(a);
    return [r * Math.cos(a), r * Math.sin(a)];
  });

function roundedRect(w, h, r, n = 12) {
  const pts = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
    [w / 2 - r, -h / 2 + r, 270],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (i / n) * 90) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return pts;
}

const regular = (sides, rot = 0) =>
  Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * TAU;
    return [Math.cos(a), Math.sin(a)];
  });

/** Preset outlines, drawn at about unit size; `outlineOf` scales them to the chosen width. */
export const PRESETS = {
  circle: () => ({ rings: [circlePts(1, 0, 0, 160)] }),
  rounded: () => ({ rings: [roundedRect(2, 2, 0.28)] }),
  square: () => ({ rings: [roundedRect(2, 2, 0.04, 4)] }),
  hexagon: () => ({ rings: [regular(6, Math.PI / 6)] }),
  octagon: () => ({ rings: [regular(8, Math.PI / 8)] }),
  scallop: () => ({ rings: [polar((a) => 1 + 0.07 * Math.abs(Math.cos(6 * a)) ** 0.6)] }),
  sunburst: () => ({
    rings: [polar((a) => 0.82 + 0.18 * Math.max(0, Math.cos(12 * a)) ** 3, 720)],
  }),
  cloud: () => ({
    rings: [
      polarUnion([
        [0, -0.05, 0.62],
        [-0.62, -0.18, 0.4],
        [0.62, -0.18, 0.4],
        [-0.3, 0.32, 0.45],
        [0.3, 0.38, 0.5],
        [-0.85, -0.3, 0.28],
        [0.85, -0.3, 0.28],
        [0, -0.4, 0.42],
      ]),
    ],
  }),
  bear: () => ({
    rings: [
      polarUnion([
        [0, 0, 0.85],
        [-0.66, 0.66, 0.36],
        [0.66, 0.66, 0.36],
      ]),
    ],
  }),
  leaf: () => {
    // A split-leaf outline (heart-ish body with a notch at the stem) and slits from the edge inward.
    const ring = polar((a) => {
      const down = Math.abs(a - (3 * Math.PI) / 2);
      return 1 - 0.18 * Math.exp(-((down / 0.12) ** 2)) + 0.05 * Math.sin(3 * a);
    }, 480);
    const cuts = [];
    for (const [ang, len] of [
      [0.35, 0.42],
      [0.95, 0.4],
      [2.2, 0.4],
      [2.8, 0.42],
      [3.6, 0.36],
      [-0.5, 0.36],
    ]) {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const w = 0.045;
      const r0 = 1.1 - len;
      // A slit from inside the leaf out past the edge, rounded at its inner end.
      const inner = Array.from({ length: 9 }, (_, i) => {
        const t = Math.PI / 2 + (i / 8) * Math.PI;
        return [
          r0 * dx + w * (Math.cos(t) * dx - Math.sin(t) * dy),
          r0 * dy + w * (Math.cos(t) * dy + Math.sin(t) * dx),
        ];
      });
      cuts.push([
        ...inner,
        [1.3 * dx + w * dy * 1.6, 1.3 * dy - w * dx * 1.6],
        [1.3 * dx - w * dy * 1.6, 1.3 * dy + w * dx * 1.6],
      ]);
    }
    return { rings: [ring], cuts };
  },
  cheese: () => ({
    // A wedge-ish slab with round bites out of the edges.
    rings: [roundedRect(2, 1.9, 0.05, 3)],
    cuts: [
      circlePts(0.14, -0.55, 0.95, 40),
      circlePts(0.1, 0.45, 0.95, 40),
      circlePts(0.12, 1, 0.2, 40),
      circlePts(0.16, -1, -0.35, 40),
      circlePts(0.13, 0.35, -0.95, 40),
    ],
  }),
  arch: () => {
    // Desk arch: flat bottom, round top, the hub at the centre of the arc.
    const pts = [
      [1, -1.15],
      [1, 0],
    ];
    for (let i = 1; i < 64; i++) {
      const a = (i / 64) * Math.PI;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    pts.push([-1, 0], [-1, -1.15]);
    return { rings: [pts] };
  },
};
export const PRESET_IDS = Object.keys(PRESETS);

// ---- ring helpers ----------------------------------------------------------------------------

export function boundsOf(rings) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r)
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
}

const mapRings = (rings, fn) => rings.map((r) => r.map(fn));

/** Winding number of point p for one ring. */
function winding(ring, [px, py]) {
  let w = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    if (y0 <= py) {
      if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++;
    } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) w--;
  }
  return w;
}

/** Whether p is inside the outline's face area (and not in a cut). */
export function insideOutline(outline, p) {
  const inShape = outline.shapes.some((s) => {
    const w = s.rings.reduce((n, r) => n + winding(r, p), 0);
    return s.rule === "EvenOdd" ? w % 2 !== 0 : w !== 0;
  });
  return inShape && !outline.cuts.some((c) => winding(c, p) !== 0);
}

const allRings = (outline) => [...outline.shapes.flatMap((s) => s.rings), ...outline.cuts];

function segDist([px, py], [x0, y0], [x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
}

/** Distance from p to the nearest edge of the outline (outer edge or a cut). */
export function edgeDistance(outline, p) {
  let d = Infinity;
  for (const r of allRings(outline))
    for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length]));
  return d;
}

/** Distance along the ray from the origin at angle `a` to the first outline edge (Infinity if none). */
export function rayDistance(outline, a) {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = Infinity;
  for (const r of allRings(outline))
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i];
      const [x1, y1] = r[(i + 1) % r.length];
      const ex = x1 - x0;
      const ey = y1 - y0;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (x0 * ey - y0 * ex) / den;
      const u = (x0 * dy - y0 * dx) / den;
      if (t > 1e-9 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  return best;
}

// ---- building the outline -----------------------------------------------------------------

/** Rings of the art layers that print, in art units (y down), for the "drawing's edge" outline. */
function artRings(art) {
  const rings = [];
  for (const L of art.layers) {
    if (!L.on) continue;
    for (const s of L.s)
      for (const flat of s.p) {
        const ring = [];
        for (let i = 0; i + 1 < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
        if (ring.length >= 3) rings.push(ring);
      }
  }
  return rings;
}

/**
 * The outline in mm, centred on its bounding box and then moved so the hub sits at the origin.
 * shape = { kind: "preset" | "svg" | "art", preset, svg, width, hub: [x, y] }; `art` is the project
 * art (used by kind "art"). Returns { shapes, cuts, w, h } or null when there is nothing to draw.
 */
export function outlineOf(shape, art = null) {
  let shapes;
  let cuts = [];
  let flip = false;
  if (shape.kind === "svg" && shape.svg) {
    shapes = shape.svg.map((s) => ({ rule: s.rule, rings: s.rings }));
    flip = true;
  } else if (shape.kind === "art" && art) {
    const rings = artRings(art);
    if (!rings.length) return null;
    shapes = [{ rule: "NonZero", rings }];
    flip = true;
  } else {
    const made = (PRESETS[shape.preset] ?? PRESETS.circle)();
    shapes = [{ rule: "NonZero", rings: made.rings }];
    cuts = made.cuts ?? [];
  }
  const [x0, y0, x1, y1] = boundsOf(shapes.flatMap((s) => s.rings));
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const k = shape.width / (x1 - x0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const [hx, hy] = shape.hub ?? [0, 0];
  const place = ([x, y]) => [(x - cx) * k - hx, (flip ? -(y - cy) : y - cy) * k - hy];
  return {
    shapes: shapes.map((s) => ({ rule: s.rule, rings: mapRings(s.rings, place) })),
    cuts: mapRings(cuts, place),
    w: shape.width,
    h: (y1 - y0) * k,
  };
}

/** Default hub for a preset, relative to the bounding-box centre (the arch's hub sits in its arc). */
export function defaultHub(preset, width) {
  if (preset === "arch") return [0, (0 - (1 - 1.15) / 2) * (width / 2)];
  return [0, 0];
}

/** Radius of the largest circle around the hub that stays on the face. */
export const faceRadius = (outline) => (outline ? edgeDistance(outline, [0, 0]) : 0);
