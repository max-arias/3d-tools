// Project -> printable mesh. The shade is plain math; manifold is only used to fuse the holder.
import { holderFit, buildHolder } from "./holder.js";
import { bounds, buildShade, meshVolume } from "./shade.js";
import { THIN_RATIO, minWall } from "./thickness.js";

// The plate stops this far inside the outer skin, within the wall, so no faces coincide.
const PLATE_INSET = 0.25;

const toMesh = (positions, indices) => ({ positions, indices });

function describe(mesh, extra = {}) {
  const { min, size } = bounds(mesh);
  return {
    mesh,
    min,
    size,
    triangles: mesh.indices.length / 3,
    volume: meshVolume(mesh),
    valid: true,
    warnings: [],
    ...extra,
  };
}

/**
 * The union leaves a few hair-thin slivers where the plate meets the rim: two vertices at the same
 * place under different indices. Weld points that coincide and drop the triangles that collapse, so no
 * zero-area triangle reaches the STL and the surface stays closed. Only points with z in
 * `[zLo, zHi]` are considered.
 */
export function weld({ positions, indices }, [zLo, zHi] = [-Infinity, Infinity]) {
  // Points closer than this (3 microns, far below a printer's resolution) count as one. A spatial
  // hash looks in the neighbouring cells too, so a pair straddling a cell edge still merges.
  const tol = 3e-3;
  const cells = new Map();
  const cellOf = (x) => Math.floor(x / tol);
  const remap = new Uint32Array(positions.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (z < zLo || z > zHi) {
      remap[i] = i;
      continue;
    }
    const cx = cellOf(x);
    const cy = cellOf(y);
    const cz = cellOf(z);
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++)
      for (let dy = -1; dy <= 1 && found < 0; dy++)
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const list = cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const j of list) {
            if (
              Math.abs(positions[j * 3] - x) < tol &&
              Math.abs(positions[j * 3 + 1] - y) < tol &&
              Math.abs(positions[j * 3 + 2] - z) < tol
            ) {
              found = j;
              break;
            }
          }
        }
    if (found >= 0) remap[i] = found;
    else {
      remap[i] = i;
      const key = `${cx},${cy},${cz}`;
      if (cells.has(key)) cells.get(key).push(i);
      else cells.set(key, [i]);
    }
  }
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { positions, indices: Uint32Array.from(kept) };
}

/**
 * Build the shade, and if the ribs would thin the wall below what prints reliably (or fold the
 * inside surface), make them shallower until it holds. Returns the project actually built too.
 */
function buildChecked(p) {
  const ok = (w) => w >= p.wall * THIN_RATIO;
  // How deep ribs can go before the wall thins, measured: about depth * count / radius <= K.
  const K = { sine: 5, scallop: 10, triangle: 2.8 }[p.ribs.wave];
  const rMin = Math.min(...p.nodes.map((n) => n.d / 2));
  let depth = Math.min(p.ribs.depth, (0.9 * K * rMin) / p.ribs.count);
  for (let tries = 0; ; tries++) {
    const q = depth === p.ribs.depth ? p : { ...p, ribs: { ...p.ribs, depth: +depth.toFixed(2) } };
    const shell = buildShade(q);
    const wall = minWall(q, shell);
    const limited = q !== p;
    if (ok(wall) || !q.ribs.depth) return { p: q, shell, wall, limited };
    depth = tries < 5 ? depth * 0.75 : 0;
  }
}

const warningsFor = (p, built, extra = []) => [
  ...extra,
  ...(built.limited ? ["ribsLimited"] : []),
  ...(built.wall < p.wall * THIN_RATIO ? ["thinWall"] : []),
];

/**
 * Fix zero-area triangles that remain after welding: three points on one line, where a point sits
 * in the middle of a long edge. Flipping that edge with the triangle across it gives two proper
 * triangles that cover the same area, so the surface stays closed. Only triangles with every point
 * in `[zLo, zHi]` are touched.
 */
