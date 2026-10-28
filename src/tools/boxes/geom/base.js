// The box's bottom half: a shell with latch channels, a Gridfinity baseplate floor, stacking tabs
// on top, grooves underneath, hinge pockets at the back, and a label holder and handle bosses on
// the front.
import { BASE_SOCKET, GF } from "../../gridfinity/constants.js";
import { BOSS, EDGE_CHAMFER, FLOOR, INNER_R, LABEL, RECESS, VGROOVE } from "./dims.js";
import { baseBottomGrooves, baseTopTabs, hingePockets, outline, rails, vGrooves } from "./shell.js";

/** Handle boss side profile in (y, dz from the pivot): rises out of the wall, flat face at y = 0. */
const BOSS_PROFILE = [
  [RECESS + 1.5, -16.3],
  [RECESS, -15.3],
  [6.4, -12.65],
  [1.1, -7.35],
  [0, -4.7],
  [0, 4.7],
  [1.1, 7.35],
  [6.4, 12.65],
  [RECESS, 15.3],
  [RECESS + 1.5, 16.3],
];

/** The label stands on a shelf 2.5 proud with a 45 degree underside, so it prints. */
const PROUD = 2.5;

function frontFeatures(kit, d) {
  const add = [];
  const cut = [];
  const zc = d.pivotZ;
  const boss = kit.poly(BOSS_PROFILE.map(([y, dz]) => [y, zc + dz]));
  for (const [x0, x1] of d.bosses)
    add.push(kit.move(kit.cabToXyz(kit.ext(boss, 0, x1 - x0)), x0, 0, 0));
  // One bolt hole through each pair (outer boss, gap, inner boss).
  const pairs = [
    [d.bosses[1][0], d.bosses[0][1]],
    [d.bosses[2][0], d.bosses[3][1]],
  ];
  for (const [x0, x1] of pairs) {
    const hole = kit.circle(BOSS.holeD / 2, BOSS.holeY, zc, 24);
    cut.push(kit.move(kit.cabToXyz(kit.ext(hole, -1, x1 - x0 + 1)), x0, 0, 0));
  }
  // The inner boss of each pair is counterbored for an M3 head, from the label side.
  const head = kit.circle(BOSS.headD / 2, BOSS.holeY, zc, 32);
  const heads = kit.cabToXyz(kit.ext(head, 0, BOSS.headL + 1));
  cut.push(kit.move(heads, d.bosses[0][1] - BOSS.headL, 0, 0));
  cut.push(kit.move(heads, d.bosses[2][0] - 1, 0, 0));
  // Label: a shelf to stand on and a post either side, all 2.5 proud of the waist.
  const { slotW, slotX0, z0 } = d.label;
  const y0 = RECESS - PROUD;
  const shelf = kit.poly([
    [RECESS + 0.5, z0 - PROUD],
    [RECESS, z0 - PROUD],
    [y0, z0],
    [RECESS + 0.5, z0],
  ]);
  add.push(kit.move(kit.cabToXyz(kit.ext(shelf, 0, slotW)), slotX0, 0, 0));
  const top = z0 + LABEL.h;
  // Posts are quarter rounds standing out of the waist either side of the label.
  const p = PROUD;
  for (const [cx, x0] of [
    [slotX0, slotX0 - p],
    [slotX0 + slotW, slotX0 + slotW],
  ]) {
    const q = kit.csUnion(
      kit.inter2d(kit.circle(p, cx, RECESS, 32), kit.rect(x0, x0 + p, y0, RECESS)),
      kit.rect(x0, x0 + p, RECESS, RECESS + 0.5),
    );
    add.push(kit.ext(q, z0 - p, top));
  }
  // Two small pegs just above the label's top edge keep it from tipping out.
  for (const x of [slotX0 + 4, slotX0 + slotW - 4])
    add.push(kit.cyl(0.5, 2, x, RECESS - 0.9, top + 0.5));
  return { add, cut };
}

/**
 * Floor cut under one socket, centred on the cell: the socket's footprint minus a round pad in
 * each corner (where magnets would go), with the cut's corners filleted into the pads.
 */
function underCut(kit) {
  const half = GF.pitch / 2;
  const e = half - BASE_SOCKET[0][1];
  const { padC, padR, fillet } = FLOOR;
  const pads = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * (half - padC);
      const cy = sy * (half - padC);
      const xs = [cx, sx * half].sort((a, b) => a - b);
      const ys = [cy, sy * half].sort((a, b) => a - b);
      pads.push(
        kit.circle(padR, cx, cy, 32),
        kit.rect(xs[0] - (sx < 0 ? 0 : padR), xs[1] + (sx < 0 ? padR : 0), ys[0], ys[1]),
        kit.rect(xs[0], xs[1], ys[0] - (sy < 0 ? 0 : padR), ys[1] + (sy < 0 ? padR : 0)),
      );
    }
  }
  const raw = kit.csSub(kit.rect(-e, e, -e, e), pads);
  return kit.grow(kit.grow(raw, -fillet, "Round"), fillet, "Round");
}

export function buildBase(kit, d) {
  const H = d.wallTop;
  const shell = kit.chamferExt(outline(kit, d), 0, H, EDGE_CHAMFER, EDGE_CHAMFER);

  // Undercuts open at the top (the latch slides in from above) and in a short pocket at the bottom.
  const r = rails(
    kit,
    d,
    H,
    [
      [-10, 4],
      [d.railOpen, H + 10],
    ],
    d.nubsBase,
  );

  const { x0, y0, w, d: dd } = d.inner;
  const cavity = [
    kit.ext(kit.move2(kit.rrect(w, dd, INNER_R), x0 + w / 2, y0 + dd / 2), FLOOR.top, H + 1),
  ];
  const below = FLOOR.socketZ - FLOOR.t;
  const socket = kit.union(
    kit.loft(BASE_SOCKET, GF.pitch, GF.pitch, 0, 1),
    kit.ext(underCut(kit), -below, 0.01),
  );
  for (let i = 0; i < d.grid.x; i++) {
    for (let j = 0; j < d.grid.y; j++) {
      cavity.push(
        kit.move(socket, x0 + GF.pitch * (i + 0.5), y0 + GF.pitch * (j + 0.5), FLOOR.socketZ),
      );
    }
  }

  const front = frontFeatures(kit, d);
  let m = kit.union(shell, ...front.add);
  m = kit.sub(m, r.cut, ...cavity, ...front.cut);
  if (r.add) m = kit.union(m, r.add);
  m = kit.union(m, baseTopTabs(kit, d, H));
  m = kit.sub(
    m,
    baseBottomGrooves(kit, d),
    hingePockets(kit, d, (t0, t1) => [H - t1, H - t0]),
    vGrooves(kit, d, [VGROOVE.at, H - VGROOVE.at]),
  );
  return m;
}
