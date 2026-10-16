import { crossings } from "./path.js";

const MARGIN = 3; // keep clear of the bed edge

/** Smallest angle (degrees, 0..90) at which a w x h rectangle fits the bed, or null. */
export function fitAngle(w, h, bx, by) {
  for (let deg = 0; deg <= 90; deg++) {
    const a = (deg * Math.PI) / 180;
    const bw = w * Math.cos(a) + h * Math.sin(a);
    const bh = w * Math.sin(a) + h * Math.cos(a);
    if (bw <= bx && bh <= by) return deg;
  }
  return null;
}

/**
 * How to fit a W x H footprint on a bed: one piece (turned by `angle`) when possible, otherwise the
 * fewest equal grid cells that fit. `cutOk(axis, at)` vetoes a cut line. Returns { nx, ny, angle }.
 */
export function planGrid(W, H, bed, cutOk = () => true) {
  const bx = bed.x - 2 * MARGIN;
  const by = bed.y - 2 * MARGIN;
  const whole = fitAngle(W, H, bx, by);
  if (whole !== null) return { nx: 1, ny: 1, angle: whole, fits: true };
  let best = null;
  for (let nx = 1; nx <= 8; nx++)
    for (let ny = 1; ny <= 8; ny++) {
      const cw = W / nx;
      const ch = H / ny;
      const a = fitAngle(cw, ch, bx, by);
      if (a === null || a > 90) continue;
      const ok =
        Array.from({ length: nx - 1 }, (_, k) => cutOk(0, -W / 2 + ((k + 1) * W) / nx)).every(Boolean) &&
        Array.from({ length: ny - 1 }, (_, k) => cutOk(1, -H / 2 + ((k + 1) * H) / ny)).every(Boolean);
      if (!ok) continue;
      const cost = nx * ny * 1e7 + cw * ch;
      if (!best || cost < best.cost) best = { nx, ny, angle: a, cost, fits: true };
    }
  return best ?? { nx: 1, ny: 1, angle: 0, fits: false };
}

/** Cut a body into the nx x ny grid over its own bounding box. Returns [{ body, r, c }]. */
export function cutGrid(kit, body, bb, nx, ny) {
  if (nx === 1 && ny === 1) return [{ body, r: 0, c: 0 }];
  const out = [];
  const [x0, y0] = bb.min;
  const [x1, y1] = bb.max;
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      const cell = kit.box(
        c === 0 ? x0 - 1 : x0 + ((x1 - x0) * c) / nx,
        c === nx - 1 ? x1 + 1 : x0 + ((x1 - x0) * (c + 1)) / nx,
        r === 0 ? y0 - 1 : y0 + ((y1 - y0) * r) / ny,
        r === ny - 1 ? y1 + 1 : y0 + ((y1 - y0) * (r + 1)) / ny,
        bb.min[2] - 1,
        bb.max[2] + 1,
      );
      const piece = kit.inter(body, cell);
      if (!piece.isEmpty() && piece.volume() > 1) out.push({ body: piece, r, c });
    }
  return out;
}

/**
 * Bowtie connectors straddling every cut, on the flat back of the rails: pockets to subtract from
 * the frame and the matching keys. Returns { pockets, keys, warnings }.
 */
export function connectors(kit, { path, bb, nx, ny, ru, w, depthMax, tol }) {
  const pockets = [];
  const keys = [];
  const warnings = [];
  const flat = w - ru;
  const depth = Math.min(2.2, depthMax - 1.4);
  if (flat < 3.6 || depth < 1) {
    warnings.push("noConnectors");
    return { pockets, keys, warnings };
  }
  const Be = Math.min(7, flat * 0.75);
  const Bn = Be * 0.45;
  const L = Math.min(16, Be * 2.4);
  const bowtie = [[-L / 2, -Be / 2], [-L / 2, Be / 2], [0, Bn / 2], [L / 2, Be / 2], [L / 2, -Be / 2], [0, -Bn / 2]];
  const place = (cx, cy, alongX) => {
    const pts = bowtie.map(([a, b]) => (alongX ? [cx + a, cy + b] : [cx + b, cy + a]));
    const key = kit.poly(pts);
    pockets.push(kit.ext(kit.grow(key, tol, "Miter"), -0.1, depth));
    keys.push(kit.ext(key, 0, depth - 0.2));
  };
  const lines = [];
  for (let k = 1; k < nx; k++) lines.push([0, bb.min[0] + ((bb.max[0] - bb.min[0]) * k) / nx]);
  for (let k = 1; k < ny; k++) lines.push([1, bb.min[1] + ((bb.max[1] - bb.min[1]) * k) / ny]);
  for (const [axis, at] of lines)
    for (const { p, n } of crossings(path, axis, at)) {
      const mid = (ru + w) / 2;
      // A vertical cut (axis 0) runs through the top and bottom rails, so the key lies along x.
      place(p[0] + n[0] * mid, p[1] + n[1] * mid, axis === 0);
    }
  return { pockets, keys, warnings };
}
