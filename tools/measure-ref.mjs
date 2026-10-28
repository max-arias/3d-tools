// Compare our storage-box parts with Pred's reference files, slice by slice.
//   node tools/measure-ref.mjs <ref-dir> [size ...]      e.g. 5x4x6 7x6x15
// <ref-dir> is the unzipped "gridfinity-storage-box-by-pred-now-parametric-model_files" folder
// (Printables 543553). For each size it slices our base and lid and the reference at the same
// planes and prints the area that differs (the symmetric difference), plus the largest blobs of
// difference with their bounding boxes, so a mismatch points at the feature that causes it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import Module from "manifold-3d";
import { createKit } from "../src/tools/boxes/lib/kit.js";
import { boxDims } from "../src/tools/boxes/geom/dims.js";
import { buildBase } from "../src/tools/boxes/geom/base.js";
import { buildLid } from "../src/tools/boxes/geom/lid.js";
import { buildLatch } from "../src/tools/boxes/geom/latch.js";
import { buildHinge } from "../src/tools/boxes/geom/hinge.js";

const [refDir, ...sizes] = process.argv.slice(2);
if (!refDir) {
  console.error("usage: node tools/measure-ref.mjs <ref-dir> [XxYxU ...]");
  process.exit(2);
}
const wasm = await Module();
wasm.setup();
const { Manifold, Mesh, CrossSection } = wasm;

/** All bodies of a 3MF as one solid, in their shared coordinates moved to start at 0. */
function load3mf(path) {
  const zip = unzipSync(readFileSync(path));
  const key = Object.keys(zip).find((k) => /^3D\/.*\.model$/i.test(k));
  const xml = strFromU8(zip[key]);
  const v = [];
  const t = [];
  // Vertex indices restart in every <object>; offset them so all bodies share one array.
  for (const obj of xml.matchAll(/<object [\s\S]*?<\/object>/g)) {
    const base = v.length / 3;
    for (const m of obj[0].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g))
      v.push(+m[1], +m[2], +m[3]);
    for (const m of obj[0].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g))
      t.push(base + +m[1], base + +m[2], base + +m[3]);
  }
  const lo = [Infinity, Infinity, Infinity];
  for (let i = 0; i < v.length; i += 3)
    for (let k = 0; k < 3; k++) lo[k] = Math.min(lo[k], v[i + k]);
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) v[i + k] -= lo[k];
  return new Manifold(
    new Mesh({ numProp: 3, vertProperties: Float32Array.from(v), triVerts: Uint32Array.from(t) }),
  );
}

/**
 * Slicer for m: section(axis, value) in 2D coordinates (x,y) for z, (y,z) for x, (x,z) for y.
 * The turned copies are made once and freed by done().
 */
function slicer(m) {
  const turned = {};
  const turn = (axis) =>
    (turned[axis] ??=
      axis === "x"
        ? m.warp((p) => ([p[0], p[1], p[2]] = [p[1], p[2], p[0]]))
        : m.warp((p) => ([p[0], p[1], p[2]] = [p[0], p[2], -p[1]])));
  return {
    section: (axis, value) =>
      axis === "z" ? m.slice(value) : turn(axis).slice(axis === "x" ? value : -value),
    done: () => Object.values(turned).forEach((t) => t.delete()),
  };
}

/** Build a part, copy it out of the kit and free every intermediate (they add up in WASM). */
function built(fn, d) {
  const kit = createKit(wasm);
  try {
    return new Manifold(fn(kit, d).getMesh());
  } finally {
    kit.free();
  }
}

