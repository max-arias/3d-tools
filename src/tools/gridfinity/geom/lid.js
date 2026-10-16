import { BASE_SOCKET, BIN_FOOT, BIN_R, FOOT_H, SOCKET_H } from "../constants.js";
import { HINGE, hingeSpec, slidingLevels } from "../layout/lids.js";
import { depthProfile, toWall, wallLength } from "./bin.js";

const BIG = 1e3;
const PLUG_DEPTH = 3;

/** Approximate a 3D offset: the shape plus copies nudged by ±d along each axis. */
function grow(kit, m, d) {
  const copies = [m];
  for (const [x, y, z] of [
    [d, 0, 0],
    [-d, 0, 0],
    [0, d, 0],
    [0, -d, 0],
    [0, 0, d],
    [0, 0, -d],
  ]) {
    copies.push(kit.move(m, x, y, z));
  }
  return kit.union(copies);
}

/** Where the pull handle goes, as a point on the lid and the wall it is nearest to. */
function handleSpot(eff, frame) {
  const { W, D, gap } = frame;
  const near =
    eff.lid === "sliding" ? eff.lidSide : eff.lid === "hinged" ? OPPOSITE[eff.lidSide] : "front";
  const inset = eff.lidHandle === "dip" ? 9 : 3;
  switch (near) {
    case "back":
      return [W / 2, D - gap - inset];
    case "left":
      return [gap + inset, D / 2];
    case "right":
      return [W - gap - inset, D / 2];
    default:
      return [W / 2, gap + inset];
  }
}
const OPPOSITE = { front: "back", back: "front", left: "right", right: "left" };

/** Handle on top of the lid plate (plate top at z = zTop). Returns the lid with the handle added or cut. */
function withHandle(kit, lid, eff, frame, zTop) {
  const kind = eff.lidHandle;
  if (kind === "none") return lid;
  const [sx, sy] = handleSpot(eff, frame);
  const t = eff.lidThickness;
  if (kind === "dip") {
    // An oval dent for a fingertip, leaving 0.6 mm of lid underneath.
    const turned =
      eff.lid === "sliding" ? eff.lidSide === "left" || eff.lidSide === "right" : false;
    const oval = kit.rrect(turned ? 8 : 14, turned ? 14 : 8, 4);
    return kit.sub(lid, kit.ext(kit.move(oval, sx, sy), zTop - t + 0.6, zTop + 1));
  }
  if (kind === "tab")
    return kit.union(lid, kit.box(sx - 6, sx + 6, sy - 2, sy + 2, zTop - 0.001, zTop + 3));
  return kit.union(lid, kit.cyl(5, 5, sx, sy, zTop - 0.001));
}

/** Flat-topped lids print upside down (top on the bed); raised handles need the top free. */
const printsFlipped = (eff) => eff.lidHandle === "none" || eff.lidHandle === "dip";

function dropIn(kit, ctx) {
  const { eff, frame, interior } = ctx;
  const { ow, od, cx, cy, top, wall, bounds } = frame;
  const t = eff.lidThickness;
  const region = (z0, z1) => kit.box(bounds.bx0, bounds.bx1, bounds.by0, bounds.by1, z0, z1);
  const outline = kit.move(kit.rrect(ow, od, BIN_R), cx, cy);
  const plate = kit.inter(kit.ext(outline, top, top + t), region(top - 1, top + t + 1));

  // The plug seats inside the rim. With the stacking lip the narrowest point it passes is 1.9 mm in.
  const inset = (eff.lip ? 1.9 : wall) + eff.lidFit;
  const shape = kit.move(
    kit.rrect(ow - 2 * inset, od - 2 * inset, Math.max(BIN_R - inset, 0.5)),
    cx,
    cy,
  );
  const plug = kit.inter(
    kit.ext(shape, top - PLUG_DEPTH, top + 0.001),
    region(top - PLUG_DEPTH - 1, top + 1),
  );
  let lid = kit.union(plate, plug);

  if (interior) {
    const zone = kit.inter(interior, kit.box(-BIG, BIG, -BIG, BIG, top - PLUG_DEPTH - 1, top + 2));
    if (!zone.isEmpty()) lid = kit.sub(lid, grow(kit, zone, eff.lidFit));
  }
  return { assembled: withHandle(kit, lid, eff, frame, top + t), flip: printsFlipped(eff) };
}

/**
 * Stackable lid: Gridfinity feet underneath (they sit in the bin's stacking lip like a stacked bin)
 * and baseplate sockets in the top, so other bins can be stacked on it.
 */
function stackable(kit, ctx) {
  const { grid, bin, seg, eff, frame } = ctx;
  const { ow, od, cx, cy, H, bounds } = frame;
  const px = grid.pitchX;
  const py = grid.pitchY;
  const t = eff.lidThickness;
  const e = H + 0.5; // where a stacked bin's feet start
  const bodyBottom = e + FOOT_H;
  const bodyTop = bodyBottom + t + SOCKET_H;
  const region = (z0, z1) => kit.box(bounds.bx0, bounds.bx1, bounds.by0, bounds.by1, z0, z1);
  const outline = kit.move(kit.rrect(ow, od, BIN_R), cx, cy);

  const cellX0 = Math.floor(bin.x + seg.x0 + 1e-6);
  const cellX1 = Math.ceil(bin.x + seg.x0 + seg.w - 1e-6);
  const cellY0 = Math.floor(bin.y + seg.y0 + 1e-6);
  const cellY1 = Math.ceil(bin.y + seg.y0 + seg.d - 1e-6);
  const foot = kit.move(kit.loft(BIN_FOOT, px, py), 0, 0, e);
  const socket = kit.move(kit.loft(BASE_SOCKET, px, py, 0, 1), 0, 0, bodyBottom + t);
  const feet = [];
  const sockets = [];
  for (let gx = cellX0; gx < cellX1; gx++) {
    for (let gy = cellY0; gy < cellY1; gy++) {
      const x = (gx + 0.5 - bin.x) * px;
      const y = (gy + 0.5 - bin.y) * py;
      feet.push(kit.move(foot, x, y, 0));
      sockets.push(kit.move(socket, x, y, 0));
    }
  }
  const clip = kit.inter(kit.ext(outline, e - 1, bodyTop + 1), region(e - 1, bodyTop + 1));
  const body = kit.inter(kit.ext(outline, bodyBottom - 0.001, bodyTop), region(e, bodyTop + 1));
  const solid = kit.union(body, kit.inter(kit.union(feet), clip));
  return { assembled: kit.sub(solid, kit.inter(kit.union(sockets), clip)), flip: false };
}

