// Divider ribs in baseplate sockets next to half-cell-wide bins.
const eq = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Rib segments, one per cell a rib passes through.
 * { axis: "v"|"h", line, cell, from, to } in cells. "v" ribs run along y at x = line.
 * Segments on the same line and cell that touch are merged.
 */
export function ribSegments(bins) {
  const raw = [];
  const add = (axis, line, lo, hi) => {
    for (let c = Math.floor(lo + 1e-9); c < hi - 1e-9; c++) {
      raw.push({ axis, line, cell: c, from: Math.max(lo, c), to: Math.min(hi, c + 1) });
    }
  };
  for (const b of bins) {
    if (eq(b.w, 0.5)) add("v", Number.isInteger(b.x) ? b.x + 0.5 : b.x, b.y, b.y + b.d);
    if (eq(b.d, 0.5)) add("h", Number.isInteger(b.y) ? b.y + 0.5 : b.y, b.x, b.x + b.w);
  }
  raw.sort(
    (a, b) => a.axis.localeCompare(b.axis) || a.line - b.line || a.cell - b.cell || a.from - b.from,
  );
  const merged = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.axis === s.axis &&
      eq(last.line, s.line) &&
      last.cell === s.cell &&
      s.from <= last.to + 1e-9
    ) {
      last.to = Math.max(last.to, s.to);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Half-width bins whose neighbouring half cell is empty: they can slide in their socket ("shared" mode). */
export function slidingBins(grid, bins) {
  const taken = (x, y) =>
    bins.some((o) => x >= o.x && x < o.x + o.w - 1e-9 && y >= o.y && y < o.y + o.d - 1e-9);
  const out = [];
  for (const b of bins) {
    const gaps = [];
    if (eq(b.w, 0.5)) {
      const nx = Number.isInteger(b.x) ? b.x + 0.5 : b.x - 0.5;
      for (let y = b.y; y < b.y + b.d - 1e-9; y += 0.5) gaps.push([nx, y]);
    }
    if (eq(b.d, 0.5)) {
      const ny = Number.isInteger(b.y) ? b.y + 0.5 : b.y - 0.5;
      for (let x = b.x; x < b.x + b.w - 1e-9; x += 0.5) gaps.push([x, ny]);
    }
    if (gaps.some(([x, y]) => x >= 0 && y >= 0 && x < grid.cols && y < grid.rows && !taken(x, y)))
      out.push(b);
  }
  return out;
}
