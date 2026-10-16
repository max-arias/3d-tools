// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { generateDrawer } from "./drawer.js";
import { createKit } from "./kit.js";
import { generateKeyTest } from "./keytest.js";

let wasm;
let font = null;
const cache = new Map(); // exported bin segments, reused across edits
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

const jobs = {
  // Smoke test: proves wasm loads and booleans run.
  async ping() {
    const { Manifold } = wasm;
    const cube = Manifold.cube([10, 10, 10], true);
    const hole = Manifold.cylinder(12, 3, 3, 24, true);
    const part = cube.subtract(hole);
    const result = { volume: part.volume(), triangles: part.numTri() };
    cube.delete();
    hole.delete();
    part.delete();
    return result;
  },
  async keytest() {
    const kit = createKit(wasm);
    try {
      return generateKeyTest(kit);
    } finally {
      kit.free();
    }
  },
  async drawer(project) {
    // The label font is large, so it is only fetched once some bin has label text.
    const wantsText = project.bins.some((b) => (b.labels ?? []).some(Boolean));
    if (wantsText && !font) font = (await import("./inter-bold.json")).default;
    return generateDrawer(() => createKit(wasm), project, { font: wantsText ? font : null, cache });
  },
};

self.onmessage = async ({ data: { id, job, project } }) => {
  try {
    await ready;
    if (!jobs[job]) throw new Error(`Unknown job: ${job}`);
    self.postMessage({ id, result: await jobs[job](project) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
