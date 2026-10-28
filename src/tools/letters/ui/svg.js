// Reading an uploaded SVG into outline rings. The browser measures the paths (getPointAtLength), so
// this runs on the main thread; only the flattened rings go to the worker. Adapted from
// tapas/ui/art.js, but every fill is merged into one silhouette (colour does not matter here).
const MAX_BYTES = 4 * 1024 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";

export class SvgError extends Error {}

function sample(el, closeHint) {
  const total = el.getTotalLength();
  if (!(total > 0)) return null;
  const n = Math.min(600, Math.max(12, Math.ceil(total / 0.5)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((total * i) / n);
    pts.push([p.x, p.y]);
  }
  const gap = Math.hypot(pts[0][0] - pts[n][0], pts[0][1] - pts[n][1]);
  const closed = closeHint || gap < total * 1e-3;
  if (closed && gap < total * 1e-3) pts.pop();
  return { pts, closed };
}

/** A path's subpaths as separate path data (relative moves made absolute). */
function subpaths(parent, d) {
  const parts = d.match(/[Mm][^Mm]*/g) ?? [];
  const out = [];
  let prefix = "";
  for (const part of parts) {
    let sub = part;
    if (part[0] === "m" && prefix) {
      const probe = document.createElementNS(SVG_NS, "path");
      probe.setAttribute("d", prefix);
      parent.append(probe);
      const end = probe.getPointAtLength(probe.getTotalLength());
      probe.remove();
      const num = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
      const nums = part.slice(1).match(num) ?? [];
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

/** Polygon outline of a stroked polyline; a closed line gives two rings (use even-odd). */
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

const visible = (c) => c && c !== "none" && !/rgba\([^)]*,\s*0\)$/.test(c);

/** Douglas-Peucker on a closed ring. */
function simplify(ring, tol) {
  if (ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length);
  const stack = [[0, ring.length - 1]];
  keep[0] = keep[ring.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let at = -1;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / len;
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const bounds = (rings) => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r)
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
};

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
};

/** A single rectangle covering (nearly) everything is a page background, not artwork. */
function dropBackground(entries) {
  const [X0, Y0, X1, Y1] = bounds(entries.flatMap((e) => e.rings));
  const bleed = (e) => {
    if (e.rings.length !== 1) return false;
    const [x0, y0, x1, y1] = bounds(e.rings);
    const box = (x1 - x0) * (y1 - y0);
    return box > 0 && ringArea(e.rings[0]) >= 0.98 * box && box >= 0.95 * (X1 - X0) * (Y1 - Y0);
  };
  const kept = entries.filter((e) => !bleed(e));
  return kept.length ? kept : entries;
}

/** Parse SVG text into [{ rule, rings }] in the file's own units (y down). Throws SvgError. */
export function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror"))
    throw new SvgError("svgType");
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;height:1000px;pointer-events:none";
  const svg = document.importNode(root, true);
  svg.querySelectorAll("script,foreignObject").forEach((e) => e.remove()); // never run anything from the file
  host.append(svg);
  document.body.append(host);
  const entries = [];
  try {
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
      const fill = Number(cs.fillOpacity) > 0 && visible(cs.fill);
      const stroke = Number(cs.strokeOpacity) > 0 && visible(cs.stroke);
      const sw = parseFloat(cs.strokeWidth) * scale;
      const sampled =
        el.tagName === "path"
          ? subpaths(el.parentNode, el.getAttribute("d") ?? "").map(({ d, closed }) => {
              const probe = document.createElementNS(SVG_NS, "path");
              probe.setAttribute("d", d);
              el.parentNode.append(probe);
              const s = sample(probe, closed);
              probe.remove();
              return s;
            })
          : [sample(el, ["rect", "circle", "ellipse", "polygon"].includes(el.tagName))];
      const fills = [];
      const strokes = [];
      for (const s of sampled) {
        if (!s || s.pts.length < 2) continue;
        const pts = apply(s.pts);
        if (fill && pts.length >= 3) fills.push(pts);
        if (stroke && sw > 0) strokes.push(...strokeRings(pts, sw, s.closed));
      }
      if (fills.length)
        entries.push({ rule: cs.fillRule === "evenodd" ? "EvenOdd" : "NonZero", rings: fills });
      if (strokes.length) entries.push({ rule: "EvenOdd", rings: strokes });
    }
  } finally {
    host.remove();
  }
  if (!entries.length) throw new SvgError("svgEmpty");
  const kept = dropBackground(entries);
  const [x0, y0, x1, y1] = bounds(kept.flatMap((e) => e.rings));
  const tol = Math.max(x1 - x0, y1 - y0) * 0.0007;
  const round = (v) => Math.round(v * 100) / 100;
  return kept.map((e) => ({
    rule: e.rule,
    rings: e.rings
      .map((r) => simplify(r, tol).map(([x, y]) => [round(x), round(y)]))
      .filter((r) => r.length >= 3),
  }));
}

/** Read an uploaded file into outlines. Throws SvgError with a strings key as the message. */
export async function importSvg(file) {
  if (file.size > MAX_BYTES) throw new SvgError("svgBig");
  if (!(file.type === "image/svg+xml" || /\.svg$/i.test(file.name))) throw new SvgError("svgType");
  return parseSvg(await file.text());
}
