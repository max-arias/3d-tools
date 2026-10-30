// Hour numerals, ticks and the custom line of text, as rings in mm around the hub (y up).
// Pure: the worker passes `glyph(text, capHeight)` (rings centred on the origin) from the font.
import { rayDistance } from "./outline.js";

const TAU = Math.PI * 2;
export const NUMERALS = ["arabic", "roman", "quarters", "none"];
export const TICKS = ["none", "lines", "dots", "bars", "triangles"];
const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

/** Angle of hour slot `i` of `n` (12 o'clock up, clockwise; backwards movements run the other way). */
export function slotAngle(i, n, reverse = false) {
  return Math.PI / 2 - (reverse ? -1 : 1) * (i / n) * TAU;
}

/** Label for hour slot `i` of `n`, or null when that slot has no numeral. */
export function slotLabel(i, n, kind) {
  if (kind === "none") return null;
  if (kind === "quarters" && i % (n / 4) !== 0) return null;
  if (kind === "roman" && n === 12) return ROMAN[i];
  return String(i === 0 ? n : i);
}

const rot = (rings, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return rings.map((r) => r.map(([x, y]) => [x * c - y * s, x * s + y * c]));
};
const move = (rings, dx, dy) => rings.map((r) => r.map(([x, y]) => [x + dx, y + dy]));

/** A radial rectangle from radius r0 to r1 at angle a, `w` wide. */
function radialRect(a, r0, r1, w) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const nx = -s * (w / 2);
  const ny = c * (w / 2);
  return [
    [r0 * c - nx, r0 * s - ny],
    [r1 * c - nx, r1 * s - ny],
    [r1 * c + nx, r1 * s + ny],
    [r0 * c + nx, r0 * s + ny],
  ];
}

const disc = (r, cx, cy, n = 24) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((i / n) * TAU),
    cy + r * Math.sin((i / n) * TAU),
  ]);

/**
 * Lay out the markers. m = project.markers; R = face radius around the hub.
 * Returns { items: [{ kind, rings, at: [x, y], r }], numeralR } where `r` is a keep-out radius.
 */
export function layoutMarkers(m, outline, R, glyph) {
  const n = m.hours;
  const items = [];
  const edge = (a) => (m.path === "outline" ? Math.min(rayDistance(outline, a), R * 1.6) : R);
  const tickLen = { none: 0, lines: 0.07, dots: 0.04, bars: 0.11, triangles: 0.08 }[m.ticks] * R;
  const size = m.size;
  let numeralR = R;
  for (let i = 0; i < n; i++) {
    const a = slotAngle(i, n, m.reverse);
    const outer = edge(a) - m.inset;
    const label = slotLabel(i, n, m.numerals);
    if (m.ticks !== "none" && !(label && m.ticks === "bars")) {
      // Bars stand in for numerals, so a slot with a numeral gets none.
      const r1 = outer;
      const r0 = outer - tickLen;
      const major = i % (n / 4) === 0;
      const w = Math.max(1.2, R * (m.ticks === "bars" ? 0.032 : 0.014)) * (major ? 1.5 : 1);
      let rings;
      if (m.ticks === "dots") {
        const rr = Math.max(1.2, R * 0.022) * (major ? 1.4 : 1);
        rings = [disc(rr, (r1 - rr) * Math.cos(a), (r1 - rr) * Math.sin(a))];
      } else if (m.ticks === "triangles") {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const half = w * 1.6;
        rings = [
          [
            [r1 * c - s * half, r1 * s + c * half],
            [r0 * c, r0 * s],
            [r1 * c + s * half, r1 * s - c * half],
          ],
        ];
      } else rings = [radialRect(a, r0, r1, w)];
      items.push({
        kind: "tick",
        rings,
        at: [((r0 + r1) / 2) * Math.cos(a), ((r0 + r1) / 2) * Math.sin(a)],
        r: tickLen / 2 + w,
      });
    }
    if (label) {
      const glyphRings = glyph(label, size);
      const half = Math.max(...glyphRings.flat().map(([x, y]) => Math.hypot(x, y)), size / 2);
      const rc =
        outer - (m.ticks === "none" ? 0 : tickLen + 2) - (m.orient === "radial" ? size / 2 : half);
      numeralR = Math.min(numeralR, rc);
      const placed = m.orient === "radial" ? rot(glyphRings, a - Math.PI / 2) : glyphRings;
      items.push({
        kind: "numeral",
        rings: move(placed, rc * Math.cos(a), rc * Math.sin(a)),
        at: [rc * Math.cos(a), rc * Math.sin(a)],
        r: half + 1,
      });
    }
  }
  if (m.minutes) {
    const w = Math.max(0.8, R * 0.007);
    for (let i = 0; i < 60; i++) {
      if ((i * n) % 60 === 0 && n === 12) continue; // hour slots already have their marker
      const a = slotAngle(i, 60, m.reverse);
      const r1 = edge(a) - m.inset;
      items.push({
        kind: "tick",
        rings: [radialRect(a, r1 - R * 0.035, r1, w)],
        at: [r1 * Math.cos(a), r1 * Math.sin(a)],
        r: R * 0.02 + w,
      });
    }
  }
  if (m.text.trim()) {
    const rings = glyph(m.text.trim(), m.textSize);
    const y = -R * 0.38;
    const w = Math.max(...rings.flat().map(([x]) => Math.abs(x)), 1);
    items.push({ kind: "text", rings: move(rings, 0, y), at: [0, y], r: w + 2 });
  }
  return { items, numeralR };
}
