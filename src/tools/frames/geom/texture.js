// Surface textures: a small z offset added to the moulding's top face while sweeping.
const hash = (ix, iy, seed) => {
  let n = (ix * 374761393 + iy * 668265263 + seed * 144665) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const fade = (t) => t * t * (3 - 2 * t);
/** Smooth value noise in 0..1. */
export function noise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * z offset for a texture at arc length `s` along the path, distance `u` across the moulding and
 * world position (x, y). Offsets lie in [-depth, 0] so a texture only ever cuts into the surface.
 */
export function textureOffset(tex, s, u, x, y) {
  const k = 1 / tex.scale;
  switch (tex.type) {
    case "woodgrain": {
      const streak = noise(u * 0.9 * k, s * 0.012 * k, tex.seed);
      const grain = noise(u * 5 * k, s * 0.08 * k + streak * 4, tex.seed + 7);
      return -tex.depth * (0.55 * streak + 0.45 * grain);
    }
    case "hammered": {
      const n = noise(x * 0.4 * k, y * 0.4 * k, tex.seed);
      return -tex.depth * (1 - Math.abs(2 * n - 1)) ** 1.5;
    }
    case "linen": {
      const p = (2 * Math.PI) / (1.4 * tex.scale);
      return -tex.depth * 0.5 * (1 + Math.sin(x * p) * Math.sin(y * p));
    }
    case "reeded":
      return -tex.depth * 0.5 * (1 + Math.cos((2 * Math.PI * u) / (2.4 * tex.scale)));
    default:
      return 0;
  }
}
