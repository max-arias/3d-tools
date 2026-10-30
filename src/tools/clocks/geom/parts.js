// The loose parts: hands, desk cradle, two-sided wall bracket and the fit coupon. Each returns
// manifolds in its own frame; generate.js exports them.
import { areaMoment, handPolys, holeRing, tipZone } from "../dial/hands.js";
import { PLA_DENSITY } from "../model/movements.js";

const cs = (kit, rings, rule = "NonZero") => kit.own(kit.CrossSection.ofPolygons(rings, rule));

/**
 * One hand, flat on z = 0..thickness, shaft at the origin, pointing +y.
 * spec = { style, length, width, tail }, hole = { d, flat }. Returns { base, tip, moment, mass }.
 */
export function buildHand(kit, spec, hole, thickness, glow) {
  const hubR = hole.d / 2 + Math.max(1.8, spec.width * 0.45);
  const { add, cut } = handPolys(spec, hubR);
  let shape = kit.csUnion(add.map((r) => cs(kit, [r])));
  if (cut.length)
    shape = kit.csSub(
      shape,
      cut.map((r) => cs(kit, [r])),
    );
  shape = kit.csSub(shape, cs(kit, [holeRing(hole.d, hole.flat)]));
  const { area, moment } = areaMoment(shape.toPolygons());
  const k = (thickness * PLA_DENSITY) / 1000; // g per mm² of outline
  let base = shape;
  let tip = null;
  if (glow) {
    const zone = cs(kit, [tipZone(spec)]);
    tip = kit.inter2d(shape, zone);
    base = kit.csSub(shape, zone);
    if (tip.isEmpty()) tip = null;
  }
  return {
    base: kit.ext(base, 0, thickness),
    tip: tip && kit.ext(tip, 0, thickness),
    mass: area * k,
    moment: (moment * k) / 10, // g·cm
  };
}

/**
 * Desk cradle: a block with a slot leaning back by `angle` that the bottom of the dial sits in.
 * Lies flat as printed: x along the block, y front to back, z up. `slot` = dial thickness + play.
 */
export function buildCradle(kit, { length, slot, angle }) {
  const depth = 36;
  const height = 14;
  const block = kit.own(kit.rrect(length, depth, 5).extrude(height));
  const cut = kit.own(
    kit.Manifold.cube([length + 2, slot, 30], true)
      .rotate([-angle, 0, 0])
      .translate([0, -4, height - 9 + 15]), // 9 mm deep
  );
  return kit.sub(block, cut);
}

/**
 * Wall bracket for a two-sided clock: wall plate with two screw holes, an arm out from the wall, and
 * a pad at its end with four holes (two per dial half). Built as printed, lying on its side.
 * depth = total clock depth (both halves); holes = x offsets of the dial-half screws.
 */
export function buildBracket(kit, { arm, depth, holeX, spread }) {
  const w = depth + 6; // the arm is as wide as the clock is deep
  const plate = kit.box(0, 5, 0, 90, 0, w);
  const bar = kit.box(0, arm, 80, 92, 0, w);
  const gusset = kit.own(
    kit.CrossSection.ofPolygons([
      [
        [5, 80],
        [5, 40],
        [45, 80],
      ],
    ])
      .extrude(8)
      .translate([0, 0, w / 2 - 4]),
  );
  let m = kit.union(plate, bar, gusset);
  // Countersunk wall screws through the plate (along x).
  for (const y of [20, 62]) {
    m = kit.sub(m, kit.move(kit.rot(kit.cyl(2.3, 12, 0, 0, -6), 0, 90, 0), 0, y, w / 2));
    m = kit.sub(
      m,
      kit.own(
        kit.Manifold.cylinder(2.6, 2.3, 4.6, 32)
          .rotate([0, 90, 0])
          .translate([2.4, y, w / 2]),
      ),
    );
  }
  // Clock screws down through the arm end (along y): one pair over each half's boss.
  for (const zc of [w / 2 - spread / 2, w / 2 + spread / 2])
    for (const dx of [-holeX, holeX]) {
      const x = arm - 12 + dx;
      m = kit.sub(
        m,
        kit.own(
          kit.Manifold.cylinder(20, 1.75, 1.75, 24).rotate([-90, 0, 0]).translate([x, 76, zc]),
        ),
      );
    }
  return m;
}

/** A small plate with the hand holes at −0.1 / 0 / +0.1 mm and the dial hole, to test the fit. */
export function buildCoupon(kit, mv) {
  let m = kit.own(kit.rrect(64, 26, 3).extrude(2.4).translate([32, 13, 0]));
  const holes = [];
  [-0.1, 0, 0.1].forEach((f, i) => {
    holes.push({ ring: holeRing(mv.hour + f), x: 8 + i * 10, y: 8 });
    holes.push({
      ring: holeRing(mv.minute + f, mv.minuteFlat ? mv.minuteFlat + f : 0),
      x: 8 + i * 10,
      y: 18,
    });
  });
  for (const hl of holes)
    m = kit.sub(m, kit.ext(kit.own(cs(kit, [hl.ring]).translate([hl.x, hl.y])), -1, 4));
  m = kit.sub(m, kit.cyl(mv.dialHole / 2, 4, 50, 13, -1));
  return m;
}
