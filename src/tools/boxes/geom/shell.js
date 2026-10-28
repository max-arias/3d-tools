// Features shared by the base and the lid: the plan outline, latch channels, stacking tabs and
// grooves, and the hinge pockets. Measured from Pred's V1 files; see dims.js.
import {
  BACK_BUMPER,
  BUMPER,
  CORNER_R,
  GROOVE,
  HINGE,
  NUB,
  RAIL,
  RECESS,
  RECESS_R,
  TAB,
  VGROOVE,
} from "./dims.js";

/**
 * Plan outline: rounded rectangle with a 7.5 mm waist between the corner bumpers on every side.
 * Each step into a waist is an S of two RECESS_R arcs. Latch channels are cut later, in 3D.
 */
export function outline(kit, d) {
  const { W, D } = d;
  const e = BUMPER + RECESS_R;
  const b = BACK_BUMPER + RECESS_R;
  const box = kit.move2(kit.rrect(W, D, CORNER_R), W / 2, D / 2);
  const cut = kit.csUnion(
    kit.rect(e, W - e, -1, RECESS),
    kit.rect(b, W - b, D - RECESS, D + 1),
    kit.rect(-1, RECESS, e, D - e),
    kit.rect(W - RECESS, W + 1, e, D - e),
  );
  const raw = kit.csSub(box, cut);
  // Opening rounds the bumper ends, closing rounds the inner corners of each waist.
  const r = RECESS_R;
  const opened = kit.grow(kit.grow(raw, -r, "Round"), r, "Round");
  return kit.grow(kit.grow(opened, r, "Round"), -r, "Round");
}

/**
 * V-grooves round the corner bumpers at heights `zs`: a 45 degree V cut into the outer 1 mm.
 * The waists stay smooth.
 */
export function vGrooves(kit, d, zs) {
  const { W, D } = d;
  const t = VGROOVE.depth;
  const out = outline(kit, d);
  const all = kit.rect(-1, W + 1, -1, D + 1);
  const waist = kit.rect(RECESS - 0.1, W - RECESS + 0.1, RECESS - 0.1, D - RECESS + 0.1);
  const mask = kit.csSub(all, waist);
  const parts = [];
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    // Layer i covers |z - zc| in [i, i + 1] * t / steps; the V is deepest at zc.
    const inset = t - (t * (i + 0.5)) / steps;
    const layer = kit.inter2d(kit.csSub(out, kit.grow(out, -inset, "Round")), mask);
    const h0 = (t * i) / steps;
    const h1 = (t * (i + 1)) / steps;
    for (const zc of zs) {
      parts.push(
        kit.ext(layer, zc + h0 - 1e-3, zc + h1 + 1e-3),
        kit.ext(layer, zc - h1 - 1e-3, zc - h0 + 1e-3),
      );
    }
  }
  return kit.union(parts);
}

/**
 * Place a cutter built in a wall-local frame (X along the wall, Y inward from the outer face,
 * Z up) on one of the walls. `at` is the X offset along the wall, measured left to right as seen
 * from outside for the front, and from the front for the sides.
 */
function onWall(kit, m, wall, at, d) {
  if (wall === "front") return kit.move(m, at, 0, 0);
  if (wall === "left") return kit.move(kit.rotZ(m, -90), 0, at + RAIL.w, 0);
  if (wall === "right") return kit.move(kit.rotZ(m, 90), d.W, at, 0);
  throw new Error(`bad wall ${wall}`);
}

/** Undercut void in the wall frame (Y, Z): a 4 mm slot with round ends, from z0 to z1. */
function undercut(kit, x0, z0, z1) {
  const r = RAIL.endR;
  const yc = (RAIL.u0 + RAIL.u1) / 2;
  const prof = kit.csUnion(
    kit.rect(RAIL.u0, RAIL.u1, z0 + r, z1 - r),
    kit.circle(r, yc, z0 + r),
    kit.circle(r, yc, z1 - r),
  );
  // Profile is sketched in (Y, Z); extrude along X.
  return kit.move(kit.cabToXyz(kit.ext(prof, 0, RAIL.under)), x0, 0, 0);
}

