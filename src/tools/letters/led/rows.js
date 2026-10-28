// Back-lit rows: parallel strip runs clipped to a letter's usable region. Pure polygon math.

/** x-intervals where the horizontal line `y` is inside the rings (even-odd). */
function crossings(rings, y) {
  const xs = [];
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

const swap = (rings) => rings.map((r) => r.map(([x, y]) => [y, x]));

/**
 * Runs of LEDs along lines `spacing` apart, centred on the region's height. `axis` "h" runs along x,
 * "v" along y. A run shorter than one `pitch` is dropped (counted in `dropped`).
 * Returns { runs: [{ pts: [[x, y], ...] }], dropped }.
 */
export function rowRuns(rings, { spacing, pitch, axis }) {
  const src = axis === "v" ? swap(rings) : rings;
  let [y0, y1] = [Infinity, -Infinity];
  for (const r of src) for (const [, y] of r) [y0, y1] = [Math.min(y0, y), Math.max(y1, y)];
  if (!(y1 > y0)) return { runs: [], dropped: 0 };
  const cy = (y0 + y1) / 2;
  const runs = [];
  let dropped = 0;
  const kMax = Math.ceil((y1 - y0) / 2 / spacing);
  for (let k = -kMax; k <= kMax; k++) {
    const y = cy + k * spacing + 1e-7;
    if (y < y0 || y > y1) continue;
    for (const [xa, xb] of crossings(src, y)) {
      const len = xb - xa;
      if (len < pitch) {
        dropped++;
        continue;
      }
      const n = Math.floor(len / pitch) + 1;
      const first = xa + (len - (n - 1) * pitch) / 2;
      const pts = Array.from({ length: n }, (_, i) => [first + i * pitch, y - 1e-7]);
      runs.push({ pts: axis === "v" ? pts.map(([x, yy]) => [yy, x]) : pts });
    }
  }
  return { runs, dropped };
}
