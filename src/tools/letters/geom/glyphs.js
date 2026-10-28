// Text to outline rings with opentype.js. Output is in mm, y up, one entry per visible character.

/** Cap height in font units: the OS/2 value, else the height of "H". */
export function capHeight(font) {
  const os2 = font.tables.os2?.sCapHeight;
  if (os2 > 0) return os2;
  const box = font.charToGlyph("H").getBoundingBox();
  return box.y2 > 0 ? box.y2 : font.unitsPerEm * 0.7;
}

/** Flatten path commands into closed rings. `curve` is the segment count for a curve of length `len`. */
function flatten(commands, place) {
  const rings = [];
  let ring = [];
  let cx = 0;
  let cy = 0;
  const push = (x, y) => ring.push(place(x, y));
  const steps = (...pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return Math.max(4, Math.min(32, Math.ceil(len / 2)));
  };
  const close = () => {
    if (ring.length > 1) {
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (Math.hypot(fx - lx, fy - ly) < 1e-6) ring.pop();
    }
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const c of commands) {
    if (c.type === "M") {
      close();
      push(c.x, c.y);
    } else if (c.type === "L") push(c.x, c.y);
    else if (c.type === "Q") {
      const n = steps(place(cx, cy), place(c.x1, c.y1), place(c.x, c.y));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const d = u * u;
        push(a * cx + b * c.x1 + d * c.x, a * cy + b * c.y1 + d * c.y);
      }
    } else if (c.type === "C") {
      const n = steps(place(cx, cy), place(c.x1, c.y1), place(c.x2, c.y2), place(c.x, c.y));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const m = 1 - u;
        push(
          m * m * m * cx + 3 * m * m * u * c.x1 + 3 * m * u * u * c.x2 + u * u * u * c.x,
          m * m * m * cy + 3 * m * m * u * c.y1 + 3 * m * u * u * c.y2 + u * u * u * c.y,
        );
      }
    } else if (c.type === "Z") close();
    if (c.x !== undefined) {
      cx = c.x;
      cy = c.y;
    }
  }
  close();
  return rings;
}

/**
 * Lay out `text` so its cap height is `height` mm. `tracking` adds mm between letters.
 * Returns [{ ch, rings }]; spaces advance the pen but produce no entry.
 */
export function layoutText(font, text, height, tracking) {
  const s = height / capHeight(font);
  const upm = font.unitsPerEm;
  const out = [];
  let pen = 0;
  let prev = null;
  for (const ch of Array.from(text)) {
    const glyph = font.charToGlyph(ch);
    if (prev) pen += font.getKerningValue(prev, glyph) * s;
    // getPath(0, 0, upm) is in font units with y pointing down.
    const commands = glyph.getPath(0, 0, upm).commands;
    const x0 = pen;
    const rings = flatten(commands, (x, y) => [x0 + x * s, -y * s]);
    if (rings.length) out.push({ ch, rings });
    pen += glyph.advanceWidth * s + tracking;
    prev = glyph;
  }
  return out;
}