/** Latch catch in the wall frame: proud of the channel's back face, chamfered on the front edges. */
function nub(kit, x0, z0, z1) {
  const c = NUB.chamfer;
  const y0 = RECESS - NUB.proud;
  const prof = kit.poly([
    [RECESS + 0.5, z0],
    [y0 + c, z0],
    [y0, z0 + c],
    [y0, z1 - c],
    [y0 + c, z1],
    [RECESS + 0.5, z1],
  ]);
  return kit.move(kit.cabToXyz(kit.ext(prof, 0, NUB.w)), x0, 0, 0);
}

/**
 * Every latch channel of a part of height h. `voids` are the [z0, z1] ranges where the undercuts
 * are open (round-ended), `nubs` the [z0, z1] ranges of the catches.
 * Returns { cut, add }: subtract `cut`, then union `add`.
 */
export function rails(kit, d, h, voids, nubs) {
  const local = () => {
    const parts = [kit.box(0, RAIL.w, -1, RECESS, -1, h + 1)];
    for (const [z0, z1] of voids) {
      parts.push(undercut(kit, -RAIL.under, z0, z1), undercut(kit, RAIL.w, z0, z1));
    }
    return kit.union(parts);
  };
  const catches = () => {
    const parts = [];
    for (const [z0, z1] of nubs) for (const x of NUB.xs) parts.push(nub(kit, x, z0, z1));
    return kit.union(parts);
  };
  const cut = [];
  const add = [];
  const place = (wall, at) => {
    cut.push(onWall(kit, local(), wall, at, d));
    if (nubs.length) add.push(onWall(kit, catches(), wall, at, d));
  };
  for (const at of d.rails.front) place("front", at);
  for (const at of d.rails.side) {
    place("left", at);
    place("right", at);
  }
  return { cut: kit.union(cut), add: add.length ? kit.union(add) : null };
}

/**
 * Quarter-ring band in one corner, `o0`..`o1` in from both outer faces, optionally running
 * `ext` straight past each end. corner: [sx, sy] with 0 = low side, 1 = high side.
 */
function cornerBand(kit, d, [sx, sy], o0, o1, ext = 0) {
  const R = CORNER_R;
  const ring = kit.csSub(kit.circle(R - o0, 0, 0, 64), kit.circle(R - o1, 0, 0, 64));
  // Keep the quadrant that faces the corner (local -x, -y), plus the straight extensions.
  const quad = kit.inter2d(ring, kit.rect(-R, 0, -R, 0));
  const parts = [quad];
  if (ext > 0)
    parts.push(kit.rect(0, ext, -(R - o0), -(R - o1)), kit.rect(-(R - o0), -(R - o1), 0, ext));
  let band = kit.csUnion(parts);
  band = kit.scale2(band, sx ? -1 : 1, sy ? -1 : 1);
  return kit.move2(band, sx ? d.W - R : R, sy ? d.D - R : R);
}

function block(kit, d, side, at, d0, d1) {
  const { W, D } = d;
  if (side === "front") return kit.rect(at, at + TAB.block.len, d0, d1);
  if (side === "left") return kit.rect(d0, d1, at, at + TAB.block.len);
  return kit.rect(W - d1, W - d0, at, at + TAB.block.len);
}

/** The base's top tabs in plan: rings at the front corners and blocks on the front and sides. */
function baseTabs(kit, d, grow = 0) {
  const { W, D } = d;
  const { r0, r1 } = TAB.baseRing;
  const { d0, d1, from, len } = TAB.block;
  const rings = [
    [0, 0],
    [1, 0],
  ].map((c) => cornerBand(kit, d, c, r0 - grow, r1 + grow, grow > 0 ? GROOVE.lid.ext : 0));
  const blocks = [
    block(kit, d, "front", from, d0, d1),
    block(kit, d, "front", W - from - len, d0, d1),
    block(kit, d, "left", from, d0, d1),
    block(kit, d, "left", D - from - len, d0, d1),
    block(kit, d, "right", from, d0, d1),
    block(kit, d, "right", D - from - len, d0, d1),
  ].map((b) => (grow > 0 ? kit.grow(b, grow) : b));
  return { rings: kit.csUnion(rings), blocks: kit.csUnion(blocks) };
}

