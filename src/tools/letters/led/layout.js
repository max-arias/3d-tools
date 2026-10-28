// LED layout for one letter: runs of LEDs inside the cavity, chained into one data line.
import { chainRuns } from "./chain.js";
import { loopRuns } from "./perimeter.js";
import { rowRuns } from "./rows.js";

const ringsOf = (cs) => cs.toPolygons();

export function insideRings(rings, [x, y]) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

/** Whether the straight wire between two points leaves the cavity (so it goes through the back). */
function crossesWall(rings, a, b) {
  for (let s = 0; s <= 8; s++) {
    const u = s / 8;
    if (!insideRings(rings, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])) return true;
  }
  return false;
}

/** The vertical z of the LEDs: on the back plate for rows, mid-cavity for the perimeter run. */
export function ledZ(p) {
  const { depth, base } = p.size;
  if (p.leds.mode === "rows") return base + 1.5;
  return base + (depth - base - (p.lid.on ? p.lid.rebate : 0)) / 2;
}

/**
 * Lay out and chain the LEDs of one letter. `inner` is the cavity CrossSection; `from` is where the
 * data line comes from (the previous letter's last LED, or null for the first letter).
 * Returns { runs, jumps, count, end, issues, z } or null when nothing fits.
 */
export function layoutLeds(kit, inner, p, from) {
  const pitch = 1000 / p.leds.density;
  const issues = [];
  const usable = kit.grow(inner, -p.leds.margin);
  let found;
  if (p.leds.mode === "perimeter") {
    const cavity = p.size.depth - p.size.base - (p.lid.on ? p.lid.rebate : 0);
    if (p.leds.stripWidth > cavity) issues.push("strip-too-wide");
    found = loopRuns(ringsOf(kit.grow(inner, -1.5)), pitch);
  } else {
    const w = p.leds.stripWidth;
    const fit = (axis) => {
      const off = axis === "h" ? [0, w / 2] : [w / 2, 0];
      const neg = [-off[0], -off[1]];
      const area = kit.inter2d(kit.own(usable.translate(off)), kit.own(usable.translate(neg)));
      return rowRuns(ringsOf(area), { spacing: p.leds.spacing, pitch, axis });
    };
    if (p.leds.dir === "auto") {
      const h = fit("h");
      const v = fit("v");
      const n = (f) => f.runs.reduce((a, r) => a + r.pts.length, 0);
      found = n(v) > n(h) || (n(v) === n(h) && v.runs.length < h.runs.length) ? v : h;
    } else found = fit(p.leds.dir);
  }
  if (found.dropped) issues.push("led-short-dropped");
  if (!found.runs.length)
    return {
      runs: [],
      jumps: [],
      count: 0,
      end: from,
      issues: [...issues, "led-none"],
      z: ledZ(p),
    };
  const bb = inner.bounds();
  const start = from ?? [bb.min[0], bb.min[1]];
  const { runs, jumps, end } = chainRuns(found.runs, start);
  const rings = ringsOf(inner);
  return {
    runs,
    jumps: jumps.map((j) => ({ ...j, wall: crossesWall(rings, j.from, j.to) })),
    count: runs.reduce((n, r) => n + r.pts.length, 0),
    end,
    issues,
    z: ledZ(p),
  };
}
