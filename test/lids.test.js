import { expect, test } from "vite-plus/test";
import { effectiveBin } from "../src/tools/gridfinity/model/effective.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";
import { computeGrid } from "../src/tools/gridfinity/layout/grid.js";
import { layoutWarnings } from "../src/tools/gridfinity/layout/warnings.js";
import { lidTop } from "../src/tools/gridfinity/layout/lids.js";

const bin = (overrides, extra = {}) => ({ id: "a", x: 0, y: 0, w: 2, d: 1, overrides, ...extra });

test("lid fields are clamped and unknown values fall back to the defaults", () => {
  const p = sanitize({
    binDefaults: { lid: "bogus", lidThickness: 99, lidFit: 0, lidHandle: "knob", lidSide: "left" },
    bins: [bin({ lid: "hinged", lidThickness: 0.1 })],
  });
  expect(p.binDefaults).toMatchObject({
    lid: "none",
    lidThickness: 4,
    lidFit: 0.1,
    lidHandle: "knob",
    lidSide: "left",
  });
  expect(p.bins[0].overrides).toEqual({ lid: "hinged", lidThickness: 1.2 });
});

test("sliding and hinged lids replace the stacking lip", () => {
  for (const lid of ["sliding", "hinged"]) {
    const p = sanitize({ bins: [bin({ lid })] });
    expect(effectiveBin(p, p.bins[0]).lip).toBe(false);
  }
  const p = sanitize({ bins: [bin({ lid: "dropin" })] });
  expect(effectiveBin(p, p.bins[0]).lip).toBe(true);
});

test("lid top height per type", () => {
  const at = (lid, extra = {}) => {
    const p = sanitize({ bins: [bin({ lid, units: 3, ...extra })] });
    return lidTop(effectiveBin(p, p.bins[0]));
  };
  expect(at("none")).toBeNull();
  expect(at("sliding")).toBeNull();
  expect(at("dropin")).toBeCloseTo(21 + 4.4 + 1.6);
  expect(at("hinged")).toBeCloseTo(21 + 1.6);
  expect(at("stackable")).toBeCloseTo(21 + 0.5 + 4.75 + 1.6 + 4.65);
});

test("lid warnings: single piece, lip needed, clearance", () => {
  const warn = (project) => layoutWarnings(project, computeGrid(project));
  const long = sanitize({
    drawer: { w: 400, d: 100 },
    printer: { x: 120, y: 120 },
    bins: [bin({ lid: "hinged" }, { w: 8, d: 2 })],
  });
  expect(warn(long).some((m) => /needs a bin that prints in one piece/.test(m))).toBe(true);
  const noLip = sanitize({ bins: [bin({ lid: "stackable", lip: false })] });
  expect(warn(noLip).some((m) => /needs the stacking lip/.test(m))).toBe(true);
  // 66 mm drawer, 5 mm to spare: an 8u bin alone fits (60.4), its lid on top (62) does not.
  const drawer = { h: 66, topClearance: 5 };
  expect(warn(sanitize({ drawer, bins: [bin({ units: 8 })] }))).toEqual([]);
  expect(
    warn(sanitize({ drawer, bins: [bin({ lid: "dropin", units: 8 })] })).some((m) =>
      /top clearance/.test(m),
    ),
  ).toBe(true);
  expect(warn(sanitize({ bins: [bin({ lid: "dropin" })] }))).toEqual([]);
});

// ---- geometry ----------------------------------------------------------------------------------

import Module from "manifold-3d";
import { beforeAll } from "vite-plus/test";
import { createKit } from "../src/tools/gridfinity/geom/kit.js";
import { generateDrawer } from "../src/tools/gridfinity/geom/drawer.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});
const gen = (over) => generateDrawer(() => createKit(wasm), sanitize(over));
const small = { drawer: { w: 200, d: 200 } };
const lids = (r) => r.parts.filter((p) => p.kind === "lid");

