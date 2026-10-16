import { unzipSync, strFromU8 } from "fflate";
import LZString from "lz-string";
import { expect, test } from "vite-plus/test";
import { build3mf, packPlates } from "../src/tools/tapas/lib/threemf.js";
import { sanitizeHouse, encodeHouse, newItem } from "../src/tools/tapas/model/house.js";
import { defaultProject } from "../src/tools/tapas/model/project.js";

const mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

test("parts that do not fit one plate spill onto the next", () => {
  const sizes = Array.from({ length: 4 }, () => ({ w: 90, h: 130 }));
  const { positions, plates, fits } = packPlates(sizes, { x: 256, y: 256 });
  expect(fits).toBe(true);
  expect(plates).toBe(2);
  expect(new Set(positions.map((p) => p.plate)).size).toBe(2);
  // nothing leaves its plate
  for (const p of positions) {
    expect(p.x + 90).toBeLessThanOrEqual(256);
    expect(p.y + 130).toBeLessThanOrEqual(256);
  }
});

test("a part bigger than the bed is flagged", () => {
  expect(packPlates([{ w: 300, h: 100 }], { x: 256, y: 256 }).fits).toBe(false);
});

test("3MF lists one plate per packed plate", () => {
  const items = Array.from({ length: 4 }, (_, i) => ({
    name: `a${i}`,
    size: [90, 130],
    bodies: [{ name: "a", mesh }],
  }));
  const zip = unzipSync(build3mf({ items, bed: { x: 256, y: 256 } }));
  expect(strFromU8(zip["Metadata/model_settings.config"]).match(/<plate>/g)).toHaveLength(2);
});

test("a house always has an item and a valid active id", () => {
  const empty = sanitizeHouse(null);
  expect(empty.items).toHaveLength(1);
  expect(empty.active).toBe(empty.items[0].id);
  const dup = sanitizeHouse({
    items: [
      { id: "x", qty: 500 },
      { id: "x", qty: 0 },
    ],
    active: "nope",
  });
  expect(new Set(dup.items.map((i) => i.id)).size).toBe(2);
  expect(dup.items.map((i) => i.qty)).toEqual([99, 1]);
  expect(dup.active).toBe(dup.items[0].id);
});

test("a shared house round-trips with names, quantities and the active cover", () => {
  const a = newItem(defaultProject(), "cocina", 2);
  const b = newItem({ ...defaultProject(), product: "frame" }, "living", 3);
  const encoded = encodeHouse({ items: [a, b], active: b.id });
  const back = JSON.parse(LZString.decompressFromEncodedURIComponent(encoded));
  expect(back.items.map((i) => [i.name, i.qty, i.project.product])).toEqual([
    ["cocina", 2, "overlay"],
    ["living", 3, "frame"],
  ]);
  expect(back.active).toBe(1);
});
