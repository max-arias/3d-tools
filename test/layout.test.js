import { expect, test } from "vite-plus/test";
import { defaultProject } from "../src/tools/gridfinity/model/defaults.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";
import { computeGrid } from "../src/tools/gridfinity/layout/grid.js";
import { planTiles, splitAxis } from "../src/tools/gridfinity/layout/split.js";
import { jointPositions } from "../src/tools/gridfinity/layout/joints.js";
import {
  duplicateSpot,
  fillEmpty,
  isValid,
  nextId,
  rectFromCells,
  resizeRect,
  roundToWholeCells,
} from "../src/tools/gridfinity/layout/bins.js";
import { planBinSegments } from "../src/tools/gridfinity/layout/binsplit.js";
import { ribSegments } from "../src/tools/gridfinity/layout/ribs.js";
import { labelSlotCount, slotRanges, tabDepth } from "../src/tools/gridfinity/layout/labels.js";
import { packPlates } from "../src/tools/gridfinity/layout/pack.js";
import { heightLimit } from "../src/tools/gridfinity/layout/limits.js";
import { layoutWarnings } from "../src/tools/gridfinity/layout/warnings.js";

const P = defaultProject();
const grid = computeGrid(P);

test("default drawer is 13 × 11 cells with centred padding", () => {
  expect(grid).toMatchObject({ cols: 13, rows: 11, pitchX: 42, pitchY: 42 });
  expect(grid.x.padStart).toBeCloseTo(6.5);
  expect(grid.y.padEnd).toBeCloseTo(3.5);
});

test("padding modes push the leftover to one side; custom fit stretches cells", () => {
  const left = computeGrid(sanitize({ grid: { padX: "start" } }));
  expect(left.x).toMatchObject({ padStart: 0 });
  expect(left.x.padEnd).toBeCloseTo(13);
  const custom = computeGrid(sanitize({ grid: { mode: "custom", target: 50 } }));
  expect(custom.cols).toBe(11);
  expect(custom.pitchX * custom.cols).toBeCloseTo(559);
  expect(() => computeGrid(sanitize({ drawer: { w: 50, tol: 5 } }))).toThrow(/smaller than one/);
});

test("tiles split evenly with the remainder in the middle and fit the bed", () => {
  const { xs, ys, tiles } = planTiles(grid, P.printer);
  expect(xs).toEqual([4, 5, 4]);
  expect(ys.reduce((a, b) => a + b)).toBe(11);
  expect(ys).toHaveLength(3);
  expect(tiles).toHaveLength(9);
  expect(tiles[0].name).toBe("tile_1-1");
});

test("a cut prefers the requested line when it still fits", () => {
  // 6 units of 42 mm, bed 150: two pieces needed; 3|3 would be 126 each, but a preferred cut at 2 gives 84|168 (too long).
  expect(splitAxis({ n: 6, size: 42, max: 150, preferred: new Set([2]) })).toEqual([3, 3]);
  // 5 units, bed 150: 2|3 or 3|2 both fit; the preferred cut decides.
  expect(splitAxis({ n: 5, size: 42, max: 150, preferred: new Set([3]) })).toEqual([3, 2]);
  expect(splitAxis({ n: 5, size: 42, max: 150, preferred: new Set([2]) })).toEqual([2, 3]);
  expect(() => splitAxis({ n: 3, size: 42, max: 30 })).toThrow(/Cannot split/);
});

test("joints sit mid-seam, one per `every` cells", () => {
  const j = jointPositions([4, 5], [5], 2);
  expect(j.map((x) => x.along)).toEqual([0.5, 2.5, 4.5]);
  expect(j.every((x) => x.seam === 4 && x.axis === "x")).toBe(true);
  expect(j).toHaveLength(3);
  expect(jointPositions([4], [4], 1)).toEqual([]);
});

test("bin validity: bounds, size and overlap", () => {
  const bins = [{ id: "a", x: 0, y: 0, w: 2, d: 2 }];
  expect(isValid(grid, bins, { x: 2, y: 0, w: 1, d: 1 })).toBe(true);
  expect(isValid(grid, bins, { x: 1, y: 1, w: 1, d: 1 })).toBe(false);
  expect(isValid(grid, bins, { x: 12.5, y: 0, w: 1, d: 1 })).toBe(false);
  expect(isValid(grid, bins, { x: 0, y: 0, w: 2, d: 2 }, "a")).toBe(true);
});

test("drag create, resize keeps one step, duplicate finds free space", () => {
  expect(rectFromCells({ x: 3, y: 2 }, { x: 1, y: 4 }, 1)).toEqual({ x: 1, y: 2, w: 3, d: 3 });
  expect(resizeRect({ x: 2, y: 2, w: 3, d: 2 }, ["r"], { x: 0, y: 0 }, 1)).toEqual({
    x: 2,
    y: 2,
    w: 1,
    d: 2,
  });
  expect(resizeRect({ x: 2, y: 2, w: 3, d: 2 }, ["l"], { x: 1, y: 0 }, 1)).toMatchObject({
    x: 1,
    w: 4,
  });
  const bins = [
    { id: "b1", x: 0, y: 0, w: 2, d: 2 },
    { id: "b2", x: 2, y: 0, w: 2, d: 2 },
  ];
  expect(duplicateSpot(grid, bins, bins[0])).toEqual({ x: 0, y: 2, w: 2, d: 2 });
  expect(nextId(bins)).toBe("b3");
  expect(nextId([{ id: "b3" }, { id: "b1" }])).toBe("b4");
  expect(nextId([{ id: "b2" }, { id: "b3" }])).toBe("b4");
});

