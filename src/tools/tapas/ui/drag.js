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

/** How far to shift the already-built image so it matches the placement that is not built yet. */
export function previewOffset(now, built) {
  return { x: -(now.ax - built.ax), y: now.ay - built.ay };
}

/** Wheel zoom: a few percent per notch, kept inside the size limits. */
export function wheelSize(size, deltaY) {
  return clamp(Math.round(size * (deltaY < 0 ? 1.06 : 1 / 1.06) * 10) / 10, 5, 250);
}