/**
 * Sliding lid: a plate that rides in the channels between the bin's ledge and guide rails and is
 * pushed in through the cut-down entry wall. Far corners are rounded to clear the cavity corners.
 */
function sliding(kit, ctx) {
  const { eff, frame } = ctx;
  const { W, D, gap, wall } = frame;
  const c = eff.lidFit;
  const lv = slidingLevels(eff);
  const e = gap + wall; // inner face of a wall
  const { lidSide: side } = eff;
  const alongY = side === "front" || side === "back";
  // Footprint: inner width across, from the far inner face to the entry wall's outer face along.
  const x0 = alongY ? e + c : side === "left" ? gap : e + c;
  const x1 = alongY ? W - e - c : side === "left" ? W - e - c : W - gap;
  const y0 = alongY ? (side === "front" ? gap : e + c) : e + c;
  const y1 = alongY ? (side === "front" ? D - e - c : D - gap) : D - e - c;
  const w = x1 - x0;
  const l = y1 - y0;
  const corner = Math.max(BIN_R - wall, 0.1) + 0.5;
  const rounded = kit.move(kit.rrect(w, l, corner), (x0 + x1) / 2, (y0 + y1) / 2);
  // Square off the entry end so the plate fills the slot.
  const half = alongY
    ? [x0, x1, side === "front" ? y0 : y1 - l / 2, side === "front" ? y0 + l / 2 : y1]
    : [side === "left" ? x0 : x1 - w / 2, side === "left" ? x0 + w / 2 : x1, y0, y1];
  const shape = kit.csUnion(rounded, kit.rect(...half));
  const plate = kit.ext(shape, lv.lidBottom, lv.lidTop);
  return { assembled: withHandle(kit, plate, eff, frame, lv.lidTop), flip: false };
}

/**
 * Hinged lid: a plate on the rim that stops short of the hinge, plus one knuckle hanging from its
 * hinge edge. The pin (1.75 mm filament) runs through the knuckle and the bin's two posts.
 */
function hinged(kit, ctx) {
  const { eff, frame } = ctx;
  const { W, D, gap, ow, od, cx, cy, top, wall, H, bounds } = frame;
  const t = eff.lidThickness;
  const side = eff.lidSide;
  const L = wallLength(side, W, D);
  const hinge = hingeSpec(eff, { gap, wall, H, L });
  const region = (z0, z1) => kit.box(bounds.bx0, bounds.bx1, bounds.by0, bounds.by1, z0, z1);
  const outline = kit.move(kit.rrect(ow, od, BIN_R), cx, cy);
  let plate = kit.inter(kit.ext(outline, top, top + t), region(top - 1, top + t + 1));
  // Leave the strip over the hinge open so the plate can swing clear of the wall and posts.
  plate = kit.sub(
    plate,
    toWall(kit, kit.box(-1, hinge.plateStart, -1, L + 1, top - 1, top + t + 1), side, W, D),
  );

  const [k0, k1] = hinge.knuckle;
  // Knuckle profile (u, z): a round barrel, a neck at axis height, and a riser up to the plate.
  // Nothing sits in the ring where it would swing into the wall top, so the lid opens past 90°.
  const { uAxis, zAxis, plateStart } = hinge;
  const profile = kit.csUnion(
    kit.circle(HINGE.knuckleR, uAxis, zAxis),
    kit.rect(uAxis, plateStart + 0.2, zAxis - 0.9, zAxis + 0.9),
    kit.rect(plateStart - 0.01, plateStart + 0.5, zAxis - 0.9, top + t),
  );
  const knuckle = toWall(kit, depthProfile(kit, profile, k0, k1), side, W, D);
  const [s0, s1] = hinge.span;
  const hole = toWall(
    kit,
    kit.move(
      kit.rot(kit.cyl(hinge.holeR, s1 - s0 + 2), -90, 0, 0),
      hinge.uAxis,
      s0 - 1,
      hinge.zAxis,
    ),
    side,
    W,
    D,
  );
  const lid = kit.sub(kit.union(plate, knuckle), hole);
  return {
    assembled: withHandle(kit, lid, eff, frame, top + t),
    flip: true,
    pinLength: hinge.pinLength,
  };
}

/** Build the lid piece for one bin segment, or null when this lid type is not available. */
export function buildLid(kit, ctx) {
  switch (ctx.eff.lid) {
    case "dropin":
      return dropIn(kit, ctx);
    case "stackable":
      return stackable(kit, ctx);
    case "sliding":
      return sliding(kit, ctx);
    case "hinged":
      return hinged(kit, ctx);
    default:
      return null;
  }
}
