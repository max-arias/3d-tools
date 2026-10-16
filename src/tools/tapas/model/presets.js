// Starting sizes per hardware line. Plate = the visible plate (mm, portrait: w across, h along the
// module row), d = how far it stands out of the wall. `source` says how far to trust the size:
//   maker    from the manufacturer's own catalogue
//   shop     from a retailer's spec field
//   estimate typical value, measure yours (TDT-32)
// `style: "flat"` = the key is the face (Milan); `layout` = the modules to start with.
export const PRESETS = [
  {
    id: "cambre-xxi",
    label: "Cambre Siglo XXI / XXII",
    plate: { w: 81, h: 123, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "shop",
  },
  {
    id: "kalop-richi",
    label: "Kalop Civil / Richi / genérica",
    plate: { w: 81, h: 127, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "shop",
  },
  {
    id: "jeluz-verona",
    label: "Jeluz Verona / Platinum",
    plate: { w: 81, h: 123, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "estimate",
  },
  {
    id: "sica-life",
    label: "Sica Life",
    plate: { w: 81, h: 123, d: 8, r: 5 },
    slots: 3,
    groups: 1,
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
    source: "maker",
  },
  {
    id: "generic-10x10",
    label: "Caja 10x10 (dos bastidores)",
    plate: { w: 122, h: 122, d: 8, r: 4 },
    slots: 3,
    groups: 2,
    source: "estimate",
  },
  { id: "custom", label: "Medidas propias", plate: null, slots: 3, groups: 1 },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

/** The module layout a preset starts with. */
export const presetLayout = (preset) =>
  preset.layout ??
  Array.from({ length: preset.groups }, () => ["tecla", "tecla", "tecla"].slice(0, preset.slots));
