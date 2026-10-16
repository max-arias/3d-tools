import { buildArt } from "./art.js";
import { buildPattern } from "./patterns.js";
import { applyRelief, applyReliefLayers } from "./relief.js";

/**
 * Put the project's pattern (or uploaded image) on a face.
 * Returns { body, patternBodies: [{ solid, color? }], warning? }; images give one body per colour.
 */
export function decorate(kit, p, body, { area, outline, face, lift }) {
  const pat = p.pattern;
  const opts = { mode: pat.mode, depth: pat.depth, face, lift };
  if (pat.id === "image") {
    if (!p.art) return { body, patternBodies: [] };
    const layers = buildArt(kit, pat, p.art, area);
    // Nothing landed on the free part of the face: tell the user rather than print a blank plate.
    if (!layers.length) return { body, patternBodies: [], warning: "artOutside" };
    return applyReliefLayers(kit, body, layers, opts);
  }
  const cs = buildPattern(kit, pat, area, outline);
  if (!cs) return { body, patternBodies: [] };
  const r = applyRelief(kit, body, cs, opts);
  return { body: r.body, patternBodies: r.patternBody ? [{ solid: r.patternBody }] : [] };
}
