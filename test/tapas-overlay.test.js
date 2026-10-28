import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/tapas/lib/kit.js";
import { facePieces } from "../src/tools/tapas/geom/layout.js";
import { generateOverlay, layoutModules } from "../src/tools/tapas/geom/overlay.js";
import { SHAPE_IDS, placeOutline } from "../src/tools/tapas/geom/shapes.js";
import { MODULE_IDS } from "../src/tools/tapas/model/modules.js";
import { PRESETS } from "../src/tools/tapas/model/presets.js";
import { defaultProject, moveModule, sanitize } from "../src/tools/tapas/model/project.js";
import { constrainMove, covers, fitScale, mustShape } from "../src/tools/tapas/geom/fit2d.js";
import { SHAPES, fitOutline } from "../src/tools/tapas/geom/shapes.js";
import { shapeDrag, turn } from "../src/tools/tapas/ui/drag.js";
import { build3mf } from "../src/tools/tapas/lib/threemf.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const make = (project) => {
  const kit = createKit(wasm);
  try {
    return generateOverlay(kit, project);
  } finally {
    kit.free();
  }
};

test("every shape makes a valid overlay on every preset", () => {
  for (const preset of PRESETS.filter((p) => p.plate)) {
    for (const shape of SHAPE_IDS) {
      const p = sanitize({
        ...defaultProject(),
        preset: preset.id,
        plate: preset.plate,
        groups: Array.from({ length: preset.groups }, () => ["tecla", "tecla", "tecla"]),
        overlay: { ...defaultProject().overlay, shape },
      });
      const part = make(p);
      expect(part.valid, `${preset.id}/${shape}`).toBe(true);
      // the outline always holds the pocket plus the wall
      expect(part.size[0]).toBeGreaterThanOrEqual(p.plate.w + 2 * p.overlay.wall - 0.01);
      expect(part.size[1]).toBeGreaterThanOrEqual(p.plate.h + 2 * p.overlay.wall - 0.01);
    }
  }
}, 60_000);

test("pocket leaves the set clearance around the tapa", () => {
  const p = defaultProject();
  p.overlay.shape = "rect";
  const part = make(p);
  expect(part.pocket[0]).toBeCloseTo(p.plate.w + 2 * p.overlay.clearance, 5);
  expect(part.size[0]).toBeCloseTo(p.plate.w + 2 * p.overlay.clearance + 2 * p.overlay.wall, 3);
  expect(part.size[2]).toBeCloseTo(p.overlay.face + p.plate.d, 3);
});

test("windows sit on the module pitch and stay inside the plate", () => {
  const p = defaultProject();
  p.groups = [["tecla", "toma"]];
  const [a, b] = layoutModules(p);
  expect(a.y - b.y).toBeCloseTo(p.mods.pitch * 1.5, 5); // tecla span 1 -> toma span 2, centre to centre
  for (const m of layoutModules(p)) expect(Math.abs(m.y)).toBeLessThan(p.plate.h / 2);
});

test("with a window per module, windows reduce the volume and a blank-only plate has none", () => {
  const withWindows = make({ ...defaultProject(), window: "each" });
  const blank = make({
    ...defaultProject(),
    window: "each",
    groups: [["ciego", "ciego", "ciego"]],
  });
  expect(blank.volume).toBeGreaterThan(withWindows.volume);
});

test("a single window covers all the modules, whatever they are: 50.4 wide, 19 per module, centred", () => {
  const p = defaultProject(); // Cambre Siglo XXII, three modules
  const { windows, slits } = facePieces(p);
  expect(slits).toHaveLength(0);
  expect(windows).toHaveLength(1);
  expect(windows[0]).toMatchObject({ x: 0, y: 0 });
  expect(windows[0].win.x).toBeCloseTo(50.4, 5);
  expect(windows[0].win.y).toBeCloseTo(3 * 19, 5);
  const blank = make({ ...p, groups: [["ciego", "ciego", "ciego"]] });
  const keys = make(p);
  expect(blank.volume).toBeCloseTo(keys.volume, 3); // same window either way
  // four modules make the 76 mm window of the real 4-modulos plate; two columns make 100.8 mm
  expect(facePieces({ ...p, mods: { ...p.mods, slots: 4 } }).windows[0].win.y).toBeCloseTo(76, 5);
  const eight = sanitize({
    ...p,
    groups: [
      ["tecla", "tecla", "tecla", "tecla"],
      ["tecla", "tecla", "tecla", "tecla"],
    ],
    mods: { ...p.mods, slots: 4 },
  });
  expect(facePieces(eight).windows[0].win.x).toBeCloseTo(100.8, 5);
});

test("overflowing modules are reported", () => {
  const p = defaultProject();
  p.groups = [["toma", "toma"]];
  expect(make(p).warnings).toContain("slotsOverflow");
});

test("every module type builds", () => {
  for (const m of MODULE_IDS) expect(make({ ...defaultProject(), groups: [[m]] }).valid).toBe(true);
});

