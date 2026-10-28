import { expect, test } from "vite-plus/test";
import { boxDims } from "../src/tools/boxes/geom/dims.js";
import {
  defaultProject,
  fitsBed,
  merge,
  projectFromHash,
  encodeShare,
  sanitize,
} from "../src/tools/boxes/model/project.js";
import { PACKS, packBins, packPatch, suggestBox } from "../src/tools/boxes/model/packs.js";

const make = (patch = {}) => sanitize(merge(defaultProject(), patch));
const P1S = { x: 256, y: 256, z: 256 };

test("sanitize keeps bins whole, inside the grid and apart", () => {
  const p = make({
    grid: { x: 4, y: 3 },
    bins: [
      { x: 0, y: 0, w: 2, d: 1 },
      { x: 1, y: 0, w: 1, d: 1 }, // overlaps the first: dropped
      { x: 3.4, y: 2, w: 1, d: 9 }, // rounded and clamped into the grid
    ],
  });
  expect(p.bins.map(({ x, y, w, d }) => [x, y, w, d])).toEqual([
    [0, 0, 2, 1],
    [3, 0, 1, 3],
  ]);
});

test("share link round-trips", () => {
  const p = make({ grid: { x: 6, y: 5, u: 9 }, label: { title: "M3", lines: ["Bolts"] } });
  expect(projectFromHash(`#p=${encodeShare(p)}`)).toEqual(p);
});

test("every pack is a valid project whose base fits a 256 mm bed", () => {
  for (const pack of PACKS) {
    const p = make(packPatch(pack));
    expect(p.bins, pack.id).toHaveLength(pack.bins.length);
    const d = boxDims(p.grid);
    expect(fitsBed([d.W, d.D], P1S), pack.id).toBe(true);
  }
});

test("packing turns bins when that is the only way they fit", () => {
  // Three 1x3 bins only fit a 3x3 grid side by side.
  const placed = packBins(
    [
      { w: 3, d: 1 },
      { w: 1, d: 3 },
      { w: 3, d: 1 },
    ],
    3,
    3,
  );
  expect(placed).not.toBeNull();
  expect(
    packBins(
      [
        { w: 2, d: 2 },
        { w: 2, d: 2 },
      ],
      3,
      3,
    ),
  ).toBeNull();
});

test("suggestion picks the smallest box that holds the bins and fits the bed", () => {
  const twelve = Array.from({ length: 12 }, () => ({ w: 1, d: 1 }));
  expect(suggestBox(twelve, P1S).grid).toEqual({ x: 4, y: 3, u: 6 });
  const s = suggestBox([...twelve, { w: 2, d: 2 }, { w: 2, d: 2 }], P1S, 9);
  expect(s.grid).toEqual({ x: 5, y: 4, u: 9 });
  expect(s.fill).toBe(1);
  // Too much for any box a 256 mm bed can print.
  expect(
    suggestBox(
      Array.from({ length: 40 }, () => ({ w: 1, d: 1 })),
      P1S,
    ),
  ).toBeNull();
  expect(fitsBed([230, 188], { x: 250, y: 210 })).toBe(true);
});
