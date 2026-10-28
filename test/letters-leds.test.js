import { readFileSync } from "node:fs";
import Module from "manifold-3d";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vite-plus/test";
import { generateLetters } from "../src/tools/letters/geom/generate.js";
import { layoutText } from "../src/tools/letters/geom/glyphs.js";
import { bom } from "../src/tools/letters/led/bom.js";
import { insideRings } from "../src/tools/letters/led/layout.js";
import { powerPlan } from "../src/tools/letters/led/power.js";
import { createKit } from "../src/tools/letters/lib/kit.js";
import { defaultProject, merge, sanitize } from "../src/tools/letters/model/project.js";

let wasm;
let font;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
  const b = readFileSync("node_modules/@fontsource/anton/files/anton-latin-400-normal.woff");
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});

const gen = (patch) => {
  const p = sanitize(merge(defaultProject(), { source: { text: "LED" }, ...patch }));
  const kit = createKit(wasm);
  try {
    return { p, r: generateLetters(kit, p, font) };
  } finally {
    kit.free();
  }
};

test("rows: no run is shorter than one pitch and every LED keeps off the wall", () => {
  const { p, r } = gen({});
  const pitch = 1000 / p.leds.density;
  for (const part of r.parts) {
    expect(part.led.count).toBeGreaterThan(0);
    for (const run of part.led.runs) {
      expect(run.pts.length).toBeGreaterThanOrEqual(2);
      const len = Math.hypot(run.pts.at(-1)[0] - run.pts[0][0], run.pts.at(-1)[1] - run.pts[0][1]);
      expect(len).toBeGreaterThanOrEqual(pitch - 1e-6);
    }
  }
});

test("rows: every LED is inside the cavity, clear of the wall by the margin", () => {
  const { p, r } = gen({ source: { text: "E" } });
  const kit = createKit(wasm);
  try {
    const [g] = layoutText(font, "E", p.size.height, 0);
    const o = kit.CrossSection.ofPolygons(g.rings, "NonZero");
    const b = o.bounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const usable = kit.grow(kit.own(o.translate([-cx, -cy])), -p.size.wall - p.leds.margin + 0.01);
    const rings = usable.toPolygons();
    for (const run of r.parts[0].led.runs)
      for (const pt of run.pts) expect(insideRings(rings, pt)).toBe(true);
  } finally {
    kit.free();
  }
});

test("perimeter: LEDs sit exactly one pitch apart along each loop", () => {
  const { p, r } = gen({ leds: { mode: "perimeter" }, source: { text: "O" } });
  const pitch = 1000 / p.leds.density;
  const part = r.parts[0];
  expect(part.led.runs.length).toBe(2); // outer loop and the counter
  for (const run of part.led.runs) {
    for (let i = 1; i < run.pts.length; i++) {
      const d = Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1]);
      expect(d).toBeLessThanOrEqual(pitch + 1e-6);
      expect(d).toBeGreaterThan(pitch * 0.6); // a chord round a tight bend is shorter than the arc
    }
  }
});

test("indices are contiguous in reading order and the chain beats a naive order", () => {
  const { r } = gen({});
  let next = 0;
  for (const part of r.parts) {
    expect(part.led.start).toBe(next);
    next += part.led.count;
  }
  expect(r.ledTotal).toBe(next);
  const part = r.parts[1]; // E has several rows
  const naive = part.led.runs.reduce((sum, run, i, all) => {
    if (!i) return 0;
    const a = all[i - 1].pts.at(-1);
    return sum + Math.hypot(run.pts[0][0] - a[0], run.pts[0][1] - a[1]);
  }, 0);
  const chained = part.led.jumps.reduce((s, j) => s + j.len, 0);
  expect(chained).toBeLessThanOrEqual(naive + 1e-6);
});

test("hole at start lands next to the first LED", () => {
  const { r } = gen({ hole: { at: "start" }, source: { text: "E" } });
  const part = r.parts[0];
  const first = part.led.runs[0].pts[0];
  expect(Math.hypot(part.hole[0] - first[0], part.hole[1] - first[1])).toBeLessThan(25);
});

test("a stroke narrower than the strip gets no LEDs and a warning, not a crash", () => {
  const { r } = gen({ size: { height: 40 }, leds: { stripWidth: 30 }, source: { text: "I" } });
  expect(r.parts[0].issues).toContain("led-none");
  expect(r.parts[0].led.count).toBe(0);
});

test("power: supply rounds up to a standard size and WLED gets a limit below it", () => {
  const plan = powerPlan(200, "ws2812b", 20);
  expect(plan.worstA).toBeCloseTo(11);
  expect(plan.needA).toBeCloseTo(((11000 + 250) * 1.2) / 1000);
  expect(plan.recommendedA).toBe(15);
  expect(plan.maxpwr).toBe(Math.floor((15000 - 250) / 1.2));
  expect(plan.injections).toBe(1);
  expect(powerPlan(200, "ws2812b", 20, 5).cap).toBeLessThan(1);
});

test("bill of materials counts strip and joints", () => {
  const { p, r } = gen({});
  const b = bom(
    r.parts.map((x) => x.led),
    p.leds.density,
    p.size.depth,
  );
  expect(b.leds).toBe(r.ledTotal);
  expect(b.stripM).toBeCloseTo((r.ledTotal * 1000) / p.leds.density / 1000);
  expect(b.pieces).toBeGreaterThan(0);
  expect(
    insideRings(
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      ],
      [1, 1],
    ),
  ).toBe(true);
});
