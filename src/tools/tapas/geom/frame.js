import { decorate } from "./decorate.js";
import { packResult } from "./relief.js";
import { placeOutline } from "./shapes.js";

/** Ring that surrounds the existing tapa and stands on the wall. Face (top of the ring) at z = 0 when printed. */
export function generateFrame(kit, p) {
  const { plate, overlay: o, frame: f, pattern: pat } = p;
  const clear = o.clearance;
  const pocketW = plate.w + 2 * clear;
  const pocketH = plate.h + 2 * clear;
  const pocketR = plate.r + clear;
  const lift = pat.id !== "none" && pat.mode === "raised" ? pat.depth : 0;
  const total = lift + f.h;

  const must = kit.rrect(pocketW + 2 * o.wall, pocketH + 2 * o.wall, pocketR + o.wall);
  const {
    cs: outline,
    dx,
    dy,
  } = placeOutline(kit, o, pocketW + 2 * o.wall, pocketH + 2 * o.wall, must);
  const pocket = kit.rrect(pocketW, pocketH, pocketR);
  let body = kit.sub(kit.ext(outline, lift, total), kit.ext(pocket, lift - 1, total + 1));

  const warnings = [];
  let patternBodies = [];
  let plainBody = null; // the face before the image is cut into it, for the live preview
  if (pat.id !== "none") {
    const hole = kit.rrect(
      pocketW + 2 * pat.margin,
      pocketH + 2 * pat.margin,
      pocketR + pat.margin,
    );
    const area = kit.csSub(kit.own(outline.offset(-pat.margin, "Round", 2, 32)), hole);
    plainBody = pat.id === "image" ? body : null;
    const r = decorate(kit, p, body, { area, outline, face: f.h, lift });
    ({ body, patternBodies } = r);
    if (r.warning) warnings.push(r.warning);
  }
  return {
    kind: "frame",
    ...packResult(kit, {
      name: "marco",
      body,
      patternBodies,
      plainBody,
      warnings,
      bounds: outline.bounds(),
      placement: { dx, dy },
      total,
      pocket: [pocketW, pocketH, f.h],
    }),
  };
}
