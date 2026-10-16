// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createKit } from "../lib/kit.js";
import { generateFrame } from "./frame.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

const jobs = {
  async generate(project) {
    const kit = createKit(wasm);
    try {
      return generateFrame(kit, project);
    } finally {
      kit.free();
    }
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
