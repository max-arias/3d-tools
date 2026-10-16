import { usedSlots } from "../model/project.js";
import { facePieces } from "./layout.js";
import { decorate } from "./decorate.js";
import { packResult } from "./relief.js";
import { fitOutline } from "./shapes.js";

export { layoutModules } from "./layout.js";

/** Cut-out shape of one window, grown by `m` mm all round. Slot windows are a union of the slots. */
export function windowShape(kit, win, m) {
  if (win.kind === "circle") return kit.circle(win.d / 2 + m, 0, 0, 48);
  if (win.kind === "slots") {
    const shapes = win.slots.map((s) => {
      const slot = kit.rrect(s.w + 2 * m, s.l + 2 * m, (s.w + 2 * m) / 2);
      return kit.own(kit.own(slot.rotate(s.ang)).translate([s.x, s.y]));
    });
    return kit.csUnion(shapes);
  }
  return kit.rrect(win.x + 2 * m, win.y + 2 * m, win.r + m);
}

/**
 * Overlay that slips over the existing tapa. Printed face down: face at z = 0, open side up.
 * Bodies share one coordinate system so they can be printed as colours of one object.
 */
export function generateOverlay(kit, p) {
  const { plate, overlay: o, mods, pattern: pat } = p;
  const warnings = [];
  const clear = o.clearance;
  const pocketW = plate.w + 2 * clear;
  const pocketH = plate.h + 2 * clear;
  const pocketR = plate.r + clear;
  const depth = plate.d;
  const lift = pat.id !== "none" && pat.mode === "raised" ? pat.depth : 0;
  const total = lift + o.face + depth;

  // The outline must hold the pocket plus a wall all round.
  const must = kit.rrect(pocketW + 2 * o.wall, pocketH + 2 * o.wall, pocketR + o.wall);
  const { cs: outline } = fitOutline(
    kit,
    o.shape,
    pocketW + 2 * o.wall,
    pocketH + 2 * o.wall,
    must,
    o,
  );

  let body = kit.sub(
    kit.ext(outline, lift, total),
    kit.ext(kit.rrect(pocketW, pocketH, pocketR), lift + o.face, total + 1),
  );

  const { windows, slits } = facePieces(p);
  const cuts = windows.map((m) =>
    kit.ext(kit.move(windowShape(kit, m.win, mods.margin), m.x, m.y), -1, total),
  );
  // Flat plates: a thin slit through the face wherever a key meets its neighbour, so each key can
  // still be pressed. It stops at the pocket wall, which keeps the pieces together.
  const slitW = p.flat.slit;
  const edge = (x) => (Math.abs(x) >= plate.w / 2 - 1e-6 ? Math.sign(x) * (pocketW / 2) : x);
  const slitCuts = slits.map((sl) =>
    kit.rect(edge(sl.x0), edge(sl.x1), sl.y - slitW / 2, sl.y + slitW / 2),
  );
  if (p.style !== "flat")
    p.groups.forEach((g) => {
      if (usedSlots(g) > mods.slots) warnings.push("slotsOverflow");
    });
  if (cuts.length) body = kit.sub(body, cuts);
  if (slitCuts.length)
    body = kit.sub(
      body,
      slitCuts.map((c) => kit.ext(c, -1, lift + o.face + 0.01)),
    );

  let patternBodies = [];
  let plainBody = null; // the face before the image is cut into it, for the live preview
  if (pat.id !== "none") {
    const keepOut = [
      ...windows.map((m) => kit.move(windowShape(kit, m.win, mods.margin + pat.margin), m.x, m.y)),
      // keep pattern and art off the slits, or they would bridge the gap between two keys
      ...slits.map((sl) =>
        kit.rect(edge(sl.x0), edge(sl.x1), sl.y - slitW / 2 - 0.4, sl.y + slitW / 2 + 0.4),
      ),
    ];
    let area = kit.own(outline.offset(-pat.margin, "Round", 2, 32));
    if (pat.mode === "cutthrough")
      area = kit.inter2d(area, kit.rrect(pocketW - 0.8, pocketH - 0.8, Math.max(0, pocketR - 0.4)));
    if (keepOut.length) area = kit.csSub(area, keepOut);
    plainBody = pat.id === "image" ? body : null;
    const r = decorate(kit, p, body, { area, outline, face: o.face, lift });
    ({ body, patternBodies } = r);
    if (r.warning) warnings.push(r.warning);
  }

  return {
    kind: "overlay",
    ...packResult(kit, {
      name: "cubretapa",
      body,
      patternBodies,
      plainBody,
      bounds: outline.bounds(),
      total,
      pocket: [pocketW, pocketH, depth],
      warnings,
    }),
  };
}
