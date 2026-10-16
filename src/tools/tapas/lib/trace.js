// Turn pixels into printable outlines: colour clustering, marching squares, simplification, and
// packing into the compact form stored in the project. Pure functions, no DOM.

export const ART_MAX = 4095; // stored coordinates run 0..ART_MAX on the longer side
export const MAX_LAYERS = 4;
const MAX_POINTS = 8000;

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * k-means on the opaque pixels. data = RGBA bytes. Returns { centers: [[r,g,b]], labels }, where
 * labels[i] is the cluster of pixel i or -1 for transparent pixels.
 */
export function cluster(data, w, h, k) {
  const labels = new Int16Array(w * h).fill(-1);
  const opaque = [];
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] >= 128) opaque.push(i);
  if (!opaque.length) return { centers: [], labels };
  const rand = rng(11);
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Train on pixels that agree with their neighbours: the soft blend along an edge would otherwise
  // become a colour of its own and take a slot. Every pixel is still assigned to a colour afterwards.
  const steadyPixel = (i) => {
    const x = i % w;
    const y = (i - x) / w;
    for (const j of [x + 1 < w ? i + 1 : -1, y + 1 < h ? i + w : -1]) {
      if (j < 0 || data[j * 4 + 3] < 128) continue;
      const d =
        Math.abs(data[i * 4] - data[j * 4]) +
        Math.abs(data[i * 4 + 1] - data[j * 4 + 1]) +
        Math.abs(data[i * 4 + 2] - data[j * 4 + 2]);
      if (d > 36) return false;
    }
    return true;
  };
  const steady = opaque.filter(steadyPixel);
  const pool = steady.length >= Math.max(50, opaque.length * 0.05) ? steady : opaque;
  const sample =
    pool.length > 20000 ? pool.filter((_, i) => i % Math.ceil(pool.length / 20000) === 0) : pool;
  // k-means++ seeding keeps small but distinct colours (a thin red line on white) from being lost.
  const centers = [px(sample[Math.floor(rand() * sample.length)])];
  while (centers.length < k) {
    const d2 = sample.map((i) => Math.min(...centers.map((c) => dist(px(i), c))));
    const total = d2.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = rand() * total;
    let pick = 0;
    for (; pick < d2.length - 1; pick++) {
      r -= d2[pick];
      if (r <= 0) break;
    }
    centers.push(px(sample[pick]));
  }
  for (let iter = 0; iter < 10; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const i of sample) {
      const p = px(i);
      let best = 0;
      for (let c = 1; c < centers.length; c++)
        if (dist(p, centers[c]) < dist(p, centers[best])) best = c;
      sum[best][0] += p[0];
      sum[best][1] += p[1];
      sum[best][2] += p[2];
      sum[best][3]++;
    }
    sum.forEach((s, c) => {
      if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  for (const i of opaque) {
    const p = px(i);
    let best = 0;
    for (let c = 1; c < centers.length; c++)
      if (dist(p, centers[c]) < dist(p, centers[best])) best = c;
    labels[i] = best;
  }
  return { centers, labels };
}

/** Box-blurred mask padded by one cell, so contours always close. */
function field(mask, w, h) {
  const W = w + 2;
  const H = h + 2;
  let a = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y + 1) * W + x + 1] = mask[y * w + x];
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) s += a[(y + dy) * W + x + dx];
        b[y * W + x] = s / 9;
      }
    a = b;
  }
  return { f: a, W, H };
}

// Segments per marching-squares case, as pairs of cell edges: t(op), r(ight), b(ottom), l(eft).
const CASES = {
  1: [["l", "b"]],
  2: [["b", "r"]],
  3: [["l", "r"]],
  4: [["t", "r"]],
  6: [["t", "b"]],
  7: [["t", "l"]],
  8: [["t", "l"]],
  9: [["t", "b"]],
  11: [["t", "r"]],
  12: [["l", "r"]],
  13: [["b", "r"]],
  14: [["l", "b"]],
};

