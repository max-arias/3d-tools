// Starter designs, drawn here in code (no third-party artwork). Each is a patch over the default
// project; art is drawn in the preset's own unit frame (y up) and packed like an uploaded SVG, with
// a switched-off frame layer first so the art spans exactly the outline's bounding box.
import { packArt } from "../../tapas/lib/trace.js";
import { PRESETS, boundsOf, defaultHub } from "../dial/outline.js";
import { defaultProject } from "./project.js";

const TAU = Math.PI * 2;
const disc = (r, cx, cy, n = 40) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((i / n) * TAU),
    cy + r * Math.sin((i / n) * TAU),
  ]);
const ellipse = (rx, ry, cx, cy, n = 40) =>
  Array.from({ length: n }, (_, i) => [
    cx + rx * Math.cos((i / n) * TAU),
    cy + ry * Math.sin((i / n) * TAU),
  ]);
const turn = (ring, a, cx = 0, cy = 0) =>
  ring.map(([x, y]) => [
    cx + x * Math.cos(a) - y * Math.sin(a),
    cy + x * Math.sin(a) + y * Math.cos(a),
  ]);

/** Outline of a polyline `w` wide (open ends squared). */
function stroke(pts, w) {
  const side = (sign) =>
    pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [
        p[0] - (sign * (b[1] - a[1]) * w) / 2 / len,
        p[1] + (sign * (b[0] - a[0]) * w) / 2 / len,
      ];
    });
  return [...side(1), ...side(-1).reverse()];
}

/** A tapering branch polyline, `w0` wide at the start and `w1` at the end. */
function branch(pts, w0, w1) {
  const n = pts.length;
  const width = (i) => w0 + ((w1 - w0) * i) / (n - 1);
  const left = [];
  const right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * (width(i) / 2);
    const ny = ((b[0] - a[0]) / len) * (width(i) / 2);
    left.push([p[0] + nx, p[1] + ny]);
    right.unshift([p[0] - nx, p[1] - ny]);
  });
  return [...left, ...right];
}

/** A petal: rounded teardrop with a notch at its tip, pointing along +y from its base. */
function petal(len, w, notch = true) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI;
    const x = (w / 2) * Math.sin(t) * (1 - 0.25 * Math.cos(t));
    let y = (len / 2) * (1 - Math.cos(t));
    if (notch && i > 32) y -= len * 0.12 * ((i - 32) / 8);
    pts.push([x, y]);
  }
  const right = pts;
  const left = pts
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  if (notch) right.push([0, len * 0.86]);
  return [...right, ...left];
}

const flower = (r, cx, cy, rot = 0) =>
  Array.from({ length: 5 }, (_, k) => turn(petal(r, r * 0.9), rot + (k / 5) * TAU, cx, cy));

/** Pack layers drawn in unit coordinates (y up) for a preset, framed by its bounding box. */
function artFor(preset, layers) {
  const made = PRESETS[preset]();
  const [x0, y0, x1, y1] = boundsOf(made.rings);
  const frame = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const all = [{ color: "#000000", shapes: [{ rule: "n", rings: [frame] }] }, ...layers];
  const flip = all.map((L) => ({
    color: L.color,
    shapes: L.shapes.map((s) => ({
      rule: s.rule ?? "n",
      rings: s.rings.map((r) => r.map(([x, y]) => [x * 1000, -y * 1000])),
    })),
  }));
  const art = packArt(flip, "svg");
  art.layers[0].on = false; // the frame only sets the extent
  return art;
}

const red = "#d6453d";
const brown = "#5b3a29";
const cream = "#f2efe8";
const ink = "#1f1f22";

