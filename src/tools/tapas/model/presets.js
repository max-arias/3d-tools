// Starting sizes per hardware line. Plate = the visible plate (mm, portrait: w across, h along the
// module row), d = how far it stands out of the wall. `source` says how far to trust the size:
//   maker    from the manufacturer's own catalogue or technical drawings
//   shop     from a retailer's spec field
//   estimate typical value, measure yours (TDT-32)
// `mods` = { pitch, winW }: the module height and the plate window's width (modular plates have one
// window for all their modules). `style: "flat"` = the key is the face (Milan); `layout` = the
// modules to start with. Plate depth `d` (how far the plate stands out) is from the maker only for
// A.R.T.E. (6.2 to 6.5 mm in its side view); the other presets borrow that as an estimate.
const CAMBRE = { pitch: 19, winW: 50.4 }; // Siglo XXII drawings: 4 modulos = 76 mm, window 50.4 mm wide
const ARTE = { pitch: 18.7, winW: 50.4 }; // A.R.T.E. drawing: 4 modulos = 74.8 mm

// Where each value comes from (see model/provenance.js); anything not listed is an estimate.
const M = "maker";
const S = "shop";
const SRC_XXII = { "plate.w": M, "plate.h": M, "plate.r": M, "mods.pitch": M, "mods.winW": M }; // depth: estimate
const SRC_SHOP = { "plate.w": S, "plate.h": S }; // size from a retailer; radius, depth, pitch, window estimated

export const PRESETS = [
  {
    id: "cambre-xxii",
    label: "Cambre Siglo XXII (estándar)",
    plate: { w: 81, h: 116, d: 6.5, r: 0.75 },
    mods: CAMBRE,
    slots: 3,
    groups: 1,
    src: SRC_XXII,
    source: "maker",
  },
  {
    id: "cambre-xxii-mignon",
    label: "Cambre Siglo XXII mignón",
    plate: { w: 81, h: 79, d: 6.5, r: 0.75 },
    mods: CAMBRE,
    slots: 2,
    groups: 1,
    src: SRC_XXII,
    source: "maker",
  },
  {
    id: "cambre-xxii-8",
    label: "Cambre Siglo XXII 8 módulos",
    plate: { w: 130, h: 116, d: 6.5, r: 3 },
    mods: CAMBRE,
    slots: 4,
    groups: 2,
    src: SRC_XXII,
    source: "maker",
  },
  {
    id: "cambre-arte",
    label: "Cambre A.R.T.E.",
    plate: { w: 100.2, h: 124.6, d: 6.5, r: 3.3 },
    mods: ARTE,
    slots: 4,
    groups: 1,
    src: {
      "plate.w": M,
      "plate.h": M,
      "plate.d": M,
      "plate.r": M,
      "mods.pitch": M,
      "mods.winW": M,
    },
    source: "maker",
  },
  {
    id: "cambre-xxi",
    label: "Cambre Siglo XXI",
    plate: { w: 81, h: 123, d: 6.5, r: 4 },
    mods: CAMBRE,
    slots: 3,
    groups: 1,
    src: SRC_SHOP,
    source: "shop",
  },
  {
    id: "kalop-richi",
    label: "Kalop Civil / Richi / genérica",
    plate: { w: 81, h: 127, d: 6.5, r: 4 },
    mods: CAMBRE,
    slots: 3,
    groups: 1,
    src: SRC_SHOP,
    source: "shop",
  },
  {
    id: "jeluz-verona",
    label: "Jeluz Verona / Platinum",
    plate: { w: 81, h: 123, d: 6.5, r: 4 },
    mods: CAMBRE,
    slots: 3,
    groups: 1,
    src: {},
    source: "estimate",
  },
  {
    id: "sica-life",
    label: "Sica Life",
    plate: { w: 81, h: 123, d: 6.5, r: 5 },
    mods: CAMBRE,
    slots: 3,
    groups: 1,
    src: {},
    source: "estimate",
  },
  {
    id: "milan-macroled",
    label: "Milán (Macroled), plana",
    plate: { w: 80, h: 120, d: 8, r: 3 },
    slots: 3,
    groups: 1,
    style: "flat",
    layout: [["tecla", "tecla", "tecla"]],
    src: { "plate.w": M, "plate.h": M },
    source: "maker",
  },
  {
    id: "milan-doble-toma",
    label: "Milán doble toma (horizontal)",
    plate: { w: 120, h: 80, d: 8, r: 3 },
    slots: 1,
    groups: 2,
    style: "flat",
    layout: [["tomaRanuras"], ["tomaRanuras"]],
    src: { "plate.w": M, "plate.h": M },
    source: "maker",
  },
  { id: "custom", label: "Medidas propias", plate: null, slots: 3, groups: 1 },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

/** The module layout a preset starts with. */
export const presetLayout = (preset) =>
  preset.layout ??
  Array.from({ length: preset.groups }, () =>
    ["tecla", "tecla", "tecla", "tecla"].slice(0, preset.slots),
  );
