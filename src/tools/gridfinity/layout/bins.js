// Bin placement rules. Coordinates are in cells (0.5 steps); y grows toward the back.
const EPS = 1e-9;

export const overlaps = (a, b) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.d - EPS && b.y < a.y + a.d - EPS;

/** A rect is valid when it is at least half a cell, inside the grid, and clear of every other bin. */
export function isValid(grid, bins, rect, ignoreId = null) {
  if (rect.w < 0.5 || rect.d < 0.5 || rect.x < 0 || rect.y < 0) return false;
  if (rect.x + rect.w > grid.cols + EPS || rect.y + rect.d > grid.rows + EPS) return false;
  return !bins.some((b) => b.id !== ignoreId && overlaps(b, rect));
}

const snap = (v, step) => Math.round(v / step) * step;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Rect spanning two corner cells (cell coordinates already snapped to `step`). */
export function rectFromCells(a, b, step) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + step, d: Math.abs(a.y - b.y) + step };
}

export function moveRect(rect, dx, dy, step, grid) {
  return {
    ...rect,
    x: clamp(snap(rect.x + dx, step), 0, grid.cols - rect.w),
    y: clamp(snap(rect.y + dy, step), 0, grid.rows - rect.d),
  };
}

/** Move the dragged edges ("l","r","f","b") to the pointer, keeping at least one step of size. */
export function resizeRect(rect, edges, point, step) {
  let { x, y, w, d } = rect;
  if (edges.includes("l")) {
    const nx = Math.min(snap(point.x, step), x + w - step);
    w += x - nx;
    x = nx;
  }
  if (edges.includes("r")) w = Math.max(snap(point.x, step), x + step) - x;
  if (edges.includes("f")) {
    const ny = Math.min(snap(point.y, step), y + d - step);
    d += y - ny;
    y = ny;
  }
  if (edges.includes("b")) d = Math.max(snap(point.y, step), y + step) - y;
  return { x, y, w, d };
}

/** First unused id of the form b{n}, starting at bins.length + 1. */
export function nextId(bins) {
  const used = new Set(bins.map((b) => b.id));
  let n = bins.length + 1;
  while (used.has(`b${n}`)) n++;
  return `b${n}`;
}

/** Nearest free spot for a copy: to the right, then behind, then any position. Null when none. */
export function duplicateSpot(grid, bins, bin) {
  const tries = [
    { x: bin.x + bin.w, y: bin.y },
    { x: bin.x, y: bin.y + bin.d },
  ];
  for (const t of tries) {
    const r = { x: t.x, y: t.y, w: bin.w, d: bin.d };
    if (isValid(grid, bins, r)) return r;
  }
  for (let y = 0; y + bin.d <= grid.rows + EPS; y += 0.5) {
    for (let x = 0; x + bin.w <= grid.cols + EPS; x += 0.5) {
      const r = { x, y, w: bin.w, d: bin.d };
      if (isValid(grid, bins, r)) return r;
    }
  }
  return null;
}

// Occupancy at half-cell resolution: index (hx, hy) covers [hx/2, hx/2 + 0.5).
function occupancy(grid, bins) {
  const W = grid.cols * 2;
  const H = grid.rows * 2;
  const cells = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  for (const b of bins) {
    for (let hy = Math.round(b.y * 2); hy < Math.min(H, Math.round((b.y + b.d) * 2)); hy++) {
      for (let hx = Math.round(b.x * 2); hx < Math.min(W, Math.round((b.x + b.w) * 2)); hx++)
        cells[hy][hx] = true;
    }
  }
  return { cells, W, H };
}

const free = (o, hx, hy, hw, hh) => {
  if (hx + hw > o.W || hy + hh > o.H) return false;
  for (let y = hy; y < hy + hh; y++)
    for (let x = hx; x < hx + hw; x++) if (o.cells[y][x]) return false;
  return true;
};
const mark = (o, hx, hy, hw, hh) => {
  for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hw; x++) o.cells[y][x] = true;
};

/** Fill every free cell with bins of at most `max` cells (default 2 × 2). Returns new rects. */
export function fillEmpty(grid, bins, max = { w: 2, d: 2 }) {
  const o = occupancy(grid, bins);
  const out = [];
  const add = (hx, hy, hw, hh) => {
    mark(o, hx, hy, hw, hh);
    out.push({ x: hx / 2, y: hy / 2, w: hw / 2, d: hh / 2 });
  };
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (!free(o, cx * 2, cy * 2, 2, 2)) continue;
      let w = 1;
      while (w < max.w && cx + w < grid.cols && free(o, (cx + w) * 2, cy * 2, 2, 2)) w++;
      let d = 1;
      while (d < max.d && cy + d < grid.rows && free(o, cx * 2, (cy + d) * 2, w * 2, 2)) d++;
      add(cx * 2, cy * 2, w * 2, d * 2);
    }
  }
  // Leftover free half-cells: prefer 1 × 0.5 or 0.5 × 1 bins, else 0.5 × 0.5.
  for (let hy = 0; hy < o.H; hy++) {
    for (let hx = 0; hx < o.W; hx++) {
      if (o.cells[hy][hx]) continue;
      if (hx % 2 === 0 && free(o, hx, hy, 2, 1)) add(hx, hy, 2, 1);
      else if (hy % 2 === 0 && free(o, hx, hy, 1, 2)) add(hx, hy, 1, 2);
      else add(hx, hy, 1, 1);
    }
  }
  return out;
}

/**
 * Round fractional bins to whole cells when half cells are turned off.
 * Each bin takes the closest whole-cell rect that is free. Returns { bins, rounded, kept }.
 */
export function roundToWholeCells(grid, bins) {
  let rounded = 0;
  let kept = 0;
  const result = bins.map((b) => ({ ...b }));
  for (const bin of result) {
    if ([bin.x, bin.y, bin.w, bin.d].every(Number.isInteger)) continue;
    const opts = (v) => [...new Set([Math.floor(v), Math.ceil(v)])];
    const candidates = [];
    for (const x of opts(bin.x))
      for (const y of opts(bin.y)) {
        for (const w of opts(bin.w))
          for (const d of opts(bin.d)) {
            if (w < 1 || d < 1) continue;
            const rect = { x, y, w, d };
            const shrinks = (w < bin.w ? 1 : 0) + (d < bin.d ? 1 : 0);
            candidates.push({
              rect,
              size: Math.abs(w - bin.w) + Math.abs(d - bin.d),
              shrinks,
              move: Math.abs(x - bin.x) + Math.abs(y - bin.y),
            });
          }
      }
    candidates.sort((a, b) => a.size - b.size || a.shrinks - b.shrinks || a.move - b.move);
    const pick = candidates.find((c) => isValid(grid, result, c.rect, bin.id));
    if (pick) {
      Object.assign(bin, pick.rect);
      rounded++;
    } else {
      kept++;
    }
  }
  return { bins: result, rounded, kept };
}

export const hasFractional = (bins) =>
  bins.some((b) => [b.x, b.y, b.w, b.d].some((v) => !Number.isInteger(v)));
