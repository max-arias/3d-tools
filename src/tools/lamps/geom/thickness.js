// Measured wall thickness of a built shade: how close the inner surface comes to the outer one.
// Sharp rib valleys or a very steep profile can thin the wall below the setting, and a slicer
// will not say so.
import { ringCount, segmentCount } from "./shade.js";

/** Squared distance from point (px, py, pz) to triangle abc, scalar form of Ericson's closest point. */
function triDistSq(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const x = apx - abx * v,
      y = apy - aby * v,
      z = apz - abz * v;
    return x * x + y * y + z * z;
  }
  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const x = apx - acx * w,
      y = apy - acy * w,
      z = apz - acz * w;
    return x * x + y * y + z * z;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const x = bpx - (cx - bx) * w,
      y = bpy - (cy - by) * w,
      z = bpz - (cz - bz) * w;
    return x * x + y * y + z * z;
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den,
    w = vc * den;
  const x = apx - abx * v - acx * w,
    y = apy - aby * v - acy * w,
    z = apz - abz * v - acz * w;
  return x * x + y * y + z * z;
}

/**
 * Thinnest wall of the shade mesh from `buildShade(p)`, in mm. Samples inner-surface points and
 * measures to the nearby outer triangles.
 */
export function minWall(p, { positions: P, indices: I }) {
  const Z = ringCount(p);
  const S = segmentCount(p);
  const grid = (Z + 1) * S;
  // Outer triangles come first in each quad's group of four: (i, j) -> triangles (i * S + j) * 4 + 0..1.
  // A steep stretch of the profile can be a single row tall and a rib cusp a single column wide,
  // so every row and column is checked.
  const rowWin = Math.ceil((1.6 * p.wall) / (p.height / Z)) + 1;
  let best = Infinity;
  for (let i = 1; i < Z; i++)
    for (let j = 0; j < S; j++) {
      const v = (grid + i * S + j) * 3;
      const px = P[v],
        py = P[v + 1],
        pz = P[v + 2];
      // Look as far around and up as a wall is thick (with margin): a closer outer point can only
      // be that near, so a narrower window would miss the thin spots across a rib valley.
      const rho = Math.hypot(px, py) || 1;
      const colWin = Math.min(40, Math.ceil((1.6 * p.wall) / ((rho * 2 * Math.PI) / S)) + 1);
      for (let ii = Math.max(0, i - rowWin); ii < Math.min(Z, i + rowWin); ii++)
        for (let dj = -colWin; dj <= colWin; dj++) {
          const base = (ii * S + ((j + dj + S) % S)) * 12; // 4 triangles x 3 indices per quad group
          for (let k = 0; k < 6; k += 3) {
            const a = I[base + k] * 3,
              b = I[base + k + 1] * 3,
              c = I[base + k + 2] * 3;
            const d = triDistSq(
              px,
              py,
              pz,
              P[a],
              P[a + 1],
              P[a + 2],
              P[b],
              P[b + 1],
              P[b + 2],
              P[c],
              P[c + 1],
              P[c + 2],
            );
            if (d < best) best = d;
          }
        }
    }
  return Math.sqrt(best);
}

/** Walls under this share of the setting are flagged. */
export const THIN_RATIO = 0.75;
