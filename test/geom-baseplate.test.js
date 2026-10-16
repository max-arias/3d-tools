import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/gridfinity/geom/kit.js";
import { generateDrawer } from "../src/tools/gridfinity/geom/drawer.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const gen = (over) => generateDrawer(() => createKit(wasm), sanitize(over));
const tiles = (r) => r.parts.filter((p) => p.kind === "tile");

test("default drawer: 9 valid tiles whose footprints add up to the plate", () => {
  const r = gen({});
  const t = tiles(r);
  expect(t).toHaveLength(9);
  expect(t.every((p) => p.valid)).toBe(true);
  expect(t[0].size[2]).toBeCloseTo(4.65, 2);
  const area = t.reduce((s, p) => s + p.size[0] * p.size[1], 0);
  expect(area).toBeCloseTo(559 * 469, 0);
});

test("styles set plate height; chamfer keeps the outline", () => {
  const h = (style) => tiles(gen({ drawer: { w: 100, d: 100 }, baseplate: { style } }))[0].size[2];
  expect(h("thin")).toBeCloseTo(4.65, 2);
  expect(h("skeleton")).toBeCloseTo(7.65, 2);
  expect(h("weighted")).toBeCloseTo(11.4, 2);
});

test("option matrix builds valid solids", () => {
  const cases = [
    { baseplate: { style: "skeleton", magnets: true, tape: true, peaks: false } },
    { baseplate: { style: "thin", magnets: true } },
    { baseplate: { style: "weighted", chamfer: 0 }, drawer: { cornerR: 20 } },
    { baseplate: { keys: true }, printer: { x: 120, y: 120 } },
    { baseplate: { clips: true }, printer: { x: 120, y: 120 } },
    {
      grid: { halfCells: true },
      bins: [{ id: "a", x: 0, y: 0, w: 0.5, d: 1 }],
      drawer: { w: 200, d: 200 },
    },
  ];
  for (const c of cases) {
    const r = gen({
      drawer: { w: 250, d: 250 },
      ...c,
      ...(c.drawer ? { drawer: { w: 250, d: 250, ...c.drawer } } : {}),
    });
    expect(r.parts.length, JSON.stringify(c)).toBeGreaterThan(0);
    for (const p of r.parts) expect(p.valid, `${p.name} ${JSON.stringify(c)}`).toBe(true);
  }
});

test("keys: seams of a split plate get keys plus two spares, clips replace keys only when keys are off", () => {
  const r = gen({
    drawer: { w: 250, d: 100 },
    printer: { x: 120, y: 256 },
    baseplate: { keys: true, keyEvery: 1 },
  });
  const keys = r.parts.filter((p) => p.name.startsWith("hkey_"));
  expect(tiles(r).length).toBeGreaterThan(1);
  expect(keys.filter((k) => !k.spare).length).toBe(r.joints);
  expect(keys.filter((k) => k.spare)).toHaveLength(2);
  expect(keys[0].size[0]).toBeCloseTo(8 - 0.3, 1);
  const clips = gen({
    drawer: { w: 250, d: 100 },
    printer: { x: 120, y: 256 },
    baseplate: { clips: true },
  });
  expect(clips.parts.some((p) => p.name.startsWith("clip_"))).toBe(true);
});

test("thin plates with magnets and shallow floors are rejected", () => {
  expect(() =>
    gen({
      drawer: { w: 100, d: 100 },
      baseplate: { style: "skeleton", magnets: true },
      magnet: { depth: 2.8 },
    }),
  ).toThrow(/Magnet holes/);
});
