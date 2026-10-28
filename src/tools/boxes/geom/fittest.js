// Fit-test coupon: the front-left corner and the back-left hinge corner of a 4x3 box, cut from
// the real base and lid at the top of the base, so latch, hinge and stacking can be checked in an
// hour of printing instead of a full box. The parts are cut from the same builders, so a pass
// here means the full box fits too.
import { boxDims } from "./dims.js";
import { buildBase } from "./base.js";
import { buildLid } from "./lid.js";

export const COUPON = { grid: { x: 4, y: 3, u: 6 }, w: 62, d: 26, baseH: 24 };

/** Returns [{ name, m }] pieces, each moved so it sits on z = 0. */
export function buildCoupon(kit) {
  const d = boxDims(COUPON.grid);
  const base = buildBase(kit, d);
  const lid = buildLid(kit, d);
  const z0 = d.wallTop - COUPON.baseH;
  const { w, d: dd } = COUPON;
  const cut = (m, x0, y0, za, zb) => kit.inter(m, kit.box(x0, x0 + w, y0, y0 + dd, za, zb));
  const pieces = [
    { name: "base corner", m: cut(base, -1, -1, z0, d.baseH + 1), dz: -z0 },
    { name: "lid corner", m: cut(lid, -1, -1, -1, d.lidH + 1), dz: 0 },
    { name: "base hinge corner", m: cut(base, -1, d.D - dd + 1, z0, d.baseH + 1), dz: -z0 },
    { name: "lid hinge corner", m: cut(lid, -1, d.D - dd + 1, -1, d.lidH + 1), dz: 0 },
  ];
  return pieces.map((p) => ({ name: p.name, m: kit.move(p.m, 0, 0, p.dz) }));
}
