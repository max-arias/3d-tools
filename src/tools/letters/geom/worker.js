// Geometry worker. Job protocol: { id, job, project } -> { id, result } | { id, error }.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import antonUrl from "@fontsource/anton/files/anton-latin-400-normal.woff?url";
import archivoUrl from "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url";
import opentype from "opentype.js";
import { createKit } from "../lib/kit.js";
import { generateLetters } from "./generate.js";

let wasm;
const ready = (async () => {
  const mod = await Module({ locateFile: () => wasmUrl });
  mod.setup();
  wasm = mod;
})();

const fontUrls = { anton: antonUrl, archivo: archivoUrl };
const fonts = new Map();
async function loadFont(id) {
  if (!fonts.has(id) && fontUrls[id]) {
    const buf = await (await fetch(fontUrls[id])).arrayBuffer();
    fonts.set(id, opentype.parse(buf));
  }
  return fonts.get(id);
}

const jobs = {
  /** Keep an uploaded font (ArrayBuffer) for the "custom" choice. Throws when it is not a font. */
  async font(_project, bytes) {
    fonts.set("custom", opentype.parse(bytes));
    return true;
  },
  async generate(project) {
    await ready;
    let font = null;
    let fontMissing = false;
    if (project.source.kind === "text") {
      // A shared link or a cleared browser has no uploaded font: fall back, and say so.
      fontMissing = project.source.font === "custom" && !fonts.has("custom");
      font = await loadFont(fontMissing ? "anton" : project.source.font);
    }
    const kit = createKit(wasm);
    try {
      return { ...generateLetters(kit, project, font), fontMissing };
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
