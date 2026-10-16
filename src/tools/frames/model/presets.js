// Photo sizes in mm [w, h] (portrait). Instax sizes are the print including its border.
export const PHOTO_SIZES = {
  stamp: { label: "Stamp 25 × 30", w: 25, h: 30 },
  stampL: { label: "Stamp 30 × 40", w: 30, h: 40 },
  instaxMini: { label: "Instax Mini", w: 54, h: 86 },
  instaxSquare: { label: "Instax Square", w: 72, h: 86 },
  instaxWide: { label: "Instax Wide", w: 108, h: 86 },
  atc: { label: "Trading card", w: 64, h: 89 },
  "4x6": { label: "4 × 6 in", w: 102, h: 152 },
  "5x7": { label: "5 × 7 in", w: 127, h: 178 },
  "6x8": { label: "6 × 8 in", w: 152, h: 203 },
  "8x10": { label: "8 × 10 in", w: 203, h: 254 },
  "8x12": { label: "8 × 12 in", w: 203, h: 305 },
  "10x10": { label: "10 × 10 in", w: 254, h: 254 },
  "11x14": { label: "11 × 14 in", w: 280, h: 356 },
  "12x12": { label: "12 × 12 in", w: 305, h: 305 },
  a5: { label: "A5", w: 148, h: 210 },
  a4: { label: "A4", w: 210, h: 297 },
  a3: { label: "A3", w: 297, h: 420 },
  custom: { label: "Custom", w: 100, h: 150 },
};
export const PHOTO_IDS = Object.keys(PHOTO_SIZES);