function compare(label, ours, ref, planes) {
  let worst = 0;
  const lines = [];
  const so = slicer(ours);
  const sr = slicer(ref);
  for (const [axis, at] of planes) {
    // Stay off exact feature heights: a plane through a face can trip the WASM slicer.
    const value = at + 0.013;
    const a = so.section(axis, value);
    const b = sr.section(axis, value);
    const d1 = CrossSection.difference([a, b]);
    const d2 = CrossSection.difference([b, a]);
    const xor = CrossSection.union([d1, d2]);
    const area = xor.area();
    worst = Math.max(worst, area);
    // Blobs from the outlines in JS (CrossSection.decompose can crash on big sections).
    const blobs = xor
      .toPolygons()
      .map((poly) => {
        let a2 = 0;
        const min = [Infinity, Infinity];
        const max = [-Infinity, -Infinity];
        poly.forEach(([px, py], i) => {
          const [qx, qy] = poly[(i + 1) % poly.length];
          a2 += px * qy - qx * py;
          min[0] = Math.min(min[0], px);
          min[1] = Math.min(min[1], py);
          max[0] = Math.max(max[0], px);
          max[1] = Math.max(max[1], py);
        });
        return { a: Math.abs(a2 / 2), b: { min, max } };
      })
      .filter((c) => c.a > 0.5)
      .sort((p, q) => q.a - p.a)
      .slice(0, Number(process.env.BLOBS || 4))
      .map(
        ({ a, b }) =>
          `${a.toFixed(1)}@[${b.min.map((n) => n.toFixed(1))}..${b.max.map((n) => n.toFixed(1))}]`,
      );
    lines.push(
      `  ${axis}=${at}: diff ${area.toFixed(1)} mm2 (ours ${a.area().toFixed(0)}, ref ${b.area().toFixed(0)}) ${blobs.join(" ")}`,
    );
    for (const o of [a, b, d1, d2, xor]) o.delete();
  }
  so.done();
  sr.done();
  ref.delete();
  ours.delete();
  console.log(`${label}: worst slice diff ${worst.toFixed(1)} mm2`);
  for (const l of lines) console.log(l);
}

const all = [];
for (const dir of readdirSync(refDir)) {
  const m = dir.match(/^Parametric V1 - (\d+)x(\d+)$/);
  if (!m) continue;
  for (const f of readdirSync(join(refDir, dir))) {
    const b = f.match(/_(\d+)x(\d+)x(\d+)u_base\.3mf$/);
    if (b)
      all.push({
        x: +b[1],
        y: +b[2],
        u: +b[3],
        base: join(refDir, dir, f),
        lid: join(refDir, dir, f.replace(/x\d+u_base/, "_lid")),
      });
  }
}
const common = join(refDir, "Parametric V1 - Common Files and F3D");
const small = (fn) =>
  built((kit) => {
    const m = fn(kit);
    return m.translate(m.boundingBox().min.map((n) => -n));
  });
compare(
  "latch",
  small((kit) => buildLatch(kit)),
  load3mf(join(common, "GridfinityStorageBox_Latch.3mf")),
  [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5].map((z) => ["z", z]),
);
compare(
  "hinge",
  small((kit) => {
    const h = buildHinge(kit, "pin");
    return kit.union(h.base, h.lid);
  }),
  load3mf(join(common, "gridfinitystoragebox_hinge.3mf")),
  [0.3, 5, 8, 10.6, 15, 21, 24, 31.3].map((z) => ["z", z]),
);

const want = sizes.length ? sizes : ["5x4x6"];
for (const s of want) {
  const [x, y, u] = s.split("x").map(Number);
  const r = all.find((e) => e.x === x && e.y === y && e.u === u);
  if (!r) {
    console.error(`no reference for ${s}`);
    continue;
  }
  const d = boxDims({ x, y, u });
  const H = d.wallTop;
  const zs = [
    0.3,
    0.8,
    2,
    3,
    4.5,
    6,
    13.5,
    20,
    27.5,
    35.5,
    H - 7.5,
    H - 5.6,
    H - 3,
    H - 1,
    H + 0.5,
    H + 1.5,
  ];
  const front = [31, d.W / 2, d.bosses[0][0] + 2.5, d.bosses[1][0] + 2.5];
  const side = [4, 25, 30, d.D / 2];
  const back = [30, 38, d.W / 2];
  compare(`${s} base`, built(buildBase, d), load3mf(r.base), [
    ...zs.map((z) => ["z", z]),
    ...front.map((v) => ["x", v]),
    ...side.map((v) => ["y", v]),
    ...back.map((v) => ["x", v]),
  ]);
  compare(`${s} lid`, built(buildLid, d), load3mf(r.lid), [
    ...[0.3, 1, 2, 3, 4.5, 6, 8, 9.5, 10.5, 11.3].map((z) => ["z", z]),
    ...[31, 52, d.W / 2].map((v) => ["x", v]),
    ...[4, 30, d.D / 2].map((v) => ["y", v]),
  ]);
}
