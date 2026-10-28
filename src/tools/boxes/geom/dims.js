// Size rules for the storage box. Every number here was measured from Pred's "Gridfinity Storage
// Box (now parametric)" V1 files (Printables 543553) so our boxes stack and latch with his; the
// f3d parameter expressions agree where they exist. Plan coordinates: x along the front (width),
// y from the front (0) to the back, z up from the bottom of the base. All values in mm.
import { GF } from "../../gridfinity/constants.js";

export const MIN = { x: 4, y: 3, u: 6 };
/** Latches: two hold the lid; four or six also lock the box to the ones above and below. */
export const LATCH_COUNTS = [2, 4, 6];
export const MAX = { x: 10, y: 10, u: 30 };

/** Material outside the 42 mm grid on every side (f3d: Grid_X * 42 + 20). */
export const MARGIN = 10;
export const CORNER_R = 14; // outer plan corner
export const INNER_R = 4; // cavity corner
export const RECESS = 7.5; // waist between the corner bumpers, in from the outer face
export const RECESS_R = 3.75; // the S-curve into a recess is two arcs of this radius
export const BUMPER = 52.25; // front and sides: bumper length from the corner
export const BACK_BUMPER = 62.25; // back: longer, it carries the hinges
export const EDGE_CHAMFER = 1; // outer edges at the bottom and top of base and lid

/** Latch channels: 20 wide, as deep as the recess, with 2 x 4 T-undercuts on both sides. */
export const RAIL = {
  from: 21, // channel starts this far from the corner
  w: 20,
  under: 2, // undercut width past each side of the channel
  u0: 1.75, // undercut depth range, from the outer face
  u1: 5.75,
  endR: 2, // undercut slot ends are rounded (half its 4 mm width)
};
/** Latch catches on the channel's back face: 2 wide, 3.5 proud, 5 tall with 1 mm chamfers. */
export const NUB = { xs: [3, 6, 12, 15], w: 2, proud: 3.5, h: 5, chamfer: 1 };

/** Stacking tabs on the base top and lid top, and the grooves that take them. */
export const TAB = {
  // Base top: 1.5 thick quarter ring at the two front corners, 2.5 tall.
  baseRing: { r0: 3.25, r1: 4.75, h: 2.5, chamfer: 0.5 },
  // Base top: 2.5 x 5 blocks, 2.25 tall, on the front and both sides.
  block: { d0: 3.75, d1: 6.25, from: 47, len: 5, h: 2.25, chamfer: 0.25 },
  // Lid top: 2.5 thick quarter ring at all four corners, 1.5 tall.
  lidRing: { r0: 3.25, r1: 5.75, h: 1.5, chamfer: 0.6 },
};
/**
 * Grooves for the tabs. Lid bottom: the base tabs grown by `grow`, with a lead-in chamfer at the
 * mouth. Base bottom: a ring band for the lid's corner rings. Both run `ext` past the ring ends.
 */
export const GROOVE = {
  lid: { grow: 0.5, depth: 4.5, mouth: 1, top: 0.5, ext: 1 },
  base: { r0: 3, r1: 6.5, depth: 2.5, mouth: 0.5, ext: 1 },
};

/** Floor: a Gridfinity baseplate socket standing on a 1.2 mm floor (f3d: 7U - (4.65 - 0.5) ...). */
// Under each socket the floor is cut away except a pad in each corner (centre padC from the
// cell corner, radius padR), filleted into the cut.
export const FLOOR = { t: 1.2, socketZ: 2.8, top: 6.95, padC: 7.9, padR: 4, fillet: 5 };

/** Lid: 10 tall body; the feet hanging under it are a shade larger than a bin foot. */
export const LID = {
  body: 10,
  // Rows of [z, inset from the cell edge, corner radius], from the foot tip up.
  foot: [
    [0, 3.2, 0.8],
    [0.8, 2.4, 1.6],
    [2.6, 2.4, 1.6],
    [4.75, 0.25, 3.75],
  ],
  shell: 1.2, // feet are hollow shells this thick, open from the top
  web: 8.45, // top of the webs between feet
};

