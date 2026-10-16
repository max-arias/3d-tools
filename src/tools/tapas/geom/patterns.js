// 2D motifs for the overlay face. Every motif is original. `build` returns CrossSections centred on
// the origin covering [-R, R]; `buildPattern` rotates, clips to the free area and returns one shape.
import { UNITS } from "./shapes.js";

const TAU = Math.PI * 2;

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Polygon outlining a polyline of width `wd` (butt ends). */
function band(pts, wd) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * (wd / 2);
    const ny = ((b[0] - a[0]) / len) * (wd / 2);
    left.push([pts[i][0] + nx, pts[i][1] + ny]);
    right.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  const poly = [...left, ...right.reverse()];
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    area += x0 * y1 - x1 * y0;
  }
  return area > 0 ? poly : poly.reverse(); // CrossSection wants counter-clockwise outlines
}

/** Every k-th point: tiles repeat hundreds of times, so they use coarse outlines. */
const thin = (pts, k) => pts.filter((_, i) => i % k === 0);

const range = (n) => Array.from({ length: 2 * n + 1 }, (_, i) => i - n);

/** Lattice points of a hex-ish grid with pitch s covering [-R, R]. */
function lattice(s, R, rowH = 0.866) {
  const out = [];
  const nj = Math.ceil(R / (s * rowH)) + 1;
  const ni = Math.ceil(R / s) + 1;
  for (const j of range(nj))
    for (const i of range(ni)) out.push([i * s + (j & 1 ? s / 2 : 0), j * s * rowH, i, j]);
  return out;
}

const regular = (n, r, rot = 0) =>
  Array.from({ length: n }, (_, i) => [
    r * Math.cos(rot + (i / n) * TAU),
    r * Math.sin(rot + (i / n) * TAU),
  ]);

