// Cell maths for the bin editor. Cells are { x, y } with y = 0 at the front; the drawing puts the
// front at the bottom, so the editor flips y when it converts a pointer position.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The grid cell under a pointer, given the grid's on-screen rectangle. Clamped inside the grid. */
export function cellAt(px, py, rect, grid) {
  const col = Math.floor(((px - rect.left) / rect.width) * grid.x);
  const row = Math.floor(((py - rect.top) / rect.height) * grid.y);
  return { x: clamp(col, 0, grid.x - 1), y: clamp(grid.y - 1 - row, 0, grid.y - 1) };
}

/** The bin rectangle { x, y, w, d } spanned by a drag from cell `a` to cell `b`. */
export function dragRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    d: Math.abs(a.y - b.y) + 1,
  };
}

/** Whether rectangle `r` overlaps any bin. */
export const overlaps = (r, bins) =>
  bins.some((b) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.d && b.y < r.y + r.d);

/** The bin covering cell `c`, or null. */
export const binAt = (bins, c) =>
  bins.find((b) => c.x >= b.x && c.x < b.x + b.w && c.y >= b.y && c.y < b.y + b.d) ?? null;

/** Every cell of the grid no bin covers, in reading order from the front left. */
export function emptyCells(bins, grid) {
  const out = [];
  for (let y = 0; y < grid.y; y++)
    for (let x = 0; x < grid.x; x++) if (!binAt(bins, { x, y })) out.push({ x, y });
  return out;
}

export const newBin = (r) => ({
  x: r.x,
  y: r.y,
  w: r.w,
  d: r.d,
  dividersX: 0,
  dividersY: 0,
  scoop: false,
  label: false,
});

/** Bins the user lists as rows { w, d, count }, expanded to one { w, d } per copy. */
export const expandBins = (rows) =>
  rows.flatMap((r) => Array.from({ length: r.count }, () => ({ w: r.w, d: r.d })));
