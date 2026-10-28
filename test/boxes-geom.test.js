import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import font from "../src/tools/gridfinity/geom/inter-bold.json" with { type: "json" };
import { createKit } from "../src/tools/boxes/lib/kit.js";
import { boxDims } from "../src/tools/boxes/geom/dims.js";
import { buildBase } from "../src/tools/boxes/geom/base.js";
import { buildLid } from "../src/tools/boxes/geom/lid.js";
import { buildLatch, LATCH } from "../src/tools/boxes/geom/latch.js";
import { generateBox } from "../src/tools/boxes/geom/generate.js";
import { buildCoupon } from "../src/tools/boxes/geom/fittest.js";
import { binOrigin, buildBin, gridfinityProject } from "../src/tools/boxes/geom/bins.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const withKit = (fn) => {
  const kit = createKit(wasm);
  try {
    return fn(kit);
  } finally {
    kit.free();
  }
};
const overlap = (kit, a, b) => kit.inter(a, b).volume();

// Sizes of Pred's Parametric V1 files (Printables 543553): the boxes must stay interchangeable.
test("size rules match Pred's reference boxes", { timeout: 60000 }, () => {
  const ref = [
    [4, 3, 188, 146],
    [4, 4, 188, 188],
    [5, 4, 230, 188],
    [5, 5, 230, 230],
    [6, 5, 272, 230],
    [7, 6, 314, 272],
  ];
  for (const [x, y, W, D] of ref) {
    for (const [u, h] of [
      [6, 47.5],
      [9, 68.5],
      [12, 89.5],
      [15, 110.5],
    ]) {
      const d = boxDims({ x, y, u });
      expect([d.W, d.D, d.baseH, d.lidH]).toEqual([W, D, h, 11.5]);
    }
  }
  // Label and handle sizes of the common files for 4xy, 5xy and 6xy/7xy boxes.
  const parts = [4, 5, 6, 7].map((x) => {
    const d = boxDims({ x, y: 4, u: 6 });
    return [d.label.w, d.handle.len];
  });
  expect(parts).toEqual([
    [25.5, 57],
    [67.5, 99],
    [82, 113.5],
    [82, 113.5],
  ]);
});

test("grid size is clamped to what the label and latches need", { timeout: 60000 }, () => {
  expect(boxDims({ x: 2, y: 1, u: 3 }).grid).toEqual({ x: 4, y: 3, u: 6 });
});

test("lid sits on the base and a second box stacks on the lid", { timeout: 60000 }, () => {
  withKit((kit) => {
    const d = boxDims({ x: 4, y: 3, u: 6 });
    const base = buildBase(kit, d);
    const lid = kit.move(buildLid(kit, d), 0, 0, d.wallTop);
    const next = kit.move(base, 0, 0, d.wallTop + 10);
    // Tabs land in grooves: no solid overlap, but they do reach into the other part.
    expect(overlap(kit, base, lid)).toBeLessThan(0.5);
    expect(overlap(kit, lid, next)).toBeLessThan(0.5);
    expect(lid.boundingBox().min[2]).toBeCloseTo(d.wallTop - 0.001, 2);
  });
});

test(
  "a latch slides in a channel and spans base and lid without hitting either",
  { timeout: 60000 },
  () => {
    withKit((kit) => {
      const d = boxDims({ x: 4, y: 3, u: 6 });
      const base = buildBase(kit, d);
      const lid = kit.move(buildLid(kit, d), 0, 0, d.wallTop);
      // Closed position: pockets on the channel's catches, tabs in the base's undercut.
      const H = d.wallTop;
      const x0 = d.rails.front[0] + 10 + (LATCH.body[0] + LATCH.body[1]) / 2;
      const latch = kit.own(
        buildLatch(kit).warp(
          (p) => ([p[0], p[1], p[2]] = [x0 - p[0], p[2] + 0.25, p[1] + H - 26.45]),
        ),
      );
      expect(latch.boundingBox().min[1]).toBeGreaterThan(0);
      expect(overlap(kit, latch, base)).toBeLessThan(0.05);
      expect(overlap(kit, latch, lid)).toBeLessThan(0.05);
      // It is held: pushed 3 mm further out of the channel it would hit the catches' lips.
      const out = kit.move(latch, 0, -3, 0);
      expect(overlap(kit, out, base) + overlap(kit, out, lid)).toBeGreaterThan(1);
    });
  },
);

