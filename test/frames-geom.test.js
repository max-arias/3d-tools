import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/frames/lib/kit.js";
import { generateFrame } from "../src/tools/frames/geom/frame.js";
import { PROFILE_IDS, crossSection } from "../src/tools/frames/geom/profiles.js";
import { defaultProject, sanitize } from "../src/tools/frames/model/project.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const run = (fn, project) => {
  const kit = createKit(wasm);
  try {
    return fn(kit, project);
  } finally {
    kit.free();
  }
};
const area = (poly) =>
  poly.reduce((a, [x0, y0], i) => {
    const [x1, y1] = poly[(i + 1) % poly.length];
    return a + (x0 * y1 - x1 * y0) / 2;
  }, 0);

test("every profile closes into a counter-clockwise polygon with positive area", () => {
  for (const id of PROFILE_IDS) {
    const poly = crossSection(id, { w: 20, hgt: 12, rd: 4, ru: 3.4 });
    expect(area(poly), id).toBeGreaterThan(20);
  }
});

test("a mitred rectangular frame is valid, matches Pappus volume and the outer size", () => {
  for (const id of PROFILE_IDS) {
    const p = sanitize({
      ...defaultProject(),
      moulding: { ...defaultProject().moulding, profile: id },
    });
    const f = run(generateFrame, p);
    expect(f.valid, id).toBe(true);
    const win = [p.photo.w - 2 * p.photo.overlap, p.photo.h - 2 * p.photo.overlap];
    expect(f.size[0], id).toBeCloseTo(win[0] + 2 * p.moulding.width, 2);
    expect(f.size[1], id).toBeCloseTo(win[1] + 2 * p.moulding.width, 2);
    // The path length at offset u is P + 8u for a mitred rectangle, so V = A*P + 8 * integral(u dA).
    const poly = crossSection(p.moulding.profile, { w: 20, hgt: f.size[2], rd: 4, ru: 3.4 });
    const A = area(poly);
    const ux = poly.reduce((a, [x0, y0], i) => {
      const [x1, y1] = poly[(i + 1) % poly.length];
      return a + ((x0 + x1) * (x0 * y1 - x1 * y0)) / 6;
    }, 0);
    expect(f.volume, id).toBeCloseTo(A * 2 * (win[0] + win[1]) + 8 * ux, -1);
  }
});

test("a deep rabbet raises the moulding height instead of cutting through the lip", () => {
  const p = sanitize({ ...defaultProject(), rabbet: { depth: 14, clearance: 0.4, lip: 2 } });
  const f = run(generateFrame, p);
  expect(f.warnings).toContain("heightRaised");
  expect(f.size[2]).toBeGreaterThanOrEqual(16);
});
