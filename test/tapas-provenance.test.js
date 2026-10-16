import { expect, test } from "vite-plus/test";
import {
  FIELD_PATHS,
  markEdited,
  presetSources,
  sourceOf,
  unverified,
} from "../src/tools/tapas/model/provenance.js";
import { PRESETS, presetById } from "../src/tools/tapas/model/presets.js";
import { defaultProject, sanitize } from "../src/tools/tapas/model/project.js";

const forPreset = (id, extra = {}) => {
  const preset = presetById(id);
  return sanitize({
    ...defaultProject(),
    preset: id,
    plate: preset.plate ?? defaultProject().plate,
    mods: { ...defaultProject().mods, ...preset.mods },
    style: preset.style ?? "modular",
    src: undefined, // as loaded from an old project: sources come from the preset
    ...extra,
  });
};
const keys = (p) => unverified(p).map((x) => x.key);

test("the default Cambre Siglo XXII overlay is backed by the maker except plate depth", () => {
  const p = defaultProject();
  expect(sourceOf(p, "plate.w")).toBe("maker");
  expect(sourceOf(p, "mods.pitch")).toBe("maker");
  expect(sourceOf(p, "mods.winW")).toBe("maker");
  expect(sourceOf(p, "plate.d")).toBe("estimate");
  expect(keys(p)).toEqual(["plate.d"]);
});

test("A.R.T.E. is fully backed by the maker; Jeluz and Sica are estimates all the way", () => {
  expect(keys(forPreset("cambre-arte"))).toEqual([]);
  for (const id of ["jeluz-verona", "sica-life"])
    expect(keys(forPreset(id)).sort(), id).toEqual([
      "mods.pitch",
      "mods.winW",
      "plate.d",
      "plate.h",
      "plate.r",
      "plate.w",
    ]);
});

test("shop-sourced sizes are flagged as shop, not as estimates and not as verified", () => {
  const p = forPreset("kalop-richi");
  expect(unverified(p).find((x) => x.key === "plate.w").source).toBe("shop");
  expect(unverified(p).find((x) => x.key === "plate.r").source).toBe("estimate");
});

test("flat Milan plates list size, radius and depth but no module values", () => {
  const p = forPreset("milan-macroled");
  expect(sourceOf(p, "plate.w")).toBe("maker");
  expect(keys(p).sort()).toEqual(["plate.d", "plate.r"]);
});

test("each product lists only what it uses", () => {
  const base = forPreset("jeluz-verona");
  expect(keys({ ...base, product: "keycap" }).sort()).toEqual([
    "keycap.h",
    "keycap.l",
    "keycap.r",
    "keycap.w",
  ]);
  expect(keys({ ...base, product: "frame" }).sort()).toEqual([
    "plate.d",
    "plate.h",
    "plate.r",
    "plate.w",
  ]);
  const tapa = keys({ ...base, product: "tapa" });
  expect(tapa).toEqual(
    expect.arrayContaining(["tapa.boxW", "tapa.boxH", "tapa.bump", "static.snap"]),
  );
  expect(tapa).not.toContain("plate.d"); // a tapa does not stand out of the wall like an overlay
  // one window per module still depends on the pitch but not on the window width
  const each = keys({ ...base, window: "each" });
  expect(each).toContain("mods.pitch");
  expect(each).not.toContain("mods.winW");
});

test("values you edit become yours and stop being listed", () => {
  const before = forPreset("jeluz-verona");
  const after = structuredClone(before);
  after.plate.d = 7;
  after.plate.w = 82;
  const src = markEdited(before, after);
  expect(src["plate.d"]).toBe("user");
  expect(src["plate.w"]).toBe("user");
  expect(src["plate.h"]).toBe("estimate"); // untouched
  expect(keys({ ...after, src })).not.toContain("plate.d");
  expect(keys({ ...after, src })).toContain("plate.h");
  // setting the same value again changes nothing
  expect(markEdited(before, structuredClone(before))).toEqual(before.src);
});

test("custom plates are the user's own measurements", () => {
  expect(presetSources(presetById("custom"))["plate.w"]).toBe("user");
  expect(keys(forPreset("custom"))).toEqual([]);
});

test("static estimates appear only when the build uses them", () => {
  const base = forPreset("cambre-xxii");
  expect(keys(base)).not.toContain("static.slots");
  expect(keys({ ...base, groups: [["tomaRanuras"]] })).toContain("static.slots");
  // a single window does not cut around module shapes, so their window sizes do not matter
  expect(keys({ ...base, groups: [["usb", "toma"]] })).not.toContain("static.moduleWindows");
  expect(keys({ ...base, window: "each", groups: [["usb", "toma"]] })).toContain(
    "static.moduleWindows",
  );
  expect(keys({ ...forPreset("milan-macroled"), groups: [["perilla"]] })).toContain(
    "static.moduleWindows",
  );
});

test("sanitising keeps valid sources, drops junk, and falls back to the preset", () => {
  const p = sanitize({
    ...defaultProject(),
    src: { "plate.d": "user", "plate.w": "bogus", "not.a.field": "maker" },
  });
  expect(p.src["plate.d"]).toBe("user");
  expect(p.src["plate.w"]).toBe("maker"); // junk value: the preset's source
  expect(Object.keys(p.src).every((k) => FIELD_PATHS.includes(k))).toBe(true);
  const old = sanitize({ plate: { w: 90 }, preset: "jeluz-verona" });
  expect(old.src["plate.w"]).toBe("estimate");
  expect(PRESETS.every((x) => presetSources(x)["plate.d"])).toBe(true);
});