export function repairSlivers({ positions: P, indices }, [zLo, zHi] = [-Infinity, Infinity]) {
  const I = Uint32Array.from(indices);
  const area2 = (a, b, c) => {
    const ux = P[b * 3] - P[a * 3],
      uy = P[b * 3 + 1] - P[a * 3 + 1],
      uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3],
      vy = P[c * 3 + 1] - P[a * 3 + 1],
      vz = P[c * 3 + 2] - P[a * 3 + 2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  const inZone = (t) =>
    [0, 1, 2].every((k) => P[I[t * 3 + k] * 3 + 2] >= zLo && P[I[t * 3 + k] * 3 + 2] <= zHi);
  const flat = [];
  for (let t = 0; t < I.length / 3; t++)
    if (inZone(t) && area2(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]) < 2e-9) flat.push(t);
  if (!flat.length) return { positions: P, indices: I };
  const owner = new Map(); // directed edge "a>b" -> triangle
  for (let t = 0; t < I.length / 3; t++)
    if (inZone(t))
      for (let k = 0; k < 3; k++) owner.set(`${I[t * 3 + k]}>${I[t * 3 + ((k + 1) % 3)]}`, t);
  const dist = (a, b) =>
    Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (const t of flat) {
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    if (area2(...v) >= 2e-9) continue; // already fixed through a neighbour
    // The long edge is the one the middle point sits on: u -> w with the odd one out v[k].
    let best = 0;
    for (let k = 1; k < 3; k++)
      if (dist(v[k], v[(k + 1) % 3]) > dist(v[best], v[(best + 1) % 3])) best = k;
    const u = v[best];
    const w = v[(best + 1) % 3];
    const m = v[(best + 2) % 3];
    const n = owner.get(`${w}>${u}`);
    if (n === undefined || n === t) continue;
    const d = [I[n * 3], I[n * 3 + 1], I[n * 3 + 2]].find((x) => x !== u && x !== w);
    if (area2(u, d, m) < 2e-9 || area2(d, w, m) < 2e-9) continue;
    I.set([u, d, m], t * 3); // the old triangle becomes (u, d, m)
    I.set([d, w, m], n * 3);
    for (const [tri, a, b, c] of [
      [t, u, d, m],
      [n, d, w, m],
    ]) {
      owner.set(`${a}>${b}`, tri);
      owner.set(`${b}>${c}`, tri);
      owner.set(`${c}>${a}`, tri);
    }
  }
  return { positions: P, indices: I };
}

/** Shade alone, no WASM needed. */
export function generateShade(p) {
  const built = buildChecked(p);
  const { positions, indices } = built.shell;
  return describe(toMesh(positions, indices), {
    wall: built.wall,
    ribDepth: built.p.ribs.depth,
    warnings: warningsFor(p, built),
  });
}

/** The union can leave zero-volume specks inside the plate; keep only the real body. */
function largestBody(kit, m) {
  const parts = m.decompose().map((x) => kit.own(x));
  if (parts.length < 2) return m;
  return parts.reduce((a, b) => (b.volume() > a.volume() ? b : a));
}

/** Shade plus holder. `kit` is a manifold kit (see lib/kit.js). */
export function generateLamp(kit, p) {
  if (p.holder.at === "none") return generateShade(p);
  const fit = holderFit(p);
  const built = buildChecked(p);
  const shade = built.shell;
  const outer = buildShade(built.p, { solid: true, inset: PLATE_INSET });
  const { Manifold, Mesh } = kit;
  const asManifold = (m) =>
    kit.own(
      new Manifold(new Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices })),
    );
  const fused = kit.union(asManifold(shade), buildHolder(kit, built.p, asManifold(outer)));
  const body = largestBody(kit, fused);
  const out = kit.export(body, [0, 0, 0]);
  // The slivers only form where the plate meets the rim, so only look there.
  const zone =
    p.holder.at === "top"
      ? [p.height - p.holder.plate - 1, Infinity]
      : [-Infinity, p.holder.plate + 1];
  out.mesh = repairSlivers(weld(out.mesh, zone), zone);
  out.triangles = out.mesh.indices.length / 3;
  return {
    ...out,
    wall: built.wall,
    ribDepth: built.p.ribs.depth,
    warnings: warningsFor(p, built, fit.ok ? [] : ["holderTooBig"]),
  };
}