test("every part is a valid solid, with label text as its own body", { timeout: 60000 }, () => {
  const r = withKit((kit) =>
    generateBox(
      kit,
      {
        grid: { x: 5, y: 4, u: 6 },
        latches: 6,
        hinge: "screw",
        label: { title: "M3", lines: ["Bolts", "Nuts"] },
        handle: { on: true, fix: "pin" },
      },
      font,
    ),
  );
  expect(r.parts.map((p) => p.id)).toEqual([
    "base",
    "lid",
    "latch",
    "hinge",
    "label",
    "handle",
    "pin",
  ]);
  for (const p of r.parts) expect(p.valid, p.id).toBe(true);
  expect(r.parts.find((p) => p.id === "label").bodies).toHaveLength(2);
  expect(r.parts.find((p) => p.id === "latch").qty).toBe(6);
});

test("fit coupon pieces are valid and small", { timeout: 60000 }, () => {
  withKit((kit) => {
    for (const { name, m } of buildCoupon(kit)) {
      expect(m.status(), name).toBe("NoError");
      const b = m.boundingBox();
      expect(b.min[2]).toBeCloseTo(0, 1);
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])).toBeLessThan(
        65,
      );
    }
  });
});

test("bins fill the box height and the lid holds them", { timeout: 60000 }, () => {
  withKit((kit) => {
    const project = {
      grid: { x: 4, y: 3, u: 6 },
      bins: [
        { x: 0, y: 0, w: 2, d: 1 },
        { x: 2, y: 0, w: 2, d: 1 },
        { x: 0, y: 1, w: 1, d: 2, dividersY: 1, scoop: true },
      ],
    };
    const r = generateBox(kit, project, null);
    const bins = r.parts.filter((p) => p.kind === "bin");
    expect(bins.map((b) => b.qty).sort()).toEqual([1, 2]);
    for (const b of bins) expect(b.valid).toBe(true);
    // Placed bins clear the base and the closed lid, but have less than 1 mm to lift.
    const d = r.dims;
    const base = buildBase(kit, d);
    const lid = kit.move(buildLid(kit, d), 0, 0, d.wallTop);
    const bin = kit.move(
      buildBin(kit, gridfinityProject(d, project.bins), project.bins[0]),
      ...binOrigin(project.bins[0]),
    );
    expect(overlap(kit, bin, base)).toBeLessThan(0.05);
    expect(overlap(kit, bin, lid)).toBeLessThan(0.05);
    expect(overlap(kit, kit.move(bin, 0, 0, 1), lid)).toBeGreaterThan(10);
    expect(r.scene.filter((s) => s.id.startsWith("bin:"))).toHaveLength(3);
  });
});

test(
  "every latch placed for the 3D view sits in its channel without hitting the box",
  { timeout: 60000 },
  () => {
    withKit((kit) => {
      const r = generateBox(kit, { grid: { x: 4, y: 3, u: 6 }, latches: 6 }, null);
      const d = r.dims;
      const base = buildBase(kit, d);
      const lid = kit.move(buildLid(kit, d), 0, 0, d.wallTop);
      const latches = r.scene.filter((s) => s.id === "latch");
      expect(latches).toHaveLength(6);
      for (const { matrix } of latches) {
        const m = kit.own(buildLatch(kit).transform(matrix));
        expect(overlap(kit, m, base) + overlap(kit, m, lid)).toBeLessThan(0.05);
      }
    });
  },
);
