import { KEY } from "../constants.js";

// Key footprint as three rects [x0, x1, y0, y1] centred on the origin; x is the key's long axis.
function rects(grow = 0) {
  const nl = KEY.neckL / 2;
  const hw = KEY.headW / 2;
  const nw = KEY.neckW / 2;
  const reach = nl + KEY.headD;
  return [
    [-reach - grow, -nl + grow, -hw - grow, hw + grow], // head
    [nl - grow, reach + grow, -hw - grow, hw + grow], // head
    [-(nl + KEY.headD / 2), nl + KEY.headD / 2, -nw - grow, nw + grow], // neck
  ];
}

export const KEY_LENGTH = KEY.neckL + 2 * KEY.headD;

/** Slot cut into a baseplate from below: chamfered mouth, depth `h - stop`. Centred at the origin, long axis x. */
export function keySlot(kit, floor) {
  const depth = floor - KEY.stop;
  const parts = [];
  for (const [x0, x1, y0, y1] of rects()) {
    const c = KEY.chamfer;
    const mouth = kit.hull(
      kit.ext(kit.rect(x0 - c, x1 + c, y0 - c, y1 + c), -1, 0),
      kit.ext(kit.rect(x0, x1, y0, y1), c, c + 0.001),
    );
    parts.push(mouth, kit.ext(kit.rect(x0, x1, y0, y1), 0, depth));
  }
  return kit.union(parts);
}

/** H-key: slot footprint shrunk by `clearance` per side, standing from z=0 up to floor - stop - 0.2. */
export function makeKey(kit, { floor, clearance, taper = false, dimples = 0 }) {
  const height = floor - KEY.stop - 0.2;
  const parts = [];
  for (const [x0, x1, y0, y1] of rects(-clearance)) {
    if (taper) {
      parts.push(
        kit.hull(
          kit.ext(kit.rect(x0, x1, y0, y1), 0, 0.001),
          kit.ext(kit.rect(x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.05), height - 0.001, height),
        ),
      );
    } else {
      parts.push(kit.ext(kit.rect(x0, x1, y0, y1), 0, height));
    }
  }
  let key = kit.union(parts);
  if (dimples > 0) {
    // Fit-test marks: small pits across the key's neck-side heads, one to three of them.
    const pits = [];
    const pitch = 1.6;
    for (let i = 0; i < dimples; i++) {
      pits.push(kit.cyl(0.5, 0.6, (i - (dimples - 1) / 2) * pitch, 0, height - 0.4));
    }
    key = kit.sub(key, ...pits);
  }
  return key;
}

/** Clip profile in the XZ plane (x across the seam, z up). `cl` is the fit clearance. */
export function clipProfile(cl) {
  const n = 1 + cl;
  const r = 1.3 + cl;
  return [
    [-2.15, 0.7],
    [-n, 0.7],
    [-n, 1.1],
    [-r, 1.5],
    [-r, 2.3],
    [r, 2.3],
    [r, 1.5],
    [n, 1.1],
    [n, 0.7],
    [2.15, 0.7],
    [2.15, 2.5],
    [0, 4.65],
    [-2.15, 2.5],
  ];
}

const CLIP_LEN = 20;
const SEAT_W = 6;

/** The clip: a cap with a dovetail groove underneath, long axis along y, centred on the origin. */
export function makeClip(kit, clearance) {
  const prism = kit.poly(clipProfile(clearance).map(([x, z]) => [x, z]));
  const len = CLIP_LEN - 2 * clearance;
  // CrossSection lives in XY; extrude along z then stand it up so (x, z) is the profile and y is the length.
  const solid = kit.ext(prism, 0, len);
  const upright = kit.rot(solid, 90, 0, 0); // y -> z, z -> -y
  return kit.move(upright, 0, len / 2, 0);
}

/** Pocket cut into the tiles around a seam: removes the ridge above z=0.7 but leaves a dovetail tongue for the clip. */
export function clipSeat(kit) {
  const cube = kit.box(-SEAT_W / 2, SEAT_W / 2, -CLIP_LEN / 2 - 1, CLIP_LEN / 2 + 1, 0.7, 12);
  const tongue2d = kit.poly([
    [-1, 0.7],
    [1, 0.7],
    [1, 1.1],
    [1.3, 1.5],
    [1.3, 2.3],
    [-1.3, 2.3],
    [-1.3, 1.5],
    [-1, 1.1],
  ]);
  const tongue = kit.move(
    kit.rot(kit.ext(tongue2d, 0, CLIP_LEN + 2), 90, 0, 0),
    0,
    (CLIP_LEN + 2) / 2,
    0,
  );
  return kit.sub(cube, tongue);
}