function blossomArt() {
  const reds = [
    ...flower(0.5, 0.02, 0.1, 0.1),
    ...[
      [0.55, 0.68, -0.3],
      [-0.48, 0.7, 0.5],
      [0.82, 0.25, 1.2],
      [0.78, -0.3, 2.2],
      [0.55, -0.72, 2.9],
      [-0.1, -0.62, 3.4],
      [-0.82, 0.18, -1.2],
      [0.12, 0.88, 0.2],
    ].map(([x, y, a]) => turn(petal(0.17, 0.13), a, x, y)),
    turn(petal(0.2, 0.14), 0.9, -0.62, -0.18),
    turn(petal(0.2, 0.14), -0.2, -0.7, -0.12),
  ];
  // Stamens: lines and dots in the face colour on top of the red flower.
  const whites = [disc(0.06, 0.02, 0.12)];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + 0.13;
    const r1 = 0.17 + 0.04 * (k % 2);
    whites.push(
      stroke(
        [
          [0.02 + 0.05 * Math.cos(a), 0.12 + 0.05 * Math.sin(a)],
          [0.02 + r1 * Math.cos(a), 0.12 + r1 * Math.sin(a)],
        ],
        0.012,
      ),
    );
    whites.push(disc(0.022, 0.02 + r1 * Math.cos(a), 0.12 + r1 * Math.sin(a), 16));
  }
  const browns = [
    branch(
      [
        [0.25, -1.05],
        [0.12, -0.7],
        [-0.15, -0.42],
        [-0.45, -0.25],
        [-0.72, -0.18],
      ],
      0.13,
      0.04,
    ),
    branch(
      [
        [0.0, -0.55],
        [-0.25, -0.62],
        [-0.5, -0.55],
      ],
      0.06,
      0.03,
    ),
    disc(0.05, 0.18, 0.9),
    disc(0.05, -0.8, -0.32),
    disc(0.05, 0.62, -0.88),
    disc(0.05, 0.86, 0.5),
  ];
  return artFor("circle", [
    { color: brown, shapes: [{ rings: browns }] },
    { color: red, shapes: [{ rings: reds }] },
    { color: cream, shapes: [{ rings: whites }] },
  ]);
}

function cloudArt() {
  return artFor("cloud", [
    {
      color: "#f2a0a8",
      shapes: [{ rings: [ellipse(0.11, 0.07, -0.42, -0.2), ellipse(0.11, 0.07, 0.42, -0.2)] }],
    },
    {
      color: ink,
      shapes: [
        {
          rings: [
            ellipse(0.07, 0.1, -0.3, 0.02),
            ellipse(0.07, 0.1, 0.3, 0.02),
            stroke(
              Array.from({ length: 13 }, (_, i) => {
                const a = Math.PI + 0.5 + (i / 12) * (Math.PI - 1);
                return [0.14 * Math.cos(a), -0.1 + 0.14 * Math.sin(a)];
              }),
              0.035,
            ),
          ],
        },
      ],
    },
  ]);
}

const bearArt = () =>
  artFor("bear", [
    {
      color: "#d9a46c",
      shapes: [{ rings: [disc(0.19, -0.66, 0.66), disc(0.19, 0.66, 0.66)] }],
    },
  ]);

const sunArt = () =>
  artFor("sunburst", [{ color: cream, shapes: [{ rings: [disc(0.6, 0, 0, 120)] }] }]);

