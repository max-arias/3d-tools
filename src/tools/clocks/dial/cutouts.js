// Holes through the face: seeded "cheese" holes, radial slots, a perforated ring. Pure.
// Every hole keeps clear of the keep-outs (hub and movement, markers, mounts) and of the edge.
import { edgeDistance, insideOutline } from "./outline.js";
import { slotAngle } from "./markers.js";

export const CUTOUTS = ["none", "cheese", "slots", "ring"];
const TAU = Math.PI * 2;
/** Material left between a hole and the edge, another hole or a keep-out, mm. */
export const MIN_WEB = 2.5;

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const disc = (r, cx, cy, n = 32) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((i / n) * TAU),
    cy + r * Math.sin((i / n) * TAU),
  ]);

/** Whether a circle (cx, cy, r) is clear of the edge and every keep-out ({ at, r } or { rect }). */
function clear(outline, keep, cx, cy, r) {
  if (!insideOutline(outline, [cx, cy])) return false;
  if (edgeDistance(outline, [cx, cy]) < r + MIN_WEB) return false;
  for (const k of keep) {
    if (k.rect) {
      const [x0, y0, x1, y1] = k.rect;
      const dx = Math.max(x0 - cx, 0, cx - x1);
      const dy = Math.max(y0 - cy, 0, cy - y1);
      if (Math.hypot(dx, dy) < r + MIN_WEB) return false;
    } else if (Math.hypot(cx - k.at[0], cy - k.at[1]) < r + k.r + MIN_WEB) return false;
  }
  return true;
}

/**
 * c = project.cutouts { kind, seed, count, size }; R = face radius; keep = keep-outs.
 * Returns [{ ring, at: [x, y], r }].
 */
export function layoutCutouts(c, outline, R, keep, hours = 12) {
  const out = [];
  if (c.kind === "none" || !outline) return out;
  if (c.kind === "cheese") {
    const rand = rng(c.seed);
    const [x0, x1] = [-outline.w, outline.w];
    const [y0, y1] = [-outline.h, outline.h];
    const big = Math.max(3, c.size);
    for (let tries = 0; tries < c.count * 60 && out.length < c.count; tries++) {
      // Sizes skew small: a few big holes and many little ones, like the real thing.
      const r = Math.max(2, big * (0.25 + 0.75 * rand() ** 2));
      const cx = x0 + rand() * (x1 - x0);
      const cy = y0 + rand() * (y1 - y0);
      if (!clear(outline, [...keep, ...out], cx, cy, r)) continue;
      out.push({ ring: disc(r, cx, cy, Math.max(20, Math.round(r * 4))), at: [cx, cy], r });
    }
  } else if (c.kind === "slots") {
    // One slot between each pair of hour markers, from 45% to 75% of the radius.
    const w = Math.max(3, c.size);
    for (let i = 0; i < hours; i++) {
      const a = slotAngle(i + 0.5, hours);
      const r0 = R * 0.45;
      const r1 = R * 0.75;
      const steps = Math.max(2, Math.ceil((r1 - r0) / (w / 2)));
      const ok = Array.from({ length: steps + 1 }, (_, s) => r0 + ((r1 - r0) * s) / steps).every(
        (rr) => clear(outline, keep, rr * Math.cos(a), rr * Math.sin(a), w / 2),
      );
      if (!ok) continue;
      const c0 = Math.cos(a);
      const s0 = Math.sin(a);
      const ring = [];
      for (let k = 0; k <= 12; k++) {
        const t = Math.PI / 2 + (k / 12) * Math.PI;
        ring.push([
          r0 * c0 + (w / 2) * (Math.cos(t) * c0 - Math.sin(t) * s0),
          r0 * s0 + (w / 2) * (Math.cos(t) * s0 + Math.sin(t) * c0),
        ]);
      }
      for (let k = 0; k <= 12; k++) {
        const t = -Math.PI / 2 + (k / 12) * Math.PI;
        ring.push([
          r1 * c0 + (w / 2) * (Math.cos(t) * c0 - Math.sin(t) * s0),
          r1 * s0 + (w / 2) * (Math.cos(t) * s0 + Math.sin(t) * c0),
        ]);
      }
      out.push({
        ring,
        at: [((r0 + r1) / 2) * c0, ((r0 + r1) / 2) * s0],
        r: (r1 - r0) / 2 + w / 2,
      });
    }
  } else if (c.kind === "ring") {
    const r = Math.max(1.5, c.size / 2);
    const rr = R * 0.6;
    const n = Math.max(6, Math.min(c.count, Math.floor((TAU * rr) / (2 * r + MIN_WEB))));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const cx = rr * Math.cos(a);
      const cy = rr * Math.sin(a);
      if (clear(outline, keep, cx, cy, r)) out.push({ ring: disc(r, cx, cy), at: [cx, cy], r });
    }
  }
  return out;
}