export const PATTERNS = {
  stripes: ({ kit, s, w, R }) =>
    range(Math.ceil(R / s)).map((i) => kit.rect(-R, R, i * s - (s * w) / 2, i * s + (s * w) / 2)),
  dots: ({ kit, s, w, R }) => lattice(s, R).map(([x, y]) => kit.circle((s * w) / 2, x, y, 16)),
  checks: ({ kit, s, R }) => {
    const n = Math.ceil(R / s);
    return range(n).flatMap((i) =>
      range(n)
        .filter((j) => (i + j) % 2 === 0)
        .map((j) => kit.rect(i * s, (i + 1) * s, j * s, (j + 1) * s)),
    );
  },
  waves: ({ kit, s, w, R }) =>
    range(Math.ceil(R / s)).map((j) => {
      const pts = [];
      for (let x = -R; x <= R; x += s / 6)
        pts.push([x, j * s + s * 0.25 * Math.sin((x / s) * Math.PI)]);
      return kit.poly(band(pts, s * w * 0.35));
    }),
  hexagons: ({ kit, s, w, R }) => {
    const r0 = s / Math.sqrt(3);
    const t = s * w * 0.3;
    return lattice(s, R).map(([x, y]) => {
      const ring = kit.csSub(
        kit.poly(regular(6, r0, Math.PI / 6)),
        kit.poly(regular(6, Math.max(0.2, r0 - t), Math.PI / 6)),
      );
      return kit.own(ring.translate([x, y]));
    });
  },
  triangles: ({ kit, s, w, R }) => {
    const k = (s * (0.3 + 0.5 * w)) / 2;
    return lattice(s, R).map(([x, y, i, j]) => {
      const up = (i + j) % 2 === 0;
      return kit.poly(
        regular(3, k, up ? Math.PI / 2 : -Math.PI / 2).map(([px, py]) => [px + x, py + y]),
      );
    });
  },
  hearts: ({ kit, s, w, R }) => {
    const k = s * (0.4 + 0.5 * w);
    return lattice(s, R).map(([x, y]) =>
      kit.poly(thin(UNITS.heart, 5).map(([px, py]) => [px * k + x, py * k + y])),
    );
  },
  stars: ({ kit, s, w, R }) => {
    const k = s * (0.45 + 0.5 * w);
    return lattice(s, R).map(([x, y]) =>
      kit.poly(thin(UNITS.star, 5).map(([px, py]) => [px * k + x, py * k + y])),
    );
  },
  terrazzo: ({ kit, s, w, R }) => {
    const rand = rng(7);
    const count = Math.min(1500, Math.round(((2 * R) ** 2 / (s * s)) * 1.4));
    return Array.from({ length: count }, () => {
      const cx = (rand() * 2 - 1) * R;
      const cy = (rand() * 2 - 1) * R;
      const r = s * (0.12 + 0.25 * w) * (0.5 + rand());
      const n = 5 + Math.floor(rand() * 3);
      const rot = rand() * TAU;
      return kit.poly(
        regular(n, r, rot).map(([x, y], i) => [
          x * (0.7 + (0.6 * ((i * 7919) % 5)) / 4) + cx,
          y * (0.7 + (0.6 * ((i * 104729) % 5)) / 4) + cy,
        ]),
      );
    });
  },
  herringbone: ({ kit, s, w, R }) => {
    const len = s * 0.9;
    const t = s * w * 0.35;
    const n = Math.ceil(R / s) + 1;
    return range(n).flatMap((i) =>
      range(n).map((j) => {
        const rect = kit.own(kit.rect(-len / 2, len / 2, -t / 2, t / 2).rotate(i % 2 ? 45 : -45));
        return kit.own(rect.translate([i * s * 0.7, j * s + (i % 2 ? s / 2 : 0)]));
      }),
    );
  },
  // Sol de Mayo-style sun: a disc with alternating straight and narrow rays.
  sol: ({ kit, s, w, R }) => {
    const rays = [kit.circle(s * 0.15, 0, 0, 24)];
    for (let i = 0; i < 16; i++) {
      const long = i % 2 === 0;
      const tip = s * (long ? 0.46 : 0.36) * (0.8 + 0.4 * w);
      const half = s * (long ? 0.05 : 0.03);
      const a = (i / 16) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const r0 = s * 0.13;
      rays.push(
        kit.poly([
          [r0 * c - half * sn, r0 * sn + half * c],
          [tip * c, tip * sn],
          [r0 * c + half * sn, r0 * sn - half * c],
        ]),
      );
    }
    const sun = kit.csUnion(rays);
    return lattice(s * 1.1, R).map(([x, y]) => kit.own(sun.translate([x, y])));
  },
  // Filete porteño-style double spiral: mirrored curls in alternating columns.
  filete: ({ kit, s, w, R }) => {
    const pts = [];
    for (let th = 0.4; th < 3.3 * Math.PI; th += 0.3) {
      const r = s * (0.05 + 0.07 * th);
      pts.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    const curl = kit.poly(band(pts, Math.max(0.5, s * w * 0.14)));
    const flip = kit.own(curl.mirror([1, 0]));
    return lattice(s * 1.1, R, 1).map(([x, y, i]) =>
      kit.own((i & 1 ? flip : curl).translate([x, y])),
    );
  },
};

/** Border band that follows the outline (guarda pampa-style): two lines with a dashed one between. */
function guarda({ kit, s, w, outline, margin }) {
  const t = Math.max(0.8, s * w * 0.12);
  const gap = t;
  const ring = (inset, width) =>
    kit.csSub(
      kit.own(outline.offset(-inset, "Round", 2, 32)),
      kit.own(outline.offset(-(inset + width), "Round", 2, 32)),
    );
  const u = t * 2;
  const R = 400;
  const lattice2 = [];
  for (const i of range(Math.ceil(R / u)))
    for (const j of range(Math.ceil(R / u)))
      if ((i + j) % 2 === 0 && Math.abs(i * u) < 150 && Math.abs(j * u) < 150)
        lattice2.push(kit.rect(i * u, (i + 1) * u, j * u, (j + 1) * u));
  const dashes = kit.inter2d(ring(margin + t + gap, t), kit.csUnion(lattice2));
  return kit.csUnion(ring(margin, t), dashes, ring(margin + 2 * (t + gap), t));
}

export const PATTERN_IDS = [...Object.keys(PATTERNS), "guarda"];

/**
 * One CrossSection with the pattern clipped to `area`, or null when it is empty.
 * p = { id, scale, weight, rot }; `outline` is the overlay's outline (used by the border pattern).
 */
export function buildPattern(kit, p, area, outline) {
  if (area.isEmpty()) return null;
  const bb = area.bounds();
  const cx = (bb.min[0] + bb.max[0]) / 2;
  const cy = (bb.min[1] + bb.max[1]) / 2;
  const R = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2 + 1;
  // Cap the element count so a tiny scale cannot freeze the worker.
  const s = Math.max(p.scale, (2 * R) / Math.sqrt(6000));
  let shape;
  if (p.id === "guarda") {
    shape = guarda({ kit, s, w: p.weight, outline, margin: p.margin });
  } else {
    const union = kit.csUnion(PATTERNS[p.id]({ kit, s, w: p.weight, R }));
    shape = kit.own(kit.own(union.rotate(p.rot)).translate([cx, cy]));
  }
  const clipped = kit.inter2d(shape, area);
  return clipped.isEmpty() ? null : clipped;
}
