import { expect, test } from "vite-plus/test";
import {
  packArt,
  reduceShapes,
  ringArea,
  simplifyRing,
  traceImage,
} from "../src/tools/tapas/lib/trace.js";

/** RGBA image filled with `bg`, then rectangles [x0, y0, x1, y1, [r, g, b]]. */
function image(w, h, bg, rects) {
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, c, a = 255) => data.set([c[0], c[1], c[2], a], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, bg ?? [0, 0, 0], bg ? 255 : 0);
  for (const [x0, y0, x1, y1, c] of rects)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, c);
  return data;
}
const bbox = (rings) => {
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

test("a dark square with a hole traces to an outer ring and a hole at the right place", () => {
  const data = image(
    40,
    40,
    [255, 255, 255],
    [
      [10, 10, 30, 30, [0, 0, 0]],
      [16, 16, 24, 24, [255, 255, 255]],
    ],
  );
  const [layer] = traceImage(data, 40, 40, { n: 1, thr: 128, inv: false });
  const rings = layer.shapes[0].rings;
  expect(rings).toHaveLength(2);
  const areas = rings.map((r) => Math.abs(ringArea(r))).sort((a, b) => b - a);
  expect(areas[0]).toBeGreaterThan(330); // outer ~ 20 x 20, minus the smoothing at the corners
  expect(areas[0]).toBeLessThan(410);
  expect(areas[1]).toBeGreaterThan(40); // hole ~ 8 x 8
  expect(areas[1]).toBeLessThan(80);
  const [x0, y0, x1, y1] = bbox(rings);
  expect(x0).toBeCloseTo(10, 0);
  expect(y1).toBeCloseTo(30, 0);
  expect(x1 - x0).toBeCloseTo(20, 0);
  expect(y1 - y0).toBeCloseTo(20, 0);
});

test("three coloured bars become three layers and the white background is dropped", () => {
  const data = image(
    60,
    30,
    [255, 255, 255],
    [
      [4, 4, 16, 26, [220, 30, 30]],
      [24, 4, 36, 26, [30, 160, 60]],
      [44, 4, 56, 26, [40, 70, 200]],
    ],
  );
  const layers = traceImage(data, 60, 30, { n: 4, thr: 128, inv: false, bg: true });
  expect(layers).toHaveLength(3);
  const colours = layers.map((l) => l.color).sort();
  expect(colours.some((c) => parseInt(c.slice(1, 3), 16) > 180)).toBe(true); // red
  expect(colours.some((c) => parseInt(c.slice(5, 7), 16) > 150)).toBe(true); // blue
});

test("keeping the background gives it a layer of its own", () => {
  const data = image(40, 20, [255, 255, 255], [[10, 5, 30, 15, [0, 0, 0]]]);
  expect(traceImage(data, 40, 20, { n: 2, thr: 128, inv: false, bg: false })).toHaveLength(2);
  expect(traceImage(data, 40, 20, { n: 2, thr: 128, inv: false, bg: true })).toHaveLength(1);
});

test("transparent pixels are never ink", () => {
  const data = image(30, 30, null, [[8, 8, 22, 22, [10, 10, 10]]]);
  const [layer] = traceImage(data, 30, 30, { n: 1, thr: 128, inv: false });
  expect(layer.shapes[0].rings).toHaveLength(1);
  const [x0, , x1] = bbox(layer.shapes[0].rings);
  expect(x1 - x0).toBeCloseTo(14, 0);
});

test("simplifying keeps the shape and removes points", () => {
  const circle = Array.from({ length: 360 }, (_, i) => [
    50 + 40 * Math.cos((i * Math.PI) / 180),
    50 + 40 * Math.sin((i * Math.PI) / 180),
  ]);
  const simple = simplifyRing(circle, 0.6);
  expect(simple.length).toBeLessThan(80);
  expect(Math.abs(ringArea(simple))).toBeGreaterThan(Math.abs(ringArea(circle)) * 0.98);
});

test("the point budget is respected", () => {
  const wiggly = Array.from({ length: 5000 }, (_, i) => [i + (i % 2) * 3, (i % 7) * 2]);
  const closed = [...wiggly, [5000, 100], [0, 100]];
  const out = reduceShapes([{ rule: "e", rings: [closed] }], 1, 400);
  expect(out.flatMap((s) => s.rings).reduce((n, r) => n + r.length, 0)).toBeLessThanOrEqual(400);
});

test("packing keeps the aspect ratio and fits 0..4095", () => {
  const art = packArt(
    [
      {
        color: "#aa0000",
        shapes: [
          {
            rule: "e",
            rings: [
              [
                [10, 10],
                [110, 10],
                [110, 60],
                [10, 60],
              ],
            ],
          },
        ],
      },
    ],
    "raster",
  );
  expect(art.w).toBe(4095);
  expect(art.h).toBe(2048);
  expect(art.layers[0].s[0].p[0]).toEqual([0, 0, 4095, 0, 4095, 2048, 0, 2048]);
  expect(packArt([], "svg")).toBeNull();
});

import Module from "manifold-3d";
import { beforeAll } from "vite-plus/test";
import { createKit } from "../src/tools/tapas/lib/kit.js";
import { generateOverlay } from "../src/tools/tapas/geom/overlay.js";
import { generateFrame } from "../src/tools/tapas/geom/frame.js";
import { generateTapa } from "../src/tools/tapas/geom/tapa.js";
import {
  PATTERN_MODES,
  defaultProject,
  sanitize,
  sanitizeArt,
} from "../src/tools/tapas/model/project.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const build = (fn, p) => {
  const kit = createKit(wasm);
  try {
    return fn(kit, p);
  } finally {
    kit.free();
  }
};

