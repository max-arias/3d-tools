// Reading an uploaded file into the stored art: SVG through the browser's own path measuring, raster
// images through lib/trace.js. The raster source is kept in memory so colours and threshold can be
// changed without uploading again; after a reload only the traced art survives.
import { MAX_LAYERS, packArt, reduceShapes, ringArea, traceImage } from "../lib/trace.js";

const MAX_BYTES = 6 * 1024 * 1024;
const RASTER_SIDE = 256;

let source = null; // { data, w, h } of the last raster upload

export const hasRasterSource = () => !!source;

export class ArtError extends Error {}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");
const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function parseColor(css) {
  const m = /rgba?\(([^)]+)\)/.exec(css ?? "");
  if (!m) return null;
  const [r, g, b, a = 1] = m[1]
    .split(/[ ,/]+/)
    .filter(Boolean)
    .map(Number);
  return a === 0 ? null : [r, g, b];
}

// ---- raster ------------------------------------------------------------------------------------

async function loadRaster(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ArtError("artErrType");
  }
  const k = Math.min(1, RASTER_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  source = { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Trace the remembered raster with new options. Returns art, or null when nothing is left to print. */
export function retrace(opts) {
  if (!source) return null;
  const layers = traceImage(source.data, source.w, source.h, opts);
  return packArt(layers, "raster", opts);
}

// ---- svg ---------------------------------------------------------------------------------------

function sampleElement(el, closeHint) {
  const total = el.getTotalLength();
  if (!(total > 0)) return null;
  const n = Math.min(500, Math.max(12, Math.ceil(total / 0.4)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((total * i) / n);
    pts.push([p.x, p.y]);
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  const closed = closeHint || Math.hypot(first[0] - last[0], first[1] - last[1]) < total * 1e-3;
  if (closed && Math.hypot(first[0] - last[0], first[1] - last[1]) < total * 1e-3) pts.pop();
  return { pts, closed };
}

/** A path's subpaths as separate path data, with relative moves made absolute. */
function subpaths(svgNS, parent, d) {
  const parts = d.match(/[Mm][^Mm]*/g) ?? [];
  const out = [];
  let prefix = "";
  for (const part of parts) {
    let sub = part;
    if (part[0] === "m" && prefix) {
      // A relative move starts from where the previous subpath ended: measure that point.
      const probe = document.createElementNS(svgNS, "path");
      probe.setAttribute("d", prefix);
      parent.append(probe);
      const end = probe.getPointAtLength(probe.getTotalLength());
      probe.remove();
      const nums = part.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
      if (nums.length >= 2) {
        const rest = part
          .slice(1)
          .replace(/^\s*-?\d*\.?\d+(?:e[-+]?\d+)?[\s,]*-?\d*\.?\d+(?:e[-+]?\d+)?/i, "");
        sub = `M${end.x + Number(nums[0])} ${end.y + Number(nums[1])}${rest}`;
      }
    }
    prefix += part;
    out.push({ d: sub, closed: /[Zz]\s*$/.test(part) });
  }
  return out;
}

/** Polygon outline of a stroked polyline. Closed lines give two rings (outer and inner). */
function strokeRings(pts, width, closed) {
  const n = pts.length;
  if (n < 2) return [];
  const side = (sign) =>
    pts.map((p, i) => {
      const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)];
      const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [
        p[0] + (sign * -(b[1] - a[1]) * width) / 2 / len,
        p[1] + (sign * (b[0] - a[0]) * width) / 2 / len,
      ];
    });
  const left = side(1);
  const right = side(-1);
  return closed ? [left, right] : [[...left, ...right.reverse()]];
}

function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror"))
    throw new ArtError("artErrType");
  // The SVG has to be live in the page for the browser to measure and transform it.
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;height:1000px;pointer-events:none";
  const svg = document.importNode(root, true);
  svg.querySelectorAll("script,foreignObject").forEach((e) => e.remove()); // never run anything from the file
  host.append(svg);
  document.body.append(host);
  try {
    const svgNS = "http://www.w3.org/2000/svg";
    const byColour = new Map();
    let order = 0; // document order, so overlapping colours keep their paint order
    const add = (color, rule, rings) => {
      if (!rings.length) return;
      if (!byColour.has(color)) byColour.set(color, []);
      byColour.get(color).push({ rule, rings, order: order++ });
    };
    const els = [...svg.querySelectorAll("path,rect,circle,ellipse,polygon,polyline,line")].filter(
      (e) => !e.closest("defs,clipPath,mask,symbol,pattern,marker"),
    );
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const m = el.getCTM();
      if (!m) continue;
      const apply = (pts) =>
        pts.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      const fill = Number(cs.fillOpacity) > 0 ? parseColor(cs.fill) : null;
      const stroke = Number(cs.strokeOpacity) > 0 ? parseColor(cs.stroke) : null;
      const sw = parseFloat(cs.strokeWidth) * scale;
      const items =
        el.tagName === "path"
          ? subpaths(svgNS, el.parentNode, el.getAttribute("d") ?? "").map(({ d, closed }) => {
              const probe = document.createElementNS(svgNS, "path");
              probe.setAttribute("d", d);
              el.parentNode.append(probe);
              const sampled = sampleElement(probe, closed);
              probe.remove();
              return sampled;
            })
          : [sampleElement(el, ["rect", "circle", "ellipse", "polygon"].includes(el.tagName))];
      const rings = [];
      const strokes = [];
      for (const s of items) {
        if (!s || s.pts.length < 2) continue;
        const pts = apply(s.pts);
        if (fill && s.pts.length >= 3) rings.push(pts);
        if (stroke && sw > 0) strokes.push(...strokeRings(pts, sw, s.closed));
      }
      if (fill) add(rgbToHex(fill), cs.fillRule === "evenodd" ? "e" : "n", rings);
      if (stroke && strokes.length) add(rgbToHex(stroke), "e", strokes);
    }
    return byColour;
  } finally {
    host.remove();
  }
}

