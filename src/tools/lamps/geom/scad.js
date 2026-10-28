// OpenSCAD export: an editable approximation. The profile is baked in as a sampled radius table,
// the ribs and the shell are rebuilt in OpenSCAD so wall, rib count and twist can be tweaked.
import { SOCKET_SPECS } from "../model/sockets.js";
import { profileCurve } from "./profile.js";

const f = (n) => +n.toFixed(3);

export function toScad(p) {
  const rows = 48;
  const curve = profileCurve(p.nodes);
  const table = Array.from({ length: rows + 1 }, (_, i) => f(curve(i / rows)));
  const spec = SOCKET_SPECS[p.holder.socket];
  const segs = Math.max(96, p.ribs.depth ? p.ribs.count * 8 : 0);
  const sp = p.holder.spokes;
  const waveExpr = {
    sine: "0.5 + 0.5 * cos(ph)",
    scallop: "abs(cos(ph / 2))",
    triangle: "1 - abs(((ph + 180) % 360 + 360) % 360 - 180) / 180",
  }[p.ribs.wave];

  return `// Lamp shade from 3D Tools (Lamps). All sizes in mm.
// An approximation of the downloaded STL: edit the numbers below and render.
height = ${f(p.height)};
wall = ${f(p.wall)};
rib_count = ${p.ribs.count};
rib_depth = ${f(p.ribs.depth)};
rib_twist = ${f(p.ribs.twist)};   // degrees over the full height
segments = ${segs};
holder = "${p.holder.at}";       // "none", "top" or "bottom"
hole = ${spec.hole};             // ${p.holder.socket} socket hole
hub = ${spec.ring};
plate = ${f(p.holder.plate)};
spokes = ${sp.count};
spoke_width = ${f(sp.width)};
spoke_rotation = ${f(sp.rotation)};

// Shade radius at ${rows + 1} evenly spaced heights, from the rim at z = 0 to the rim at z = height.
profile = [${table.join(", ")}];
rows = len(profile) - 1;

function wave(ph) = ${waveExpr};
function radius(i, a) =
  profile[i] + rib_depth * wave(rib_count * (a + rib_twist * i / rows));
function ring(i, r_off) = [for (j = [0 : segments - 1])
  let (a = 360 * j / segments, r = max(radius(i, a) - r_off, 0.5))
  [r * cos(a), r * sin(a), height * i / rows]];

module shell() {
  outer = [for (i = [0 : rows]) each ring(i, 0)];
  inner = [for (i = [0 : rows]) each ring(i, wall)];
  n = (rows + 1) * segments;
  pts = concat(outer, inner);
  side = [for (i = [0 : rows - 1], j = [0 : segments - 1])
    let (a = i * segments + j, b = i * segments + (j + 1) % segments,
         c = (i + 1) * segments + (j + 1) % segments, d = (i + 1) * segments + j)
    each [[a, d, c, b], [n + a, n + b, n + c, n + d]]];
  bottom = [for (j = [0 : segments - 1])
    [j, (j + 1) % segments, n + (j + 1) % segments, n + j]];
  t0 = rows * segments;
  top = [for (j = [0 : segments - 1])
    [t0 + j, n + t0 + j, n + t0 + (j + 1) % segments, t0 + (j + 1) % segments]];
  polyhedron(points = pts, faces = concat(side, bottom, top), convexity = 10);
}

module plate_2d() {
  difference() {
    union() {
      circle(d = hub, $fn = 96);
      for (k = [0 : spokes - 1])
        rotate(spoke_rotation + 360 * k / spokes)
          translate([hub / 4, -spoke_width / 2]) square([max(profile) + rib_depth, spoke_width]);
    }
    circle(d = hole, $fn = 96);
  }
}

// The shade's outside at the rib valleys, filled in and pulled in a hair, so the plate never pokes
// out of the wall (the STL trims it exactly; this is the simple version).
module outer_solid() {
  rotate_extrude($fn = 96)
    polygon(concat([[0, 0]],
      [for (i = [0 : rows]) [max(profile[i] - 0.25, 0.1), height * i / rows]],
      [[0, height]]));
}

module holder_plate() {
  z0 = holder == "top" ? height - plate : 0;
  intersection() {
    translate([0, 0, z0]) linear_extrude(plate) plate_2d();
    outer_solid();
  }
}

union() {
  shell();
  if (holder != "none") holder_plate();
}
`;
}