test("drop-in lid: valid, footprint equals the bin, one piece per bin", () => {
  const r = gen({ ...small, bins: [bin({ lid: "dropin", units: 3 }, { w: 3, d: 2 })] });
  const [lid] = lids(r);
  expect(lid).toBeTruthy();
  expect(lid.valid).toBe(true);
  expect(lid.name).toBe("lid_3x2_a");
  expect(lid.base).toBe("lid_3x2");
  const b = r.parts.find((p) => p.kind === "bin");
  expect(lid.size[0]).toBeCloseTo(b.size[0], 1);
  expect(lid.size[1]).toBeCloseTo(b.size[1], 1);
  // plate 1.6 + plug 3
  expect(lid.size[2]).toBeCloseTo(4.6, 1);
  // sits on the rim of the bin (3u + lip)
  expect(lid.place[2]).toBeCloseTo(21 + 4.4 - 3, 1);
});

test("handles: dip lowers volume, tab and knob add, flat-topped lids print flipped", () => {
  const vol = (lidHandle) => {
    const r = gen({ ...small, bins: [bin({ lid: "dropin", lidHandle }, { w: 3, d: 2 })] });
    return { v: lids(r)[0].volume, flipped: lids(r)[0].flipped, h: lids(r)[0].size[2] };
  };
  const none = vol("none");
  expect(vol("dip").v).toBeLessThan(none.v);
  expect(vol("tab").v).toBeGreaterThan(none.v);
  expect(vol("knob").v).toBeGreaterThan(none.v);
  expect(vol("knob").h).toBeCloseTo(none.h + 5, 1);
  expect([none.flipped, vol("dip").flipped, vol("tab").flipped, vol("knob").flipped]).toEqual([
    true,
    true,
    false,
    false,
  ]);
});

test("drop-in lid stays clear of dividers and the bin never overlaps its lid", () => {
  const r = gen({
    ...small,
    bins: [
      bin({ lid: "dropin", lip: false, units: 3, dividersX: 1, lidHandle: "none" }, { w: 3, d: 2 }),
    ],
  });
  expect(lids(r)[0].valid).toBe(true);
  // A divider cut-out makes the plug lighter than a plain one.
  const plain = gen({
    ...small,
    bins: [bin({ lid: "dropin", lip: false, units: 3, lidHandle: "none" }, { w: 3, d: 2 })],
  });
  expect(lids(r)[0].volume).toBeLessThan(lids(plain)[0].volume);
});

/** Part mesh back in assembled position (undoing the print flip), as a manifold. */
function assembled(part) {
  const p = part.mesh.positions;
  const v = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    v[i] = p[i] + part.place[0];
    v[i + 1] = (part.flipped ? part.size[1] - p[i + 1] : p[i + 1]) + part.place[1];
    v[i + 2] = (part.flipped ? part.size[2] - p[i + 2] : p[i + 2]) + part.place[2];
  }
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: v, triVerts: part.mesh.indices });
  return wasm.Manifold.ofMesh(mesh);
}

/** Overlap volume between two parts in the assembled drawer (should be ~0 for parts that fit together). */
const overlap = (a, b) => assembled(a).intersect(assembled(b)).volume();

test("the overlap helper really detects overlap", () => {
  const r = gen({ ...small, bins: [bin({ lid: "dropin" }, { w: 2, d: 2 })] });
  const b = r.parts.find((p) => p.kind === "bin");
  expect(overlap(b, b)).toBeGreaterThan(10000);
});

test("a drop-in lid never overlaps its bin, with and without lip, dividers, label tab", () => {
  for (const overrides of [
    {},
    { lip: false },
    { lip: false, dividersX: 2, dividersY: 1 },
    { label: "front", lip: false },
    { grab: { front: { scoop: true, notch: true } } },
  ]) {
    const r = gen({
      ...small,
      bins: [bin({ lid: "dropin", units: 3, ...overrides }, { w: 3, d: 2 })],
      labelStyle: { kind: "raised" },
    });
    const binPart = r.parts.find((p) => p.kind === "bin");
    const lid = lids(r)[0];
    expect(overlap(binPart, lid), JSON.stringify(overrides)).toBeLessThan(1);
  }
});

test("default drawers have no lids", () => {
  expect(lids(gen({ ...small, bins: [bin({})] }))).toHaveLength(0);
});

