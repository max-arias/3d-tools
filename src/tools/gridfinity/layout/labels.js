import { FOOT_H, GF } from "../constants.js";

const isFrontBack = (wall) => wall === "front" || wall === "back";

/** Number of label slots a bin has: none 0, full width 1, per compartment (dividers + 1). */
export function labelSlotCount(eff) {
  if (eff.label === "none") return 0;
  if (eff.label === "full") return 1;
  return (isFrontBack(eff.labelWall) ? eff.dividersX : eff.dividersY) + 1;
}

/** [start, end] of each slot along a wall of length `len`. */
export function slotRanges(len, count, kind) {
  if (kind === "full" || count <= 1) return kind === "none" ? [] : [[0, len]];
  const seg = len / count;
  return Array.from({ length: count }, (_, i) => [i * seg + 0.2 * seg, (i + 1) * seg - 0.2 * seg]);
}

/** Overall bin dimensions used by label fitting. */
export function binOuter(grid, bin) {
  return { w: bin.w * grid.pitchX - 2 * GF.binGap, d: bin.d * grid.pitchY - 2 * GF.binGap };
}

/** Depth of the label tab into the bin, or 0 when the bin is too small for one. */
export function tabDepth(eff, outer) {
  const H = eff.heightMm || eff.units * 7;
  const top = H + (eff.lip ? GF.lipH : 0);
  const floorTop = FOOT_H + eff.floor;
  const across = isFrontBack(eff.labelWall) ? outer.d : outer.w;
  const depth = Math.min(12, (across - 2 * eff.wall) / 3, top - floorTop - 1);
  return depth <= 2 ? 0 : depth;
}

/** Text box inside one slot [r0, r1] of a wall of length `len`. Null when there is no room. */
export function textBox({ r0, r1, len, wall, depth }) {
  const edge = GF.binGap + wall;
  const u0 = Math.max(r0, edge) + 2;
  const w = Math.min(r1, len - edge) - 2 - u0;
  const h = depth - 1 - 1.5;
  return w > 0 && h > 0 ? { u0, w, h } : null;
}

/** Slot order used by the Labels tab: back to front, then left to right. */
export const labelOrder = (bins) => [...bins].sort((a, b) => b.y + b.d - (a.y + a.d) || a.x - b.x);