/** Gallery entries: { id, art?, patch }. Names and blurbs are strings `g_<id>` / `gd_<id>`. */
export const GALLERY = [
  {
    id: "blossom",
    art: blossomArt,
    patch: {
      shape: { preset: "circle", width: 200, border: { kind: "flat", w: 6 } },
      markers: { numerals: "none", ticks: "none" },
      hands: { style: "baton" },
      colors: { slots: [cream, red, brown, ink], face: 0, border: 1, hands: 2, markers: 3 },
      artColors: [2, 1, 0],
    },
  },
  {
    id: "cloud",
    art: cloudArt,
    patch: {
      shape: { preset: "cloud", width: 220, border: { kind: "flat", w: 5 } },
      markers: { numerals: "arabic", ticks: "none", font: "archivo", path: "outline", inset: 8 },
      hands: { style: "sword" },
      colors: { slots: ["#d5d3d8", ink, "#f2a0a8"], face: 0, border: 1, hands: 1, markers: 1 },
      artColors: [2, 1],
    },
  },
  {
    id: "bear",
    art: bearArt,
    patch: {
      shape: { preset: "bear", width: 210, border: { kind: "none" } },
      markers: { numerals: "arabic", ticks: "none", font: "archivo" },
      hands: { style: "leaf" },
      colors: { slots: ["#7a4a2a", "#d9a46c", cream], face: 0, border: 0, hands: 2, markers: 2 },
      artColors: [1],
    },
  },
  {
    id: "leaf",
    patch: {
      shape: { preset: "leaf", width: 220, border: { kind: "none" } },
      markers: { numerals: "quarters", ticks: "bars", inset: 22 },
      hands: { style: "baton" },
      colors: { slots: ["#2e9d4f", cream], face: 0, border: 0, hands: 1, markers: 1 },
    },
  },
  {
    id: "cheese",
    patch: {
      shape: { preset: "cheese", width: 200, border: { kind: "none" } },
      markers: { numerals: "none", ticks: "none" },
      cutouts: { kind: "cheese", count: 26, size: 18, seed: 11 },
      hands: { style: "baton" },
      colors: { slots: ["#f4c430", cream], face: 0, border: 0, hands: 1, markers: 1 },
    },
  },
  {
    id: "minimal",
    patch: {
      shape: { preset: "circle", width: 180, border: { kind: "none" } },
      markers: { numerals: "none", ticks: "dots" },
      hands: { style: "baton", tail: true },
      colors: { slots: [cream, ink], face: 0, border: 0, hands: 1, markers: 1 },
    },
  },
  {
    id: "sunburst",
    art: sunArt,
    patch: {
      shape: { preset: "sunburst", width: 240, border: { kind: "none" } },
      markers: { numerals: "roman", ticks: "none", orient: "radial", inset: 12 },
      hands: { style: "spade" },
      colors: { slots: ["#c9a227", cream, ink], face: 0, border: 0, hands: 2, markers: 2 },
      artColors: [1],
    },
  },
  {
    id: "station",
    patch: {
      type: "twoSided",
      shape: { preset: "circle", width: 200, border: { kind: "flat", w: 7 } },
      markers: { numerals: "arabic", ticks: "lines", minutes: true },
      hands: { style: "baton" },
      colors: { slots: [cream, ink, "#c8302c"], face: 0, border: 1, hands: 1, markers: 1 },
    },
  },
  {
    id: "halo",
    patch: {
      shape: { preset: "circle", width: 220, border: { kind: "none" } },
      markers: { numerals: "none", ticks: "bars" },
      leds: { halo: true },
      back: { kind: "rim" },
      hands: { style: "baton", glow: true },
      colors: { slots: [ink, cream, "#bfe8c4"], face: 0, border: 0, hands: 1, markers: 1, glow: 2 },
    },
  },
  {
    id: "arch",
    patch: {
      type: "desk",
      style: "ribs",
      shape: { preset: "arch", width: 150, border: { kind: "none" } },
      back: { stand: "foot", kind: "none" },
      markers: { numerals: "none", ticks: "lines", inset: 10 },
      hands: { style: "baton" },
      colors: { slots: ["#e6e1d8", ink], face: 0, border: 0, hands: 1, markers: 1 },
    },
  },
];

/** The design as a full raw project (sanitize it before use); keeps the user's movement and printer. */
export function galleryProject(entry, current) {
  const { artColors = [], ...patch } = entry.patch;
  const p = defaultProject();
  Object.assign(
    p,
    structuredClone({ movement: current.movement, printer: current.printer, build: current.build }),
  );
  for (const [k, v] of Object.entries(patch))
    p[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...p[k], ...v } : v;
  p.shape.hub = defaultHub(p.shape.preset, p.shape.width);
  p.art = entry.art ? entry.art() : null;
  p.artPlace = { size: 0, x: 0, y: 0, rot: 0 };
  if (p.art) {
    // Layer 0 is the switched-off frame.
    p.colors.art = [0, ...artColors];
  }
  return p;
}
