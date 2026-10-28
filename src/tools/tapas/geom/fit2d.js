// Plain-JS 2D helpers for the live preview: no manifold, so the interface can follow the pointer.
// Outlines are arrays of [x, y]; `fitScale` mirrors what shapes.js `fitAt` does with booleans.
const RAD = Math.PI / 180;

/** Rounded rectangle, centred, counter-clockwise. */
export function rrectPoints(w, h, r, seg = 8) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r < 1e-6)
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
  const out = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, 90],
    [-w / 2 + r, -h / 2 + r, 180],
    [w / 2 - r, -h / 2 + r, 270],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = (a0 + (90 * i) / seg) * RAD;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return out;
}

export function circlePoints(r, n = 48) {
  return Array.from({ length: n }, (_, i) => [
    r * Math.cos((i / n) * 2 * Math.PI),
    r * Math.sin((i / n) * 2 * Math.PI),
  ]);
}

/** Scale by k, turn by `rot` degrees (counter-clockwise) and move by (dx, dy), in that order. */
export function transform(poly, { k = 1, rot = 0, dx = 0, dy = 0 } = {}) {
  const c = Math.cos(rot * RAD);
  const s = Math.sin(rot * RAD);
  return poly.map(([x, y]) => [k * (x * c - y * s) + dx, k * (x * s + y * c) + dy]);
}

/** Add points along long edges so no stretch is longer than `step`. */
export function densify(poly, step = 3) {
  const out = [];
  poly.forEach(([x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 0; j < n; j++) out.push([x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n]);
  });
  return out;
}

export function insidePoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The rounded rectangle the outline has to cover, with points sampled along its edge. */
export function mustShape(w, h, r) {
  return { w, h, r, pts: densify(rrectPoints(w, h, r, 10), 3) };
}

const inRRect = (x, y, { w, h, r }) => {
  const ax = Math.abs(x) - (w / 2 - r);
  const ay = Math.abs(y) - (h / 2 - r);
  if (Math.abs(x) > w / 2 || Math.abs(y) > h / 2) return false;
  return ax <= 0 || ay <= 0 || ax * ax + ay * ay <= r * r;
};

const backPoints = (must, { rot = 0, dx = 0, dy = 0 }) => {
  const c = Math.cos(-rot * RAD);
  const s = Math.sin(-rot * RAD);
  return must.pts.map(([x, y]) => [(x - dx) * c - (y - dy) * s, (x - dx) * s + (y - dy) * c]);
};

/**
 * Does `unit` scaled by k, turned and moved, hold the whole of `must`? Every sampled point of its
 * edge must be inside, and no corner of the outline may poke into it (a notch like a heart's cleft
 * can slip between two samples).
 */
export function covers(unit, must, k, at = {}) {
  return holdsAt(unit, must, backPoints(must, at), k, at);
}

function holdsAt(unit, must, back, k, { rot = 0, dx = 0, dy = 0 }) {
  if (!back.every(([x, y]) => insidePoly(x / k, y / k, unit))) return false;
  const c = Math.cos(rot * RAD);
  const s = Math.sin(rot * RAD);
  // a corner within 0.1 mm of the plate's edge is on it, not in it
  const inner = { w: must.w - 0.2, h: must.h - 0.2, r: Math.max(0, must.r - 0.1) };
  return !unit.some(([x, y]) => inRRect(k * (x * c - y * s) + dx, k * (x * s + y * c) + dy, inner));
}

/**
 * Smallest k so that `unit` (the outline at k = 1), scaled by k, turned and moved, still holds
 * every point of `must`. Same search as shapes.js `fitAt`, with point tests instead of booleans.
 */
export function fitScale(unit, must, at = {}) {
  const back = backPoints(must, at);
  const holds = (k) => holdsAt(unit, must, back, k, at);
  let lo = 0.3;
  if (holds(lo)) return lo;
  let hi = lo * 1.5;
  while (!holds(hi) && hi < 40) hi *= 1.5;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (holds(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The size the cover really has: a fixed `size` (mm) is a floor over the smallest cover; same as shapes.js placeOutline. */
export function effectiveK(unit, must, o, at, box) {
  const full = { rot: o.rot, dx: at.dx, dy: at.dy };
  if (o.size != null) {
    const k = o.size / Math.max(box.w, box.h);
    if (covers(unit, must, k, full)) return k;
    return fitScale(unit, must, full);
  }
  return fitScale(unit, must, full) * (1 + (o.grow ?? 0) / 100);
}

/**
 * Move from `from` toward `target` (both { dx, dy }) without leaving the offsets where `ok` holds:
 * the target itself, else the one-axis slide closest to it, else as far along the line as it goes.
 */
export function constrainMove(ok, from, target) {
  if (ok(target)) return target;
  const slides = [
    { dx: target.dx, dy: from.dy },
    { dx: from.dx, dy: target.dy },
  ].filter(ok);
  if (slides.length) {
    const d = (a) => Math.hypot(a.dx - target.dx, a.dy - target.dy);
    return slides.sort((a, b) => d(a) - d(b))[0];
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (
      ok({ dx: from.dx + (target.dx - from.dx) * mid, dy: from.dy + (target.dy - from.dy) * mid })
    )
      lo = mid;
    else hi = mid;
  }
  return { dx: from.dx + (target.dx - from.dx) * lo, dy: from.dy + (target.dy - from.dy) * lo };
}

/** [minX, maxX, minY, maxY] of a polygon. */
export function bounds(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}

/** Window outlines (one or more polygons) around (0, 0), grown by `m`; mirrors overlay.js windowShape. */
export function windowPolygons(win, m) {
  if (win.kind === "circle") return [circlePoints(win.d / 2 + m)];
  if (win.kind === "slots")
    return win.slots.map((s) =>
      transform(rrectPoints(s.w + 2 * m, s.l + 2 * m, (s.w + 2 * m) / 2, 4), {
        rot: s.ang,
        dx: s.x,
        dy: s.y,
      }),
    );
  return [rrectPoints(win.x + 2 * m, win.y + 2 * m, win.r + m, 4)];
}

/** Sizes of the cover's outline problem: the pocket, and the shape that must hold pocket + wall. */
export function overlayBox(p) {
  const { plate, overlay: o } = p;
  const pocketW = plate.w + 2 * o.clearance;
  const pocketH = plate.h + 2 * o.clearance;
  const pocketR = plate.r + o.clearance;
  return {
    pocketW,
    pocketH,
    pocketR,
    w: pocketW + 2 * o.wall,
    h: pocketH + 2 * o.wall,
    r: pocketR + o.wall,
  };
}
