import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/gridfinity/geom/kit.js";
import { generateDrawer } from "../src/tools/gridfinity/geom/drawer.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";
import font from "../src/tools/gridfinity/geom/inter-bold.json";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const gen = (over, opts) => generateDrawer(() => createKit(wasm), sanitize(over), opts);
const bins = (r) => r.parts.filter((p) => p.kind === "bin" && !p.inlay);
const small = { drawer: { w: 200, d: 200 } };

test("a plain 2×1×3u bin has the right outer size and is a valid solid", () => {
  const r = gen({ ...small, bins: [{ id: "a", x: 0, y: 0, w: 2, d: 1, overrides: { units: 3 } }] });
  const [b] = bins(r);
  expect(b.valid).toBe(true);
  expect(b.size[0]).toBeCloseTo(84 - 0.5, 1);
  expect(b.size[1]).toBeCloseTo(42 - 0.5, 1);
  expect(b.size[2]).toBeCloseTo(21 + 4.4, 0);
});

test("option matrix: every feature builds a valid solid", () => {
  const grab = (w, v) => ({ [w]: v });
  const cases = [
    { lip: false },
    { dividersX: 2, dividersY: 1, dividerPct: 60 },
    { label: "front", dividersX: 1 },
    { label: "full", labelWall: "left" },
    { magnets: true },
    {
      grab: {
        ...grab("front", { notch: true }),
        ...grab("back", { scoop: true }),
        ...grab("left", { lower: true }),
      },
    },
    { wallPattern: "slots", units: 8 },
    { wallPattern: "honeycomb", units: 10 },
    { units: 4, heightMm: 0, wall: 2.4, floor: 3 },
  ];
  for (const overrides of cases) {
    const r = gen(
      {
        ...small,
        bins: [{ id: "a", x: 0, y: 0, w: 3, d: 2, overrides, labels: ["Screws", "M3"] }],
      },
      { font },
    );
    expect(bins(r).length).toBeGreaterThan(0);
    for (const p of r.parts) expect(p.valid, `${p.name} ${JSON.stringify(overrides)}`).toBe(true);
  }
});

test("text: raised labels add material, engraved remove it, two-colour adds a second body", () => {
  const vol = (kind) => {
    const r = gen(
      {
        ...small,
        labelStyle: { kind },
        bins: [
          { id: "a", x: 0, y: 0, w: 2, d: 2, overrides: { label: "full" }, labels: ["Hello"] },
        ],
      },
      { font },
    );
    return { r, parts: r.parts.filter((p) => p.kind === "bin") };
  };
  const base = gen(
    { ...small, bins: [{ id: "a", x: 0, y: 0, w: 2, d: 2, overrides: { label: "full" } }] },
    { font },
  );
  const raised = vol("raised");
  expect(raised.r.labels[0]).toMatchObject({ text: "Hello", status: "ok" });
  expect(raised.parts[0].triangles).toBeGreaterThan(bins(base)[0].triangles);
  const inlay = vol("inlay");
  expect(inlay.parts).toHaveLength(2);
  expect(inlay.parts.find((p) => p.inlay).valid).toBe(true);
});

test("a long bin splits at the bed with joints; keys + spares are produced", () => {
  const r = gen({
    drawer: { w: 400, d: 100 },
    printer: { x: 200, y: 200 },
    bins: [{ id: "a", x: 0, y: 0, w: 8, d: 2, overrides: { seamJoint: "hkey" } }],
  });
  const segs = bins(r);
  expect(segs.length).toBeGreaterThan(1);
  expect(segs[0].name).toMatch(/_seg1$/);
  for (const p of r.parts) expect(p.valid, p.name).toBe(true);
  expect(r.parts.filter((p) => p.name.startsWith("binkey_")).length).toBeGreaterThanOrEqual(4);
  const mag = gen({
    drawer: { w: 400, d: 100 },
    printer: { x: 200, y: 200 },
    bins: [
      { id: "a", x: 0, y: 0, w: 8, d: 2, overrides: { seamJoint: "magnets", floorSeam: "lap" } },
    ],
  });
  expect(mag.seamMagnets).toBeGreaterThan(0);
  for (const p of mag.parts) expect(p.valid, p.name).toBe(true);
});

test("half bins, tall bins over the printer Z and out-of-grid bins", () => {
  const half = gen({
    ...small,
    grid: { halfCells: true },
    bins: [{ id: "a", x: 0.5, y: 0, w: 0.5, d: 1.5 }],
  });
  expect(bins(half)[0].valid).toBe(true);
  expect(() =>
    gen({ ...small, printer: { z: 40 }, bins: [{ id: "a", x: 0, y: 0, w: 1, d: 1 }] }),
  ).toThrow(/printer Z/);
  const out = gen({ ...small, bins: [{ id: "a", x: 50, y: 0, w: 1, d: 1 }] });
  expect(bins(out)).toHaveLength(0);
  expect(out.warnings.some((w) => /left out/.test(w))).toBe(true);
});

test("each feature changes the solid in the expected direction", () => {
  const vol = (overrides = {}, extra = {}) => {
    const r = gen(
      {
        ...small,
        ...extra,
        bins: [{ id: "a", x: 0, y: 0, w: 3, d: 2, overrides: { units: 8, ...overrides } }],
      },
      { font },
    );
    return bins(r)[0].volume;
  };
  const base = vol();
  expect(vol({ dividersX: 2 })).toBeGreaterThan(base);
  expect(vol({ lip: false })).toBeLessThan(base);
  expect(vol({ grab: { front: { notch: true } } })).toBeLessThan(base);
  expect(vol({ grab: { front: { lower: true } } })).toBeLessThan(base);
  expect(vol({ grab: { back: { scoop: true } } })).toBeGreaterThan(base);
  expect(vol({ magnets: true })).toBeLessThan(base);
  expect(vol({ wallPattern: "slots" })).toBeLessThan(base);
  expect(vol({ wallPattern: "honeycomb" })).toBeLessThan(base);
  expect(vol({ label: "full" })).toBeGreaterThan(base);
  expect(vol({ wall: 2 })).toBeGreaterThan(base);
  // 21 mm of plastic walls: a solid check on the base case (3×2 cells, 8u).
  expect(base).toBeGreaterThan(20000);
  expect(base).toBeLessThan(120000);
});

test("lap seams and seam joints change the segments", () => {
  const seg = (overrides) => {
    const r = gen({
      drawer: { w: 400, d: 100 },
      printer: { x: 200, y: 200 },
      bins: [{ id: "a", x: 0, y: 0, w: 8, d: 2, overrides }],
    });
    return bins(r)[0].volume;
  };
  const plain = seg({});
  expect(seg({ floorSeam: "lap" })).toBeGreaterThan(plain);
  expect(seg({ seamJoint: "hkey" })).toBeGreaterThan(plain - 1);
});
