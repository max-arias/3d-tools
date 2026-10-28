// Pure maths for moving an uploaded image by dragging it in the preview.
// Points are on the face plane in view coordinates (mm). The cover is shown turned over, so view x
// runs the opposite way to the design's x; y is the same.

export const LIMIT = 250; // mm the image may be moved either way; whatever leaves the face is clipped away

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const tenth = (v) => Math.round(v * 10) / 10;

/** New placement after the pointer moved from `start` to `hit`. */
export function dragPlacement({ start, hit, ax, ay }) {
  return {
    ax: clamp(tenth(ax - (hit.x - start.x)), -LIMIT, LIMIT),
    ay: clamp(tenth(ay + (hit.y - start.y)), -LIMIT, LIMIT),
  };
}

/**
 * New offset of the cover's outline after the pointer moved from `start` to `hit` (view mm).
 * The cover is shown turned over, so view x is the design's x reversed, as for the image.
 */
export function shapeDrag({ start, hit, dx, dy }) {
  return {
    dx: clamp(Math.round((dx - (hit.x - start.x)) * 2) / 2, -150, 150),
    dy: clamp(Math.round((dy + (hit.y - start.y)) * 2) / 2, -150, 150),
  };
}

/** Rotation in degrees after turning by `step`, kept in 0-359. */
export const turn = (rot, step) => ((Math.round(rot + step) % 360) + 360) % 360;

/** Size of the image's box in mm, for a given size of its longer side. */
export function artBox(art, size) {
  const longest = Math.max(art.w, art.h);
  return { w: (size * art.w) / longest, h: (size * art.h) / longest };
}

/**
 * Is a point on the face (view mm) inside the image's box? place = { ax, ay, rot, mirror }.
 * Undoes the placement: translate, rotate back, un-mirror, then compare with the box.
 */
export function insideArt(hit, place, box) {
  const x = -hit.x - place.ax; // view x runs the opposite way to the design's x
  const y = hit.y - place.ay;
  const a = (-place.rot * Math.PI) / 180;
  let u = x * Math.cos(a) - y * Math.sin(a);
  const v = x * Math.sin(a) + y * Math.cos(a);
  if (place.mirror) u = -u;
  return Math.abs(u) <= box.w / 2 && Math.abs(v) <= box.h / 2;
}

/** Everything that decides where and how the image is built. Equal keys mean the build is current. */
export function placementKey(p) {
  const pat = p.pattern;
  const art = p.art
    ? `${p.art.w}x${p.art.h}:${p.art.layers.map((l) => `${l.c}${l.on ? 1 : 0}${l.s.length}`).join("|")}`
    : "";
  return [
    p.product,
    pat.id,
    pat.mode,
    pat.ax,
    pat.ay,
    pat.size,
    pat.rot,
    pat.mirror,
    pat.margin,
    pat.depth,
    art,
  ].join("/");
}

/** Wheel zoom: a few percent per notch, kept inside the size limits. */
export function wheelSize(size, deltaY) {
  return clamp(Math.round(size * (deltaY < 0 ? 1.06 : 1 / 1.06) * 10) / 10, 5, 250);
}

/** What the live preview draws: the cover's plate, windows and outline. Equal keys mean an exact build still matches. */
export const geometryKey = (p) =>
  JSON.stringify([p.product, p.plate, p.mods, p.style, p.window, p.groups, p.overlay]);
