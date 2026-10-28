import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/lamps/lib/kit.js";
import { generateLamp, generateShade, weld } from "../src/tools/lamps/geom/generate.js";
import { printMesh } from "../src/tools/lamps/geom/print.js";
import { toStl } from "../src/tools/lamps/lib/stl.js";
import { profileCurve } from "../src/tools/lamps/geom/profile.js";
import { buildShade, meshVolume } from "../src/tools/lamps/geom/shade.js";
import {
  SOCKETS,
  SPOKE_STYLES,
  WAVES,
  defaultProject,
  merge,
  sanitize,
} from "../src/tools/lamps/model/project.js";
import { SOCKET_SPECS } from "../src/tools/lamps/model/sockets.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const make = (patch = {}) => sanitize(merge(defaultProject(), patch));
const withKit = (fn) => {
  const kit = createKit(wasm);
  try {
    return fn(kit);
  } finally {
    kit.free();
  }
};

test("the profile passes through every node and never overshoots", () => {
  const nodes = [
    { z: 0, d: 100 },
    { z: 0.3, d: 220 },
    { z: 0.6, d: 60 },
    { z: 1, d: 180 },
  ];
  const r = profileCurve(nodes);
  for (const n of nodes) expect(r(n.z)).toBeCloseTo(n.d / 2, 6);
  for (let z = 0; z <= 1; z += 0.01) {
    expect(r(z)).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(r(z)).toBeLessThanOrEqual(110 + 1e-9);
  }
});

test("every wave and twist gives a closed shell where each edge is shared by two triangles", () => {
  for (const wave of WAVES) {
    const m = buildShade(make({ ribs: { wave, count: 9, depth: 6, twist: 90 } }));
    const edges = new Map();
    for (let t = 0; t < m.indices.length; t += 3)
      for (let k = 0; k < 3; k++) {
        const a = m.indices[t + k];
        const b = m.indices[t + ((k + 1) % 3)];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + (a < b ? 1 : -1));
      }
    // Each undirected edge is used once in each direction: the net is zero.
    expect(
      [...edges.values()].every((v) => v === 0),
      wave,
    ).toBe(true);
    expect(meshVolume(m), wave).toBeGreaterThan(0);
  }
});

test("manifold accepts the shade and agrees on the volume", () => {
  const p = make();
  const res = withKit((kit) => {
    const m = buildShade(p);
    const solid = kit.own(
      new kit.Manifold(
        new kit.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }),
      ),
    );
    return { status: solid.status(), vol: solid.volume(), mine: meshVolume(m) };
  });
  expect(res.status).toBe("NoError");
  expect(Math.abs(res.vol - res.mine) / res.mine).toBeLessThan(0.01);
});

test("a holder fuses into one valid body for every socket, side and spoke style", () => {
  for (const socket of SOCKETS)
    for (const at of ["top", "bottom"])
      for (const style of SPOKE_STYLES) {
        const p = make({ holder: { socket, at, spokes: { style, count: 4, rotation: 15 } } });
        const out = withKit((kit) => generateLamp(kit, p));
        expect(out.valid, `${socket} ${at} ${style}`).toBe(true);
        expect(out.volume).toBeGreaterThan(generateShade(p).volume);
      }
}, 30000);

test("the socket hole is open at the stated size", () => {
  const p = make({ holder: { socket: "E14", at: "bottom" } });
  const out = withKit((kit) => generateLamp(kit, p));
  // Every vertex of the plate near the axis lies outside the hole radius.
  const hole = SOCKET_SPECS.E14.hole / 2;
  const v = out.mesh.positions;
  let inner = Infinity;
  for (let i = 0; i < v.length; i += 3)
    if (v[i + 2] < p.holder.plate + 0.01) inner = Math.min(inner, Math.hypot(v[i], v[i + 1]));
  expect(inner).toBeGreaterThanOrEqual(hole - 0.05);
});

test("no holder skips manifold and keeps the axis at the origin", () => {
  const out = generateShade(make({ holder: { at: "none" } }));
  expect(out.min[2]).toBe(0);
  expect(out.size[2]).toBeCloseTo(200, 3);
});

/** Read the STL bytes the way a slicer does (loose triangles, equal points merged) into a manifold. */
function manifoldFromStl(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  const v = new Float32Array(n * 9);
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 9; k++) v[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: v,
    triVerts: Uint32Array.from({ length: n * 3 }, (_, i) => i),
  });
  mesh.merge();
  return new wasm.Manifold(mesh);
}

test("the STL of every holder side is one closed solid lying on the bed", () => {
  for (const at of ["top", "bottom", "none"])
    for (const wave of WAVES) {
      const p = make({
        holder: { at, spokes: { style: "curved", rotation: 11 } },
        ribs: { wave, twist: 60 },
      });
      const part = withKit((kit) => generateLamp(kit, p));
      const m = manifoldFromStl(toStl(printMesh(part, p)));
      const bodies = m.decompose();
      expect(m.status(), `${at} ${wave}`).toBe("NoError");
      expect(bodies, `${at} ${wave}`).toHaveLength(1);
      expect(m.volume()).toBeGreaterThan(0);
      expect(m.boundingBox().min[2]).toBeCloseTo(0, 3);
      bodies.forEach((b) => b.delete());
      m.delete();
    }
}, 60000);

test("turning a holder-on-top lamp over keeps its volume and puts the plate on the bed", () => {
  const p = make({ holder: { at: "top" } });
  const part = withKit((kit) => generateLamp(kit, p));
  const flipped = printMesh(part, p);
  expect(meshVolume(flipped)).toBeCloseTo(meshVolume(part.mesh), 0);
  // The plate is the wide flat part: the lowest vertices are no wider than the hub plus spokes reach.
  let low = 0;
  for (let i = 2; i < flipped.positions.length; i += 3) if (flipped.positions[i] < 0.01) low++;
  expect(low).toBeGreaterThan(50);
});

test("ribs that would thin the wall are made shallower, and the wall stays printable", () => {
  const p = make({
    ribs: { count: 80, depth: 20, wave: "triangle", twist: 400 },
    holder: { at: "none" },
  });
  const part = generateShade(p);
  expect(part.warnings).toContain("ribsLimited");
  expect(part.ribDepth).toBeLessThan(20);
  expect(part.wall).toBeGreaterThanOrEqual(p.wall * 0.75);
  expect(
    withKit((kit) =>
      kit
        .own(
          new kit.Manifold(
            new kit.Mesh({
              numProp: 3,
              vertProperties: part.mesh.positions,
              triVerts: part.mesh.indices,
            }),
          ),
        )
        .status(),
    ),
  ).toBe("NoError");
});

test("a near-flat ledge in the profile is reported as a thin wall", () => {
  const p = make({
    height: 130,
    ribs: { depth: 0 },
    holder: { at: "none" },
    nodes: [
      { z: 0, d: 96 },
      { z: 0.79, d: 96 },
      { z: 0.8, d: 146 },
      { z: 1, d: 117 },
    ],
  });
  expect(generateShade(p).warnings).toContain("thinWall");
  expect(generateShade(make({ holder: { at: "none" } })).warnings).toEqual([]);
});

test("welding drops collapsed triangles and keeps the rest", () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1.0001, 0, 0, 5, 5, 5]);
  const out = weld({ positions, indices: Uint32Array.from([0, 1, 2, 1, 3, 4, 3, 1, 4]) });
  // Point 3 merges into 1, so the second triangle (1, 3, 4) collapses; the third (3, 1, 4) too.
  expect(out.indices.length).toBe(3);
});