test("3MF holds one object per colour body", () => {
  const part = make(defaultProject());
  const mesh = part.mesh;
  const zip = unzipSync(
    build3mf({
      items: [
        {
          name: "a",
          size: part.size,
          bodies: [
            { name: "a", mesh },
            { name: "a_2", mesh },
          ],
        },
      ],
      bed: { x: 256, y: 256 },
    }),
  );
  const model = strFromU8(zip["3D/3dmodel.model"]);
  expect(model.match(/<mesh>/g)).toHaveLength(2);
  expect(strFromU8(zip["Metadata/model_settings.config"])).toContain('key="extruder" value="2"');
});

test("sanitize clamps garbage", () => {
  const p = sanitize({
    plate: { w: -5, h: "x" },
    overlay: { shape: "nope", wall: 99 },
    groups: [["zzz"]],
  });
  expect(p.plate.w).toBe(30);
  expect(p.overlay.shape).toBe("rounded");
  expect(p.overlay.wall).toBe(8);
  expect(p.groups[0][0]).toBe("tecla");
});

import { PATTERN_IDS } from "../src/tools/tapas/geom/patterns.js";
import { PATTERN_MODES } from "../src/tools/tapas/model/project.js";

const withPattern = (id, mode, extra = {}) => {
  const p = defaultProject();
  p.pattern = { ...p.pattern, id, mode, ...extra };
  return p;
};

test("every pattern builds in every mode", () => {
  for (const id of PATTERN_IDS) {
    for (const mode of PATTERN_MODES) {
      const part = make(withPattern(id, mode));
      expect(part.valid, `${id}/${mode}`).toBe(true);
      expect(part.bodies.length, `${id}/${mode}`).toBe(
        mode === "inlay" || mode === "raised" ? 2 : 1,
      );
    }
  }
}, 120000);

test("an inlay fills exactly the recess it cuts", () => {
  const plain = make(defaultProject());
  const inlay = make(withPattern("stripes", "inlay"));
  expect(inlay.bodies[1].volume).toBeGreaterThan(10);
  expect(inlay.volume).toBeCloseTo(plain.volume, 0);
});

test("engraving and cut-through remove material; raised adds a lifted layer", () => {
  const plain = make(defaultProject());
  expect(make(withPattern("dots", "engraved")).volume).toBeLessThan(plain.volume);
  expect(make(withPattern("dots", "cutthrough")).volume).toBeLessThan(
    make(withPattern("dots", "engraved")).volume,
  );
  const raised = make(withPattern("dots", "raised", { depth: 1 }));
  expect(raised.size[2]).toBeCloseTo(plain.size[2] + 1, 3);
});

test("patterns keep clear of the plate's window", () => {
  const p = withPattern("checks", "inlay", { scale: 6, margin: 3 });
  const part = make(p);
  const [px, py] = part.center; // plate centre in mesh coordinates
  const { windows } = facePieces(p);
  const { positions, indices } = part.bodies[1].mesh;
  const pad = p.mods.margin + p.pattern.margin - 0.2;
  for (const m of windows) {
    const hw = m.win.x / 2 + pad;
    const hh = m.win.y / 2 + pad;
    const slack = m.win.r + pad;
    for (const i of indices) {
      const x = positions[i * 3] - px - m.x;
      const y = positions[i * 3 + 1] - py - m.y;
      // cross-shaped test region: the window's rounded corners may legitimately hold pattern
      const inCross =
        (Math.abs(x) < hw - slack && Math.abs(y) < hh) ||
        (Math.abs(x) < hw && Math.abs(y) < hh - slack);
      expect(inCross).toBe(false);
    }
  }
});

test("a placed, turned or grown outline still covers the plate; auto beats centred on a shield", () => {
  const kit = createKit(wasm);
  try {
    const must = kit.rrect(76, 120, 8);
    const covers = (cs) => kit.csSub(must, cs).area() < 0.05;
    const area = (o) => {
      const b = placeOutline(kit, o, 76, 120, must).cs.bounds();
      return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
    };
    const base = { ...defaultProject().overlay, corner: 6 };
    for (const shape of SHAPE_IDS) {
      for (const move of [
        { place: "manual", dx: 20, dy: -15, rot: 30, grow: 0 },
        { place: "manual", dx: -40, dy: 60, rot: 200, grow: 50 },
        { place: "auto", rot: 90, grow: 10 },
      ]) {
        const o = { ...base, shape, dx: 0, dy: 0, rot: 0, grow: 0, ...move };
        expect(
          covers(placeOutline(kit, o, 76, 120, must).cs),
          `${shape} ${JSON.stringify(move)}`,
        ).toBe(true);
      }
    }
    // a shield only needs to be big near its flat top, so sliding it up over the plate shrinks it a lot
    const shield = { ...base, shape: "shield", dx: 0, dy: 0, rot: 0, grow: 0 };
    expect(area({ ...shield, place: "auto" })).toBeLessThan(
      area({ ...shield, place: "manual" }) * 0.7,
    );
    expect(area({ ...shield, place: "manual", grow: 50 })).toBeGreaterThan(
      area({ ...shield, place: "manual" }),
    );
  } finally {
    kit.free();
  }
});

