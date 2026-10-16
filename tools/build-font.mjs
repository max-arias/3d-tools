// Builds glyph outlines for label text from Inter Bold (OFL) via @fontsource/inter woff files.
// Output: { upm, cap, glyphs: { ch: { a: advance, c: [[x0,y0,x1,y1,...], ...] } }, kern: { "AB": dx } }
import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const dir = "node_modules/@fontsource/inter/files/";
const sets = [
  [
    "inter-latin-700-normal.woff",
    [
      [32, 126],
      [192, 255],
    ],
  ],
  ["inter-cyrillic-700-normal.woff", [[1040, 1103]]],
];
const CURVE_STEPS = 6;

function flatten(path) {
  const contours = [];
  let cur = [];
  let x = 0,
    y = 0;
  const push = (px, py) => cur.push(+px.toFixed(1), +py.toFixed(1));
  for (const c of path.commands) {
    if (c.type === "M") {
      if (cur.length) contours.push(cur);
      cur = [];
      push(c.x, c.y);
    } else if (c.type === "L") push(c.x, c.y);
    else if (c.type === "Q") {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS,
          u = 1 - t;
        push(
          u * u * x + 2 * u * t * c.x1 + t * t * c.x,
          u * u * y + 2 * u * t * c.y1 + t * t * c.y,
        );
      }
    } else if (c.type === "C") {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS,
          u = 1 - t;
        push(
          u ** 3 * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x,
          u ** 3 * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y,
        );
      }
    } else if (c.type === "Z") {
      if (cur.length) contours.push(cur);
      cur = [];
    }
    if ("x" in c) {
      x = c.x;
      y = c.y;
    }
  }
  if (cur.length) contours.push(cur);
  return contours;
}

const glyphs = {};
let upm = 2048,
  cap = 1490;
const fonts = [];
for (const [file, ranges] of sets) {
  const buf = readFileSync(dir + file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fonts.push(font);
  upm = font.unitsPerEm;
  for (const [lo, hi] of ranges) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      const g = font.charToGlyph(ch);
      if (!g || g.index === 0) continue;
      glyphs[ch] = {
        a: g.advanceWidth,
        c: flatten(g.getPath(0, 0, upm)).map((c) => c.map((v, i) => (i % 2 ? -v : v))),
      };
    }
  }
}
const H = fonts[0].charToGlyph("H").getBoundingBox();
cap = Math.round(H.y2);
const kern = {};
const chars = Object.keys(glyphs).filter((c) => c.codePointAt(0) < 128);
for (const l of chars)
  for (const r of chars) {
    const k = fonts[0].getKerningValue(fonts[0].charToGlyph(l), fonts[0].charToGlyph(r));
    if (k) kern[l + r] = k;
  }
writeFileSync(
  "src/tools/gridfinity/geom/inter-bold.json",
  JSON.stringify({ upm, cap, glyphs, kern }),
);
console.log(
  `glyphs: ${Object.keys(glyphs).length}, kern pairs: ${Object.keys(kern).length}, cap: ${cap}`,
);
