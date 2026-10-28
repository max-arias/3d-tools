import { describe, expect, it } from "vite-plus/test";
import { build3mf, packPlates } from "../src/tools/frames/lib/threemf.js";
import { partNames, printItems } from "../src/tools/boxes/lib/plates.js";
import { defaultProject, sanitize } from "../src/tools/boxes/model/project.js";
import {
  cellAt,
  dragRect,
  emptyCells,
  expandBins,
  overlaps,
} from "../src/tools/boxes/ui/binMath.js";
import { stlFiles } from "../src/tools/boxes/ui/export.js";
import { packSheet } from "../src/tools/boxes/ui/summary.js";
import "../src/tools/boxes/ui/strings.js";

const mesh = (w, d, h = 1) => ({
  positions: new Float32Array([0, 0, 0, w, 0, 0, w, d, 0, 0, d, h]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});
const part = (id, kind, qty, w, d, extra = {}) => ({
  id,
  kind,
  qty,
  bodies: [{ name: id, mesh: mesh(w, d) }],
  size: [w, d, 1],
  volume: w * d,
  valid: true,
  print: { layer: 0.2, walls: 3, infill: 100 },
  ...extra,
});

describe("bin editor maths", () => {
  const grid = { x: 5, y: 4 };
  it("maps a pointer to a cell with the front at the bottom", () => {
    const rect = { left: 0, top: 0, width: 500, height: 400 };
    expect(cellAt(10, 390, rect, grid)).toEqual({ x: 0, y: 0 });
    expect(cellAt(490, 10, rect, grid)).toEqual({ x: 4, y: 3 });
    expect(cellAt(900, -50, rect, grid)).toEqual({ x: 4, y: 3 });
  });
  it("spans a drag in any direction", () => {
    expect(dragRect({ x: 3, y: 2 }, { x: 1, y: 0 })).toEqual({ x: 1, y: 0, w: 3, d: 3 });
  });
  it("rejects a drop that overlaps a bin and lists the empty cells", () => {
    const bins = [{ x: 0, y: 0, w: 2, d: 1 }];
    expect(overlaps({ x: 1, y: 0, w: 2, d: 2 }, bins)).toBe(true);
    expect(overlaps({ x: 2, y: 0, w: 2, d: 2 }, bins)).toBe(false);
    expect(emptyCells(bins, grid)).toHaveLength(18);
  });
});

describe("suggest rows", () => {
  it("expands each row to its count of bins", () => {
    expect(
      expandBins([
        { w: 2, d: 1, count: 3 },
        { w: 1, d: 1, count: 1 },
      ]),
    ).toHaveLength(4);
  });
});

describe("print layout", () => {
  const project = { ...defaultProject(), build: { x: 256, y: 256, z: 256 } };
  const parts = [
    part("base", "base", 1, 250, 210),
    part("lid", "lid", 1, 250, 210),
    part("latch", "latch", 6, 30, 20),
    part("bin:a", "bin", 3, 40, 40, { bin: { w: 1, d: 1, u: 6 } }),
    part("bin:b", "bin", 1, 40, 40, { bin: { w: 1, d: 1, u: 6 } }),
  ];
  it("repeats parts by quantity and starts each print group on its own plate", () => {
    const { items } = printItems(parts, project);
    expect(items.map((i) => i.name).filter((n) => n.startsWith("latch"))).toHaveLength(6);
    expect(items.filter((i) => i.newPlate).map((i) => i.name.split("_")[0])).toEqual([
      "base",
      "lid",
      "latch",
      "bin",
    ]);
    const { plates } = packPlates(
      items.map((i) => ({ w: i.size[0], h: i.size[1], newPlate: i.newPlate })),
      project.build,
    );
    expect(plates).toBe(4);
    expect(build3mf({ items, bed: project.build }).length).toBeGreaterThan(0);
  });
  it("gives parts that share a name distinct names", () => {
    const names = partNames(parts, project.grid);
    expect(new Set(names.values()).size).toBe(parts.length);
  });
  it("turns a part that only fits sideways and flags one that never fits", () => {
    const small = { ...project, build: { x: 100, y: 300, z: 256 } };
    const { items, oversize } = printItems(
      [part("base", "base", 1, 250, 90), part("lid", "lid", 1, 400, 400)],
      small,
    );
    expect(items[0].size).toEqual([90, 250]);
    expect(oversize).toEqual(["lid_5x4"]);
  });
  it("keeps the label text with its plate and puts the quantity in STL names", () => {
    const label = part("label", "label", 1, 80, 20);
    label.bodies.push({ name: "label text", mesh: mesh(70, 10) });
    const files = stlFiles([label, parts[2]], project.grid);
    expect(Object.keys(files).sort()).toEqual(["label.stl", "label_text.stl", "latch_x6.stl"]);
  });
});

describe("pack sheet", () => {
  it("lists every part with its quantity and the hardware the choices need", () => {
    const project = sanitize({ hinge: "screw", handle: { on: true, fix: "bolt" }, pack: "m3" });
    const parts = [part("base", "base", 1, 250, 210), part("latch", "latch", 6, 30, 20)];
    const text = packSheet(project, {
      dims: { W: 252, D: 208, closedH: 56.5 },
      parts,
    });
    expect(text).toMatch(/- 1× Base/);
    expect(text).toMatch(/- 6× Latch/);
    expect(text).toMatch(/2× M3×30 bolt/);
    expect(text).toMatch(/2× M3×14–16 bolt/);
    expect(text).toMatch(/\d+ g/);
  });
});
