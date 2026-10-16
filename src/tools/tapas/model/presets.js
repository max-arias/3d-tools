// Starting sizes per hardware line. Plate = the visible tapa (mm, portrait: w across, h along the
// module row), d = how far it stands out of the wall. Only the Cambre width/height come from a shop
// listing; the rest are typical values. Every preset is `verify: true` until measured (TDT-32).
export const PRESETS = [
  {
    id: "cambre-xxi",
    label: "Cambre Siglo XXI / XXII",
    box: "5x10",
    plate: { w: 81, h: 123, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "shop",
  },
  {
    id: "jeluz-verona",
    label: "Jeluz Verona / Platinum",
    box: "5x10",
    plate: { w: 80, h: 120, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "estimate",
  },
  {
    id: "kalop-richi",
    label: "Kalop / Richi / genérica",
    box: "5x10",
    plate: { w: 80, h: 120, d: 8, r: 4 },
    slots: 3,
    groups: 1,
    source: "estimate",
  },
  {
    id: "generic-10x10",
    label: "Caja 10x10 (dos bastidores)",
    box: "10x10",
    plate: { w: 122, h: 122, d: 8, r: 4 },
    slots: 3,
    groups: 2,
    source: "estimate",
  },
  { id: "custom", label: "Medidas propias", box: "custom", plate: null, slots: 3, groups: 1 },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
