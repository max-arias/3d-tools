import { expect, test } from "vite-plus/test";
import { holderFit } from "../src/tools/lamps/geom/holder.js";
import { LIBRARY, isModified } from "../src/tools/lamps/model/library.js";
import {
  defaultProject,
  fitStatus,
  fromSettingsJson,
  merge,
  resetSection,
  sanitize,
  toSettingsJson,
} from "../src/tools/lamps/model/project.js";
import { randomize } from "../src/tools/lamps/model/random.js";

test("sanitize clamps, sorts the nodes and pins the ends", () => {
  const p = sanitize({
    height: 9000,
    nodes: [
      { z: 0.9, d: 100 },
      { z: 0.4, d: 99999 },
      { z: 0.5, d: 120 },
    ],
    ribs: { count: 1, wave: "nope" },
  });
  expect(p.height).toBe(600);
  expect(p.nodes.map((n) => n.z)).toEqual([0, 0.5, 1]);
  expect(p.nodes[0].d).toBe(600);
  expect(p.ribs.count).toBe(3);
  expect(p.ribs.wave).toBe("sine");
  expect(
    sanitize({ nodes: Array.from({ length: 30 }, (_, i) => ({ z: i / 30, d: 100 })) }).nodes,
  ).toHaveLength(12);
});

test("a settings file round-trips and a stray JSON is refused", () => {
  const p = sanitize(merge(defaultProject(), { ribs: { count: 21, twist: -45 }, seed: 77 }));
  expect(fromSettingsJson(toSettingsJson(p))).toEqual(p);
  expect(() => fromSettingsJson('{"hello":1}')).toThrow();
});

test("the same seed gives the same design, and a locked section does not change", () => {
  const base = defaultProject();
  expect(randomize(base, 42)).toEqual(randomize(base, 42));
  expect(randomize(base, 42)).not.toEqual(randomize(base, 43));
  const locked = randomize(base, 7, { shape: true, ribs: true });
  expect(locked.nodes).toEqual(base.nodes);
  expect(locked.ribs).toEqual(base.ribs);
  expect(locked.height).toBe(base.height);
});

test("a section reset leaves the others alone", () => {
  const p = sanitize(merge(defaultProject(), { ribs: { depth: 9 }, wall: 3 }));
  const r = resetSection(p, "ribs");
  expect(r.ribs).toEqual(defaultProject().ribs);
  expect(r.wall).toBe(3);
});

test("build volume status turns near within 10 mm and over past the limit", () => {
  const build = { x: 250, y: 250, z: 250 };
  expect(fitStatus([200, 200, 200], build)).toBe("ok");
  expect(fitStatus([245, 200, 200], build)).toBe("near");
  expect(fitStatus([251, 200, 200], build)).toBe("over");
});

test("every library design has a holder that fits and is not flagged modified", () => {
  expect(LIBRARY.length).toBeGreaterThanOrEqual(28);
  for (const d of LIBRARY) {
    expect(holderFit(d.project).ok, d.id).toBe(true);
    expect(isModified(d.project, d.id), d.id).toBe(false);
  }
  const first = LIBRARY[0];
  expect(isModified(merge(first.project, { wall: 4 }), first.id)).toBe(true);
});
