import { MODULES } from "../model/modules.js";
import { usedSlots } from "../model/project.js";
import { buildPattern } from "./patterns.js";
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
    const start = -rowLen / 2 + ((Math.max(total, slots) - total) * pitch) / 2;
    for (const type of group) {
      const span = MODULES[type].span;
      out.push({ x, y: start + (cursor + span / 2) * pitch, type, span });
      cursor += span;
    }
  });
  return out;
}

function windowShape(kit, win, m) {
  return win.kind === "circle"
    ? kit.circle(win.d / 2 + m, 0, 0, 48)
    : kit.rrect(win.x + 2 * m, win.y + 2 * m, win.r + m);
}

const concat = (meshes) => {
  const n = meshes.reduce((a, m) => a + m.positions.length, 0);
  const positions = new Float32Array(n);
  const indices = new Uint32Array(meshes.reduce((a, m) => a + m.indices.length, 0));
  let po = 0;
  let io = 0;
  for (const m of meshes) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
};

/**
 * Overlay that slips over the existing tapa. Printed face down: face at z = 0, open side up.
 * Bodies share one coordinate system (so they can be printed as colours of one object):
 * [{ name, role: "main" | "pattern", mesh, volume }].
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
    if (cs) {
      const d = Math.min(pat.depth, o.face);
      if (pat.mode === "raised") patternBody = kit.ext(cs, 0, lift);
      else if (pat.mode === "inlay") {
        patternBody = kit.ext(cs, 0, d);
        body = kit.sub(body, kit.ext(cs, -1, d));
      } else if (pat.mode === "engraved") body = kit.sub(body, kit.ext(cs, -1, d));
      else body = kit.sub(body, kit.ext(cs, -1, lift + o.face));
    }
  }

  const bb = outline.bounds();
  const origin = [bb.min[0], bb.min[1], 0];
  const main = kit.export(body, origin);
  if (!main.valid) warnings.push("invalidMesh");
  const bodies = [{ name: "cubretapa", role: "main", mesh: main.mesh, volume: main.volume }];
  if (patternBody) {
    const pb = kit.export(patternBody, origin);
    if (!pb.valid) warnings.push("invalidMesh");
    bodies.push({ name: "patron", role: "pattern", mesh: pb.mesh, volume: pb.volume });
  }
  return {
    kind: "overlay",
    name: "cubretapa",
    bodies,
    mesh: bodies.length > 1 ? concat(bodies.map((b) => b.mesh)) : main.mesh,
    size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], total],
    center: [-bb.min[0], -bb.min[1]],
    triangles: bodies.reduce((a, b) => a + b.mesh.indices.length / 3, 0),
    volume: bodies.reduce((a, b) => a + b.volume, 0),
    valid: main.valid,
    pocket: [pocketW, pocketH, depth],
    warnings: [...new Set(warnings)],
  };
}
