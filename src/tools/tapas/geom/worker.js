// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createKit } from "../lib/kit.js";
import { generateCoupon } from "./coupon.js";
import { generateFrame } from "./frame.js";
import { generateKeycap } from "./keycap.js";
import { generateOverlay } from "./overlay.js";
import { generateTapa } from "./tapa.js";
import { SHAPES } from "./shapes.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

let font = null;

const products = {
  overlay: generateOverlay,
  tapa: generateTapa,
  frame: generateFrame,
  keycap: generateKeycap,
};

const jobs = {
  // One job per project: the product decides which generator runs.
  async generate(project) {
    const kit = createKit(wasm);
    try {
      if (project.product === "keycap" && project.keycap.icon === "text" && !font)
        font = (await import("./font.json")).default;
      return products[project.product](kit, project, { font });
    } finally {
      kit.free();
    }
  },
  // The outline of a shape at its own size, for the live preview (which scales and turns it in JS).
  async outline({ shape, w, h, corner }) {
    const kit = createKit(wasm);
    try {
      const def = SHAPES[shape];
      const side = Math.max(w, h);
      const cs = def.round
        ? def.build(kit, side, side, { corner })
        : def.build(kit, w, h, { corner });
      const area = (r) =>
        Math.abs(
          r.reduce(
            (a, [x, y], i) => a + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y,
            0,
          ),
        );
      return cs.toPolygons().sort((a, b) => area(b) - area(a))[0];
    } finally {
      kit.free();
    }
  },
  async coupon(project) {
    const kit = createKit(wasm);
    try {
      return generateCoupon(kit, project);
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