const ALL_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** Tabs standing on the base's wall top. */
export function baseTopTabs(kit, d, z) {
  const { rings, blocks } = baseTabs(kit, d);
  return kit.union(
    kit.chamferExt(rings, z - 0.01, z + TAB.baseRing.h, 0, TAB.baseRing.chamfer),
    kit.chamferExt(blocks, z - 0.01, z + TAB.block.h, 0, TAB.block.chamfer),
  );
}

/** Grooves in the lid's underside that take the base's tabs. */
export function lidBottomGrooves(kit, d) {
  const g = GROOVE.lid;
  const { rings, blocks } = baseTabs(kit, d, g.grow);
  const cs = kit.csUnion(rings, blocks);
  return kit.union(
    kit.chamferExt(cs, -1, g.depth, 0, g.top),
    kit.chamferExt(kit.grow(cs, g.mouth), -1, g.mouth, 0, g.mouth),
  );
}

/** Corner rings on the lid's top, at height z. */
export function lidTopTabs(kit, d, z) {
  const { r0, r1, h, chamfer } = TAB.lidRing;
  const cs = kit.csUnion(ALL_CORNERS.map((c) => cornerBand(kit, d, c, r0, r1)));
  return kit.chamferExt(cs, z - 0.01, z + h, 0, chamfer);
}

/** Grooves in the base's underside that take the lid rings of the box below. */
export function baseBottomGrooves(kit, d) {
  const g = GROOVE.base;
  const cs = kit.csUnion(ALL_CORNERS.map((c) => cornerBand(kit, d, c, g.r0, g.r1, g.ext)));
  return kit.union(
    kit.ext(cs, -1, g.depth),
    kit.chamferExt(kit.grow(cs, g.mouth), -1, g.mouth, 0, g.mouth),
  );
}

/**
 * Hinge pockets in "mating" coordinates: depth `t` below the face that touches the other part.
 * `toZ(t0, t1)` maps a depth range to a part's [z0, z1].
 */
export function hingePockets(kit, d, toZ) {
  const { D } = d;
  const H = HINGE;
  const yb = (b0, b1) => [D - b1, D - b0]; // distances from the back face -> y range
  const box = (x0, x1, [y0, y1], t0, t1) => {
    const [z0, z1] = toZ(t0, t1);
    return kit.box(x0, x1, y0, y1, z0, z1);
  };
  const parts = [];
  for (const a of d.hinges) {
    parts.push(box(a, a + H.len, yb(-1, H.notch.y0), -1, H.notch.h));
    parts.push(
      box(
        a + H.channel.inset,
        a + H.len - H.channel.inset,
        yb(H.channel.y1, H.channel.y0),
        0,
        H.depth,
      ),
    );
    // The channel flares out toward the notch so the knuckle drops in.
    const ch = H.chamfer;
    const [cy0] = yb(H.channel.y1, H.channel.y0);
    const flareAt = (t, xin, back) => {
      const [z] = toZ(t, t);
      return kit.slice(kit.rect(a + xin, a + H.len - xin, cy0, D - back), z);
    };
    parts.push(
      kit.hull(flareAt(ch.t, ch.x, ch.back), flareAt(ch.t + 1, H.channel.inset, H.channel.y1)),
    );
    const [hy0, hy1] = yb(H.hole.y1, H.hole.y0);
    const r = (hy1 - hy0) / 2;
    for (let i = 0; i < 2; i++) {
      const c0 = a + H.hole.c[2 * i];
      const c1 = a + H.hole.c[2 * i + 1];
      const slot = kit.csUnion(
        kit.rect(c0, c1, hy0, hy1),
        kit.circle(r, c0, hy0 + r, 24),
        kit.circle(r, c1, hy0 + r, 24),
      );
      const [z0, z1] = toZ(-1, H.depth);
      parts.push(kit.ext(slot, z0, z1));
      const xc = (c0 + c1) / 2;
      parts.push(
        box(
          xc - H.window.w / 2,
          xc + H.window.w / 2,
          yb(H.channel.y0, H.hole.y1),
          H.window.z0,
          H.window.z1,
        ),
      );
    }
  }
  return kit.union(parts);
}
