// What the live preview and the handles need to know about the cover's outline: where it sits,
// how big it really is, and the box around it. Pure; the stage supplies the outline polygon.
import { bounds, effectiveK, mustShape, overlayBox, transform } from "../geom/fit2d.js";
import { CENTRED } from "../geom/shapes.js";

const mustCache = new Map();
/** The shape the outline must cover: the pocket plus a wall. */
export function mustPoints(b) {
  const key = `${b.w}|${b.h}|${b.r}`;
  if (!mustCache.has(key)) {
    if (mustCache.size > 20) mustCache.clear();
    mustCache.set(key, mustShape(b.w, b.h, b.r));
  }
  return mustCache.get(key);
}

/** Where the outline sits: the typed offset, or (auto) centred / the last build's best offset. */
export function offsetFor(o, built) {
  if (o.place === "manual") return { dx: o.dx, dy: o.dy };
  if (CENTRED.has(o.shape)) return { dx: 0, dy: 0 };
  return built ?? { dx: 0, dy: 0 };
}

/** `unit` is the outline at its own size (from the worker); `built` the last build's placement. */
export function shapeModel(p, unit, built) {
  const o = p.overlay;
  const b = overlayBox(p);
  const must = mustPoints(b);
  const at = offsetFor(o, built);
  const k = effectiveK(unit, must, o, at, b);
  const [x0, x1, y0, y1] = bounds(unit);
  const place = { k, rot: o.rot, dx: at.dx, dy: at.dy };
  return {
    o,
    b,
    unit,
    must,
    at,
    k,
    sizeMM: k * Math.max(b.w, b.h),
    corners: transform(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      place,
    ),
    top: transform([[(x0 + x1) / 2, y1]], place)[0],
    center: transform([[(x0 + x1) / 2, (y0 + y1) / 2]], place)[0],
  };
}
