// Gridfinity geometry constants, in mm. Shared by layout and geometry code.
export const GF = { pitch: 42, heightUnit: 7, binGap: 0.25, lipH: 4.4 };

// Profiles are rows of [z, inset from the cell edge, corner radius].
export const BASE_SOCKET = [
  [0, 2.85, 1.15],
  [0.7, 2.15, 1.85],
  [2.5, 2.15, 1.85],
  [4.65, 0, 4],
];
export const BIN_FOOT = [
  [0, 3.31, 0.69],
  [0.8, 2.51, 1.49],
  [2.6, 2.51, 1.49],
  [4.75, 0.25, 3.75],
];
export const SOCKET_H = 4.65;
export const FOOT_H = 4.75;
export const BIN_R = 3.75;
// Stacking lip rows: [dz above (H + 0.5), inset]
export const LIP = [
  [0, 2.6],
  [0.7, 1.9],
  [2.5, 1.9],
  [4.65, -0.25],
];
export const LIP_INSET0 = 2.6;

// Baseplate floor thickness below the sockets, by style.
export const FLOOR_H = { thin: 0, skeleton: 3, weighted: 6.75 };
export const THIN_MAGNET_FLOOR = 3;
export const SKEL_INSET = 5.5;

export const KEY = { headW: 6, headD: 2, neckW: 3, neckL: 4, chamfer: 0.5, stop: 0.6 };
export const TAPE = { w: 3, l: 20, d: 0.6 };
export const RIB = { w: 0.8, h: 4.45 };

/** Distance from a cell centre to its corner magnets. */
export const magnetOffset = (pitch) => Math.min(13, pitch / 2 - 7.5);

/** Thin plates have no floor to hold H-keys, so they print as skeletonized when keys are on. */
export const effectiveStyle = (bp) => (bp.style === "thin" && bp.keys ? "skeleton" : bp.style);

/** Baseplate floor height for a project (thin with magnets gets small corner pads on a 3 mm floor). */
export function floorHeight(bp) {
  const style = effectiveStyle(bp);
  if (style === "thin" && bp.magnets) return THIN_MAGNET_FLOOR;
  return FLOOR_H[style];
}
