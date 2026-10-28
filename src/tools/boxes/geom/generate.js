// Project -> printable parts. Each part is one print job item: its bodies (a second body prints in
// a second colour), how many to print, and print notes taken from Pred's instructions.
import { boxDims, HINGE as POCKET, LABEL, RECESS, RAIL } from "./dims.js";
export { LATCH_COUNTS } from "./dims.js";
import { buildBase } from "./base.js";
import { buildLid } from "./lid.js";
import { buildLatch } from "./latch.js";
import { buildHinge } from "./hinge.js";
import { buildHandle, buildPin } from "./handle.js";
import { buildLabel } from "./label.js";
import { LATCH } from "./latch.js";
import { HANDLE } from "./handle.js";
import { binKey, binOrigin, buildBin, gridfinityProject } from "./bins.js";

export const PRINT = {
  big: { layer: 0.3, walls: 2, infill: 15, note: "base_lid" },
  small: { layer: 0.2, walls: 3, infill: 100, note: "small" },
  bin: { layer: 0.2, walls: 2, infill: 15, note: "bin" },
};

/** Column-major 4x4 matrix (three.js order) from a 3x3 rotation given by rows, and a translation. */
const mat = (r, t) => [
  r[0][0],
  r[1][0],
  r[2][0],
  0,
  r[0][1],
  r[1][1],
  r[2][1],
  0,
  r[0][2],
  r[1][2],
  r[2][2],
  0,
  t[0],
  t[1],
  t[2],
  1,
];
const I = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Which channels get latches: the front pair first, then the back pair on each side. */
function latchSpots(d, n) {
  const spots = d.rails.front.map((at) => ["front", at]);
  if (n >= 4) spots.push(["left", d.rails.side[1]], ["right", d.rails.side[1]]);
  if (n >= 6) spots.push(["left", d.rails.side[0]], ["right", d.rails.side[0]]);
  return spots.slice(0, n);
}

/**
 * Where each part sits on the closed box, for the 3D view: [{ id, matrix }]. Latches hang in their
 * channels with the pockets on the catches, the label stands on its shelf, the handle hangs down.
 */
function scene(d, parts, project) {
  const H = d.wallTop;
  const out = [
    { id: "base", matrix: mat(I, [0, 0, 0]) },
    { id: "lid", matrix: mat(I, [0, 0, H]) },
  ];
  const lc = (LATCH.body[0] + LATCH.body[1]) / 2;
  const z0 = H - 26.45;
  for (const [wall, at] of latchSpots(d, project.latches ?? 2)) {
    const c = at + RAIL.w / 2;
    if (wall === "front")
      out.push({
        id: "latch",
        matrix: mat(
          [
            [-1, 0, 0],
            [0, 0, 1],
            [0, 1, 0],
          ],
          [c + lc, 0.25, z0],
        ),
      });
    if (wall === "left")
      out.push({
        id: "latch",
        matrix: mat(
          [
            [0, 0, 1],
            [1, 0, 0],
            [0, 1, 0],
          ],
          [0.25, c - lc, z0],
        ),
      });
    if (wall === "right")
      out.push({
        id: "latch",
        matrix: mat(
          [
            [0, 0, -1],
            [-1, 0, 0],
            [0, 1, 0],
          ],
          [d.W - 0.25, c + lc, z0],
        ),
      });
  }
  const lb = d.label;
  out.push({
    id: "label",
    matrix: mat(
      [
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ],
      [lb.slotX0 + LABEL.slack / 2, RECESS, lb.z0],
    ),
  });
  if (parts.some((p) => p.id === "handle")) {
    out.push({
      id: "handle",
      matrix: mat(
        [
          [1, 0, 0],
          [0, 0, -1],
          [0, 1, 0],
        ],
        [d.bosses[1][1] + 0.25, HANDLE.t + 0.25, d.pivotZ - HANDLE.holeZ],
      ),
    });
  }
  for (const b of project.bins ?? [])
    out.push({ id: `bin:${binKey(b)}`, matrix: mat(I, binOrigin(b)) });
  return out;
}

function body(kit, m, name, origin = null) {
  const e = kit.export(m, origin);
  return {
    name,
    mesh: e.mesh,
    size: e.size,
    triangles: e.triangles,
    volume: e.volume,
    valid: e.valid,
  };
}

function part(id, kind, bodies, qty, print, extra = {}) {
  const size = [0, 1, 2].map((k) => Math.max(...bodies.map((b) => b.size[k])));
  return {
    id,
    kind,
    qty,
    bodies,
    size,
    volume: bodies.reduce((a, b) => a + b.volume, 0),
    valid: bodies.every((b) => b.valid),
    print,
    ...extra,
  };
}

/**
 * Every part of the box for `project`. `font` (Inter Bold JSON) is needed only for label text.
 * Returns { dims, parts, issues }.
 */
export function generateBox(kit, project, font = null) {
  const d = boxDims(project.grid);
  const tol = project.fit?.tolerance ?? 0;
  const parts = [];
  const issues = [];
  parts.push(part("base", "base", [body(kit, buildBase(kit, d), "base")], 1, PRINT.big));
  parts.push(part("lid", "lid", [body(kit, buildLid(kit, d), "lid")], 1, PRINT.big));
  parts.push(
    part(
      "latch",
      "latch",
      [body(kit, buildLatch(kit, tol), "latch")],
      project.latches ?? 2,
      PRINT.small,
    ),
  );
  const hinge = buildHinge(kit, project.hinge ?? "pin", tol);
  // Both halves print together as one item (in place for the pin hinge).
  parts.push(
    part("hinge", "hinge", [body(kit, kit.union(hinge.base, hinge.lid), "hinge")], 2, PRINT.small, {
      type: project.hinge ?? "pin",
    }),
  );
  const label = buildLabel(kit, d, font, project.label?.title ?? "", project.label?.lines ?? []);
  issues.push(...label.issues.map((i) => ({ kind: "label", ...i })));
  // The plate and its text share one origin so the text stays where it was laid out.
  const plateMin = label.plate.boundingBox().min;
  const labelBodies = [body(kit, label.plate, "label", plateMin)];
  if (label.text) labelBodies.push(body(kit, label.text, "label text", plateMin));
  parts.push(part("label", "label", labelBodies, 1, PRINT.small));
  if (project.handle?.on ?? true) {
    parts.push(
      part(
        "handle",
        "handle",
        [body(kit, buildHandle(kit, d.handle.len), "handle")],
        1,
        PRINT.small,
      ),
    );
    if ((project.handle?.fix ?? "bolt") === "pin") {
      parts.push(part("pin", "pin", [body(kit, buildPin(kit), "pin")], 2, PRINT.small));
    }
  }
  // Bins: one part per distinct bin, printed as many times as the layout has it.
  const bins = project.bins ?? [];
  if (bins.length) {
    const gp = gridfinityProject(d, bins);
    const groups = new Map();
    for (const b of bins) {
      const k = binKey(b);
      if (!groups.has(k)) groups.set(k, { bin: b, qty: 0 });
      groups.get(k).qty++;
    }
    for (const [k, { bin, qty }] of groups) {
      parts.push(
        part(
          `bin:${k}`,
          "bin",
          [body(kit, buildBin(kit, gp, bin), `bin ${bin.w}x${bin.d}`)],
          qty,
          PRINT.bin,
          { bin: { w: bin.w, d: bin.d, u: d.grid.u } },
        ),
      );
    }
  }
  return { dims: d, parts, issues, scene: scene(d, parts, project), pocket: POCKET.len };
}