test("old projects without placement load as auto", () => {
  const p = sanitize({ overlay: { shape: "heart" } });
  expect(p.overlay).toMatchObject({ place: "auto", dx: 0, dy: 0, rot: 0, grow: 0 });
});

test("moveModule reorders within a frame and moves between frames", () => {
  const g = [["tecla", "usb", "toma"], ["ciego"]];
  expect(moveModule(g, { g: 0, i: 0 }, { g: 0, i: 3 })[0]).toEqual(["usb", "toma", "tecla"]);
  expect(moveModule(g, { g: 0, i: 2 }, { g: 0, i: 0 })[0]).toEqual(["toma", "tecla", "usb"]);
  expect(moveModule(g, { g: 0, i: 1 }, { g: 0, i: 2 })[0]).toEqual(["tecla", "usb", "toma"]);
  expect(moveModule(g, { g: 0, i: 1 }, { g: 1, i: 0 })).toEqual([
    ["tecla", "toma"],
    ["usb", "ciego"],
  ]);
});

test("dragging the outline in the turned-over view, and turning it", () => {
  const start = { x: 0, y: 0 };
  // view x runs against the design's x; y runs with it
  expect(shapeDrag({ start, hit: { x: 10, y: 4 }, dx: 0, dy: 0 })).toEqual({ dx: -10, dy: 4 });
  expect(shapeDrag({ start, hit: { x: -900, y: 900 }, dx: 0, dy: 0 })).toEqual({
    dx: 150,
    dy: 150,
  });
  expect(turn(0, -15)).toBe(345);
  expect(turn(350, 15)).toBe(5);
});

test("the live preview's fit matches the exact boolean fit", () => {
  const p = defaultProject();
  const [w, h, r] = [71 + 2 * 2.7, 114 + 2 * 2.7, 6];
  const must = mustShape(w, h, r);
  const kit = createKit(wasm);
  try {
    const mustCs = kit.rrect(w, h, r);
    for (const [id, at] of [
      ["oval", { rot: 0, dx: 0, dy: 0 }],
      ["star", { rot: 20, dx: 6, dy: -4 }],
      ["heart", { rot: 0, dx: 0, dy: 8 }],
      ["heart", { rot: 0, dx: 0, dy: -7.5 }], // the cleft can slip between two edge samples
      ["scallop", { rot: 0, dx: 0, dy: 0 }],
      ["octagon", { rot: 15, dx: -5, dy: 3 }],
    ]) {
      const def = SHAPES[id];
      const side = Math.max(w, h);
      const unitCs = def.round
        ? def.build(kit, side, side, p.overlay)
        : def.build(kit, w, h, p.overlay);
      const unit = unitCs.toPolygons()[0];
      const k = fitScale(unit, must, at);
      const real = fitOutline(kit, id, w, h, mustCs, p.overlay, at);
      expect(Math.abs(k / real.k - 1), id).toBeLessThan(0.02);
    }
  } finally {
    kit.free();
  }
});

test("a fixed size is kept wherever the outline sits, and never goes below what covers", () => {
  const base = defaultProject();
  const build = (overlay) =>
    make(sanitize({ ...base, overlay: { ...base.overlay, shape: "heart", ...overlay } }));
  const longest = (part) => Math.max(part.size[0], part.size[1]);
  const at0 = build({ size: 320, place: "manual", dx: 0, dy: 0 });
  const moved = build({ size: 320, place: "manual", dx: 12, dy: 8 });
  expect(longest(at0)).toBeCloseTo(320, 0);
  expect(longest(moved)).toBeCloseTo(320, 0);
  const tooSmall = build({ size: 100, place: "manual", dx: 0, dy: 0 });
  expect(tooSmall.valid).toBe(true);
  expect(longest(tooSmall)).toBeGreaterThan(200);
});

test("dragging an outline stops at the edge of where it covers the plate", () => {
  const [w, h, r] = [76.4, 119.4, 6];
  const must = mustShape(w, h, r);
  const kit = createKit(wasm);
  try {
    const unit = SHAPES.heart.build(kit, Math.max(w, h), Math.max(w, h), {}).toPolygons()[0];
    const k = fitScale(unit, must, {}) * 1.1;
    const ok = (a) => covers(unit, must, k, a);
    expect(constrainMove(ok, { dx: 0, dy: 0 }, { dx: 2, dy: 1 })).toEqual({ dx: 2, dy: 1 });
    const far = constrainMove(ok, { dx: 0, dy: 0 }, { dx: 80, dy: 70 });
    expect(ok(far)).toBe(true);
    expect(Math.hypot(far.dx, far.dy)).toBeGreaterThan(0);
    expect(Math.hypot(far.dx, far.dy)).toBeLessThan(Math.hypot(80, 70));
    // against a wall in x, it still slides along y
    const edge = constrainMove(ok, far, { dx: far.dx + 40, dy: far.dy - 3 });
    expect(ok(edge)).toBe(true);
  } finally {
    kit.free();
  }
});