/** Closed contours of `f` at `level`, as lists of [x, y] in pixel coordinates (y down). */
export function contours(f, W, H, level = 0.5) {
  const pts = new Map();
  const next = new Map();
  const link = (a, b) => {
    if (!next.has(a)) next.set(a, []);
    if (!next.has(b)) next.set(b, []);
    next.get(a).push(b);
    next.get(b).push(a);
  };
  const lerp = (v0, v1) => (level - v0) / (v1 - v0);
  const edge = (name, x, y, tl, tr, br, bl) => {
    // Horizontal edge ids are even, vertical ones odd.
    if (name === "t") {
      const id = (y * W + x) * 2;
      if (!pts.has(id)) pts.set(id, [x + lerp(tl, tr), y]);
      return id;
    }
    if (name === "b") {
      const id = ((y + 1) * W + x) * 2;
      if (!pts.has(id)) pts.set(id, [x + lerp(bl, br), y + 1]);
      return id;
    }
    if (name === "l") {
      const id = (y * W + x) * 2 + 1;
      if (!pts.has(id)) pts.set(id, [x, y + lerp(tl, bl)]);
      return id;
    }
    const id = (y * W + x + 1) * 2 + 1;
    if (!pts.has(id)) pts.set(id, [x + 1, y + lerp(tr, br)]);
    return id;
  };
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const tl = f[y * W + x];
      const tr = f[y * W + x + 1];
      const br = f[(y + 1) * W + x + 1];
      const bl = f[(y + 1) * W + x];
      const idx =
        (tl >= level ? 8 : 0) |
        (tr >= level ? 4 : 0) |
        (br >= level ? 2 : 0) |
        (bl >= level ? 1 : 0);
      let segs = CASES[idx];
      if (idx === 5 || idx === 10) {
        const centre = (tl + tr + br + bl) / 4 >= level;
        // 5: top-right and bottom-left high. 10: top-left and bottom-right high.
        segs =
          idx === 5
            ? centre
              ? [
                  ["t", "l"],
                  ["b", "r"],
                ]
              : [
                  ["t", "r"],
                  ["l", "b"],
                ]
            : centre
              ? [
                  ["t", "r"],
                  ["l", "b"],
                ]
              : [
                  ["t", "l"],
                  ["b", "r"],
                ];
      }
      if (!segs) continue;
      for (const [a, b] of segs) link(edge(a, x, y, tl, tr, br, bl), edge(b, x, y, tl, tr, br, bl));
    }
  const seen = new Set();
  const loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let prev = -1;
    let cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      ring.push(pts.get(cur));
      const [a, b] = next.get(cur);
      const nxt = a !== prev && !seen.has(a) ? a : !seen.has(b) ? b : undefined;
      prev = cur;
      cur = nxt;
    }
    if (ring.length >= 3) loops.push(ring);
  }
  return loops;
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function dp(points, eps) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let worst = 0;
  let at = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= eps) return [points[0], points[points.length - 1]];
  const left = dp(points.slice(0, at + 1), eps);
  return [...left.slice(0, -1), ...dp(points.slice(at), eps)];
}

