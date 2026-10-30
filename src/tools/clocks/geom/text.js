import { layoutText } from "../../letters/geom/glyphs.js";

/** Text rings with cap height `size`, centred on the origin. */
export const glyphFor = (font) => (text, size) => {
  const rings = layoutText(font, text, size, size * 0.06).flatMap((g) => g.rings);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r)
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return rings.map((r) => r.map(([x, y]) => [x - cx, y - cy]));
};