test("fill covers every free cell without overlap", () => {
  const bins = [{ id: "a", x: 0, y: 0, w: 3, d: 3 }];
  const added = fillEmpty(grid, bins);
  const all = [...bins, ...added.map((r, i) => ({ id: `n${i}`, ...r }))];
  const area = all.reduce((s, b) => s + b.w * b.d, 0);
  expect(area).toBe(13 * 11);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      expect(isValid(grid, [all[i]], all[j])).toBe(true);
    }
  expect(Math.max(...added.map((r) => r.w))).toBeLessThanOrEqual(2);
});

test("turning half cells off rounds bins, or keeps those with no room", () => {
  const bins = [
    { id: "a", x: 0, y: 0, w: 1.5, d: 1 },
    { id: "b", x: 1.5, y: 0, w: 0.5, d: 1 },
  ];
  const r = roundToWholeCells(grid, bins);
  expect(r.rounded + r.kept).toBe(2);
  for (const b of r.bins) if (!(b.id === "b" && r.kept)) expect(Number.isInteger(b.w)).toBe(true);
  const tight = roundToWholeCells({ cols: 2, rows: 1 }, bins);
  expect(
    tight.bins.every((b) =>
      isValid(
        { cols: 2, rows: 1 },
        tight.bins.filter((o) => o !== b),
        b,
      ),
    ),
  ).toBe(true);
});

test("a long bin splits on dividers; seams on a divider stay closed", () => {
  const eff = { split: true, dividersX: 0, dividersY: 0 };
  const long = { x: 0, y: 0, w: 8, d: 2 };
  const plan = planBinSegments(grid, P.printer, long, eff);
  expect(plan.xs).toEqual([4, 4]);
  expect(plan.segments[0].open).toMatchObject({ xMax: true, xMin: false });
  const withDivider = planBinSegments(grid, P.printer, long, { ...eff, dividersX: 1 });
  expect(withDivider.segments[0].open.xMax).toBe(false);
  expect(planBinSegments(grid, P.printer, long, { ...eff, split: false }).segments).toHaveLength(1);
});

test("half-width bins get ribs, merged across touching bins", () => {
  const ribs = ribSegments([
    { x: 0, y: 0, w: 0.5, d: 1 },
    { x: 0, y: 1, w: 0.5, d: 0.5 },
    { x: 4, y: 2, w: 0.5, d: 1 },
  ]);
  expect(ribs.filter((r) => r.axis === "v")).toEqual([
    { axis: "v", line: 0.5, cell: 0, from: 0, to: 1 },
    { axis: "v", line: 0.5, cell: 1, from: 1, to: 1.5 },
    { axis: "v", line: 4.5, cell: 2, from: 2, to: 3 },
  ]);
  expect(ribSegments([{ x: 0, y: 0, w: 1, d: 1 }])).toEqual([]);
});

test("label slots follow dividers and the wall; tabs vanish on tiny bins", () => {
  expect(labelSlotCount({ label: "none" })).toBe(0);
  expect(labelSlotCount({ label: "full", dividersX: 3 })).toBe(1);
  expect(labelSlotCount({ label: "front", labelWall: "front", dividersX: 2, dividersY: 5 })).toBe(
    3,
  );
  expect(labelSlotCount({ label: "front", labelWall: "left", dividersX: 2, dividersY: 5 })).toBe(6);
  const r = slotRanges(100, 2, "front");
  expect(r[0][0]).toBeCloseTo(10);
  expect(r[1][1]).toBeCloseTo(90);
  const eff = { units: 6, heightMm: 0, lip: true, floor: 1.2, wall: 1.2, labelWall: "front" };
  expect(tabDepth(eff, { w: 41.5, d: 41.5 })).toBeGreaterThan(2);
  expect(tabDepth({ ...eff, units: 2 }, { w: 41.5, d: 5 })).toBe(0);
});

test("plates: parts fit, big parts get their own flagged plate, keys are grouped", () => {
  const parts = [
    { id: "t1", kind: "tile", w: 200, d: 200 },
    { id: "t2", kind: "tile", w: 200, d: 200 },
    { id: "huge", kind: "bin", w: 400, d: 50 },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, kind: "key", w: 8, d: 6 })),
  ];
  const plates = packPlates(parts, P.printer);
  expect(plates.find((p) => p.items.some((i) => i.id === "huge")).oversize).toBe(true);
  expect(plates.flatMap((p) => p.items)).toHaveLength(parts.length);
  const tilePlates = plates.filter((p) => p.items.some((i) => i.id.startsWith("t")));
  expect(tilePlates).toHaveLength(2);
  for (const p of plates.filter((p) => !p.oversize)) {
    for (const a of p.items) {
      expect(a.x + a.w).toBeLessThanOrEqual(246 + 5);
      expect(a.y + a.d).toBeLessThanOrEqual(246 + 5);
    }
  }
});

test("Bambu keep-out zone is respected", () => {
  const plates = packPlates([{ id: "a", kind: "tile", w: 230, d: 230 }], P.printer, {
    keepOut: true,
  });
  const it = plates[0].items[0];
  const ko = { w: 13, d: 23 };
  expect(it.x >= ko.w || it.y >= ko.d).toBe(true);
});

test("height limit and clearance warnings", () => {
  expect(heightLimit(P)).toMatchObject({ limit: 177, maxUnitsLip: 24, maxUnits: 25 });
  const tall = sanitize({
    drawer: { h: 60 },
    bins: [
      { id: "a", x: 0, y: 0, w: 1, d: 1, overrides: { units: 10 } },
      { id: "b", x: 99, y: 0, w: 1, d: 1 },
    ],
  });
  const w = layoutWarnings(tall, computeGrid(tall));
  expect(w.some((m) => /leaves less than the 3 mm top clearance/.test(m))).toBe(true);
  expect(w.some((m) => /does not fit the 13×11 grid/.test(m))).toBe(true);
});
