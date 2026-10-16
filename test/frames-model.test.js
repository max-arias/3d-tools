import Module from "manifold-3d";
import { unzipSync } from "fflate";
import { beforeAll, expect, test } from "vite-plus/test";
import { createKit } from "../src/tools/frames/lib/kit.js";
import { build3mf, packPlates } from "../src/tools/frames/lib/threemf.js";
import { printable } from "../src/tools/frames/lib/place.js";
import { generateFrame } from "../src/tools/frames/geom/frame.js";
import { sanitizeGallery } from "../src/tools/frames/model/gallery.js";
import {
  defaultProject,
  encodeShare,
  merge,
  projectFromHash,
  sanitize,
} from "../src/tools/frames/model/project.js";

let wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

test("sanitize keeps rules: slide-in only on rectangles, mat border clears the overlap, grids only on boxy shapes", () => {
  const circle = sanitize(
    merge(defaultProject(), {
      shape: { type: "circle" },
      retention: "slide",
      mat: { on: true, rows: 3, cols: 3 },
    }),
  );
  expect(circle.retention).toBe("clip");
  expect(circle.mat.rows * circle.mat.cols).toBe(1);
  const tight = sanitize(
    merge(defaultProject(), { photo: { overlap: 8 }, mat: { on: true, border: 2 } }),
  );
  expect(tight.mat.border).toBeGreaterThanOrEqual(8.8);
  expect(sanitize({ photo: { size: "nope" }, moulding: { width: "x" } }).photo.size).toBe(
    defaultProject().photo.size,
  );
});

test("a shared link round-trips a project and a gallery always has an active frame", () => {
  const p = sanitize(
    merge(defaultProject(), {
      shape: { type: "arch" },
      moulding: { profile: "ogee" },
      colors: { frame: "#112233" },
    }),
  );
  expect(projectFromHash(`#p=${encodeShare(p)}`)).toEqual(p);
  const g = sanitizeGallery({ items: [], active: "zzz" });
  expect(g.items.length).toBe(1);
  expect(g.items[0].id).toBe(g.active);
});

test("the 3MF holds one object per part and every part is laid flat on the bed", () => {
  const kit = createKit(wasm);
  try {
    const res = generateFrame(kit, sanitize(merge(defaultProject(), { mount: { type: "stand" } })));
    const items = res.parts.map((q) => {
      const pr = printable(q);
      expect(Math.min(...pr.mesh.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(0, 4);
      return { name: q.name, size: pr.size, bodies: [{ name: q.name, mesh: pr.mesh }] };
    });
    const { plates } = packPlates(
      items.map((i) => ({ w: i.size[0], h: i.size[1] })),
      { x: 256, y: 256 },
    );
    const zip = unzipSync(build3mf({ items, bed: { x: 256, y: 256 } }));
    const model = new TextDecoder().decode(zip["3D/3dmodel.model"]);
    expect((model.match(/<object /g) ?? []).length).toBe(res.parts.length);
    const cfg = new TextDecoder().decode(zip["Metadata/model_settings.config"]);
    expect((cfg.match(/<plate>/g) ?? []).length).toBe(plates);
  } finally {
    kit.free();
  }
});

test("a keyhole hanger and a prop stand build valid parts for every printable shape", () => {
  for (const type of ["rect", "oval", "arch"]) {
    const kit = createKit(wasm);
    try {
      for (const mount of ["hanger", "stand"]) {
        const res = generateFrame(
          kit,
          sanitize(merge(defaultProject(), { shape: { type }, mount: { type: mount } })),
        );
        expect(res.valid, `${type} ${mount}`).toBe(true);
      }
    } finally {
      kit.free();
    }
  }
});