/** Douglas-Peucker for a closed ring: split at the point farthest from the first one. */
export function simplifyRing(ring, eps) {
  let far = 0;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = dp(ring.slice(0, far + 1), eps);
  const b = dp([...ring.slice(far), ring[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const total = (shapes) => shapes.reduce((n, s) => n + s.rings.reduce((m, r) => m + r.length, 0), 0);

/** Simplify every ring harder until the whole thing fits the point budget; drop specks. */
export function reduceShapes(shapes, minArea, budget = MAX_POINTS) {
  let eps = 0.6;
  let out = shapes;
  for (let i = 0; i < 12; i++) {
    out = shapes
      .map((s) => ({
        ...s,
        rings: s.rings
          .map((r) => simplifyRing(r, eps))
          .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= minArea),
      }))
      .filter((s) => s.rings.length);
    if (total(out) <= budget) break;
    eps *= 1.5;
    minArea *= 1.5;
  }
  return out;
}

/**
 * Trace an RGBA image into colour layers.
 * opts: { n: 1..4 colours, thr: 0..255 and inv: when n = 1, bg: drop the background colour when n > 1 }.
 * Returns [{ color, shapes: [{ rule: "e", rings }] }] in pixel coordinates, y down.
 */
export function traceImage(data, w, h, opts) {
  const n = Math.min(MAX_LAYERS, Math.max(1, opts.n | 0));
  const masks = [];
  if (n === 1) {
    const mask = new Uint8Array(w * h);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] < 128) continue;
      const dark = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < opts.thr;
      if (dark !== !!opts.inv) {
        mask[i] = 1;
        r += data[i * 4];
        g += data[i * 4 + 1];
        b += data[i * 4 + 2];
        count++;
      }
    }
    masks.push({ mask, color: count ? hex([r / count, g / count, b / count]) : "#222222" });
  } else {
    // One extra cluster for the background, which is dropped again below.
    const { centers, labels } = cluster(data, w, h, opts.bg ? n + 1 : n);
    let drop = -1;
    if (opts.bg && centers.length > 1) {
      const border = Array.from({ length: centers.length }, () => 0);
      let seen = 0;
      for (let x = 0; x < w; x++)
        for (const y of [0, h - 1]) {
          const l = labels[y * w + x];
          if (l >= 0) {
            border[l]++;
            seen++;
          }
        }
      for (let y = 1; y < h - 1; y++)
        for (const x of [0, w - 1]) {
          const l = labels[y * w + x];
          if (l >= 0) {
            border[l]++;
            seen++;
          }
        }
      const top = border.indexOf(Math.max(...border));
      if (seen && border[top] / seen >= 0.5) drop = top;
    }
    const kept = [];
    centers.forEach((c, k) => {
      if (k === drop) return;
      const mask = new Uint8Array(w * h);
      let count = 0;
      for (let i = 0; i < w * h; i++)
        if (labels[i] === k) {
          mask[i] = 1;
          count++;
        }
      kept.push({ mask, color: hex(c), count });
    });
    // No background found: still never return more colours than asked for (drop the smallest).
    kept.sort((a, b) => b.count - a.count);
    masks.push(...kept.slice(0, n));
  }
  const layers = [];
  for (const { mask, color } of masks) {
    const { f, W, H } = field(mask, w, h);
    const rings = contours(f, W, H).map((ring) => ring.map(([x, y]) => [x - 0.5, y - 0.5]));
    const shapes = reduceShapes([{ rule: "e", rings }], 3);
    if (shapes.length) layers.push({ color, shapes });
  }
  return layers;
}

/**
 * Quantise layers of float shapes into the stored form:
 * { v, kind, w, h, layers: [{ c, on, s: [{ r, p: [[x0, y0, x1, y1, ...]] }] }], src }.
 * Returns null when there is nothing to print.
 */
export function packArt(layers, kind, src = null) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const L of layers)
    for (const s of L.shapes)
      for (const ring of s.rings)
        for (const [x, y] of ring) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
  if (!Number.isFinite(x0) || x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  const q = ART_MAX / Math.max(x1 - x0, y1 - y0);
  return {
    v: 1,
    kind,
    w: Math.max(1, Math.round((x1 - x0) * q)),
    h: Math.max(1, Math.round((y1 - y0) * q)),
    layers: layers.map((L) => ({
      c: L.color,
      on: true,
      s: L.shapes.map((s) => ({
        r: s.rule,
        p: s.rings.map((ring) =>
          ring.flatMap(([x, y]) => [Math.round((x - x0) * q), Math.round((y - y0) * q)]),
        ),
      })),
    })),
    src,
  };
}