const dist = (a, b) => {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
};

/** Axis-aligned bounds of every point in a set of colour groups. */
function boundsOf(groups) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shapes of groups)
    for (const s of shapes)
      for (const r of s.rings)
        for (const [x, y] of r)
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
}

/** A plain rectangle covering (nearly) everything is a page background, not art. */
function dropBackground(byColour) {
  const [X0, Y0, X1, Y1] = boundsOf(byColour.values());
  const area = (ring) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      a += x0 * y1 - x1 * y0;
    }
    return Math.abs(a) / 2;
  };
  // Sampled outlines have hundreds of points, so judge a rectangle by its area against its bounds.
  const bleed = (ring) => {
    const [x0, y0, x1, y1] = boundsOf([[{ rings: [ring] }]]);
    const box = (x1 - x0) * (y1 - y0);
    return box > 0 && area(ring) >= 0.98 * box && box >= 0.95 * (X1 - X0) * (Y1 - Y0);
  };
  const others = [...byColour.values()]
    .flat()
    .filter((sh) => !(sh.rings.length === 1 && bleed(sh.rings[0])));
  if (!others.length) return; // the file is only a rectangle: keep it
  for (const [colour, shapes] of byColour) {
    const kept = shapes.filter((sh) => !(sh.rings.length === 1 && bleed(sh.rings[0])));
    if (kept.length) byColour.set(colour, kept);
    else byColour.delete(colour);
  }
}

const MAX_SVG_COLOURS = 6; // kept in the art, so a white "hole" colour still cuts
const PRINT_COLOURS = MAX_LAYERS; // switched on by default; the rest start off

function svgToArt(text) {
  const byColour = parseSvg(text);
  dropBackground(byColour);
  const weight = (shapes) =>
    shapes.reduce((n, s) => n + s.rings.reduce((m, r) => m + Math.abs(ringArea(r)), 0), 0);
  // Paint order = where each colour's first remaining shape sits in the file (a removed background
  // rectangle must not decide it).
  const first = (c) => Math.min(...byColour.get(c).map((sh) => sh.order));
  let colours = [...byColour.keys()].sort((a, b) => first(a) - first(b));
  if (colours.length > MAX_SVG_COLOURS) {
    // Beyond six, fold the smallest colours into the nearest kept one.
    const ranked = [...colours].sort((a, b) => weight(byColour.get(b)) - weight(byColour.get(a)));
    const keep = new Set(ranked.slice(0, MAX_SVG_COLOURS));
    for (const c of ranked.slice(MAX_SVG_COLOURS)) {
      const near = [...keep].reduce((best, k) => (dist(c, k) < dist(c, best) ? k : best));
      byColour.get(near).push(...byColour.get(c));
      byColour.delete(c);
    }
    colours = colours.filter((c) => keep.has(c));
  }
  const layers = colours
    .map((color) => ({
      color,
      shapes: reduceShapes(byColour.get(color), 0, 8000 / colours.length),
    }))
    .filter((l) => l.shapes.length);
  const art = packArt(layers, "svg");
  if (!art) return null;
  // Print the four biggest colours; the others stay in the art, switched off (they still cut).
  const ranked = layers.map((l, i) => [i, weight(l.shapes)]).sort((a, b) => b[1] - a[1]);
  for (const [i] of ranked.slice(PRINT_COLOURS)) art.layers[i].on = false;
  return art;
}

/** Read an uploaded file. `opts` are the raster trace options. Returns { art }, or throws ArtError. */
export async function importFile(file, opts) {
  if (file.size > MAX_BYTES) throw new ArtError("artErrBig");
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  let art;
  if (isSvg) {
    source = null;
    art = svgToArt(await file.text());
  } else {
    if (!file.type.startsWith("image/")) throw new ArtError("artErrType");
    await loadRaster(file);
    art = retrace(opts);
  }
  if (!art) throw new ArtError("artErrEmpty");
  return art;
}

/** Draw the traced art, in its colours, onto a canvas. */
export function drawThumb(canvas, art) {
  const size = 150;
  const k = size / Math.max(art.w, art.h);
  canvas.width = Math.ceil(art.w * k);
  canvas.height = Math.ceil(art.h * k);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of art.layers) {
    if (!layer.on) continue;
    ctx.fillStyle = layer.c;
    for (const shape of layer.s) {
      ctx.beginPath();
      for (const flat of shape.p) {
        ctx.moveTo(flat[0] * k, flat[1] * k);
        for (let i = 2; i < flat.length; i += 2) ctx.lineTo(flat[i] * k, flat[i + 1] * k);
        ctx.closePath();
      }
      ctx.fill(shape.r === "e" ? "evenodd" : "nonzero");
    }
  }
}