// Three coloured bars traced from an image, then used as the design.
const art = () => {
  const data = image(
    90,
    60,
    [255, 255, 255],
    [
      [6, 6, 26, 54, [220, 30, 30]],
      [34, 6, 54, 54, [30, 160, 60]],
      [62, 6, 84, 54, [40, 70, 200]],
    ],
  );
  return packArt(traceImage(data, 90, 60, { n: 4, thr: 128, inv: false, bg: true }), "raster", {
    n: 4,
    thr: 128,
    inv: false,
    bg: true,
  });
};
const withArt = (mode, extra = {}) => {
  const p = defaultProject();
  p.pattern = { ...p.pattern, id: "image", mode, size: 50, margin: 3, ...extra };
  p.art = art();
  p.groups = [["ciego", "ciego", "ciego"]]; // no windows: all of the face is free for the image
  return sanitize(p);
};

test("an uploaded image with three colours prints as three bodies plus the plate", () => {
  const part = build(generateOverlay, withArt("inlay"));
  expect(part.valid).toBe(true);
  expect(part.bodies).toHaveLength(4);
  expect(part.bodies.slice(1).map((b) => b.name)).toEqual(["patron_1", "patron_2", "patron_3"]);
  expect(new Set(part.bodies.slice(1).map((b) => b.color)).size).toBe(3);
});

test("the image works in every mode and on every product", () => {
  for (const fn of [generateOverlay, generateFrame, generateTapa]) {
    for (const mode of PATTERN_MODES) {
      const part = build(fn, withArt(mode));
      expect(part.valid, `${part.kind}/${mode}`).toBe(true);
      if (fn === generateFrame) {
        // A frame only has its thin ring; an image in the middle lands on the plate, not the ring.
        expect(part.warnings, `${part.kind}/${mode}`).toContain("artOutside");
        continue;
      }
      expect(part.bodies.length, `${part.kind}/${mode}`).toBe(
        mode === "inlay" || mode === "raised" ? 4 : 1,
      );
    }
  }
});

test("turning a colour off removes its body, and an inlay still fills exactly its recess", () => {
  const p = withArt("inlay");
  const plain = build(generateOverlay, { ...p, pattern: { ...p.pattern, id: "none" } });
  expect(build(generateOverlay, p).volume).toBeCloseTo(plain.volume, 0);
  p.art.layers[1].on = false;
  expect(build(generateOverlay, p).bodies).toHaveLength(3);
});

