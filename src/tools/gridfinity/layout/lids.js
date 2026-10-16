import { FOOT_H, GF, SOCKET_H } from "../constants.js";
import { binHeight } from "../model/effective.js";

/** Rails of a sliding lid, in mm: how far they reach in, how thick they are, and the gap under the rim. */
export const RAIL = { depth: 2, thick: 1.6, rimGap: 0.4 };

/** z levels (bin-local) of the sliding lid's channel: guide above, ledge below, lid between. */
export function slidingLevels(eff) {
  const H = binHeight(eff);
  const c = eff.lidFit;
  const guideTop = H - RAIL.rimGap;
  const guideBottom = guideTop - RAIL.thick;
  const lidTopZ = guideBottom - c;
  const lidBottomZ = lidTopZ - eff.lidThickness;
  const ledgeTop = lidBottomZ - c;
  return {
    guideTop,
    guideBottom,
    lidTop: lidTopZ,
    lidBottom: lidBottomZ,
    ledgeTop,
    ledgeBottom: ledgeTop - RAIL.thick,
  };
}

/** Lids that take over the top of the bin, so label tabs are left out. */
export const hidesLabelTab = (lid) => lid === "sliding" || lid === "hinged";

export const LID_TYPES = ["none", "dropin", "stackable", "sliding", "hinged"];

/** Lids that live inside or hang off the bin, so the bin must print as a single piece. */
export const needsSinglePiece = (lid) => lid === "sliding" || lid === "hinged";

/**
 * Height (bin-local z) of the lid's top face when it is fitted, or null when there is no lid
 * or the lid sits below the rim (sliding).
 */
export function lidTop(eff) {
  const t = eff.lidThickness;
  const H = binHeight(eff);
  switch (eff.lid) {
    case "dropin":
    case "hinged":
      return H + (eff.lip ? GF.lipH : 0) + t;
    case "stackable":
      // Feet sit in the stacking lip like a stacked bin; sockets are cut into the top.
      return H + 0.5 + FOOT_H + t + SOCKET_H;
    case "sliding": {
      // The lid sits below the rim; only a raised handle can poke out above it.
      const rise = eff.lidHandle === "knob" ? 5 : eff.lidHandle === "tab" ? 3 : 0;
      const top = slidingLevels(eff).lidTop + rise;
      return top > H ? top : null;
    }
    default:
      return null;
  }
}

/** Why a lid cannot be built for this bin as set up, or null when it can. */
export function lidProblem(eff, segmentCount) {
  if (eff.lid === "none") return null;
  if (needsSinglePiece(eff.lid) && segmentCount > 1) {
    return `A ${eff.lid} lid needs a bin that prints in one piece`;
  }
  if (eff.lid === "sliding" && slidingLevels(eff).ledgeBottom < FOOT_H + eff.floor + 1) {
    return "This bin is too short for a sliding lid";
  }
  if (
    eff.lid === "hinged" &&
    binHeight(eff) - HINGE.axisDown - HINGE.knuckleR < FOOT_H + eff.floor + 0.5
  ) {
    return "This bin is too short for a hinged lid";
  }
  if (eff.lid === "stackable" && !eff.lip)
    return "A stackable lid needs the stacking lip turned on";
  return null;
}

// ---- hinge ----------------------------------------------------------------------------------

export const HINGE = {
  axisIn: 3.5, // axis distance from the hinge wall's inner face
  axisDown: 3.4, // axis depth below the rim
  knuckleR: 2.9,
  pinD: 1.75, // 1.75 mm filament
  pinFit: 0.3,
  margin: 10, // hinge starts this far from the corners
  axialGap: 0.3, // between a post and the lid knuckle
  plateReach: 5.2, // the plate starts this far in front of the axis: far enough to swing over the wall top
  postReach: 2.4, // posts extend this far in front of the axis
};

/**
 * Hinge layout in the hinge wall's frame (u = distance in from the cell edge, a = along the wall):
 * two posts on the bin, one knuckle on the lid, and the pin between them.
 */
export function hingeSpec(eff, { gap, wall, H, L }) {
  const innerFace = gap + wall;
  const a0 = HINGE.margin;
  const a1 = L - HINGE.margin;
  const seg = (a1 - a0) / 3;
  const g = HINGE.axialGap;
  return {
    uAxis: innerFace + HINGE.axisIn,
    zAxis: H - HINGE.axisDown,
    holeR: (HINGE.pinD + HINGE.pinFit) / 2,
    postDepth: HINGE.axisIn + HINGE.postReach,
    innerFace,
    span: [a0, a1],
    posts: [
      [a0, a0 + seg - g],
      [a0 + 2 * seg + g, a1],
    ],
    knuckle: [a0 + seg + g, a0 + 2 * seg - g],
    plateStart: innerFace + HINGE.axisIn + HINGE.plateReach,
    pinLength: Math.floor(a1 - a0 - 1),
  };
}
