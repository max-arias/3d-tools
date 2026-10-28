// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createKit } from "../lib/kit.js";
import { generateLamp, generateShade } from "./generate.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

const jobs = {
  async generate(project) {
    if (project.holder.at === "none") return generateShade(project);
    await ready;
    const kit = createKit(wasm);
    try {
      return generateLamp(kit, project);
    } finally {
      kit.free();
    }
  },
};

self.onmessage = async ({ data: { id, job, project } }) => {
  try {
    if (!jobs[job]) throw new Error(`Unknown job: ${job}`);
    self.postMessage({ id, result: await jobs[job](project) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