test("the image stays clear of the module windows and moves with its position", () => {
  const p = withArt("inlay", { size: 120 });
  p.groups = defaultProject().groups;
  const part = build(generateOverlay, p);
  const [px, py] = part.center;
  const win = { x: 21 + 0.6 + 3 - 1, y: 10.5 + 0.6 + 3 - 1 }; // first tecla window plus margin, minus slack
  const slack = 1.5 + 0.6 + 3;
  for (const body of part.bodies.slice(1)) {
    const { positions, indices } = body.mesh;
    for (const i of indices) {
      const x = positions[i * 3] - px;
      const y = positions[i * 3 + 1] - py;
      // the windows sit at x = 0 along the module row; inside any of them there must be no ink
      for (const wy of [22.5, 0, -22.5]) {
        const inCross =
          (Math.abs(x) < win.x - slack && Math.abs(y - wy) < win.y) ||
          (Math.abs(x) < win.x && Math.abs(y - wy) < win.y - slack);
        expect(inCross).toBe(false);
      }
    }
  }
  const moved = build(generateOverlay, withArt("inlay", { ax: 10 }));
  const mean = (b) =>
    b.mesh.positions.filter((_, i) => i % 3 === 0).reduce((a, v) => a + v, 0) /
    (b.mesh.positions.length / 3);
  expect(
    mean(moved.bodies[1]) - mean(build(generateOverlay, withArt("inlay")).bodies[1]),
  ).toBeGreaterThan(7);
});

test("an image project with no art builds a plain plate, and bad art is dropped", () => {
  const p = defaultProject();
  p.pattern = { ...p.pattern, id: "image" };
  expect(build(generateOverlay, sanitize(p)).bodies).toHaveLength(1);
  expect(sanitizeArt({ layers: [{ c: "red", s: [{ p: [[1, 2, 3]] }] }] })).toBeNull();
  expect(sanitizeArt("junk")).toBeNull();
  const ok = sanitizeArt(art());
  expect(ok.layers).toHaveLength(3);
  expect(Math.max(...ok.layers.flatMap((l) => l.s.flatMap((s) => s.p.flat())))).toBeLessThanOrEqual(
    4095,
  );
});

test("a switched-off colour is not printed but still cuts the colour beneath it", () => {
  const ring = (x0, y0, x1, y1) => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const layers = (inner) =>
    [
      { color: "#cc0000", shapes: [{ rule: "n", rings: [ring(0, 0, 100, 100)] }] },
      { color: "#ffffff", shapes: [{ rule: "n", rings: [ring(35, 35, 65, 65)] }] },
    ].slice(0, inner ? 2 : 1);
  const volume = (a) => {
    const p = withArt("inlay");
    p.art = sanitizeArt(a);
    p.pattern.size = 40;
    return build(generateOverlay, p).bodies[1].volume;
  };
  const solid = volume(packArt(layers(false), "svg"));
  const withHole = packArt(layers(true), "svg");
  withHole.layers[1].on = false;
  const holeVolume = volume(withHole);
  expect(holeVolume).toBeLessThan(solid * 0.95);
  expect(holeVolume).toBeGreaterThan(solid * 0.7);
});

test("soft anti-aliased edges do not take a colour slot", () => {
  const w = 90;
  const h = 60;
  const sharp = image(
    w,
    h,
    [255, 255, 255],
    [
      [6, 6, 26, 54, [220, 30, 30]],
      [34, 6, 54, 54, [30, 160, 60]],
      [62, 6, 84, 54, [40, 70, 200]],
    ],
  );
  // 3x3 box blur: every edge gets a band of blended colours, like a scaled screenshot.
  const soft = new Uint8ClampedArray(sharp.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            s += sharp[(yy * w + xx) * 4 + c];
            n++;
          }
        soft[(y * w + x) * 4 + c] = s / n;
        soft[(y * w + x) * 4 + 3] = 255;
      }
  const layers = traceImage(soft, w, h, { n: 3, thr: 128, inv: false, bg: true });
  expect(layers).toHaveLength(3);
  const channel = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  expect(layers.filter((l) => channel(l.color, 0) > 170 && channel(l.color, 1) < 90)).toHaveLength(
    1,
  ); // red
  expect(layers.filter((l) => channel(l.color, 1) > 120 && channel(l.color, 0) < 90)).toHaveLength(
    1,
  ); // green
  expect(layers.filter((l) => channel(l.color, 2) > 150 && channel(l.color, 0) < 90)).toHaveLength(
    1,
  ); // blue
});

import {
  LIMIT,
  artBox,
  dragPlacement,
  insideArt,
  placementKey,
  wheelSize,
} from "../src/tools/tapas/ui/drag.js";

