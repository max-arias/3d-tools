// The shade as a closed triangle mesh, built directly from the project (no WASM).
import { outerRadius, profileCurve } from "./profile.js";

export const ringCount = (p) => Math.max(40, Math.min(240, Math.ceil(p.height / 1.5)));
export const segmentCount = (p) => Math.min(720, Math.max(96, p.ribs.depth ? p.ribs.count * 8 : 0));

/** Signed volume of a closed mesh (positive when triangles wind outward). */
export function meshVolume({ positions: v, indices }) {
  let vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    vol +=
      (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) -
        v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) +
        v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) /
      6;
  }
  return vol;
}

export function bounds({ positions: v }) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[i + k]);
      max[k] = Math.max(max[k], v[i + k]);
    }
  return { min, size: max.map((m, k) => m - min[k]) };
}

/**
 * Build the shade. The axis is Z, the base rim sits at z = 0 and the top rim at z = height.
 * `solid` returns the outer skin capped top and bottom (used to trim the holder plate), pulled in
 * by `inset` mm so the plate ends inside the wall instead of sharing its surface.
 */
export function buildShade(p, { solid = false, inset = 0 } = {}) {
  const Z = ringCount(p);
  const S = segmentCount(p);
  const r = profileCurve(p.nodes);
  const H = p.height;
  const rows = Z + 1;
  const grid = rows * S;
  const hasInner = !solid;
  const caps = solid ? 2 : 0;
  const positions = new Float32Array((grid * (hasInner ? 2 : 1) + caps) * 3);
  // Outer radius at every grid point first, so the wall can follow the true surface slope.
  const R = new Float64Array(grid);
  for (let i = 0; i < rows; i++) {
    const base = r(i / Z);
    for (let j = 0; j < S; j++)
      R[i * S + j] = outerRadius(base, p.ribs, i / Z, (j / S) * Math.PI * 2);
  }
  const dTheta = (Math.PI * 2) / S;
  const dZ = H / Z;

  for (let i = 0; i < rows; i++) {
    const t = i / Z;
    for (let j = 0; j < S; j++) {
      const theta = j * dTheta;
      const Rij = R[i * S + j];
      const Ro = solid ? Math.max(Rij - inset, 0.1) : Rij;
      const o = (i * S + j) * 3;
      positions[o] = Math.cos(theta) * Ro;
      positions[o + 1] = Math.sin(theta) * Ro;
      positions[o + 2] = t * H;
      if (hasInner) {
        // Slope of the surface around (dR/dtheta) and up (dR/dz).
        const dRdTheta = (R[i * S + ((j + 1) % S)] - R[i * S + ((j + S - 1) % S)]) / (2 * dTheta);
        const dRdZ =
          (R[Math.min(Z, i + 1) * S + j] - R[Math.max(0, i - 1) * S + j]) /
          ((Math.min(Z, i + 1) - Math.max(0, i - 1)) * dZ);
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        // Outward normal of the surface (R cos + R' sin, R sin - R' cos, -R R_z), unit length.
        let nx = Rij * cos + dRdTheta * sin;
        let ny = Rij * sin - dRdTheta * cos;
        let nz = -Rij * dRdZ;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl;
        ny /= nl;
        nz /= nl;
        let x;
        let y;
        let z;
        if (i === 0 || i === Z) {
          // On the rims the inner edge stays level, so the rim is flat: move in along the ray only.
          const h = p.wall * Math.sqrt(1 + (dRdTheta / Rij) ** 2 + dRdZ ** 2);
          const ri = Math.max(Rij - h, Rij * 0.2);
          x = cos * ri;
          y = sin * ri;
          z = t * H;
        } else {
          // Inside: step in by the wall along the true normal, so the wall is square to the surface
          // on rib flanks and on steep or flat stretches of the profile alike.
          x = cos * Rij - nx * p.wall;
          y = sin * Rij - ny * p.wall;
          z = Math.min(H, Math.max(0, t * H - nz * p.wall)); // never below the bed or above the rim
          const rad = Math.hypot(x, y);
          const floor = Rij * 0.2;
          if (rad < floor) {
            x *= floor / rad;
            y *= floor / rad;
          }
        }
        const q = (grid + i * S + j) * 3;
        positions[q] = x;
        positions[q + 1] = y;
        positions[q + 2] = z;
      }
    }
  }

  const tris = [];
  const quad = (a, b, c, d) => tris.push(a, b, c, a, c, d);
  for (let i = 0; i < Z; i++)
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      const a = i * S + j;
      const b = i * S + j2;
      const c = (i + 1) * S + j2;
      const d = (i + 1) * S + j;
      quad(a, b, c, d); // outside, counter-clockwise seen from outside
      if (hasInner) quad(grid + a, grid + d, grid + c, grid + b); // inside, reversed
    }
  if (hasInner) {
    // Rim annuli: bottom faces down, top faces up.
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      const ob = j;
      const ob2 = j2;
      const ib = grid + j;
      const ib2 = grid + j2;
      quad(ob, ib, ib2, ob2);
      const top = Z * S;
      quad(top + j, top + j2, grid + top + j2, grid + top + j);
    }
  } else {
    const bottom = grid;
    const top = grid + 1;
    positions.set([0, 0, 0], bottom * 3);
    positions.set([0, 0, H], top * 3);
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      tris.push(bottom, j2, j);
      tris.push(top, Z * S + j, Z * S + j2);
    }
  }
  const indices = Uint32Array.from(tris);
  return { positions, indices };
}
