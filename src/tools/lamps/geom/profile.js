// The shade profile: a smooth radius curve through the user's nodes.

/**
 * Monotone cubic Hermite (Fritsch-Carlson) through [z, r] knots, so the curve never overshoots
 * a node and the radius never goes negative. Returns r(z) for z in 0..1.
 */
export function profileCurve(nodes) {
  const zs = nodes.map((n) => n.z);
  const rs = nodes.map((n) => n.d / 2);
  const n = zs.length;
  const dz = [];
  const sl = [];
  for (let i = 0; i < n - 1; i++) {
    dz.push(zs[i + 1] - zs[i]);
    sl.push((rs[i + 1] - rs[i]) / dz[i]);
  }
  const m = Array.from({ length: n }, () => 0);
  m[0] = sl[0];
  m[n - 1] = sl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / sl[i];
    const b = m[i + 1] / sl[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * sl[i];
      m[i + 1] = k * b * sl[i];
    }
  }
  return (z) => {
    const t = Math.min(1, Math.max(0, z));
    let i = 0;
    while (i < n - 2 && t > zs[i + 1]) i++;
    const h = dz[i];
    const u = (t - zs[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * rs[i] +
      (u3 - 2 * u2 + u) * h * m[i] +
      (-2 * u3 + 3 * u2) * rs[i + 1] +
      (u3 - u2) * h * m[i + 1]
    );
  };
}

/** Rib profile in 0..1 (0 = valley, 1 = peak) for a phase in radians; the peak is at phase 0. */
export function wave(kind, phase) {
  if (kind === "scallop") return Math.abs(Math.cos(phase / 2));
  if (kind === "triangle") {
    const p = ((((phase + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return 1 - Math.abs(p) / Math.PI;
  }
  return 0.5 + 0.5 * Math.cos(phase);
}

/** Outer radius at height fraction `t` and angle `theta`. */
export function outerRadius(base, ribs, t, theta) {
  if (!ribs.depth) return base;
  const twist = (ribs.twist * Math.PI) / 180;
  return base + ribs.depth * wave(ribs.wave, ribs.count * (theta + twist * t));
}