test("dragging right on the face moves the image right as seen (the cover is shown turned over)", () => {
  const start = { x: 0, y: 0 };
  // view x grows to the right; design x runs the other way, so ax shrinks
  expect(dragPlacement({ start, hit: { x: 10, y: 0 }, ax: 0, ay: 0 })).toEqual({ ax: -10, ay: 0 });
  expect(dragPlacement({ start, hit: { x: 0, y: 5 }, ax: 3, ay: 4 })).toEqual({ ax: 3, ay: 9 });
});

test("a press counts as on the image only inside its box, however it is moved, rotated or mirrored", () => {
  const box = artBox({ w: 4095, h: 1365 }, 60); // 60 x 20 mm
  expect(box).toEqual({ w: 60, h: 20 });
  const at = { ax: 0, ay: 0, rot: 0, mirror: false };
  expect(insideArt({ x: 25, y: 8 }, at, box)).toBe(true);
  expect(insideArt({ x: 25, y: 12 }, at, box)).toBe(false);
  // moved: the stored ax runs opposite to the view's x
  const moved = { ...at, ax: -30 };
  expect(insideArt({ x: 30, y: 0 }, moved, box)).toBe(true);
  expect(insideArt({ x: -30, y: 0 }, moved, box)).toBe(false);
  // turned a quarter: the long side now runs up the plate
  const turned = { ...at, rot: 90 };
  expect(insideArt({ x: 0, y: 25 }, turned, box)).toBe(true);
  expect(insideArt({ x: 25, y: 0 }, turned, box)).toBe(false);
  // mirroring a symmetric box changes nothing; an offset one still lines up
  expect(insideArt({ x: 25, y: 8 }, { ...at, mirror: true }, box)).toBe(true);
});

test("the build is current only while nothing that places the image has changed", () => {
  const p = withArt("inlay");
  const key = placementKey(p);
  expect(placementKey(structuredClone(p))).toBe(key); // copies are equal
  for (const change of [
    (q) => (q.pattern.ax = 5),
    (q) => (q.pattern.ay = 5),
    (q) => (q.pattern.size = 41),
    (q) => (q.pattern.rot = 15),
    (q) => (q.pattern.mirror = true),
    (q) => (q.art.layers[0].on = false),
    (q) => (q.art.layers[0].c = "#123456"),
  ]) {
    const q = structuredClone(p);
    change(q);
    expect(placementKey(q)).not.toBe(key);
  }
  const unrelated = structuredClone(p);
  unrelated.color = "#112233"; // the cover colour does not move the image
  expect(placementKey(unrelated)).toBe(key);
});

test("the image may be dragged far off the face, within a limit", () => {
  const far = dragPlacement({ start: { x: 0, y: 0 }, hit: { x: -900, y: 900 }, ax: 0, ay: 0 });
  expect(far).toEqual({ ax: LIMIT, ay: LIMIT });
  expect(wheelSize(40, -100)).toBeGreaterThan(40);
  expect(wheelSize(40, 100)).toBeLessThan(40);
  expect(wheelSize(249, -100)).toBe(250);
  expect(wheelSize(5.2, 100)).toBe(5);
});

test("an image placed partly off the plate still builds, and prints only what stays on the face", () => {
  const inside = withArt("inlay", { ax: 0, ay: 0 });
  const half = withArt("inlay", { ax: 40, ay: 0 }); // the plate is ~81 wide: part of the art is past its edge
  const gone = withArt("inlay", { ax: 200, ay: 0 }); // entirely off the plate
  const vol = (p) =>
    build(generateOverlay, p)
      .bodies.slice(1)
      .reduce((a, b) => a + b.volume, 0);
  const full = vol(inside);
  expect(vol(half)).toBeGreaterThan(0);
  expect(vol(half)).toBeLessThan(full * 0.95);
  const off = build(generateOverlay, gone);
  expect(off.valid).toBe(true);
  expect(off.bodies).toHaveLength(1);
  expect(off.warnings).toContain("artOutside");
});

test("with an image, the build also returns the plain face (no recess) for the live preview", () => {
  const withImg = build(generateOverlay, withArt("inlay"));
  const plain = build(generateOverlay, {
    ...withArt("inlay"),
    pattern: { ...withArt("inlay").pattern, id: "none" },
  });
  expect(withImg.plain).toBeTruthy();
  expect(withImg.plain.indices.length).toBeGreaterThan(0);
  // the plain face is the face before cutting: it matches a build with no pattern at all
  expect(withImg.plain.positions.length).toBe(plain.mesh.positions.length);
  expect(plain.plain).toBeNull();
});
