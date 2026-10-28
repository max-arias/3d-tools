// Front handle and its pins. The handle is a U, 7 x 7 in section with 1 mm chamfers, that hangs
// from M3 bolts (or printed pins) through the boss pairs; measured from Pred's 5xy handle.
export const HANDLE = { t: 7, h: 30, holeZ: 26.5, holeD: 3.5, outerR: 10, innerR: 3, chamfer: 1 };
export const PIN = { d: 2.9, len: 17, headD: 5.2, headL: 2.5, flat: 0.3 };

/** Handle lying flat as it prints: x along the grip, y up the arms, z its 7 mm thickness. */
export function buildHandle(kit, len) {
  const H = HANDLE;
  const t = H.t;
  const outer = kit.csUnion(
    kit.move2(kit.rrect(len, 2 * H.outerR + 2, H.outerR), len / 2, H.outerR + 1),
    kit.rect(0, len, H.outerR, H.holeZ),
    kit.circle(t / 2, t / 2, H.holeZ, 48),
    kit.circle(t / 2, len - t / 2, H.holeZ, 48),
    kit.rect(0, t, H.holeZ - 1, H.holeZ),
    kit.rect(len - t, len, H.holeZ - 1, H.holeZ),
  );
  const clip = kit.rect(0, len, 0, H.h);
  const inner = kit.move2(kit.rrect(len - 2 * t, 2 * (H.h - t), H.innerR), len / 2, H.h);
  const plan = kit.inter2d(kit.csSub(outer, inner), clip);
  let m = kit.chamferExt(plan, 0, t, H.chamfer, H.chamfer, 0.2);
  for (const x of [t / 2, len - t / 2]) {
    m = kit.sub(m, kit.ext(kit.circle(H.holeD / 2, x, H.holeZ, 32), -1, t + 1));
  }
  return m;
}

/** Printed pin for one side: a D-shaped shank (flat side down) with a round head. */
export function buildPin(kit) {
  const P = PIN;
  const shank = kit.csSub(
    kit.circle(P.d / 2, 0, 0, 32),
    kit.rect(-P.d, P.d, -P.d, -P.d / 2 + P.flat),
  );
  const head = kit.csSub(
    kit.circle(P.headD / 2, 0, 0, 32),
    kit.rect(-P.headD, P.headD, -P.headD, -P.d / 2 + P.flat),
  );
  // Sketched across the pin (y, z), extruded along x.
  const m = kit.union(
    kit.cabToXyz(kit.ext(shank, 0, P.len)),
    kit.cabToXyz(kit.ext(head, -P.headL, 0.01)),
  );
  return m;
}
