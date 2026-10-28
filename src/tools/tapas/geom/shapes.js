// Overlay outlines. Each shape builds a CrossSection of the requested size; `fitOutline` grows it
// until it contains the pocket (plate + wall), so every shape works for every plate size.
const TAU = Math.PI * 2;

const ccw = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a > 0 ? pts : [...pts].reverse();
};

/** Polygon from a parametric curve, scaled into [-0.5, 0.5] (uniformly, or per axis when stretch). */
function curve(fn, { n = 120, stretch = false } = {}) {
  const raw = Array.from({ length: n }, (_, i) => fn((i / n) * TAU));
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = stretch ? x1 - x0 : Math.max(x1 - x0, y1 - y0);
  const sy = stretch ? y1 - y0 : sx;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return ccw(raw.map(([x, y]) => [(x - cx) / sx, (y - cy) / sy]));
}

const scaled = (unit, w, h) => unit.map(([x, y]) => [x * w, y * h]);
const fromCurve = (unit) => (kit, w, h) => kit.poly(scaled(unit, w, h));

export const UNITS = {
  oval: curve((t) => [Math.cos(t), Math.sin(t)], { stretch: true }),
  squircle: curve(
    (t) => [
      Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.5,
      Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.5,
    ],
    { stretch: true, n: 160 },
  ),
  circle: curve((t) => [Math.cos(t), Math.sin(t)]),
  heart: curve(
    (t) => [
      16 * Math.sin(t) ** 3,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    ],
    { n: 200 },
  ),
  flower: curve(
    (t) => {
      const r = 1 + 0.16 * Math.cos(6 * t);
      return [r * Math.cos(t), r * Math.sin(t)];
    },
    { n: 240 },
  ),
  star: curve(
    (t) => {
      const k = ((t / TAU) * 10) % 2; // 5 points, rounded by sampling
      const r = 0.62 + 0.38 * Math.abs(1 - k) ** 1.2;
      return [r * Math.cos(t), r * Math.sin(t)];
    },
    { n: 200 },
  ),
  clover: curve(
    (t) => {
      const r = 0.72 + 0.28 * Math.cos(4 * t);
      return [r * Math.cos(t), r * Math.sin(t)];
    },
    { n: 240 },
  ),
  octagon: curve(
    (t) => {
      const a = Math.round(t / (TAU / 8)) * (TAU / 8);
      const r = Math.cos(Math.PI / 8) / Math.cos(t - a);
      return [r * Math.cos(t), r * Math.sin(t)];
    },
    { n: 480 },
  ),
  hexagon: curve(
    (t) => {
      const a = Math.round(t / (TAU / 6)) * (TAU / 6);
      const r = Math.cos(Math.PI / 6) / Math.cos(t - a);
      return [r * Math.cos(t), r * Math.sin(t)];
    },
    { n: 360 },
  ),
};

function scallop(kit, w, h) {
  const rb = 3;
  const bw = w - 2 * rb;
  const bh = h - 2 * rb;
  const base = kit.rect(-bw / 2, bw / 2, -bh / 2, bh / 2);
  const bumps = [];
  const along = (len, fixed, horizontal) => {
    const n = Math.max(2, Math.round(len / (1.7 * rb)));
    for (let i = 0; i <= n; i++) {
      const s = -len / 2 + (len * i) / n;
      bumps.push(horizontal ? kit.circle(rb, s, fixed, 16) : kit.circle(rb, fixed, s, 16));
    }
  };
  along(bw, bh / 2, true);
  along(bw, -bh / 2, true);
  along(bh, bw / 2, false);
  along(bh, -bw / 2, false);
  return kit.csUnion(base, bumps);
}

const diamond = (kit, w, h) =>
  kit.poly([
    [0, -h / 2],
    [w / 2, 0],
    [0, h / 2],
    [-w / 2, 0],
  ]);

/** Heater-shield outline: flat top, straight sides, curved sides meeting in a point. */
function shield(kit, w, h) {
  const pts = [
    [-0.5, 0.5],
    [-0.5, 0.05],
  ];
  for (let i = 1; i < 12; i++) {
    const s = i / 12;
    pts.push([-0.5 * (1 - s) ** 1.0, 0.05 - 0.55 * s ** 1.5]);
  }
  pts.push([0, -0.5]);
  for (let i = 11; i >= 1; i--) {
    const s = i / 12;
    pts.push([0.5 * (1 - s), 0.05 - 0.55 * s ** 1.5]);
  }
  pts.push([0.5, 0.05], [0.5, 0.5]);
  return kit.poly(scaled(pts.reverse(), w, h));
}

function arch(kit, w, h) {
  const r = w / 2;
  const top = kit.circle(r, 0, h / 2 - r, 64);
  return kit.hull2d(top, kit.rect(-r, r, -h / 2, 0));
}

