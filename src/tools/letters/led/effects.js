// Preview colours for the effects in model/effects.js. Each is drawn from how the WLED effect looks
// (not from WLED's code), over the LED index like WLED does without a 2D map. Approximate.
const PRIMARY = [255, 160, 0]; // WLED's default colour

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fract = (v) => v - Math.floor(v);
const scale = (c, k) => c.map((v) => v * k);

function hsv(h, s = 1, v = 1) {
  const i = Math.floor(fract(h) * 6);
  const f = fract(h) * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, u, p],
    [q, v, p],
    [p, v, u],
    [p, q, v],
    [u, p, v],
    [v, p, q],
  ][i % 6];
  return [r * 255, g * 255, b * 255];
}

/** Black, red, orange, yellow, white: the fire palette. */
function heat(h) {
  const x = clamp01(h) * 3;
  if (x < 1) return [x * 255, 0, 0];
  if (x < 2) return [255, (x - 1) * 160, 0];
  return [255, 160 + (x - 2) * 95, (x - 2) * 255];
}

const noise = (x) => {
  const i = Math.floor(x);
  const a = fract(Math.sin(i * 127.1) * 43758.5453);
  const b = fract(Math.sin((i + 1) * 127.1) * 43758.5453);
  const u = fract(x);
  return a + (b - a) * u * u * (3 - 2 * u);
};

const DRAW = {
  0: () => PRIMARY,
  2: (t, i, n, sp) => scale(PRIMARY, 0.08 + 0.92 * (Math.sin(t * sp * 2.4) * 0.5 + 0.5)),
  3: (t, i, n, sp) => {
    const phase = (t * sp * 0.25) % 2;
    const pos = phase % 1;
    return phase < 1 === i / n < pos ? PRIMARY : [0, 0, 0];
  },
  8: (t, i, n, sp) => hsv(t * sp * 0.08),
  9: (t, i, n, sp) => hsv(i / n + t * sp * 0.08),
  13: (t, i, n, sp) => ((i - Math.floor(t * sp * 4)) % 3 === 0 ? PRIMARY : [0, 0, 0]),
  15: (t, i, n, sp) => scale(PRIMARY, Math.sin(i * 0.7 - t * sp * 5) * 0.5 + 0.5),
  66: (t, i, n, sp, ix) => {
    const flick = noise(i * 0.45 - t * sp * 4) * 0.7 + noise(i * 1.3 + t * sp * 7) * 0.3;
    return heat(flick * (0.55 + ix / 400) + 0.08);
  },
  67: (t, i, n, sp) =>
    hsv(
      0.55 +
        0.25 * Math.sin((i / n) * 5 + t * sp * 0.5) +
        0.1 * Math.sin((i / n) * 13 - t * sp * 0.8),
    ),
  76: (t, i, n, sp) => {
    const trail = Math.max(4, n * 0.18);
    const head = (t * sp * n * 0.12) % (n + trail);
    const d = head - i;
    return d >= 0 && d < trail ? scale([255, 255, 255], Math.exp((-d * 4) / trail)) : [10, 6, 0];
  },
};

/** [r, g, b] (0-255) of LED `i` of `n` at time `t` seconds, for WLED effect id `fx`. */
export function colorAt(fx, t, i, n, sx = 128, ix = 128) {
  const draw = DRAW[fx] ?? DRAW[0];
  return draw(t, i, n, 0.2 + sx / 128, ix);
}
