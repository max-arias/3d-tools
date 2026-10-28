// The box's top half: a 10 mm frame with the same channels as the base, a grid of hollow
// Gridfinity feet underneath that press on the bins' stacking lips, grooves for the base's tabs,
// corner rings on top for the next box, and hinge pockets mirrored from the base.
import { GF } from "../../gridfinity/constants.js";
import { EDGE_CHAMFER, INNER_R, LID, LID_FRONT, RECESS } from "./dims.js";
import { hingePockets, lidBottomGrooves, lidTopTabs, outline, rails } from "./shell.js";

// Inside of each hollow foot, rows of [z, inset from the cell edge, corner radius].
const POCKET = [
  [LID.shell, 3.7, 0.3],
  [LID.shell + 0.5, 3.2, 0.8],
  [4.4, 3.2, 0.8],
  [5.45, 2.15, 1.85],
  [7.25, 2.15, 1.85],
  [8, 1.4, 2.6],
  [8.45, 0.75, 3.25],
  [LID.body + 1, 0.75, 3.25],
];

/**
 * Block that fills the front waist over the label, with a round-ended slot open toward the base.
 * Its face drops straight 3 mm, then leans back at 45 degrees to the top.
 */
function frontBlock(kit, d) {
  const F = LID_FRONT;
  const { slotW, slotX0 } = d.label;
  const x0 = slotX0 - F.out;
  const x1 = slotX0 + slotW + F.out;
  const plan = kit.csUnion(
    kit.rect(x0 + F.r, x1 - F.r, F.y0, RECESS + 0.5),
    kit.rect(x0, x1, F.y0 + F.r, RECESS + 0.5),
    kit.circle(F.r, x0 + F.r, F.y0 + F.r, 48),
    kit.circle(F.r, x1 - F.r, F.y0 + F.r, 48),
  );
  const side = kit.poly([
    [F.y0 + 1, 0],
    [RECESS + 0.5, 0],
    [RECESS + 0.5, LID.body],
    [F.y0 + 6, LID.body],
    [F.y0, LID.body - 6],
    [F.y0, 1],
  ]);
  const block = kit.inter(
    kit.ext(plan, 0, LID.body),
    kit.move(kit.cabToXyz(kit.ext(side, 0, x1 - x0 + 2)), x0 - 1, 0, 0),
  );
  const s0 = slotX0 + F.out;
  const s1 = slotX0 + slotW - F.out;
  const slot = kit.csUnion(
    kit.rect(s0, s1, F.slotY0, RECESS + 0.1),
    kit.inter2d(kit.circle(F.slotR, s0, RECESS, 32), kit.rect(s0 - F.slotR, s0, F.slotY0, RECESS)),
    kit.inter2d(kit.circle(F.slotR, s1, RECESS, 32), kit.rect(s1, s1 + F.slotR, F.slotY0, RECESS)),
  );
  return kit.sub(block, kit.chamferExt(slot, -1, F.slotZ + 1, 0, 1));
}

export function buildLid(kit, d) {
  const H = LID.body;
  const frame = kit.chamferExt(outline(kit, d), 0, H, EDGE_CHAMFER, EDGE_CHAMFER);
  const { x0, y0, w, d: dd } = d.inner;
  const inner = kit.move2(kit.rrect(w, dd, INNER_R), x0 + w / 2, y0 + dd / 2);

  const feet = [kit.ext(inner, LID.foot[3][0] - 0.01, LID.web)];
  const pockets = [];
  const foot = kit.loft(LID.foot, GF.pitch, GF.pitch);
  const pocket = kit.loft(POCKET, GF.pitch, GF.pitch);
  for (let i = 0; i < d.grid.x; i++) {
    for (let j = 0; j < d.grid.y; j++) {
      const cx = x0 + GF.pitch * (i + 0.5);
      const cy = y0 + GF.pitch * (j + 0.5);
      feet.push(kit.move(foot, cx, cy, 0));
      pockets.push(kit.move(pocket, cx, cy, 0));
    }
  }

  const r = rails(
    kit,
    d,
    H,
    [
      [-10, 4],
      [6, H + 10],
    ],
    d.nubsLid,
  );
  let m = kit.sub(frame, kit.ext(inner, -1, H + 1), r.cut);
  m = kit.union(m, kit.sub(kit.union(feet), pockets));
  if (r.add) m = kit.union(m, r.add);
  m = kit.union(m, lidTopTabs(kit, d, H), frontBlock(kit, d));
  return kit.sub(
    m,
    lidBottomGrooves(kit, d),
    hingePockets(kit, d, (t0, t1) => [t0, t1]),
  );
}
