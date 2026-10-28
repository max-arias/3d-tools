// A WLED 2D ledmap for the letters: map[row * width + col] is the LED index in that cell, -1 for none.
// Row 0 is the top. Format: https://kno.wled.ge/advanced/mapping/

const MAX_CELLS = 4096; // bigger maps risk running WLED out of memory

/** Cell grid for `points` ([x, y] in mm, in LED order), cell size `cell` mm, grown to stay small. */
export function buildLedmap(points, cell) {
  if (!points.length) return { map: [], width: 0, height: 0 };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points)
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  let size = Math.max(cell, 0.5);
  let width;
  let height;
  do {
    width = Math.floor((x1 - x0) / size) + 1;
    height = Math.floor((y1 - y0) / size) + 1;
    if (width * height > MAX_CELLS) size *= 1.15;
  } while (width * height > MAX_CELLS);
  const map = new Array(width * height).fill(-1);
  points.forEach(([x, y], i) => {
    const col = Math.min(width - 1, Math.floor((x - x0) / size));
    const row = Math.min(height - 1, Math.floor((y1 - y) / size));
    // Two LEDs in one cell: take the nearest free cell, searching outwards.
    for (let r = 0; ; r++) {
      let placed = false;
      for (let dy = -r; dy <= r && !placed; dy++)
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = col + dx;
          const cy = row + dy;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height || map[cy * width + cx] !== -1)
            continue;
          map[cy * width + cx] = i;
          placed = true;
        }
      if (placed) break;
    }
  });
  return { map, width, height };
}
