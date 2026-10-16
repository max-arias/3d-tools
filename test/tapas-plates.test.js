import Module from "manifold-3d";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/tapas/lib/kit.js";
import { facePieces, layoutModules } from "../src/tools/tapas/geom/layout.js";
import { generateOverlay, windowShape } from "../src/tools/tapas/geom/overlay.js";
import { generateTapa } from "../src/tools/tapas/geom/tapa.js";
import { FLAT_IDS, MODULES, MODULE_IDS, SOCKET_SLOTS } from "../src/tools/tapas/model/modules.js";
import { PRESETS, presetLayout } from "../src/tools/tapas/model/presets.js";
import { defaultProject, sanitize } from "../src/tools/tapas/model/project.js";

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
const make = (p, gen = generateOverlay) => withKit((kit) => gen(kit, p));
const flat = (groups, extra = {}) =>
  sanitize({
    ...defaultProject(),
    style: "flat",
    plate: { w: 80, h: 120, d: 8, r: 3 },
    groups,
    ...extra,
  });

test("the socket face is the Argentine pattern: inverted V with an earth slot below, sizes from the gauge table", () => {
  const [a, b, earth] = SOCKET_SLOTS;
  // 13.7 mm between the two blade centres, 10.31 mm from the midpoint to the earth slot
  expect(Math.abs(a.x - b.x)).toBeCloseTo(13.7, 1);
  expect(Math.hypot(a.x, a.y)).toBeCloseTo(7.92, 1);
  expect(earth.y).toBeCloseTo(-10.31, 2);
  expect(earth.ang).toBe(0);
  // Orientation, in design coordinates. Seen from the front the left slot leans "/" and the right
  // "\\", and the cover is shown turned over, so the slot at +x must lean "\\" here: its top end is
  // nearer the middle than its bottom end.
  withKit((kit) => {
    const polys = windowShape(kit, MODULES.tomaRanuras.win, 0).toPolygons();
    expect(polys).toHaveLength(3);
    const lean = (ring) => {
      const top = ring.reduce((m, p) => (p[1] > m[1] ? p : m));
      const bottom = ring.reduce((m, p) => (p[1] < m[1] ? p : m));
      return top[0] - bottom[0]; // > 0 leans "/", < 0 leans "\\"
    };
    const right = polys.find((r) => r.every((p) => p[0] > 2));
    const left = polys.find((r) => r.every((p) => p[0] < -2));
    const mid = polys.find((r) => r.every((p) => Math.abs(p[0]) < 2));
    expect(lean(right)).toBeLessThan(-2);
    expect(lean(left)).toBeGreaterThan(2);
    expect(Math.abs(lean(mid))).toBeLessThan(0.5);
    // each blade slot is about 7.5 x 2.3 with rounded ends
    expect(windowShape(kit, MODULES.tomaRanuras.win, 0).area()).toBeGreaterThan(44);
    expect(windowShape(kit, MODULES.tomaRanuras.win, 0).area()).toBeLessThan(52);
  });
});

test("flat plates give every module an equal share of the face", () => {
  const three = layoutModules(flat([["tecla", "tecla", "tecla"]]));
  expect(three.map((m) => m.y)).toEqual([40, 0, -40]);
  expect(three.every((m) => m.cellH === 40 && m.cellW === 80)).toBe(true);
  const one = layoutModules(flat([["tecla"]]));
  expect(one[0].y).toBe(0);
  expect(one[0].cellH).toBe(120); // one punto is the whole face
  // landscape double toma: two cells side by side
  const double = layoutModules(
    flat([["tomaRanuras"], ["tomaRanuras"]], { plate: { w: 120, h: 80, d: 8, r: 3 } }),
  );
  expect(double.map((m) => m.x)).toEqual([-30, 30]);
});

