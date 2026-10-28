// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createKit } from "../lib/kit.js";
import { generateBox } from "./generate.js";
import { buildCoupon } from "./fittest.js";
import { buildLatch } from "./latch.js";
import { buildHinge } from "./hinge.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

let font = null;
const hasText = (p) => !!(p.label?.title?.trim() || p.label?.lines?.some((l) => l.trim()));

const jobs = {
  async generate(project) {
    await ready;
    if (hasText(project) && !font)
      font = (await import("../../gridfinity/geom/inter-bold.json")).default;
    const kit = createKit(wasm);
    try {
      return generateBox(kit, project, font);
    } finally {
      kit.free();
    }
  },
  /** Fit-test coupon pieces as { name, mesh, size }, with a latch and hinge at the project's fit. */
  async coupon(project) {
    await ready;
    const kit = createKit(wasm);
    const tol = project?.fit?.tolerance ?? 0;
    try {
      const h = buildHinge(kit, project?.hinge ?? "pin", tol);
      const pieces = [
        ...buildCoupon(kit),
        { name: "latch", m: buildLatch(kit, tol) },
        { name: "hinge", m: kit.union(h.base, h.lid) },
      ];
      return pieces.map(({ name, m }) => {
        const e = kit.export(m);
        return { name, mesh: e.mesh, size: e.size, volume: e.volume, valid: e.valid };
      });
    } finally {
      kit.free();
    }
  },
};

self.onmessage = async ({ data: { id, job, project, extra } }) => {
  try {
    if (!jobs[job]) throw new Error(`Unknown job: ${job}`);
    self.postMessage({ id, result: await jobs[job](project, extra) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