test("stackable lid: feet underneath, sockets on top, clear of the bin, splits with the bin", () => {
  const r = gen({ ...small, bins: [bin({ lid: "stackable", units: 3 }, { w: 3, d: 2 })] });
  const [lid] = lids(r);
  expect(lid.valid).toBe(true);
  // feet 4.75 + floor 1.6 + sockets 4.65
  expect(lid.size[2]).toBeCloseTo(4.75 + 1.6 + 4.65, 1);
  expect(lid.flipped).toBe(false);
  // its feet start where a stacked bin's would: lip base (H + 0.5)
  expect(lid.place[2]).toBeCloseTo(21 + 0.5, 1);
  expect(
    overlap(
      r.parts.find((p) => p.kind === "bin"),
      lid,
    ),
  ).toBeLessThan(1);
  // top sockets remove material compared to a solid slab
  const slab = 3 * 42 - 0.5;
  expect(lid.volume).toBeLessThan(slab * (2 * 42 - 0.5) * (1.6 + 4.65 + 4.75));
  const split = gen({
    drawer: { w: 400, d: 100 },
    printer: { x: 120, y: 120 },
    bins: [bin({ lid: "stackable" }, { w: 8, d: 2 })],
  });
  expect(lids(split).length).toBeGreaterThan(1);
  expect(lids(split).every((l) => l.valid)).toBe(true);
  expect(lids(split)[0].name).toMatch(/^lid_8x2_a_seg1$/);
});

const OUT = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0] };

test("sliding lid: rails, entry slot, lid never touches the bin and slides straight out", () => {
  for (const side of ["front", "back", "left", "right"]) {
    const r = gen({
      ...small,
      bins: [bin({ lid: "sliding", lidSide: side, units: 4 }, { w: 3, d: 2 })],
    });
    const lid = lids(r)[0];
    const binPart = r.parts.find((p) => p.kind === "bin");
    expect(lid.valid, side).toBe(true);
    expect(binPart.valid, side).toBe(true);
    const bm = assembled(binPart);
    const lm = assembled(lid);
    for (const dist of [0, 15, 40, 80]) {
      const moved = lm.translate(OUT[side].map((v) => v * dist));
      expect(bm.intersect(moved).volume(), `${side} at ${dist} mm`).toBeLessThan(1);
    }
    // The lid sits below the rim with no lip on the bin.
    expect(lid.place[2] + lid.size[2]).toBeLessThan(28);
  }
});

test("sliding lid: bin gets rails (heavier than a plain bin), dividers stay under the lid, tabs are skipped", () => {
  const vol = (overrides) =>
    gen({ ...small, bins: [bin({ units: 4, ...overrides }, { w: 3, d: 2 })] }).parts.find(
      (p) => p.kind === "bin",
    );
  const plain = vol({ lip: false });
  const slid = vol({ lid: "sliding" });
  expect(slid.volume).toBeGreaterThan(plain.volume);
  const divided = gen({
    ...small,
    bins: [bin({ units: 4, lid: "sliding", dividersX: 1 }, { w: 3, d: 2 })],
  });
  expect(
    overlap(
      divided.parts.find((p) => p.kind === "bin"),
      lids(divided)[0],
    ),
  ).toBeLessThan(1);
  const tabbed = vol({ lid: "sliding", label: "front" });
  expect(tabbed.volume).toBeCloseTo(slid.volume, -1);
});

test("sliding lids need a tall enough, single-piece bin", () => {
  // A thick lid in a 2u bin leaves no room for the ledge above the floor.
  const short = gen({
    ...small,
    bins: [bin({ lid: "sliding", units: 2, lidThickness: 4 }, { w: 2, d: 2 })],
  });
  expect(lids(short)).toHaveLength(0);
  expect(short.warnings.some((m) => /too short for a sliding lid/.test(m))).toBe(true);
  const split = gen({
    drawer: { w: 400, d: 100 },
    printer: { x: 120, y: 120 },
    bins: [bin({ lid: "sliding" }, { w: 8, d: 2 })],
  });
  expect(lids(split)).toHaveLength(0);
  expect(split.warnings.some((m) => /one piece/.test(m))).toBe(true);
});

import { hingeSpec } from "../src/tools/gridfinity/layout/lids.js";

/** Pin axis in bin-local coordinates, plus its direction (x or y), for a hinge on `side`. */
function pinAxis(side, W, D, h) {
  const u = h.uAxis;
  const at = { left: [u, 0], right: [W - u, 0], front: [0, u], back: [0, D - u] }[side];
  return { point: at, alongX: side === "front" || side === "back" };
}

