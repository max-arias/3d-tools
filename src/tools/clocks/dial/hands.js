// Hand outlines (mm, pointing up +y from the shaft at the origin) and their balance. Pure.
export const HAND_STYLES = ["baton", "spade", "leaf", "sword", "arrow", "skeleton"];

const TAU = Math.PI * 2;
const disc = (r, cx = 0, cy = 0, n = 40) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((i / n) * TAU),
    cy + r * Math.sin((i / n) * TAU),
  ]);

/** Lens between y0 and y1, widest (`w`) at fraction `at` of its length. */
function lens(y0, y1, w, at = 0.4, n = 24) {
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const shape =
      t < at ? Math.sin((t / at) * (Math.PI / 2)) : Math.cos(((t - at) / (1 - at)) * (Math.PI / 2));
    const y = y0 + t * (y1 - y0);
    right.push([(w / 2) * Math.max(shape, 0.06), y]);
    left.unshift([-(w / 2) * Math.max(shape, 0.06), y]);
  }
  return [...right, ...left];
}

/**
 * Polygons that union into one hand: blade, hub boss and counterweight tail.
 * h = { style, length, width, tail } (mm); `hubR` is the boss radius around the hole.
 * Returns { add: [ring], cut: [ring] } (cut: openings inside the blade, e.g. the skeleton window).
 */
export function handPolys(h, hubR) {
  const L = h.length;
  const w = h.width;
  const add = [disc(hubR)];
  const cut = [];
  const tail = h.tail > 0 ? h.tail : 0;
  const bar = (y0, y1, w0, w1 = w0) => [
    [-w0 / 2, y0],
    [w0 / 2, y0],
    [w1 / 2, y1],
    [-w1 / 2, y1],
  ];
  if (tail > 0) {
    add.push(bar(-tail, 0, w * 0.8));
    add.push(disc(Math.max(w, hubR * 0.8), 0, -tail, 32));
  }
  switch (h.style) {
    case "spade": {
      add.push(bar(0, L * 0.7, w * 0.55));
      const sp = lens(L * 0.6, L, w * 2.2, 0.35);
      add.push(sp);
      cut.push(disc(w * 0.38, 0, L * 0.73, 20));
      break;
    }
    case "leaf":
      add.push(lens(0, L, w * 2, 0.35));
      break;
    case "skeleton":
      add.push(lens(0, L, w * 2.2, 0.35));
      cut.push(lens(hubR + w * 0.6, L - w * 1.6, w * 1.1, 0.35));
      break;
    case "sword":
      add.push([
        [-w * 0.75, 0],
        [w * 0.75, 0],
        [w * 0.45, L * 0.85],
        [0, L],
        [-w * 0.45, L * 0.85],
      ]);
      break;
    case "arrow": {
      add.push(bar(0, L * 0.8, w * 0.5));
      add.push([
        [-w * 1.3, L * 0.78],
        [w * 1.3, L * 0.78],
        [0, L],
      ]);
      break;
    }
    default:
      add.push(bar(0, L - w / 2, w, w * 0.8));
      add.push(disc((w * 0.8) / 2, 0, L - w / 2, 20));
  }
  return { add, cut };
}

/** Part of the hand from `from` (fraction of the length) to the tip: the glow tip zone. */
export function tipZone(h, from = 0.72) {
  const y0 = h.length * from;
  const x = h.width * 3;
  return [
    [-x, y0],
    [x, y0],
    [x, h.length + 2],
    [-x, h.length + 2],
  ];
}

/** Hole ring for a hand: round (`flat` 0) or an I-shaft bush (circle cut by two flats). */
export function holeRing(d, flat = 0, n = 48) {
  const r = d / 2;
  if (!(flat > 0) || flat >= d) return disc(r, 0, 0, n);
  const f = flat / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.max(-f, Math.min(f, r * Math.cos(a)));
    pts.push([x, r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Area (mm²) and first moment about the shaft along the hand (mm³) of polygons from
 * CrossSection.toPolygons() (holes come back clockwise, so signed sums handle them).
 */
export function areaMoment(polys) {
  let area = 0;
  let my = 0;
  for (const ring of polys)
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      const c = x0 * y1 - x1 * y0;
      area += c / 2;
      my += ((y0 + y1) * c) / 6;
    }
  return { area: Math.abs(area), moment: area < 0 ? -my : my };
}

/** Default hand lengths and widths for a face of radius R with numerals reaching in to `numeralR`. */
export function defaultHandSizes(R, numeralR) {
  const inner = Math.min(R, numeralR);
  return {
    hour: { length: Math.round(inner * 0.62), width: Math.max(3, Math.round(R * 0.05 * 10) / 10) },
    minute: {
      length: Math.round(inner * 0.92),
      width: Math.max(2.4, Math.round(R * 0.036 * 10) / 10),
    },
    second: { length: Math.round(inner * 0.95), width: 1.2 },
  };
}
