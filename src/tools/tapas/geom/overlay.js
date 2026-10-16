import { MODULES } from "../model/modules.js";
import { usedSlots } from "../model/project.js";
import { buildPattern } from "./patterns.js";
import { applyRelief, packResult } from "./relief.js";
import { fitOutline } from "./shapes.js";

/** Window centres [{ x, y, type }] in plate coordinates (x across, y along the module row). */
export function layoutModules(p) {
  const { pitch, slots } = p.mods;
  const groups = p.groups.length;
  const out = [];
  p.groups.forEach((group, g) => {
    const x = (g - (groups - 1) / 2) * (p.plate.w / groups);
    let cursor = 0;
    const total = usedSlots(group);
    const rowLen = Math.max(total, slots) * pitch;
    // First module at the top, matching the order of the list in the panel.
    const start = rowLen / 2 - ((Math.max(total, slots) - total) * pitch) / 2;
    for (const type of group) {
      const span = MODULES[type].span;
      out.push({ x, y: start - (cursor + span / 2) * pitch, type, span });
      cursor += span;
    }
  });
  return out;
}

export function windowShape(kit, win, m) {
  return win.kind === "circle"
    ? kit.circle(win.d / 2 + m, 0, 0, 48)
    : kit.rrect(win.x + 2 * m, win.y + 2 * m, win.r + m);
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

  const placed = layoutModules(p).filter((m) => MODULES[m.type].win);
  const cuts = placed.map((m) =>
    kit.ext(kit.move(windowShape(kit, MODULES[m.type].win, mods.margin), m.x, m.y), -1, total),
  );
  p.groups.forEach((g) => {
    if (usedSlots(g) > mods.slots) warnings.push("slotsOverflow");
  });
  if (cuts.length) body = kit.sub(body, cuts);

  let patternBody = null;
  if (pat.id !== "none") {
    const keepOut = placed.map((m) =>
      kit.move(windowShape(kit, MODULES[m.type].win, mods.margin + pat.margin), m.x, m.y),
    );
    let area = kit.own(outline.offset(-pat.margin, "Round", 2, 32));
    if (pat.mode === "cutthrough")
      area = kit.inter2d(area, kit.rrect(pocketW - 0.8, pocketH - 0.8, Math.max(0, pocketR - 0.4)));
    if (keepOut.length) area = kit.csSub(area, keepOut);
    const cs = buildPattern(kit, pat, area, outline);
    if (cs)
      ({ body, patternBody } = applyRelief(kit, body, cs, {
        mode: pat.mode,
        depth: pat.depth,
        face: o.face,
        lift,
      }));
  }

  return {
    kind: "overlay",
    ...packResult(kit, {
      name: "cubretapa",
      body,
      patternBody,
      bounds: outline.bounds(),
      total,
      pocket: [pocketW, pocketH, depth],
      warnings,
    }),
  };
}