/** id -> { round: keep the aspect ratio, build(kit, w, h, opts) }. */
export const SHAPES = {
  rect: { round: false, build: (kit, w, h) => kit.rrect(w, h, 0) },
  rounded: { round: false, build: (kit, w, h, o) => kit.rrect(w, h, o.corner) },
  stadium: { round: false, build: (kit, w, h) => kit.rrect(w, h, Math.min(w, h) / 2) },
  oval: { round: false, build: fromCurve(UNITS.oval) },
  squircle: { round: false, build: fromCurve(UNITS.squircle) },
  arch: { round: false, build: arch },
  scallop: { round: false, build: scallop },
  diamond: { round: false, build: diamond },
  shield: { round: false, build: shield },
  octagon: { round: true, build: fromCurve(UNITS.octagon) },
  clover: { round: true, build: fromCurve(UNITS.clover) },
  circle: { round: true, build: fromCurve(UNITS.circle) },
  hexagon: { round: true, build: fromCurve(UNITS.hexagon) },
  heart: { round: true, build: fromCurve(UNITS.heart) },
  flower: { round: true, build: fromCurve(UNITS.flower) },
  star: { round: true, build: fromCurve(UNITS.star) },
};
export const SHAPE_IDS = Object.keys(SHAPES);

/**
 * Smallest scaling (from the w x h box) of shape `id` that still contains `must`, for a shape
 * turned by `rot` degrees and centred at (dx, dy). `iters` trades precision for speed.
 * Returns { cs, k } where k = 1 means the outline is exactly w x h.
 */
function fitAt(kit, id, w, h, must, opts, { rot = 0, dx = 0, dy = 0 } = {}, iters = 22) {
  const shape = SHAPES[id];
  const make = (k) => {
    const base = shape.round
      ? shape.build(kit, k * Math.max(w, h), k * Math.max(w, h), opts)
      : shape.build(kit, k * w, k * h, opts);
    const turned = rot ? kit.own(base.rotate(rot)) : base;
    return dx || dy ? kit.own(turned.translate([dx, dy])) : turned;
  };
  const contains = (cs) => kit.csSub(must, cs).area() < 0.05;
  let lo = 0.3;
  let cs = make(lo);
  if (contains(cs)) return { cs, k: lo, make };
  let hi = lo * 1.5;
  while (!contains((cs = make(hi))) && hi < 40) hi *= 1.5;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (contains(make(mid))) hi = mid;
    else lo = mid;
  }
  return { cs: make(hi), k: hi, make };
}

export const fitOutline = (kit, id, w, h, must, opts, at) => fitAt(kit, id, w, h, must, opts, at);

/** Shapes with a centre of symmetry: the plate is too, so centred is already the tightest fit. */
export const CENTRED = new Set([
  "rect",
  "rounded",
  "stadium",
  "oval",
  "squircle",
  "scallop",
  "diamond",
  "octagon",
  "clover",
  "circle",
  "hexagon",
  "flower",
]);

/** Offset (dx, dy) that lets the shape, turned by `rot`, cover `must` at the smallest size. */
function bestOffset(kit, id, w, h, must, opts, rot) {
  if (CENTRED.has(id)) return { dx: 0, dy: 0 };
  const span = Math.max(w, h);
  const cost = (dx, dy) => fitAt(kit, id, w, h, must, opts, { rot, dx, dy }, 9).k;
  let best = { dx: 0, dy: 0, k: cost(0, 0) };
  const tryAt = (dx, dy) => {
    const k = cost(dx, dy);
    if (k < best.k * 0.995) best = { dx, dy, k }; // ties stay centred
  };
  const reach = span * 0.25;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) tryAt((i * reach) / 2, (j * reach) / 2);
  for (let step = reach / 4; step > 0.4; step /= 2) {
    for (const [ax, ay] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      tryAt(best.dx + ax * step, best.dy + ay * step);
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { dx: r(best.dx), dy: r(best.dy) };
}

/**
 * The outline of the project's shape: turned, placed and grown as the overlay asks, never smaller
 * than what covers `must`. place "auto" looks for the offset that gives the smallest shape.
 * Returns { cs, k, dx, dy }.
 */
export function placeOutline(kit, o, w, h, must) {
  const rot = o.rot ?? 0;
  const auto = (o.place ?? "auto") === "auto";
  const { dx, dy } = auto
    ? bestOffset(kit, o.shape, w, h, must, o, rot)
    : { dx: o.dx ?? 0, dy: o.dy ?? 0 };
  const fit = fitAt(kit, o.shape, w, h, must, o, { rot, dx, dy });
  // A fixed size (mm, longest side) is a floor: the shape is never smaller than what covers `must`.
  const k =
    o.size != null ? Math.max(o.size / Math.max(w, h), fit.k) : fit.k * (1 + (o.grow ?? 0) / 100);
  return { cs: k === fit.k ? fit.cs : fit.make(k), k, dx, dy };
}
