// Copied from src/tools/gridfinity/geom/text.js.
// Label text: lay out Inter Bold glyph contours and fit them into a box.

/** Glyph contours for `str`, in font units, kerning applied. `skipped` lists characters the font lacks. */
export function layoutText(font, str, upper = false) {
  const text = upper ? str.toLocaleUpperCase("uk") : str;
  const contours = [];
  const skipped = [];
  let x = 0;
  let prev = null;
  for (const ch of text) {
    const g = font.glyphs[ch];
    if (!g) {
      if (!skipped.includes(ch)) skipped.push(ch);
      continue;
    }
    if (prev) x += font.kern[prev + ch] ?? 0;
    for (const c of g.c) {
      const shifted = c.slice();
      for (let i = 0; i < shifted.length; i += 2) shifted[i] += x;
      contours.push(shifted);
    }
    x += g.a;
    prev = ch;
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      minX = Math.min(minX, c[i]);
      maxX = Math.max(maxX, c[i]);
      minY = Math.min(minY, c[i + 1]);
      maxY = Math.max(maxY, c[i + 1]);
    }
  }
  return { contours, minX, maxX, minY, maxY, skipped, empty: contours.length === 0 };
}

/**
 * Pick a text scale (mm per font unit) that fits the box.
 * status: "ok", "small" (cap height under 4 mm), "overflow" (too wide with shrinking off).
 */
export function fitText(font, layout, box, { maxMm, autoFit }) {
  const inkW = layout.maxX - layout.minX;
  const inkH = layout.maxY - layout.minY;
  let scale = Math.min(maxMm / font.cap, box.h / inkH);
  if (autoFit) scale = Math.min(scale, box.w / inkW);
  const size = scale * font.cap;
  let status = "ok";
  if (!autoFit && inkW * scale > box.w + 1e-6) status = "overflow";
  else if (size < 4) status = "small";
  return { scale, size, inkW: inkW * scale, inkH: inkH * scale, status };
}
