// Seeded random designs. A lock keeps that section exactly as it is.
import { buildShade } from "../geom/shade.js";
import { THIN_RATIO, minWall } from "../geom/thickness.js";
import { MAX_NODES, WAVES, SOCKETS, SPOKE_STYLES, sanitize } from "./project.js";

/** Small fast seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r, lo, hi) => lo + r() * (hi - lo);
const pick = (r, list) => list[Math.floor(r() * list.length)];

/**
 * Reroll the unlocked sections of `project` from `seed`.
 * `locks` is { shape, ribs, holder } booleans. A draw whose ribs would thin the wall below what
 * prints reliably is redrawn (always the same way for the same seed).
 */
export function randomize(project, seed, locks = {}) {
  let last;
  for (let attempt = 0; attempt < 12; attempt++) {
    last = draw(project, seed, locks, attempt);
    if (minWall(last, buildShade(last)) >= last.wall * THIN_RATIO) return last;
    if (locks.shape && locks.ribs) return last; // nothing left to redraw
  }
  return locks.ribs ? last : sanitize({ ...last, ribs: { ...last.ribs, depth: 0 } });
}

function draw(project, seed, locks, attempt) {
  const next = structuredClone(project);
  next.seed = seed;

  // Each section draws from its own stream so locking one does not change what the others get.
  if (!locks.shape) {
    const s = rng(seed * 3 + 1 + attempt * 7919);
    next.type = pick(s, ["table", "pendant"]);
    next.height = Math.round(between(s, 110, 260));
    const count = 3 + Math.floor(s() * Math.min(5, MAX_NODES - 3));
    // One point per slice of the height, jittered inside it, so no two sit almost on top of each other.
    const zs = Array.from(
      { length: count - 2 },
      (_, k) => (k + 1 + (s() - 0.5) * 0.6) / (count - 1),
    );
    let d = between(s, 90, 230);
    next.nodes = [0, ...zs, 1].map((z) => {
      d = Math.min(240, Math.max(75, d + between(s, -70, 70)));
      return { z, d: Math.round(d) };
    });
    if (!locks.holder) next.holder.at = next.type === "pendant" ? "top" : "bottom";
  }
  if (!locks.ribs) {
    const s = rng(seed * 3 + 2 + attempt * 7919);
    next.ribs = {
      count: Math.round(between(s, 6, 40)),
      depth: s() < 0.2 ? 0 : +between(s, 1, 7).toFixed(1),
      twist: s() < 0.4 ? 0 : Math.round(between(s, -180, 180)),
      wave: pick(s, WAVES),
    };
  }
  if (!locks.holder) {
    const s = rng(seed * 3 + 3);
    next.holder.socket = pick(s, SOCKETS);
    next.holder.spokes = {
      count: 3 + Math.floor(s() * 4),
      style: pick(s, SPOKE_STYLES),
      width: Math.round(between(s, 5, 12)),
      rotation: 0,
    };
  }
  return sanitize(next);
}

export const newSeed = () => 1 + Math.floor(Math.random() * 999998);
