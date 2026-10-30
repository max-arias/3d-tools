import { readFileSync } from "node:fs";
import Module from "manifold-3d";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/letters/lib/kit.js";
import { generateClock } from "../src/tools/clocks/geom/generate.js";
import { glyphFor } from "../src/tools/clocks/geom/text.js";
import { defaultProject, merge, sanitize } from "../src/tools/clocks/model/project.js";

let wasm;
let glyph;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
  const b = readFileSync("node_modules/@fontsource/anton/files/anton-latin-400-normal.woff");
  glyph = glyphFor(opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
});

const make = (patch = {}) => sanitize(merge(defaultProject(), patch));
const gen = (patch) => {
  const kit = createKit(wasm);
  try {
    return generateClock(kit, make(patch), glyph);
  } finally {
    kit.free();
  }
};
const part = (r, id) => r.parts.find((p) => p.id === id);
const allValid = (r) => r.parts.every((p) => p.bodies.every((b) => b.valid));

test.each([
  ["wall", {}],
  ["desk cradle", { type: "desk" }],
  ["desk foot on an arch", { type: "desk", shape: { preset: "arch" }, back: { stand: "foot" } }],
  ["magnet", { type: "magnet", back: { kind: "none" } }],
  ["two keyholes on a rim", { back: { kind: "rim", hanger: "two" } }],
  ["two-sided", { type: "twoSided" }],
  ["relief", { style: "relief", markers: { finish: "raised" } }],
  ["ribs", { style: "ribs", markers: { numerals: "quarters", ticks: "bars" } }],
  ["cheese holes on a cheese", { shape: { preset: "cheese" }, cutouts: { kind: "cheese" } }],
  [
    "cloud with slots, radial roman",
    {
      shape: { preset: "cloud" },
      cutouts: { kind: "slots" },
      markers: { numerals: "roman", orient: "radial" },
    },
  ],
  ["halo leds", { leds: { halo: true }, hands: { glow: true } }],
])("%s builds valid manifolds", (_, patch) => {
  const r = gen(patch);
  expect(allValid(r)).toBe(true);
  expect(part(r, "dial").bodies.length).toBeGreaterThan(0);
});

test("the dial at the hub is never thicker than the movement takes", () => {
  const r = gen({ face: { thickness: 9 }, movement: { preset: "std", maxDial: 6 } });
  expect(r.info.hubDial).toBe(6);
  expect(r.info.recess).toBeCloseTo(3);
  // The recess removes material: a 9 mm face with a 3 mm deep pocket weighs less than a solid one.
  const solid = gen({ face: { thickness: 9 }, movement: { maxDial: 12 } });
  const vol = (x) => part(x, "dial").bodies.reduce((n, b) => n + b.volume, 0);
  expect(vol(r)).toBeLessThan(vol(solid) - 56 * 56 * 2.5);
});

test("colour slots are separate bodies that do not overlap", () => {
  const kit = createKit(wasm);
  try {
    const r = generateClock(kit, make({ colors: { face: 0, border: 1, markers: 3 } }), glyph);
    const bodies = part(r, "dial").bodies;
    expect(bodies.map((b) => b.slot)).toEqual([0, 1, 3]);
    const sum = bodies.reduce((n, b) => n + b.volume, 0);
    const meshes = bodies.map((b) =>
      kit.own(
        new kit.Manifold(
          new kit.Mesh({ numProp: 3, vertProperties: b.mesh.positions, triVerts: b.mesh.indices }),
        ),
      ),
    );
    expect(kit.union(meshes).volume()).toBeCloseTo(sum, 0);
  } finally {
    kit.free();
  }
});

test("raised decor with a back housing splits the back into its own part", () => {
  const r = gen({ face: { decor: "raised" }, markers: { finish: "raised" } });
  expect(r.info.faceDown).toBe(false);
  expect(part(r, "back")).toBeTruthy();
  expect(part(gen({}), "back")).toBeFalsy();
});

test("the back follows the type: a halo forces a rim, a keyhole needs a raised back", () => {
  expect(gen({ leds: { halo: true }, back: { kind: "housing" } }).info.back).toBe("rim");
  const r = gen({ back: { kind: "none", hanger: "keyhole" } });
  expect(r.info.back).toBe("housing");
  expect(r.info.notes).toContain("backKeyhole");
  expect(gen({ back: { kind: "none", hanger: "movement" } }).info.back).toBe("none");
});

test("hands carry the movement's hole sizes and a glow tip as a second body", () => {
  const r = gen({ hands: { glow: true }, colors: { hands: 2, glow: 0 } });
  const minute = part(r, "minute");
  expect(minute.bodies.map((b) => b.slot)).toEqual([2, 0]);
  expect(r.info.hands.find((h) => h.id === "minute").mass).toBeGreaterThan(0);
  // A counterweight tail lowers the minute hand's moment.
  const noTail = gen({ hands: { tail: false } }).info.hands.find((h) => h.id === "minute").moment;
  const tail = gen({ hands: { tail: true } }).info.hands.find((h) => h.id === "minute").moment;
  expect(tail).toBeLessThan(noTail);
});

test("halo LEDs follow the rim length", () => {
  const small = gen({ leds: { halo: true }, shape: { width: 160 } }).info.leds;
  const big = gen({ leds: { halo: true }, shape: { width: 300 } }).info.leds;
  expect(big.length).toBeGreaterThan(small.length * 1.6);
  expect(big.count).toBe(Math.floor((big.length / 1000) * 60));
});
