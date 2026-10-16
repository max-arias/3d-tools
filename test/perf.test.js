import { readFileSync } from "node:fs";
import Module from "manifold-3d";
import { expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/gridfinity/geom/kit.js";
import { generateDrawer } from "../src/tools/gridfinity/geom/drawer.js";
import { decodeShare } from "../src/tools/gridfinity/model/persist.js";
import font from "../src/tools/gridfinity/geom/inter-bold.json";

test("the official example drawer builds in a few seconds, all parts valid", async () => {
  const wasm = await Module();
  wasm.setup();
  const project = decodeShare(
    readFileSync(new URL("./fixtures/fitforge-example.hash", import.meta.url), "utf8"),
  );
  const t0 = performance.now();
  const r = generateDrawer(() => createKit(wasm), project, { font });
  const ms = performance.now() - t0;
  console.log(`example drawer: ${r.parts.length} parts in ${Math.round(ms)} ms`, r.warnings);
  expect(r.parts.filter((p) => p.kind === "tile")).toHaveLength(9);
  expect(r.parts.filter((p) => p.kind === "bin").length).toBeGreaterThanOrEqual(13);
  expect(r.parts.every((p) => p.valid)).toBe(true);
  expect(ms).toBeLessThan(20000);
}, 30000);
