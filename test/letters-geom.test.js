import { readFileSync } from "node:fs";
import Module from "manifold-3d";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/letters/lib/kit.js";
import { generateLetters } from "../src/tools/letters/geom/generate.js";
import { layoutText } from "../src/tools/letters/geom/glyphs.js";
import { defaultProject, fitsBed, merge, sanitize } from "../src/tools/letters/model/project.js";

let wasm;
let font;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
  const b = readFileSync("node_modules/@fontsource/anton/files/anton-latin-400-normal.woff");
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
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
const gen = (patch) => withKit((kit) => generateLetters(kit, make(patch), font));
const text = (t, extra = {}) => gen({ source: { text: t }, ...extra });

test("every part of LED is a closed box with a closed lid", () => {
  const r = text("LED");
  expect(r.parts.map((p) => p.label)).toEqual(["L", "E", "D"]);
  for (const p of r.parts) {
    expect(p.box.valid).toBe(true);
    expect(p.lid.valid).toBe(true);
    expect(p.issues).toEqual([]);
  }
});

test("O: counter gets its own wall, volume matches the analytic sum, hole is inside the cavity", () => {
  const p = make({ source: { text: "O" } });
  const r = withKit((kit) => generateLetters(kit, p, font));
  const part = r.parts[0];
  const expected = withKit((kit) => {
    const [g] = layoutText(font, "O", p.size.height, 0);
    const o = kit.own(kit.CrossSection.ofPolygons(g.rings, "NonZero"));
    const inner = kit.grow(o, -p.size.wall);
    const rebate = kit.grow(o, -(p.size.wall - p.lid.ledge));
    const { depth, base } = p.size;
    return (
      o.area() * depth -
      inner.area() * (depth - base) -
      (rebate.area() - inner.area()) * p.lid.rebate -
      Math.PI * (p.hole.d / 2) ** 2 * base
    );
  });
  expect(part.box.valid).toBe(true);
  expect(Math.abs(part.box.volume - expected) / expected).toBeLessThan(0.01);
  // The hole sits in the cavity: 1 mm clear of both the outer wall and the counter's wall.
  const [hx, hy] = part.hole;
  expect(Math.hypot(hx, hy)).toBeGreaterThan(0);
  const probe = withKit((kit) => {
    const [g] = layoutText(font, "O", p.size.height, 0);
    const o = kit.CrossSection.ofPolygons(g.rings, "NonZero");
    const b = o.bounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const inner = kit.grow(kit.own(o.translate([-cx, -cy])), -p.size.wall - 1);
    return (
      kit.own(kit.CrossSection.circle(p.hole.d / 2, 32).translate([hx, hy])).area() -
      kit
        .inter2d(inner, kit.own(kit.CrossSection.circle(p.hole.d / 2, 32).translate([hx, hy])))
        .area()
    );
  });
  expect(probe).toBeLessThan(0.5);
});

test("the lid drops into the rebate without touching the box", () => {
  const r = text("E");
  const p = make({ source: { text: "E" } });
  const { box, lid } = r.parts[0];
  const overlap = withKit((kit) => {
    const mk = (m, dz) =>
      kit.own(
        new kit.Manifold(
          new kit.Mesh({
            numProp: 3,
            vertProperties: Float32Array.from(m.mesh.positions, (v, i) =>
              i % 3 === 2 ? v + dz : v,
            ),
            triVerts: m.mesh.indices,
          }),
        ),
      );
    return kit.inter(mk(box, 0), mk(lid, r.lidZ)).volume();
  });
  expect(overlap).toBeLessThan(1e-3);
  expect(r.lidZ).toBeCloseTo(p.size.depth - p.lid.rebate);
});

test("letters that overlap become one part; i keeps its dot in the same part", () => {
  const merged = text("LE", { source: { tracking: -20 } });
  expect(merged.parts).toHaveLength(1);
  expect(merged.parts[0].box.valid).toBe(true);
  const i = text("i");
  expect(i.parts).toHaveLength(1);
  expect(i.parts[0].box.valid).toBe(true);
});

test("an SVG becomes one part per island, left to right", () => {
  const square = (x, s) => [
    [x, 0],
    [x + s, 0],
    [x + s, s],
    [x, s],
  ];
  const r = gen({
    source: { kind: "svg", svg: [{ rule: "NonZero", rings: [square(0, 50), square(80, 50)] }] },
    size: { height: 60 },
  });
  expect(r.parts).toHaveLength(2);
  expect(r.parts.every((p) => p.box.valid)).toBe(true);
  expect(r.size[1]).toBeCloseTo(60, 1);
});

test("a stroke too thin for the wall is flagged, not a crash", () => {
  const r = gen({ source: { text: "I" }, size: { height: 20, wall: 6 } });
  expect(r.parts[0].issues).toContain("thin");
  expect(r.parts[0].box.valid).toBe(true);
});

test("a 400 mm letter does not fit a 256 mm plate, a 120 mm one does", () => {
  const big = text("H", { size: { height: 400 } });
  const small = text("H");
  expect(fitsBed(big.parts[0].size, { x: 256, y: 256 })).toBe(false);
  expect(fitsBed(small.parts[0].size, { x: 256, y: 256 })).toBe(true);
});
