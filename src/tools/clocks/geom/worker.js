// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import antonUrl from "@fontsource/anton/files/anton-latin-400-normal.woff?url";
import archivoUrl from "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url";
import opentype from "opentype.js";
import { createKit } from "../../letters/lib/kit.js";
import { generateClock } from "./generate.js";
import { glyphFor } from "./text.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

const fontUrls = { anton: antonUrl, archivo: archivoUrl };
const fonts = new Map();
async function loadFont(id) {
  if (!fonts.has(id))
    fonts.set(id, opentype.parse(await (await fetch(fontUrls[id])).arrayBuffer()));
  return fonts.get(id);
}

const jobs = {
  async generate(project) {
    await ready;
    const font = await loadFont(project.markers.font);
    const kit = createKit(wasm);
    try {
      return generateClock(kit, project, glyphFor(font));
    } finally {
      kit.free();
    }
  },
};

self.onmessage = async ({ data: { id, job, project } }) => {
  try {
    if (!jobs[job]) throw new Error(`Unknown job: ${job}`);
    const result = await jobs[job](project);
    const transfer = result.parts.flatMap((p) =>
      p.bodies.flatMap((b) => [b.mesh.positions.buffer, b.mesh.indices.buffer]),
    );
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
