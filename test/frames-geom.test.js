import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/frames/lib/kit.js";
import { printable } from "../src/tools/frames/lib/place.js";
import { generateCoupon } from "../src/tools/frames/geom/coupon.js";
import { generateFrame } from "../src/tools/frames/geom/frame.js";
import { lithophane } from "../src/tools/frames/geom/litho.js";
import { PROFILE_IDS, crossSection } from "../src/tools/frames/geom/profiles.js";
import { fitAngle, planGrid } from "../src/tools/frames/geom/split.js";
import { defaultProject, merge, sanitize } from "../src/tools/frames/model/project.js";
import { STYLE_IDS, applyStyle } from "../src/tools/frames/model/styles.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const run = (fn, ...args) => {
  const kit = createKit(wasm);
  try {
    return fn(kit, ...args);
  } finally {
    kit.free();
  }
};
const make = (patch = {}) => sanitize(merge(defaultProject(), patch));
const area = (poly) =>
  poly.reduce((a, [x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    return a + (x0 * y1 - x1 * y0) / 2;
  }, 0);
const part = (f, name) => f.parts.find((q) => q.name === name);

test("every profile closes into a counter-clockwise polygon with positive area", () => {
  for (const id of PROFILE_IDS) {
    expect(area(crossSection(id, { w: 20, hgt: 12, rd: 4, ru: 3.4 })), id).toBeGreaterThan(20);
  }
});

test("a mitred rectangular frame matches the exact mitre volume for every profile", () => {
  for (const id of PROFILE_IDS) {
    const p = make({ moulding: { profile: id }, mount: { type: "none" }, retention: "clip" });
    const f = run(generateFrame, p);
    const fr = part(f, "frame");
    expect(fr.valid, id).toBe(true);
    const win = [p.photo.w - 2 * p.photo.overlap, p.photo.h - 2 * p.photo.overlap];
    expect(f.size[0], id).toBeCloseTo(win[0] + 2 * p.moulding.width, 2);
    // Path length at offset u is P + 8u for a mitred rectangle, so V = A*P + 8 * integral(u dA).
    const L = f.layers;
    const poly = crossSection(id, {
      w: 20,
      hgt: L.hgt,
      rd: L.rd,
      ru: p.photo.overlap + p.rabbet.clearance,
    });
    const A = area(poly);
    const ux = poly.reduce((a, [x0, y0], i) => {
      const [x1, y1] = poly[(i + 1) % poly.length];
      return a + ((x0 + x1) * (x0 * y1 - x1 * y0)) / 6;
    }, 0);
    // The clip grooves remove a little volume, so compare loosely (within 0.3%).
    expect(Math.abs(fr.volume / (A * 2 * (win[0] + win[1]) + 8 * ux) - 1), id).toBeLessThan(0.003);
  }
});

test("a deep stack raises the moulding height instead of cutting through the lip", () => {
  const f = run(generateFrame, make({ stack: { glass: 3, back: 6, gap: 8 } }));
  expect(f.warnings).toContain("heightRaised");
  expect(f.size[2]).toBeGreaterThanOrEqual(f.layers.rd + 2 - 1e-6);
});

test("every shape builds a valid frame with a back that fits its pocket", () => {
  for (const type of ["rect", "rounded", "oval", "circle", "arch", "polygon"]) {
    const f = run(generateFrame, make({ shape: { type }, photo: { size: "5x7" } }));
    expect(f.valid, type).toBe(true);
    const back = part(f, "back");
    expect(back.valid, type).toBe(true);
    expect(f.parts.find((q) => q.role === "frame").volume, type).toBeGreaterThan(10000);
  }
});

test("the plate is smaller than the pocket by a clearance on every side", () => {
  const p = make({ mount: { type: "none" } });
  const f = run(generateFrame, p);
  const back = part(f, "back");
  const win = [p.photo.w - 2 * p.photo.overlap, p.photo.h - 2 * p.photo.overlap];
  const pocket = [
    win[0] + 2 * (p.photo.overlap + p.rabbet.clearance),
    win[1] + 2 * (p.photo.overlap + p.rabbet.clearance),
  ];
  // The bumps stand 0.35 proud of the plate edge, which is 0.15 inside the pocket wall.
  expect(back.size[0]).toBeCloseTo(pocket[0] - 0.3 + 0.7, 1);
  expect(back.size[1]).toBeCloseTo(pocket[1] - 0.3 + 0.7, 1);
});

test("mat has openings for every photo of the grid and a stamp edge removes material", () => {
  const plain = run(generateFrame, make({ mat: { on: true } }));
  const grid = run(generateFrame, make({ mat: { on: true, rows: 2, cols: 2 } }));
  const perf = run(generateFrame, make({ mat: { on: true, edge: "scalloped" } }));
  expect(part(grid, "mat").valid).toBe(true);
  expect(part(grid, "mat").volume).toBeGreaterThan(part(plain, "mat").volume); // bars between the openings
  expect(part(perf, "mat").volume).toBeLessThan(part(plain, "mat").volume);
});

test("mounts: magnets need pockets, a stand adds a leg, slide-in leaves the back wall on the frame", () => {
  const mag = run(generateFrame, make({ mount: { type: "magnets" } }));
  const none = run(generateFrame, make({ mount: { type: "none" } }));
  // The magnet back is thicker (magnet + 0.8) but pockets remove material from it.
  expect(part(mag, "back").volume).toBeLessThan((part(none, "back").volume * (2 + 0.8)) / 2);
  expect(part(run(generateFrame, make({ mount: { type: "stand" } })), "stand").valid).toBe(true);
  const slide = run(generateFrame, make({ retention: "slide", mount: { type: "none" } }));
  expect(part(slide, "back")).toBeUndefined();
  expect(part(slide, "frame").volume).toBeGreaterThan(part(none, "frame").volume);
});

test("every preset builds a valid frame without warnings", () => {
  for (const id of STYLE_IDS) {
    const f = run(generateFrame, applyStyle(defaultProject(), id));
    expect(f.valid, id).toBe(true);
    expect(f.warnings, id).toEqual([]);
  }
  const mini = run(generateFrame, applyStyle(defaultProject(), "stampBlack"));
  expect(mini.parts.map((q) => q.role).sort()).toEqual(["frame"]);
  expect(mini.plan.nx * mini.plan.ny).toBe(1);
});

test("planGrid: whole when it fits (even on the diagonal), otherwise the fewest pieces that fit", () => {
  const one = planGrid(200, 240, { x: 256, y: 256 });
  expect(one.nx * one.ny).toBe(1);
  const two = planGrid(200, 300, { x: 256, y: 256 });
  expect(two.nx * two.ny).toBe(2);
  const diag = planGrid(60, 290, { x: 256, y: 256 });
  expect(diag.fits && diag.angle > 0 && diag.nx * diag.ny === 1).toBe(true);
  expect(fitAngle(600, 600, 250, 250)).toBeNull();
  const big = planGrid(500, 400, { x: 256, y: 256 });
  expect(big.nx * big.ny).toBe(4);
});

test("a frame bigger than the bed is cut into pieces that each fit, with connectors on every cut", () => {
  const p = make({ photo: { size: "a3" }, print: { x: 256, y: 256 }, mount: { type: "none" } });
  const f = run(generateFrame, p);
  const pieces = f.parts.filter((q) => q.role === "frame");
  const keys = f.parts.filter((q) => q.role === "key");
  expect(pieces.length).toBe(f.plan.nx * f.plan.ny - (f.plan.nx > 2 && f.plan.ny > 2 ? 1 : 0));
  for (const q of f.parts.filter((q) => q.role !== "key")) {
    const { size } = printable(q);
    expect(
      (Math.min(size[0], size[1]) <= 250 && Math.max(size[0], size[1]) <= 250) ||
        (size[0] <= 250 && size[1] <= 250),
      q.name,
    ).toBe(true);
  }
  // 2 x 2 split: 2 cuts, each crossing the ring twice.
  expect(f.plan.nx * f.plan.ny).toBeGreaterThan(1);
  expect(keys.length).toBeGreaterThanOrEqual(f.plan.nx - 1 + (f.plan.ny - 1));
  expect(f.valid).toBe(true);
});

test("textures keep the frame valid and only cut into the surface", () => {
  const plain = run(generateFrame, make({ mount: { type: "none" } }));
  for (const type of ["woodgrain", "hammered", "linen", "reeded"]) {
    const f = run(generateFrame, make({ texture: { type }, mount: { type: "none" } }));
    expect(f.valid, type).toBe(true);
    expect(part(f, "frame").volume, type).toBeLessThan(part(plain, "frame").volume);
  }
});

test("lithophane panel is a valid solid whose thickness follows the image", () => {
  const cols = 20;
  const rows = 30;
  const data = new Uint8Array(cols * rows).fill(255);
  for (let i = 0; i < (cols * rows) / 2; i++) data[i] = 0; // top half black
  const kit = createKit(wasm);
  try {
    const m = lithophane(
      kit,
      { cols, rows, data },
      { w: 40, h: 60, z0: 0, min: 1, max: 3, invert: false },
    );
    expect(m.status()).toBe("NoError");
    expect(m.volume()).toBeCloseTo(40 * 60 * (0.5 * 3 + 0.5 * 1), -1);
  } finally {
    kit.free();
  }
});

test("coupon makes five keys and a bar", () => {
  const c = run(generateCoupon);
  expect(c.valid).toBe(true);
  expect(c.parts.length).toBe(6);
});

test("cutting loses only the connector pockets: pieces + pockets add up to the whole frame", () => {
  const base = { photo: { size: "a3" }, mount: { type: "none" }, retention: "clip" };
  const whole = run(generateFrame, make({ ...base, print: { x: 1000, y: 1000 } }));
  const cut = run(generateFrame, make({ ...base, print: { x: 256, y: 256 } }));
  const sum = (f) => f.parts.filter((q) => q.role === "frame").reduce((a, q) => a + q.volume, 0);
  const keys = cut.parts.filter((q) => q.role === "key");
  const lost = sum(whole) - sum(cut);
  expect(keys.length).toBeGreaterThan(0);
  // Each pocket is its key grown by the tolerance and 0.2 deeper; the allowance covers both.
  const keyVol = keys.reduce((a, q) => a + q.volume, 0);
  expect(lost).toBeGreaterThan(keyVol);
  expect(lost).toBeLessThan(keyVol * 1.6);
});
