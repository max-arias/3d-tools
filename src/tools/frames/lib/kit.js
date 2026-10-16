// Copied from src/tools/tapas/lib/kit.js (TDT-33 dedupes). Adds `sweepLoop` for mitred mouldings.
// Thin wrapper over manifold-3d: every object created through the kit is tracked and freed by `free()`.
export function createKit(wasm) {
  const { Manifold, CrossSection, Mesh } = wasm;
  const owned = [];
  const own = (o) => (owned.push(o), o);
  const SEGMENTS = 32;

  const kit = {
    Manifold,
    CrossSection,
    Mesh,
    own,
    free() {
      for (const o of owned) {
        try {
          o.delete();
        } catch {
          /* already freed */
        }
      }
      owned.length = 0;
    },

    // --- 2D (CrossSection) ---
    /** Rectangle from corner coordinates. */
    rect: (x0, x1, y0, y1) => own(CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0])),
    /** Rounded rectangle centred on the origin; radius is clamped to half the shorter side. */
    rrect(w, d, r) {
      r = Math.max(0, Math.min(r, w / 2 - 1e-3, d / 2 - 1e-3));
      const sq = own(
        CrossSection.square([Math.max(w - 2 * r, 1e-3), Math.max(d - 2 * r, 1e-3)], true),
      );
      return r > 0 ? own(sq.offset(r, "Round", 2, SEGMENTS)) : sq;
    },
    circle: (r, x = 0, y = 0, segments = SEGMENTS) =>
      own(CrossSection.circle(r, segments).translate([x, y])),
    csUnion: (...list) => own(CrossSection.union(list.flat())),
    csSub: (a, ...rest) => own(CrossSection.difference([a, ...rest.flat()])),
    /** Polygon from [x, y] points in either winding order (CrossSection wants counter-clockwise). */
    poly(points) {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        area += x0 * y1 - x1 * y0;
      }
      return own(CrossSection.ofPolygons([area >= 0 ? points : [...points].reverse()]));
    },

    // --- 3D ---
    box: (x0, x1, y0, y1, z0, z1) =>
      own(Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])),
    cyl: (r, h, x = 0, y = 0, z = 0) =>
      own(Manifold.cylinder(h, r, r, SEGMENTS).translate([x, y, z])),
    /** Extrude a CrossSection from z0 to z1. */
    ext: (cs, z0, z1) => own(cs.extrude(z1 - z0).translate([0, 0, z0])),
    union: (...list) =>
      list.flat().length === 1 ? list.flat()[0] : own(Manifold.union(list.flat())),
    sub: (a, ...rest) => own(Manifold.difference([a, ...rest.flat()])),
    inter: (a, b) => own(Manifold.intersection([a, b])),
    hull: (...list) => own(Manifold.hull(list.flat())),
    move: (m, x = 0, y = 0, z = 0) => own(m.translate([x, y, z])),
    rotZ: (m, deg) => own(m.rotate([0, 0, deg])),
    rot: (m, x, y, z) => own(m.rotate([x, y, z])),
    mirrorX: (m) => own(m.mirror([1, 0, 0])),
    mirrorY: (m) => own(m.mirror([0, 1, 0])),
    mirrorZ: (m) => own(m.mirror([0, 0, 1])),
    /** Offset a CrossSection outward (negative: inward). Miter keeps sharp corners sharp. */
    grow: (cs, d, join = "Miter") => own(cs.offset(d, join, 4, SEGMENTS)),
    /** Orient a 2D profile sketched as (a, b) with extrusion c: map to (c, a, b) = (x, y, z). */
    cabToXyz: (m) => own(m.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1])),
    inter2d: (a, b) => own(CrossSection.intersection([a, b])),
    hull2d: (...list) => own(CrossSection.hull(list.flat())),

    /**
     * Sweep a closed 2D profile [[u, z], ...] (counter-clockwise, u = distance outward from the
     * path, z = height) around a closed counter-clockwise convex-ish path [[x, y], ...].
     * Each corner is mitred, so a sharp rectangle gets true 45 degree joints.
     * `maxSeg` subdivides long edges (for textures); `displace(s, j, x, y, z)` may return a z
     * offset per vertex, where `s` is the arc length along the path. Returns a Manifold.
     */
    sweepLoop(profile, path, { maxSeg = 0, displace = null } = {}) {
      let pts = path;
      if (maxSeg > 0) {
        pts = [];
        for (let i = 0; i < path.length; i++) {
          const a = path[i];
          const b = path[(i + 1) % path.length];
          const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSeg));
          for (let k = 0; k < n; k++)
            pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
        }
      }
      const N = pts.length;
      const M = profile.length;
      const arc = [0];
      for (let i = 1; i < N; i++)
        arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const normal = (a, b) => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        return [dy / l, -dx / l];
      };
      const verts = new Float32Array(N * M * 3);
      for (let i = 0; i < N; i++) {
        const n1 = normal(pts[(i + N - 1) % N], pts[i]);
        const n2 = normal(pts[i], pts[(i + 1) % N]);
        const k = 1 / Math.max(1 + n1[0] * n2[0] + n1[1] * n2[1], 0.05);
        const mx = (n1[0] + n2[0]) * k;
        const my = (n1[1] + n2[1]) * k;
        for (let j = 0; j < M; j++) {
          const [u, z] = profile[j];
          const o = (i * M + j) * 3;
          verts[o] = pts[i][0] + u * mx;
          verts[o + 1] = pts[i][1] + u * my;
          verts[o + 2] = z + (displace ? displace(arc[i], j, verts[o], verts[o + 1], z) : 0);
        }
      }
      const tris = [];
      for (let i = 0; i < N; i++) {
        const i2 = (i + 1) % N;
        for (let j = 0; j < M; j++) {
          const j2 = (j + 1) % M;
          const a = i * M + j;
          const b = i2 * M + j;
          const c = i2 * M + j2;
          const d = i * M + j2;
          tris.push(a, b, c, a, c, d);
        }
      }
      // Orient outward: flip when the signed volume comes out negative.
      let vol = 0;
      for (let t = 0; t < tris.length; t += 3) {
        const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]].map((v) => v * 3);
        vol +=
          (verts[a] * (verts[b + 1] * verts[c + 2] - verts[b + 2] * verts[c + 1]) -
            verts[a + 1] * (verts[b] * verts[c + 2] - verts[b + 2] * verts[c]) +
            verts[a + 2] * (verts[b] * verts[c + 1] - verts[b + 1] * verts[c])) /
          6;
      }
      const triVerts = Uint32Array.from(tris);
      if (vol < 0)
        for (let t = 0; t < triVerts.length; t += 3) {
          const x = triVerts[t + 1];
          triVerts[t + 1] = triVerts[t + 2];
          triVerts[t + 2] = x;
        }
      return own(new Manifold(new Mesh({ numProp: 3, vertProperties: verts, triVerts })));
    },

    /** Thin slab of a CrossSection used as a hull anchor. */
    slice: (cs, z) => own(cs.extrude(0.001).translate([0, 0, z])),

    /** Mesh as transferable typed arrays, moved so its bounding box starts at the origin. */
    export(m, origin = null) {
      const bb = m.boundingBox();
      const o = origin ?? bb.min;
      const mesh = m.getMesh();
      const np = mesh.numProp;
      const verts = mesh.vertProperties;
      const n = verts.length / np;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = verts[i * np] - o[0];
        positions[i * 3 + 1] = verts[i * np + 1] - o[1];
        positions[i * 3 + 2] = verts[i * np + 2] - o[2];
      }
      const indices = Uint32Array.from(mesh.triVerts);
      return {
        mesh: { positions, indices },
        min: [...bb.min],
        size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
        triangles: indices.length / 3,
        volume: m.volume(),
        valid: m.status() === "NoError" && !m.isEmpty(),
      };
    },
  };
  return kit;
}
