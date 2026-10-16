import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/tapas/lib/kit.js";
import { generateCoupon } from "../src/tools/tapas/geom/coupon.js";
import { generateFrame } from "../src/tools/tapas/geom/frame.js";
import { generateKeycap } from "../src/tools/tapas/geom/keycap.js";
import { generateTapa } from "../src/tools/tapas/geom/tapa.js";
import { ICON_IDS } from "../src/tools/tapas/geom/icons.js";
import { PATTERN_MODES, defaultProject, sanitize } from "../src/tools/tapas/model/project.js";
import font from "../src/tools/tapas/geom/font.json";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const run = (fn, project) => {
  const kit = createKit(wasm);
  try {
    return fn(kit, project, { font });
  } finally {
    kit.free();
  }
};
const base = (patch) => sanitize({ ...defaultProject(), ...patch });

test("key cap pocket holds the key with clearance and the cap has the set height", () => {
  const p = defaultProject();
  const cap = run(generateKeycap, p);
  expect(cap.valid).toBe(true);
  expect(cap.pocket[0]).toBeCloseTo(p.keycap.w + 2 * p.keycap.clearance, 5);
  expect(cap.size[2]).toBeCloseTo(p.keycap.face + p.keycap.h, 3);
  expect(cap.size[0]).toBeCloseTo(cap.pocket[0] + 2 * p.keycap.wall, 3);
});

test("every icon in every mode makes a valid cap", () => {
  for (const icon of ICON_IDS) {
    for (const iconMode of PATTERN_MODES) {
      const p = base({ keycap: { ...defaultProject().keycap, icon, iconMode, text: "12" } });
      const cap = run(generateKeycap, p);
      expect(cap.valid, `${icon}/${iconMode}`).toBe(true);
      expect(cap.warnings, `${icon}/${iconMode}`).toEqual([]);
      expect(cap.bodies.length, `${icon}/${iconMode}`).toBe(
        iconMode === "inlay" || iconMode === "raised" ? 2 : 1,
      );
    }
  }
});

test("empty key-cap text is reported, not silently dropped", () => {
  const p = base({ keycap: { ...defaultProject().keycap, icon: "text", text: "" } });
  expect(run(generateKeycap, p).warnings).toContain("emptyText");
});

test("frame is a ring: it leaves the tapa pocket open and stands at the set height", () => {
  const p = base({ product: "frame" });
  const frame = run(generateFrame, p);
  expect(frame.valid).toBe(true);
  expect(frame.size[2]).toBeCloseTo(p.frame.h, 3);
  expect(frame.pocket[0]).toBeCloseTo(p.plate.w + 2 * p.overlay.clearance, 5);
  const solid = frame.size[0] * frame.size[1] * p.frame.h;
  expect(frame.volume).toBeLessThan(solid - frame.pocket[0] * frame.pocket[1] * p.frame.h * 0.9);
});

test("frame patterns work in every mode", () => {
  for (const mode of PATTERN_MODES) {
    const p = base({
      product: "frame",
      pattern: { ...defaultProject().pattern, id: "stripes", mode },
    });
    expect(run(generateFrame, p).valid, mode).toBe(true);
  }
});

test("replacement tapa has the plate footprint, windows and a skirt around the bastidor", () => {
  const p = base({ product: "tapa" });
  const tapa = run(generateTapa, p);
  expect(tapa.valid).toBe(true);
  expect(tapa.size[0]).toBeCloseTo(p.plate.w, 3);
  expect(tapa.size[2]).toBeCloseTo(p.tapa.face + p.tapa.skirt, 3);
  expect(tapa.pocket[0]).toBeCloseTo(p.tapa.boxW + 2 * p.tapa.clearance, 5);
  const blank = run(generateTapa, base({ product: "tapa", groups: [["ciego", "ciego", "ciego"]] }));
  expect(blank.volume).toBeGreaterThan(tapa.volume);
});

test("a bastidor that does not fit inside the plate is reported", () => {
  const p = base({ product: "tapa", tapa: { ...defaultProject().tapa, boxW: 80 } });
  expect(run(generateTapa, p).warnings).toContain("boxTooBig");
});

test("fit strip has five blocks with different pockets", () => {
  const strip = run(generateCoupon, defaultProject());
  expect(strip.valid).toBe(true);
  expect(strip.size[0]).toBeGreaterThan(150);
});
