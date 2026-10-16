import { MODULES } from "../model/modules.js";
import { usedSlots } from "../model/project.js";

/**
 * Where each module sits, in plate coordinates (x across, y along the plate, 0,0 = centre).
 * Modular plates place modules on a 22.5 mm pitch; flat plates (Milan style) give every module an
 * equal share of the face, so one punto is the whole face and four puntos are four equal keys.
 */
export function layoutModules(p) {
  const groups = p.groups.length;
  const out = [];
  if (p.style === "flat") {
    const cellW = p.plate.w / groups;
    p.groups.forEach((group, g) => {
      const x = (g - (groups - 1) / 2) * cellW;
      const cellH = p.plate.h / Math.max(1, group.length);
      group.forEach((type, i) =>
        out.push({ x, y: p.plate.h / 2 - (i + 0.5) * cellH, type, span: 1, cellW, cellH }),
      );
    });
    return out;
  }
  const { pitch, slots } = p.mods;
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

/**
 * What the cover must leave open or cut: `windows` [{ x, y, type, win }] and, on flat plates,
 * `slits` [{ x0, x1, y }] along the boundary where a key meets its neighbour, so each key can move.
 */
export function facePieces(p) {
  const flat = p.style === "flat";
  const placed = layoutModules(p);
  const windows = [];
  for (const m of placed) {
    const def = MODULES[m.type];
    if (!def.win || (flat && def.key)) continue; // on a flat plate the key is covered, not exposed
    windows.push({ x: m.x, y: m.y, type: m.type, win: def.win });
  }
  const slits = [];
  if (flat)
    placed.forEach((m, i) => {
      const next = placed[i + 1];
      if (!next || next.x !== m.x) return;
      if (!MODULES[m.type].key && !MODULES[next.type].key) return;
      slits.push({ x0: m.x - m.cellW / 2, x1: m.x + m.cellW / 2, y: (m.y + next.y) / 2 });
    });
  return { windows, slits };
}
