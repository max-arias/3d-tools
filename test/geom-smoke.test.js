import { expect, test } from "vite-plus/test";
import Module from "manifold-3d";

test("manifold runs in node and booleans work", async () => {
  const wasm = await Module();
  wasm.setup();
  const cube = wasm.Manifold.cube([10, 10, 10], true);
  const hole = wasm.Manifold.cylinder(12, 3, 3, 48, true);
  const part = cube.subtract(hole);
  expect(part.status()).toBe("NoError");
  expect(part.volume()).toBeLessThan(1000);
  expect(part.volume()).toBeGreaterThan(700);
});

test("font JSON has expected glyph coverage", async () => {
  const font = (await import("../src/tools/gridfinity/geom/inter-bold.json")).default;
  expect(font.glyphs.A.c.length).toBeGreaterThan(0);
  expect(font.glyphs["Ж"]).toBeTruthy();
  expect(font.cap).toBeGreaterThan(1300);
  // y-up: H's tallest point equals cap height
  const ys = font.glyphs.H.c.flatMap((c) => c.filter((_, i) => i % 2));
  expect(Math.max(...ys)).toBeCloseTo(font.cap, -1);
});
