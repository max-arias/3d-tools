// Hinge: two leaves on one axle, measured from Pred's gridfinitystoragebox_hinge (printed in
// place, standing up, flat open). z runs along the axle (31.6 long). One leaf drops into the
// base's pocket, the other into the lid's; snap bumps on each leaf click into the pocket windows.
//
// "pin": the base half's knuckle turns on a pin that is part of the lid half (print in place).
// "screw": both halves are bored for an M3 x 30 bolt and nut and print as two parts.
export const HINGE_PART = {
  len: 31.6,
  axis: [8.88, 3.5],
  knuckleR: 3.5,
  pinR: 2,
  boreR: 2.25, // pin 4.0 in a 4.5 bore
  gap: 0.38, // radial clearance around the other half's knuckles
  // Lid half: outer knuckles; base half: the middle one.
  outer: [
    [0, 10.5],
    [21.3, 31.6],
  ],
  middle: [10.8, 20.8],
  leaf: { x: [1.3, 2.9], y: [3.65, 11.2], tip: 0.8 },
  web: [
    [2.3, 3.65],
    [4.51, 3.65],
    [5.06, 4.15],
    [4.02, 6],
    [2.9, 7.12],
  ],
  bumps: {
    z: [
      [5, 10.8],
      [21, 26.8],
    ],
    y: [6.8, 8.8],
    tip: [7.6, 8.0],
  },
  chamfer: 0.4,
  screw: { r: 1.7, headR: 3, headH: 3, nutR: 3.2, nutH: 2.5 },
};

/** Leaf, web and snap bumps of the base half, in plan; the lid half is its mirror. */
function leafPlan(kit) {
  const H = HINGE_PART;
  const [x0, x1] = H.leaf.x;
  const [y0, y1] = H.leaf.y;
  const t = H.leaf.tip;
  return kit.csUnion(
    kit.poly([
      [x0, y0 + 1],
      [x0 + 1, y0],
      [x1, y0],
      [x1, y1],
      [(x0 + x1) / 2, y1 + t],
      [x0, y1],
    ]),
    kit.poly(H.web),
  );
}

function bump(kit) {
  const H = HINGE_PART;
  const x0 = H.leaf.x[0];
  return kit.poly([
    [x0 + 0.05, H.bumps.y[0]],
    [0, H.bumps.tip[0]],
    [0, H.bumps.tip[1]],
    [x0 + 0.05, H.bumps.y[1]],
  ]);
}

function along(kit, cs, z0, z1, c = 0) {
  return kit.chamferExt(cs, z0, z1, c, c, 0.2);
}

/** Returns { base, lid } halves, already placed together as they print. */
export function buildHinge(kit, type = "pin", tol = 0) {
  const H = HINGE_PART;
  const [ax, ay] = H.axis;
  const c = H.chamfer;
  const knuckle = kit.circle(H.knuckleR, ax, ay, 48);
  const clear = kit.circle(H.knuckleR + H.gap + tol, ax, ay, 48);
  const leaf = leafPlan(kit);

  // Base half: leaf full length, kept clear of the lid's knuckles; middle knuckle with a bore.
  const [m0, m1] = H.middle;
  const baseParts = [
    kit.sub(along(kit, leaf, 0, H.len, c), kit.ext(clear, -1, m0), kit.ext(clear, m1, H.len + 1)),
  ];
  const ring = kit.csUnion(knuckle, kit.rect(H.leaf.x[1] - 0.6, ax, H.leaf.y[0], 6));
  baseParts.push(along(kit, ring, m0, m1, c));
  for (const [z0, z1] of H.bumps.z) baseParts.push(along(kit, bump(kit), z0, z1, 0.6));
  let base = kit.union(baseParts);
  const boreR = type === "screw" ? H.screw.r : H.boreR + tol / 2;
  base = kit.sub(base, kit.cyl(boreR, H.len + 2, ax, ay, -1));

  // Lid half: mirror image across the axle, outer knuckles, and the pin through the middle.
  const mirror = (m) => kit.move(kit.mirrorX(m), 2 * ax, 0, 0);
  const lidParts = [
    kit.sub(mirror(along(kit, leaf, 0, H.len, c)), kit.ext(clear, m0 - H.gap, m1 + H.gap)),
  ];
  const lugs = kit.csUnion(knuckle, kit.rect(ax, 2 * ax - H.leaf.x[1] + 0.6, H.leaf.y[0], 6));
  for (const [z0, z1] of H.outer) lidParts.push(along(kit, lugs, z0, z1, c));
  for (const [z0, z1] of H.bumps.z) lidParts.push(mirror(along(kit, bump(kit), z0, z1, 0.6)));
  if (type === "pin")
    lidParts.push(
      kit.cyl(H.pinR - tol / 2, H.outer[1][0] - H.outer[0][1] + 0.2, ax, ay, H.outer[0][1] - 0.1),
    );
  let lid = kit.union(lidParts);
  if (type === "screw") {
    const S = H.screw;
    lid = kit.sub(
      lid,
      kit.cyl(S.r, H.len + 2, ax, ay, -1),
      kit.cyl(S.headR, S.headH + 1, ax, ay, -1),
      kit.move(
        kit.own(kit.Manifold.cylinder(S.nutH + 1, S.nutR, S.nutR, 6)),
        ax,
        ay,
        H.len - S.nutH,
      ),
    );
  }
  return { base, lid };
}
