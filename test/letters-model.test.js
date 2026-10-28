import { expect, test } from "vite-plus/test";
import {
  defaultProject,
  encodeShare,
  geomKey,
  merge,
  projectFromHash,
  sanitize,
} from "../src/tools/letters/model/project.js";

const make = (patch = {}) => sanitize(merge(defaultProject(), patch));

test("the lip above the ledge never gets thinner than 0.8 mm", () => {
  const p = make({ size: { wall: 2 }, lid: { ledge: 1.9 } });
  expect(p.size.wall - p.lid.ledge).toBeGreaterThanOrEqual(0.8 - 1e-9);
});

test("the rebate leaves 5 mm of cavity above the back plate", () => {
  const p = make({ size: { depth: 12, base: 2 }, lid: { rebate: 8 } });
  expect(p.size.depth - p.size.base - p.lid.rebate).toBeGreaterThanOrEqual(5 - 1e-9);
});

test("a share link round-trips an SVG project", () => {
  const svg = [
    {
      rule: "EvenOdd",
      rings: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      ],
    },
  ];
  const p = make({ source: { kind: "svg", svg, text: "AB" }, size: { height: 80 } });
  expect(projectFromHash(`#p=${encodeShare(p)}`)).toEqual(p);
});

test("only geometry fields change the geometry key", () => {
  const p = defaultProject();
  expect(geomKey(make({ printer: "bambu-a1", build: { x: 180 } }))).toBe(geomKey(p));
  expect(geomKey(make({ size: { height: 130 } }))).not.toBe(geomKey(p));
});
