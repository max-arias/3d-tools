import { expect, test } from "vite-plus/test";
import { fitChecks } from "../src/tools/clocks/dial/checks.js";
import { layoutCutouts } from "../src/tools/clocks/dial/cutouts.js";
import { areaMoment, holeRing } from "../src/tools/clocks/dial/hands.js";
import { layoutMarkers, slotAngle, slotLabel } from "../src/tools/clocks/dial/markers.js";
import {
  edgeDistance,
  faceRadius,
  insideOutline,
  outlineOf,
  rayDistance,
} from "../src/tools/clocks/dial/outline.js";
import { galleryProject, GALLERY } from "../src/tools/clocks/model/gallery.js";
import {
  defaultProject,
  encodeShare,
  merge,
  projectFromHash,
  sanitize,
  slotFor,
} from "../src/tools/clocks/model/project.js";

const make = (patch = {}) => sanitize(merge(defaultProject(), patch));
const circle = (w = 200, hub = [0, 0]) =>
  outlineOf({ kind: "preset", preset: "circle", width: w, hub });
const box = (text, size) => [
  [
    [-size / 2, -size / 2],
    [size / 2, -size / 2],
    [size / 2, size / 2],
    [-size / 2, size / 2],
  ],
];

test("12 is up, 3 is right, and a backwards movement mirrors the dial", () => {
  expect(slotAngle(0, 12)).toBeCloseTo(Math.PI / 2);
  expect(Math.cos(slotAngle(3, 12))).toBeCloseTo(1);
  expect(Math.cos(slotAngle(3, 12, true))).toBeCloseTo(-1);
  expect(slotLabel(0, 24, "arabic")).toBe("24");
  expect(slotLabel(1, 12, "quarters")).toBe(null);
  expect(slotLabel(9, 12, "roman")).toBe("IX");
});

// Ticks are rectangles, so their outer corners sit a hair past the inset radius.
test("markers stay inside the face and keep their inset from the edge", () => {
  const o = circle();
  const R = faceRadius(o);
  const m = { ...make().markers, size: 12, minutes: true };
  const { items } = layoutMarkers(m, o, R, box);
  for (const it of items)
    for (const r of it.rings)
      for (const p of r) expect(Math.hypot(...p)).toBeLessThanOrEqual(R - m.inset + 0.05);
});

test("outline geometry: hub offset, edge and ray distances", () => {
  const o = circle(200, [30, 0]);
  expect(faceRadius(o)).toBeCloseTo(70, 0);
  expect(rayDistance(o, 0)).toBeCloseTo(70, 0);
  expect(rayDistance(o, Math.PI)).toBeCloseTo(130, 0);
  expect(insideOutline(o, [0, 0])).toBe(true);
  expect(insideOutline(o, [80, 0])).toBe(false);
  // Leaf slits are holes: a point inside a slit is not on the face.
  const leaf = outlineOf({ kind: "preset", preset: "leaf", width: 200, hub: [0, 0] });
  expect(leaf.cuts.length).toBeGreaterThan(0);
});

test("cutouts keep a web to the edge, to each other and to keep-outs", () => {
  const o = circle();
  const R = faceRadius(o);
  const keep = [{ rect: [-31, -31, 31, 31] }, { at: [0, 80], r: 6 }];
  const holes = layoutCutouts({ kind: "cheese", seed: 3, count: 40, size: 16 }, o, R, keep);
  expect(holes.length).toBeGreaterThan(10);
  for (const h of holes) {
    expect(edgeDistance(o, h.at)).toBeGreaterThanOrEqual(h.r + 2.5 - 1e-6);
    const [x, y] = h.at;
    expect(Math.max(Math.abs(x) - 31, Math.abs(y) - 31)).toBeGreaterThan(0);
  }
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++)
      expect(
        Math.hypot(holes[i].at[0] - holes[j].at[0], holes[i].at[1] - holes[j].at[1]),
      ).toBeGreaterThanOrEqual(holes[i].r + holes[j].r + 2.5 - 1e-6);
  // Same seed, same holes.
  expect(layoutCutouts({ kind: "cheese", seed: 3, count: 40, size: 16 }, o, R, keep)).toEqual(
    holes,
  );
});

test("an I-shaft hole is cut to its flats; a round one is not", () => {
  const xs = (ring) => Math.max(...ring.map(([x]) => Math.abs(x)));
  expect(xs(holeRing(4, 3)) * 2).toBeCloseTo(3);
  expect(xs(holeRing(4)) * 2).toBeCloseTo(4, 1);
});

test("hand moment: a bar from the shaft to y = 10 balances at 5", () => {
  const { area, moment } = areaMoment([
    [
      [-1, 0],
      [1, 0],
      [1, 10],
      [-1, 10],
    ],
  ]);
  expect(area).toBeCloseTo(20);
  expect(moment / area).toBeCloseTo(5);
});

test("fit checks flag raised decor under the hour hand, heavy hands and a big clock", () => {
  const p = make({ shape: { width: 400 } });
  const info = {
    notes: [],
    hubDial: 4,
    raised: 5,
    recess: 0,
    R: 190,
    size: [400, 400],
    hands: [{ id: "minute", length: 150, mass: 12, moment: 40 }],
    holes: 0,
    splitBack: false,
  };
  const keys = fitChecks(p, info).map((c) => c.key);
  expect(keys).toEqual(expect.arrayContaining(["handsHitDecor", "heavyHand", "tooBig"]));
  const ok = fitChecks(make(), { ...info, raised: 0, size: [200, 200], hands: [] }).map(
    (c) => c.key,
  );
  expect(ok).toEqual([]);
});

test("share links round-trip and sanitize clamps nonsense", () => {
  const p = make({ shape: { preset: "cloud", width: 240 }, markers: { numerals: "roman" } });
  expect(projectFromHash(`#p=${encodeShare(p)}`)).toEqual(p);
  const bad = sanitize({
    shape: { width: 9999, kind: "svg" },
    face: { thickness: 2, inlay: 5 },
    colors: { slots: [], face: 9 },
  });
  expect(bad.shape.width).toBe(600);
  expect(bad.shape.kind).toBe("preset"); // no SVG stored
  expect(bad.face.inlay).toBeLessThanOrEqual(1);
  expect(bad.colors.face).toBeLessThan(bad.colors.slots.length);
});

test("a colour close to a slot reuses it; a new one gets its own slot", () => {
  const slots = ["#ffffff", "#000000"];
  expect(slotFor(slots, "#fafafa")).toBe(0);
  expect(slotFor(slots, "#d02020")).toBe(2);
  expect(slots).toHaveLength(3);
});

test("every gallery design sanitizes to itself", () => {
  for (const g of GALLERY) {
    const p = sanitize(galleryProject(g, defaultProject()));
    expect(sanitize(p)).toEqual(p);
    if (g.art) expect(p.art.layers.length).toBe(p.colors.art.length);
  }
});