/** Hinge pockets in the back, one near each corner; the lid has the same pocket mirrored. */
export const HINGE = {
  from: 21.13, // pocket starts this far from the side
  len: 34,
  depth: 9, // below the mating face
  notch: { y0: 5.5, h: 2.7 }, // full-length notch at the mating face, 5.5 in from the back
  channel: { y0: 5.1, y1: 3, inset: 1 }, // knuckle channel
  hole: { y0: 8.7, y1: 6.7, c: [2.25, 15.75, 18.25, 31.75] }, // two leaf slots: end-circle centres
  chamfer: { t: 2.7, x: 0.5, back: 2 }, // the channel flares into the notch
  window: { w: 6.2, z0: 2.6, z1: 5.6 }, // catch window from each slot to the channel
};

/** Label holder and handle bosses on the front, centred. */
// Bosses and label are centred on the handle pivot, halfway between z = 10 and the wall top.
export const LABEL = { maxW: 82, margin: 162.5, slack: 0.5, h: 24.5, t: 0.85, below: 12.5 };
export const BOSS = {
  w: 5,
  gap: 7.5,
  fromSlot: 3.25,
  holeD: 3,
  holeY: 3.75,
  headD: 5.5,
  headL: 3.5,
  pivotFrom: 10,
};
/** Lid: block over the label with a slot open toward the base. */
export const LID_FRONT = { out: 3.75, y0: 2.5, r: 5, slotY0: 5, slotR: 2.5, slotZ: 5 };
/** V-grooves round the bumpers: 1 deep, 10 mm from the bottom and 10 mm below the wall top. */
export const VGROOVE = { depth: 1, at: 10 };

export function clampGrid({ x, y, u }) {
  const c = (v, k) => Math.max(MIN[k], Math.min(MAX[k], Math.round(Number(v) || MIN[k])));
  return { x: c(x, "x"), y: c(y, "y"), u: c(u, "u") };
}

/** Every size the parts need, from the grid size. */
export function boxDims(grid) {
  const { x, y, u } = clampGrid(grid);
  const W = GF.pitch * x + 2 * MARGIN;
  const D = GF.pitch * y + 2 * MARGIN;
  const wallTop = GF.heightUnit * u + 3; // 45 for 6U
  const baseH = wallTop + TAB.baseRing.h; // 7U + 5.5
  const lidH = LID.body + TAB.lidRing.h; // 11.5
  const labelW = Math.min(W - LABEL.margin, LABEL.maxW);
  const slotW = labelW + LABEL.slack;
  const slotX0 = (W - slotW) / 2;
  // Boss pairs either side of the label: inner boss right next to the slot, outer one a gap away.
  const innerX1 = slotX0 - BOSS.fromSlot;
  const bosses = [
    [innerX1 - BOSS.w, innerX1],
    [innerX1 - 2 * BOSS.w - BOSS.gap, innerX1 - BOSS.w - BOSS.gap],
  ];
  const mirror = ([a, b]) => [W - b, W - a];
  const handleLen = W - 2 * bosses[1][1] - 0.5;
  const pivotZ = (wallTop + BOSS.pivotFrom) / 2; // 27.5 for 6U
  return {
    grid: { x, y, u },
    W,
    D,
    wallTop,
    baseH,
    lidH,
    closedH: baseH - TAB.baseRing.h + lidH, // base and lid together
    inner: { x0: MARGIN, y0: MARGIN, w: GF.pitch * x, d: GF.pitch * y },
    label: { w: labelW, h: LABEL.h, slotW, slotX0, z0: pivotZ - LABEL.below },
    pivotZ,
    bosses: [...bosses, ...bosses.map(mirror)],
    handle: { len: handleLen },
    rails: {
      front: [RAIL.from, W - RAIL.from - RAIL.w],
      side: [RAIL.from, D - RAIL.from - RAIL.w],
    },
    hinges: [HINGE.from, W - HINGE.from - HINGE.len],
    // The base's undercuts are open over the top 39 mm (the latch drops in from above).
    railOpen: wallTop - 39,
    // Catches in the base channels, as [z0, z1] ranges (first from the bottom, the rest from the top).
    nubsBase: [
      [0, NUB.h],
      [wallTop - 19 - 1, wallTop - 16 + 1],
      [wallTop - 9 - 1, wallTop - 6 + 1],
    ],
    nubsLid: [[0, NUB.h]],
  };
}