test("a flat plate has no opening for its keys, but slits where a key meets a neighbour", () => {
  const keys = facePieces(flat([["tecla", "tecla", "tecla"]]));
  expect(keys.windows).toHaveLength(0);
  expect(keys.slits.map((s) => s.y)).toEqual([20, -20]);
  expect(keys.slits[0].x1 - keys.slits[0].x0).toBe(80);
  // 1 punto + 1 toma: the key's lower edge still needs a slit, and the socket needs its slots
  const mixed = facePieces(flat([["tecla", "tomaRanuras"]]));
  expect(mixed.slits.map((s) => s.y)).toEqual([0]);
  expect(mixed.windows).toHaveLength(1);
  expect(mixed.windows[0].y).toBe(-30);
  // two sockets and no keys: nothing to slit
  const sockets = facePieces(flat([["tomaRanuras", "tomaRanuras"]]));
  expect(sockets.slits).toHaveLength(0);
  expect(sockets.windows).toHaveLength(2);
  // the same modules on a modular plate do get windows for their keys
  expect(
    facePieces({ ...flat([["tecla", "tecla", "tecla"]]), style: "modular", window: "each" })
      .windows,
  ).toHaveLength(3);
});

test("slits cut through the face and take about their width of material out", () => {
  const withSlits = make(flat([["tecla", "tecla", "tecla"]]));
  const without = make(flat([["ciego", "ciego", "ciego"]]));
  expect(withSlits.valid).toBe(true);
  const removed = without.volume - withSlits.volume;
  const p = flat([["tecla", "tecla", "tecla"]]);
  const expected = 2 * (p.plate.w + 2 * p.overlay.clearance) * p.flat.slit * p.overlay.face;
  expect(removed).toBeGreaterThan(expected * 0.85);
  expect(removed).toBeLessThan(expected * 1.15);
  // a wider slit removes more
  const wide = make(flat([["tecla", "tecla", "tecla"]], { flat: { slit: 1.6 } }));
  expect(wide.volume).toBeLessThan(withSlits.volume);
});

test("a flat plate with a socket leaves only its slots open", () => {
  const plain = make(flat([["ciego"]]));
  const socket = make(flat([["tomaRanuras"]]));
  expect(socket.valid).toBe(true);
  const removed = plain.volume - socket.volume;
  const slotArea = withKit((kit) => windowShape(kit, { ...MODULES.tomaRanuras.win }, 0.6).area());
  expect(removed).toBeGreaterThan(slotArea * 2 * 0.9);
  expect(removed).toBeLessThan(slotArea * 2 * 1.1);
});

test("a teclon takes all three modules and one big window; a half teclon takes one and a half", () => {
  const big = layoutModules(
    sanitize({ ...defaultProject(), window: "each", groups: [["teclon"]] }),
  );
  expect(big).toHaveLength(1);
  expect(big[0].span).toBe(3);
  expect(big[0].y).toBeCloseTo(0, 5);
  const halves = layoutModules(
    sanitize({ ...defaultProject(), groups: [["teclonMedio", "teclonMedio"]] }),
  );
  expect(halves[0].y - halves[1].y).toBeCloseTo(1.5 * defaultProject().mods.pitch, 5);
  expect(make(sanitize({ ...defaultProject(), groups: [["teclon"]] })).warnings).not.toContain(
    "slotsOverflow",
  );
  expect(MODULES.teclon.win.y).toBeGreaterThan(50);
});

test("every module builds on both plate styles; the flat palette leaves out the modular-only types", () => {
  for (const style of ["modular", "flat"]) {
    for (const id of MODULE_IDS) {
      const p = sanitize({ ...defaultProject(), style, groups: [[id]] });
      expect(make(p).valid, `${style}/${id}`).toBe(true);
    }
  }
  expect(FLAT_IDS).not.toContain("teclon");
  expect(FLAT_IDS).not.toContain("toma");
  expect(FLAT_IDS).toContain("tomaRanuras");
});

test("a replacement tapa is always a modular plate, whatever style the project says", () => {
  const p = sanitize({ ...flat([["tecla", "tecla", "tecla"]]), product: "tapa" });
  const tapa = make(p, generateTapa);
  const modular = make(sanitize({ ...p, style: "modular" }), generateTapa);
  expect(tapa.valid).toBe(true);
  expect(tapa.volume).toBeCloseTo(modular.volume, 3);
});

