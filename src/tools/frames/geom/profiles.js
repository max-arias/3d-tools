// Moulding profile catalogue, drawn from scratch. Each profile is a top-face curve in a unit box:
// [s, h] points with s from 0 (window edge) to 1 (outer edge) and h from 0 to 1 (fraction of the
// moulding height). `crossSection` scales it and closes it into the frame's back and rabbet.
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const sample = (f, n = 24) => Array.from({ length: n + 1 }, (_, i) => [i / n, f(i / n)]);
const bead = (x) => Math.sqrt(Math.max(0, 1 - (2 * x - 1) ** 2));
const beads = (count, base) => (s) => base + (1 - base) * bead((s * count) % 1 || (s > 0 ? 1 : 0));

export const PROFILES = {
  box: {
    label: "Box",
    pts: [
      [0, 1],
      [1, 1],
    ],
  },
  cushion: { label: "Cushion", pts: sample((s) => 0.55 + 0.45 * Math.sin(Math.PI * s)) },
  slopeOut: {
    label: "Slope out",
    pts: [
      [0, 1],
      [1, 0.4],
    ],
  },
  slopeIn: {
    label: "Slope in",
    pts: [
      [0, 0.45],
      [1, 1],
    ],
  },
  stepped: {
    label: "Stepped",
    pts: [
      [0, 1],
      [0.25, 1],
      [0.25, 0.8],
      [0.5, 0.8],
      [0.5, 0.6],
      [0.75, 0.6],
      [0.75, 0.4],
      [1, 0.4],
    ],
  },
  curve: { label: "Simple curve", pts: sample((s) => 0.35 + 0.65 * Math.sqrt(1 - s * s)) },
  cove: { label: "Cove", pts: sample((s) => 1 - 0.65 * Math.sqrt(1 - (1 - s) ** 2)) },
  ogee: { label: "Ogee", pts: sample((s) => lerp(1, 0.35, smooth(s))) },
  doubleHump: {
    label: "Double hump",
    pts: sample((s) => 0.6 + 0.4 * Math.sin(2 * Math.PI * s) ** 2, 40),
  },
  ripple: {
    label: "Ripple",
    pts: sample((s) => 0.7 + 0.3 * Math.abs(Math.sin(5 * Math.PI * s)), 60),
  },
  doubleBead: { label: "Double bead", pts: sample(beads(2, 0.5), 48) },
  reeded: { label: "Reeded", pts: sample(beads(4, 0.72), 64) },
  singleBead: {
    label: "Single bead",
    pts: sample((s) => 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - ((s - 0.5) / 0.35) ** 2)), 40),
  },
  gallery: {
    label: "Gallery lip",
    pts: [
      [0, 0.45],
      [0.75, 0.45],
      [0.8, 0.8],
      [0.88, 1],
      [1, 0.9],
    ],
  },
  tray: {
    label: "Tray",
    pts: [
      [0, 1],
      [0.15, 1],
      [0.22, 0.5],
      [0.78, 0.5],
      [0.85, 1],
      [1, 1],
    ],
  },
  swoosh: { label: "Swoosh", pts: sample((s) => 0.35 + 0.65 * Math.exp(-4 * s)) },
  gable: {
    label: "Gable",
    pts: [
      [0, 0.5],
      [0.5, 1],
      [1, 0.5],
    ],
  },
};
export const PROFILE_IDS = Object.keys(PROFILES);

/** Lowest curve height over s in [0, s1]. */
export function minHeight(id, s1) {
  const pts = PROFILES[id].pts;
  let m = pts[0][1];
  for (const [s, h] of pts) if (s <= s1) m = Math.min(m, h);
  const end = pts.find((p) => p[0] > s1);
  if (end) m = Math.min(m, end[1]);
  return m;
}

/**
 * Closed counter-clockwise [u, z] polygon of the moulding: width `w`, height `hgt`, a rabbet cut
 * from the back (depth `rd`) that reaches `ru` from the window edge, so the lip above it stays solid.
 */
export function crossSection(id, { w, hgt, rd, ru }) {
  const top = PROFILES[id].pts.map(([s, h]) => [s * w, h * hgt]);
  const poly = [[ru, 0], [w, 0], ...top.slice().reverse(), [0, rd], [ru, rd]];
  return poly;
}