function swing(lid, side, W, D, h, origin, binMan, degrees) {
  const { point, alongX } = pinAxis(side, W, D, h);
  const centre = [
    origin[0] + (alongX ? 0 : point[0]),
    origin[1] + (alongX ? point[1] : 0),
    origin[2] + h.zAxis,
  ];
  const lm = assembled(lid);
  // Pick the sense of rotation that lifts the lid's free edge.
  const turn = (sign) => {
    const euler = alongX ? [sign * degrees, 0, 0] : [0, sign * degrees, 0];
    const moved = lm
      .translate(centre.map((v) => -v))
      .rotate(euler)
      .translate(centre);
    return moved;
  };
  const a = turn(1);
  const b = turn(-1);
  const lifted = a.boundingBox().max[2] > b.boundingBox().max[2] ? a : b;
  return binMan.intersect(lifted).volume();
}

test("hinged lid: valid parts, pin posts, and the lid swings open 100° on every side without touching the bin", () => {
  for (const side of ["back", "front", "left", "right"]) {
    const r = gen({
      ...small,
      bins: [bin({ lid: "hinged", lidSide: side, units: 4, lidHandle: "dip" }, { w: 3, d: 2 })],
    });
    const lid = lids(r)[0];
    const binPart = r.parts.find((p) => p.kind === "bin");
    expect(lid.valid, side).toBe(true);
    expect(binPart.valid, side).toBe(true);
    expect(lid.flipped).toBe(true);
    const W = 3 * 42;
    const D = 2 * 42;
    const h = hingeSpec(sanitizeEff(side), {
      gap: 0.25,
      wall: 1.2,
      H: 28,
      L: side === "front" || side === "back" ? W : D,
    });
    const origin = [binPart.place[0] - 0.25, binPart.place[1] - 0.25, binPart.place[2]];
    const bm = assembled(binPart);
    expect(overlap(binPart, lid), `${side} closed`).toBeLessThan(1);
    for (const deg of [20, 45, 70, 90, 100]) {
      expect(swing(lid, side, W, D, h, origin, bm, deg), `${side} at ${deg}°`).toBeLessThan(1);
    }
  }
});

function sanitizeEff(side) {
  const p = sanitize({ bins: [bin({ lid: "hinged", lidSide: side, units: 4 }, { w: 3, d: 2 })] });
  return effectiveBin(p, p.bins[0]);
}

test("hinged lid: posts are carved with a pin hole, raised handles become a dip, short bins are refused", () => {
  const withHandle = gen({
    ...small,
    bins: [bin({ lid: "hinged", units: 4, lidHandle: "knob" }, { w: 3, d: 2 })],
  });
  expect(lids(withHandle)[0].flipped).toBe(true);
  const plain = gen({ ...small, bins: [bin({ units: 4 }, { w: 3, d: 2 })] }).parts.find(
    (p) => p.kind === "bin",
  );
  const hinged = withHandle.parts.find((p) => p.kind === "bin");
  expect(hinged.volume).toBeGreaterThan(plain.volume);
  const short = gen({
    ...small,
    bins: [bin({ lid: "hinged", units: 2, lidThickness: 4 }, { w: 2, d: 2 })],
  });
  expect(
    lids(short).length + short.warnings.filter((m) => /too short for a hinged lid/.test(m)).length,
  ).toBeGreaterThan(0);
});

test("hinged lids put a pin line in the parts list", async () => {
  const { partsText } = await import("../src/tools/gridfinity/export/bundle.js");
  const { getPartsData } = await import("../src/tools/gridfinity/ui/partsData.js");
  const project = sanitize({ ...small, bins: [bin({ lid: "hinged", units: 4 }, { w: 3, d: 2 })] });
  const r = generateDrawer(() => createKit(wasm), project);
  expect(partsText(r, project, getPartsData(r, project))).toMatch(
    /Hinge pins: cut 1\.75 mm filament to 1 × \d+ mm/,
  );
  const none = sanitize({ ...small, bins: [bin({ lid: "dropin" }, { w: 3, d: 2 })] });
  const r2 = generateDrawer(() => createKit(wasm), none);
  expect(partsText(r2, none, getPartsData(r2, none))).not.toMatch(/Hinge pins/);
});
