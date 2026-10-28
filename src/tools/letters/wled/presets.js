// WLED presets for the letters: one segment per letter, one preset per chosen effect.
// presets.json starts with a "0":{} placeholder; ids run from 1. Segment keys follow WLED's JSON API.
import { EFFECTS } from "../model/effects.js";

const WARM = [255, 160, 0];

/** HSV (0-1) to an [r, g, b] array of 0-255 ints. */
function hsv(h) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const q = 1 - f;
  const [r, g, b] = [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Segments for the letters that got LEDs: [{ id, start, stop, n, ... }] (stop is exclusive). */
export function letterSegments(parts, extra = () => ({})) {
  return parts
    .filter((x) => x.led?.count)
    .map((x, id) => ({
      id,
      start: x.led.start,
      stop: x.led.start + x.led.count,
      n: x.label,
      on: true,
      ...extra(id, x),
    }));
}

/** presets.json content and the list of preset names, in id order. */
export function buildPresets(parts, wled) {
  const presets = { 0: {} };
  const names = [];
  const add = (name, seg) => {
    const id = names.length + 1;
    presets[id] = { n: name, on: true, bri: wled.bri, seg };
    names.push(name);
  };
  for (const key of wled.presets) {
    const e = EFFECTS.find((x) => x.key === key);
    if (!e) continue;
    add(
      key,
      letterSegments(parts, () => ({
        fx: e.fx,
        sx: e.sx,
        ix: e.ix,
        pal: 0,
        col: [WARM, [0, 0, 0], [0, 0, 0]],
      })),
    );
  }
  const live = parts.filter((x) => x.led?.count).length;
  if (live > 1)
    add(
      "letter-colours",
      letterSegments(parts, (id) => ({ fx: 0, col: [hsv(id / live), [0, 0, 0], [0, 0, 0]] })),
    );
  return { presets, names };
}
