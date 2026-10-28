// Copied from src/tools/lamps/lib/kit.js without the sweep helpers (TDT-33 dedupes).
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
    /** Offset a CrossSection outward (negative: inward). Round joins keep the wall thickness constant. */
    grow: (cs, d, join = "Round") => own(cs.offset(d, join, 4, SEGMENTS)),
    inter2d: (a, b) => own(CrossSection.intersection([a, b])),
    hull2d: (...list) => own(CrossSection.hull(list.flat())),

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
