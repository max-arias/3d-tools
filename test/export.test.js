import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/gridfinity/geom/kit.js";
import { generateDrawer } from "../src/tools/gridfinity/geom/drawer.js";
import { generateKeyTest } from "../src/tools/gridfinity/geom/keytest.js";
import { sanitize } from "../src/tools/gridfinity/model/sanitize.js";
import { packPlates } from "../src/tools/gridfinity/layout/pack.js";
import { groupParts } from "../src/tools/gridfinity/export/group.js";
import { toStl } from "../src/tools/gridfinity/export/stl.js";
import { make3mf, makeZip, partsText } from "../src/tools/gridfinity/export/bundle.js";
import { getPartsData } from "../src/tools/gridfinity/ui/partsData.js";
import font from "../src/tools/gridfinity/geom/inter-bold.json";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const project = sanitize({
  drawer: { w: 200, d: 150 },
  printer: { x: 120, y: 120 },
  baseplate: { keys: true },
  labelStyle: { kind: "inlay" },
  bins: [
    { id: "a", x: 0, y: 0, w: 2, d: 2, overrides: { label: "full" }, labels: ["Hi"] },
    { id: "b", x: 2, y: 0, w: 2, d: 2 },
    { id: "c", x: 0, y: 2, w: 2, d: 1 },
  ],
});
const make = () => generateDrawer(() => createKit(wasm), project, { font });

test("identical bins group; names carry counts", () => {
  const r = make();
  const groups = groupParts(r.parts);
  const bins = groups.filter((g) => g.kind === "bin" && !g.inlay);
  expect(bins.map((g) => g.name).sort()).toEqual(
    ["bin_2x1_x1", "bin_2x2_x1", "bin_2x2_b_x1"].sort(),
  );
  expect(groups.find((g) => g.base === "hkey")?.count).toBeGreaterThan(0);
});

test("STL has the right size and triangle count", () => {
  const r = make();
  const part = r.parts.find((p) => p.kind === "tile");
  const stl = toStl(part.mesh);
  expect(stl.length).toBe(84 + part.triangles * 50);
  expect(new DataView(stl.buffer).getUint32(80, true)).toBe(part.triangles);
});

test("3MF package is well-formed with one build item per part and a two-colour component", () => {
  const r = make();
  const data = getPartsData(r, project);
  const zip = unzipSync(make3mf(r, project, data));
  expect(Object.keys(zip).sort()).toEqual(
    [
      "3D/3dmodel.model",
      "Metadata/model_settings.config",
      "Metadata/project_settings.config",
      "[Content_Types].xml",
      "_rels/.rels",
    ].sort(),
  );
  const model = strFromU8(zip["3D/3dmodel.model"]);
  const mainParts = r.parts.filter((p) => !p.inlay).length;
  expect(model.match(/<item /g)).toHaveLength(mainParts);
  expect(model.match(/<component /g)).toHaveLength(2);
  expect(model.match(/<object /g).length).toBe(model.match(/<\/object>/g).length);
  expect(strFromU8(zip["Metadata/project_settings.config"])).toContain("Bambu Lab P1S");
  const cfg = strFromU8(zip["Metadata/model_settings.config"]);
  expect(cfg.match(/<plate>/g)).toHaveLength(data.plates.length);
});

test("non-Bambu printers get a plain 3MF; zip holds STLs and parts.txt", () => {
  const r = make();
  const other = { ...project, printer: { ...project.printer, preset: "ender3", x: 220, y: 220 } };
  const zip = unzipSync(make3mf(r, other, getPartsData(r, other)));
  expect(zip["Metadata/project_settings.config"]).toBeUndefined();
  const z = unzipSync(makeZip(r, project, getPartsData(r, project)));
  expect(Object.keys(z)).toContain("parts.txt");
  expect(Object.keys(z).some((k) => k.endsWith(".stl"))).toBe(true);
  expect(partsText(r, project, getPartsData(r, project))).toMatch(/Plates: \d+/);
});

test("key fit-test produces two blocks and three valid keys", () => {
  const kit = createKit(wasm);
  const { parts } = generateKeyTest(kit);
  kit.free();
  expect(parts.map((p) => p.name)).toEqual([
    "keytest_block_a",
    "keytest_block_b",
    "hkey_0.10mm",
    "hkey_0.15mm",
    "hkey_0.20mm",
  ]);
  expect(parts.every((p) => p.valid)).toBe(true);
  expect(
    packPlates(
      parts.map((p) => ({ id: p.name, kind: p.kind, w: p.size[0], d: p.size[1] })),
      project.printer,
    ),
  ).toHaveLength(1);
});