test("presets: researched sizes, flat Milan presets and their starting layouts", () => {
  const byId = Object.fromEntries(PRESETS.map((x) => [x.id, x]));
  // Macroled's catalogue: one 120 x 80 plate for 1 to 4 puntos
  expect(byId["milan-macroled"].plate.h).toBe(120);
  expect(byId["milan-macroled"].plate.w).toBe(80);
  expect(byId["milan-macroled"].source).toBe("maker");
  expect(byId["milan-macroled"].style).toBe("flat");
  // the double socket plate is landscape
  expect(byId["milan-doble-toma"].plate).toMatchObject({ w: 120, h: 80 });
  expect(presetLayout(byId["milan-doble-toma"])).toEqual([["tomaRanuras"], ["tomaRanuras"]]);
  // retailer listings: Kalop Civil 12.7 x 8.1 cm, Cambre 12.3 x 8.1 cm
  expect(byId["kalop-richi"].plate).toMatchObject({ w: 81, h: 127 });
  expect(byId["cambre-xxi"].plate).toMatchObject({ w: 81, h: 123 });
  // every preset builds with its own layout and style
  for (const preset of PRESETS.filter((x) => x.plate)) {
    const p = sanitize({
      ...defaultProject(),
      preset: preset.id,
      plate: preset.plate,
      style: preset.style ?? "modular",
      groups: presetLayout(preset),
    });
    expect(make(p).valid, preset.id).toBe(true);
  }
});

test("style and slit width are clamped", () => {
  expect(sanitize({ style: "weird" }).style).toBe("modular");
  expect(sanitize({ style: "flat" }).style).toBe("flat");
  expect(sanitize({ flat: { slit: 99 } }).flat.slit).toBe(2);
  expect(sanitize({ flat: { slit: 0 } }).flat.slit).toBe(0.3);
});

test("Cambre Siglo XXII presets match Cambre's technical drawings (distribuidores.cambre.com.ar)", () => {
  const byId = Object.fromEntries(PRESETS.map((x) => [x.id, x]));
  const project = (id, slots) => {
    const preset = byId[id];
    const q = sanitize({
      ...defaultProject(),
      preset: id,
      plate: preset.plate,
      mods: { ...defaultProject().mods, ...preset.mods, slots: slots ?? preset.slots },
      groups: presetLayout(preset).map((g) => g.slice(0, slots ?? preset.slots)),
    });
    return q;
  };
  const window = (p) => facePieces(p).windows[0].win;
  // standard plate: 81 x 116, window 50.40 wide, 19 mm per module, centred
  const std = byId["cambre-xxii"];
  expect(std.plate).toMatchObject({ w: 81, h: 116 });
  expect(std.plate.r).toBeLessThan(1); // 0.73 mm read from the drawing's corner curves
  expect(std.source).toBe("maker");
  for (const [slots, tall] of [
    [1, 19],
    [2, 38],
    [3, 57],
    [4, 76],
  ]) {
    expect(window(project("cambre-xxii", slots)).y, `${slots} modulos`).toBeCloseTo(tall, 5);
    expect(window(project("cambre-xxii", slots)).x).toBeCloseTo(50.4, 5);
  }
  // the 4 modulos window leaves (116 - 76) / 2 = 20 mm above and below, as drawn
  expect((std.plate.h - window(project("cambre-xxii", 4)).y) / 2).toBeCloseTo(20, 5);
  // mignon: 81 x 79; its 1 modulo window leaves 30 mm above and below, as drawn
  expect(byId["cambre-xxii-mignon"].plate).toMatchObject({ w: 81, h: 79 });
  expect((79 - window(project("cambre-xxii-mignon", 1)).y) / 2).toBeCloseTo(30, 5);
  expect(window(project("cambre-xxii-mignon", 2)).y).toBeCloseTo(38, 5);
  // 8 modulos: 130 x 116, two columns of four share one 100.8 x 76 window, rounder corners
  const eight = project("cambre-xxii-8");
  expect(byId["cambre-xxii-8"].plate).toMatchObject({ w: 130, h: 116 });
  expect(byId["cambre-xxii-8"].plate.r).toBeGreaterThan(2.5);
  expect(window(eight).x).toBeCloseTo(100.8, 5);
  expect(window(eight).y).toBeCloseTo(76, 5);
  // the columns sit one window width apart, so each key lines up with its half of the window
  expect(layoutModules(eight).map((m) => m.x)).toEqual([
    ...Array(4).fill(-25.2),
    ...Array(4).fill(25.2),
  ]);
  // and the cover for each of them builds
  for (const id of ["cambre-xxii", "cambre-xxii-mignon", "cambre-xxii-8"])
    expect(make(project(id)).valid, id).toBe(true);
});
