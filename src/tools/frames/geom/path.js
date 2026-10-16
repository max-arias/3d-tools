// Window outlines. Every path is a counter-clockwise polygon centred on the origin.
const arcPts = (cx, cy, r, a0, a1, n) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

/** Window size after the shape's own constraints (circle and polygon are square). */
export function effectiveWin(shape, win) {
  if (shape.type === "circle" || shape.type === "polygon") {
    const d = Math.min(win[0], win[1]);
    return [d, d];
  }
  return win;
}

export function windowPath(shape, win) {
  const [w, h] = effectiveWin(shape, win);
  const hw = w / 2;
  const hh = h / 2;
  switch (shape.type) {
    case "rounded": {
      const r = Math.min(shape.radius, hw - 0.01, hh - 0.01);
      if (r < 0.05) break;
      return [
        ...arcPts(hw - r, -hh + r, r, -Math.PI / 2, 0, 10),
        ...arcPts(hw - r, hh - r, r, 0, Math.PI / 2, 10),
        ...arcPts(-hw + r, hh - r, r, Math.PI / 2, Math.PI, 10),
        ...arcPts(-hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI, 10),
      ];
    }
    case "oval":
    case "circle":
      return Array.from({ length: 96 }, (_, i) => {
        const a = (2 * Math.PI * i) / 96;
        return [hw * Math.cos(a), hh * Math.sin(a)];
      });
    case "arch": {
      if (h <= hw) break;
      return [[-hw, -hh], [hw, -hh], ...arcPts(0, hh - hw, hw, 0, Math.PI, 40)];
    }
    case "polygon": {
      const n = shape.sides;
      const R = hw / Math.cos(Math.PI / n);
      return Array.from({ length: n }, (_, k) => {
        const a = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
        return [R * Math.cos(a), R * Math.sin(a)];
      });
    }
  }
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
}

/**
 * Points where the line `axis` = `at` (axis 0: x = at, axis 1: y = at) crosses the path, each with
 * the outward normal of the crossed edge: [{ p: [x, y], n: [nx, ny] }].
 */
export function crossings(path, axis, at) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const da = a[axis] - at;
    const db = b[axis] - at;
    if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
      const t = da / (da - db);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      out.push({ p, n: [dy / l, -dx / l] });
    }
  }
  return out;
}

/** Distance from the origin to the outline along the x axis when `dx` is set, otherwise along y. */
export function rayHit(win, dx) {
  // `win` here is the window size [w, h]; shapes reach their bounding box at the axis extremes.
  return dx ? win[0] / 2 : win[1] / 2;
}
