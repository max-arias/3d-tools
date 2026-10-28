// Latch: a flat plate that slides in a channel and spans base and lid. Measured from Pred's
// GridfinityStorageBox_Latch. It prints face down; z is its thickness, y its length (y = 0 is
// the end with the T-tabs that ride in the channel's undercuts).
//
// The face that lies against the channel's back has a ladder of pockets: the channel's catches sit
// in them and the rungs between hook behind the catches. A detent strip on each side, freed above
// and below, springs in and out of the channel's undercuts.
export const LATCH = {
  w: 23.6, // across the T-tabs
  body: [2, 21.6], // x range of the plate (sits in the 20 mm channel with 0.2 clearance)
  len: 36.5,
  t: 7,
  tabs: { y1: 4.7, z0: 1.6, z1: 5.4, chamfer: 0.5 },
  windows: {
    x: [4.65, 18.95],
    slot: [10.6, 13],
    rows: [6.4, 11.6, 16.4, 21.6, 26.4, 31.6],
    z0: 2,
    chamfer: 1,
  },
  pull: { x: [4.3, 19.3], y0: 34, z0: 2, r: 2.2 }, // finger pull at the far end
  side: {
    slit: 0.45,
    from: 1,
    y: [23.4, 29.4],
    free: [23.6, 29.2],
    gap: 0.75,
    bump: 1,
    bumpY: 26.4,
    z: [1.75, 5.25],
  },
  edge: 0.5, // chamfer on the far end
};

// Near end, in plan: it dips in a shallow scoop between the tabs so a fingertip can lift it.
const NEAR_EDGE = [
  [0, 1.4],
  [2, 2.26],
  [4, 3.1],
  [6, 3.75],
  [8, 4],
  [15.6, 4],
  [17.6, 3.1],
  [19, 1.7],
  [19.85, 0],
  [LATCH.w, 0],
];

export function buildLatch(kit, tol = 0) {
  const L = LATCH;
  const [bx0, bx1] = [L.body[0] + tol / 2, L.body[1] - tol / 2];
  const near = NEAR_EDGE.map(([x, y]) => [x, y]);
  // Outline of the plate (without tabs): body width, scooped near edge, square far edge.
  const plate = kit.inter2d(
    kit.poly([...near, [L.w, L.len], [0, L.len]]),
    kit.rect(bx0, bx1, -1, L.len + 1),
  );
  let m = kit.chamferExt(plate, 0, L.t, 0, 0);
  // Chamfer the far end on both faces.
  const e = L.edge;
  const farCut = kit.poly([
    [L.len - e - 1, -1],
    [L.len + 1, -1],
    [L.len + 1, e + 1],
  ]);
  // Built in (y, z), extruded along x.
  const farBottom = kit.cabToXyz(kit.ext(farCut, -1, L.w + 1));
  const farTop = kit.move(kit.mirrorZ(farBottom), 0, 0, L.t);
  m = kit.sub(m, farBottom, farTop);

  // T-tabs either side at the near end, chamfered all round so they slide in.
  const tabPlan = kit.inter2d(
    kit.poly([...near, [L.w, L.tabs.y1], [0, L.tabs.y1]]),
    kit.csUnion(
      kit.rect(0 + tol / 2, bx0 + 0.01, -1, L.tabs.y1),
      kit.rect(bx1 - 0.01, L.w - tol / 2, -1, L.tabs.y1),
    ),
  );
  const c = L.tabs.chamfer;
  m = kit.union(m, kit.chamferExt(tabPlan, L.tabs.z0 + tol / 2, L.tabs.z1 - tol / 2, c, c));

  // Ladder pockets from z0 up, chamfered on the open face.
  const W = L.windows;
  const [r0, r1, r2, r3, r4, r5] = W.rows;
  const holes = kit.csUnion(
    kit.rect(W.x[0], W.x[1], r0, r1),
    kit.rect(W.x[0], W.x[1], r2, r3),
    kit.rect(W.x[0], W.x[1], r4, r5),
    kit.rect(W.slot[0], W.slot[1], r0, r5),
  );
  m = kit.sub(
    m,
    kit.ext(holes, W.z0, L.t - W.chamfer + 0.01),
    kit.chamferExt(kit.grow(holes, W.chamfer), L.t - W.chamfer, L.t + 1, W.chamfer, 0),
  );

  // Finger pull at the far end, open to the top face.
  const P = L.pull;
  const pull = kit.csUnion(
    kit.rect(P.x[0] + P.r, P.x[1] - P.r, P.y0, L.len + 1),
    kit.rect(P.x[0], P.x[1], P.y0 + P.r, L.len + 1),
    kit.circle(P.r, P.x[0] + P.r, P.y0 + P.r, 24),
    kit.circle(P.r, P.x[1] - P.r, P.y0 + P.r, 24),
  );
  m = kit.sub(m, kit.ext(pull, P.z0, L.t + 1));

  // Side detents: a bump on a strip that is freed by a slit behind it and cut away above and below.
  const S = L.side;
  const parts = [];
  const slits = [];
  for (const [edge, dir] of [
    [bx0, 1],
    [bx1, -1],
  ]) {
    const sx = edge + dir * (S.from + S.slit);
    const [x0, x1] = [Math.min(edge - dir, sx), Math.max(edge - dir, sx)];
    const [a, b] = [Math.min(edge + dir * S.from, sx), Math.max(edge + dir * S.from, sx)];
    slits.push(kit.box(a, b, S.y[0], S.y[1], S.z[0], S.z[1]));
    // Gaps above and below the strip, under a thin skin on each face.
    slits.push(
      kit.box(x0, x1, S.free[0], S.free[1], S.z[0] - S.gap, S.z[0]),
      kit.box(x0, x1, S.free[0], S.free[1], S.z[1], S.z[1] + S.gap),
    );
    parts.push(kit.ext(kit.circle(S.bump, edge, S.bumpY, 24), S.z[0], S.z[1]));
  }
  m = kit.sub(kit.union(m, ...parts), slits);
  return m;
}
