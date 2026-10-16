import { usedSlots } from "../model/project.js";
import { facePieces } from "./layout.js";
import { windowShape } from "./overlay.js";
import { decorate } from "./decorate.js";
import { packResult } from "./relief.js";

/**
 * Replacement plate: a flat face the size of the tapa with a skirt that wraps the bastidor and two
 * snap bumps per long side. Printed face down. The clip geometry varies per brand, so print the
 * fit strip first.
 */
export function generateTapa(kit, p) {
  const { plate, mods, tapa: t, pattern: pat } = p;
  const warnings = [];
  const lift = pat.id !== "none" && pat.mode === "raised" ? pat.depth : 0;
  const total = lift + t.face + t.skirt;
  const outline = kit.rrect(plate.w, plate.h, plate.r);

  const bw = t.boxW + 2 * t.clearance;
  const bh = t.boxH + 2 * t.clearance;
  if (bw + 2 * t.wall > plate.w || bh + 2 * t.wall > plate.h) warnings.push("boxTooBig");
  const innerR = 3;
  let body = kit.union(
    kit.ext(outline, lift, lift + t.face),
    kit.sub(
      kit.ext(
        kit.rrect(bw + 2 * t.wall, bh + 2 * t.wall, innerR + t.wall),
        lift + t.face - 0.001,
        total,
      ),
      kit.ext(kit.rrect(bw, bh, innerR), lift + t.face - 1, total + 1),
    ),
  );

  // Snap bumps: short ridges on the inside of the long walls, near the open end.
  const ridgeR = 0.9;
  const z = total - 1.6;
  const bumps = [];
  for (const sx of [-1, 1])
    for (const y of [-bh / 4, bh / 4])
      bumps.push(
        kit.move(
          kit.rot(kit.cyl(ridgeR, 10, 0, 0, -5), 90, 0, 0),
          sx * (bw / 2 - (ridgeR - t.bump)),
          y,
          z,
        ),
      );
  body = kit.union(
    body,
    kit.inter(
      kit.union(bumps),
      kit.ext(kit.rrect(bw + 2 * t.wall, bh + 2 * t.wall, innerR + t.wall), lift, total),
    ),
  );

  const placed = facePieces({ ...p, style: "modular" }).windows; // a tapa is always a modular plate
  p.groups.forEach((g) => {
    if (usedSlots(g) > mods.slots) warnings.push("slotsOverflow");
  });
  if (placed.length)
    body = kit.sub(
      body,
      placed.map((m) =>
        kit.ext(kit.move(windowShape(kit, m.win, t.winMargin), m.x, m.y), -1, lift + t.face + 0.01),
      ),
    );

  let patternBodies = [];
  let plainBody = null; // the face before the image is cut into it, for the live preview
  if (pat.id !== "none") {
    const keepOut = placed.map((m) =>
      kit.move(windowShape(kit, m.win, t.winMargin + pat.margin), m.x, m.y),
    );
    let area = kit.own(outline.offset(-pat.margin, "Round", 2, 32));
    if (keepOut.length) area = kit.csSub(area, keepOut);
    plainBody = pat.id === "image" ? body : null;
    const r = decorate(kit, p, body, { area, outline, face: t.face, lift });
    ({ body, patternBodies } = r);
    if (r.warning) warnings.push(r.warning);
  }
  return {
    kind: "tapa",
    ...packResult(kit, {
      name: "tapa",
      body,
      patternBodies,
      plainBody,
      bounds: outline.bounds(),
      total,
      pocket: [bw, bh, t.skirt],
      warnings,
    }),
  };
}
