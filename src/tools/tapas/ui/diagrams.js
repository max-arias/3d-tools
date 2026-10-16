// Visual inputs: an isometric plate with its measurements typed on the edges, and a schematic of
// the module frames where you tap a slot to place a module.
import { h } from "../../../shell/h.js";
import { numField } from "../../../shell/widgets.js";
import { FLAT_IDS, FLAT_MAX, MODULES, MODULE_IDS } from "../model/modules.js";
import { usedSlots } from "../model/project.js";
import { t } from "../lib/i18n.js";

const NS = "http://www.w3.org/2000/svg";
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const W = 320; // drawing width in px; the element scales to the panel

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** Field sets for plateDiagram. `key` is what onChange receives. */
export const PLATE_FIELDS = [
  { key: "w", min: 30, max: 300, step: 0.5, label: "dimW", at: "w", path: "plate.w" },
  { key: "h", min: 30, max: 300, step: 0.5, label: "dimH", at: "h", path: "plate.h" },
  { key: "d", min: 2, max: 30, step: 0.5, label: "dimD", at: "d", path: "plate.d" },
  { key: "r", min: 0, max: 30, step: 0.5, label: "dimR", at: "r", path: "plate.r" },
];

/**
 * Isometric block: x runs right-down, y (depth, how far it stands out) left-down, z up.
 * values = { w, h, d, r } sizes the block; `inner` = { w, h } adds a dashed outline on the face
 * (the bastidor under a tapa). Each field is typed on its dimension line; `at` picks the line:
 * "w" and "h" run along the block (or along `inner` when `inner` is given), "d" is the depth,
 * "r" the corner radius. `windows()` returns [{ x, y, win }] drawn on the face.
 */
export function plateDiagram({
  values,
  fields = PLATE_FIELDS,
  inner = null,
  windows = () => [],
  badge = null,
  onChange,
}) {
  const v = { ...values };
  const iv = inner ? { ...inner } : null;
  const svg = svgEl("svg", { class: "iso", role: "img", "aria-label": t("measures") });
  const boxes = {};
  const wrap = h("div", { class: "diag" }, svg);

  for (const f of fields) {
    const isInner = iv && (f.at === "w" || f.at === "h");
    const store = isInner ? iv : v;
    const input = numField({
      value: store[f.at],
      min: f.min,
      max: f.max,
      step: f.step,
      unit: "mm",
      onChange: (n) => {
        store[f.at] = n;
        onChange(f.key, n);
        draw();
      },
    });
    boxes[f.at] = h(
      "label",
      { class: "dim" },
      h("span", { class: "dim-name" }, t(f.label)),
      input,
      f.path && badge ? badge(f.path) : null,
    );
    wrap.append(boxes[f.at]);
  }

  function draw() {
    const { w, h: hh, d, r } = v;
    const big = Math.max(w, hh);
    const g = Math.max(7, big * 0.1); // dimension lines sit this far off the block (mm)
    const m = Math.max(10, big * 0.3); // the wall shows this much around it (mm)
    // Dimension extents: the block, or the inner outline when there is one.
    const ax0 = iv ? (w - iv.w) / 2 : 0;
    const ax1 = iv ? (w + iv.w) / 2 : w;
    const bz0 = iv ? (hh - iv.h) / 2 : 0;
    const bz1 = iv ? (hh + iv.h) / 2 : hh;
    // Unit-scale projection, then fit to the drawing.
    const raw = (x, y, z) => [(x - y) * C30, (x + y) * S30 - z];
    const pts = [
      raw(-m, 0, -m),
      raw(w + m, 0, -m),
      raw(w + m, 0, hh + m),
      raw(-m, 0, hh + m),
      raw(-g, d, bz0),
      raw(-g, d, bz1),
      raw(ax0, d, -g),
      raw(ax1, d, -g),
      raw(w + g, 0, 0),
    ];
    // Pixel room around the content for the labelled boxes.
    const PAD = { l: 92, r: 76, t: 44, b: 66 };
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - PAD.l - PAD.r) / (x1 - x0), 280 / (y1 - y0));
    const H = Math.round((y1 - y0) * k + PAD.t + PAD.b);
    const ox = PAD.l - x0 * k;
    const oy = PAD.t - y0 * k;
    const P = (x, y, z) => {
      const [px, py] = raw(x, y, z);
      return [px * k + ox, py * k + oy];
    };
    // SVG matrix for the plane y = y0: (x, z) -> screen.
    const plane = (y) => {
      const [e, f] = P(0, y, 0);
      return `matrix(${k * C30} ${k * S30} 0 ${-k} ${e} ${f})`;
    };

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    const add = (tag, attrs) => {
      const el = svgEl(tag, attrs);
      svg.append(el);
      return el;
    };
    const wall = [P(-m, 0, -m), P(w + m, 0, -m), P(w + m, 0, hh + m), P(-m, 0, hh + m)];
    add("polygon", { points: wall.map((p) => p.join(",")).join(" "), class: "wall" });
    // Stacked outlines from the wall out to the face give the thickness with true rounded corners.
    const steps = Math.min(40, Math.max(2, Math.ceil(d * 1.5)));
    for (let i = 0; i <= steps; i++) {
      add("rect", {
        x: 0,
        y: 0,
        width: w,
        height: hh,
        rx: r,
        ry: r,
        transform: plane((d * i) / steps),
        class: i === steps ? "face" : "edge",
        "vector-effect": "non-scaling-stroke",
      });
    }
    const facePlane = plane(d);
    for (const mod of windows()) {
      if (mod.slit) {
        // a flat plate's slit between two keys: a thin line across the face
        const sl = mod.slit;
        const x0 = Math.max(0, w / 2 - sl.x1);
        const x1 = Math.min(w, w / 2 - sl.x0);
        add("rect", {
          x: x0,
          y: hh / 2 + sl.y - 0.4,
          width: x1 - x0,
          height: 0.8,
          transform: facePlane,
          class: "win",
        });
        continue;
      }
      const win = mod.win;
      if (!win) continue;
      const cx = w / 2 - mod.x; // seen from the front, design x runs the other way
      const cy = hh / 2 + mod.y;
      if (win.kind === "circle")
        add("circle", { cx, cy, r: win.d / 2, transform: facePlane, class: "win" });
      else if (win.kind === "slots")
        for (const sl of win.slots) {
          // mirrored along x, so the lean flips with it: the left slot leans "/", the right "\"
          const sx = cx - sl.x;
          const sy = cy + sl.y;
          add("rect", {
            x: sx - sl.w / 2,
            y: sy - sl.l / 2,
            width: sl.w,
            height: sl.l,
            rx: sl.w / 2,
            transform: `${facePlane} rotate(${-sl.ang} ${sx} ${sy})`,
            class: "win",
          });
        }
      else
        add("rect", {
          x: cx - win.x / 2,
          y: cy - win.y / 2,
          width: win.x,
          height: win.y,
          rx: win.r,
          transform: facePlane,
          class: "win",
        });
    }
    if (iv)
      add("rect", {
        x: ax0,
        y: bz0,
        width: iv.w,
        height: iv.h,
        rx: 3,
        transform: facePlane,
        class: "inner",
        "vector-effect": "non-scaling-stroke",
      });

    const line = (a, b) =>
      add("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "dimline" });
    const tick = (a, dir) =>
      add("line", {
        x1: a[0] - dir[0],
        y1: a[1] - dir[1],
        x2: a[0] + dir[0],
        y2: a[1] + dir[1],
        class: "dimline",
      });
    const A1 = P(ax0, d, -g);
    const A2 = P(ax1, d, -g);
    line(A1, A2);
    line(P(ax0, d, bz0), A1);
    line(P(ax1, d, bz0), A2);
    const B1 = P(-g, d, bz0);
    const B2 = P(-g, d, bz1);
    line(B1, B2);
    line(P(ax0, d, bz0), B1);
    line(P(ax0, d, bz1), B2);
    const C1 = P(w + g, 0, 0);
    const C2 = P(w + g, d, 0);
    line(C1, C2);
    line(P(w, 0, 0), C1);
    line(P(w, d, 0), C2);
    tick(A1, [0, 4]);
    tick(A2, [0, 4]);
    tick(B1, [4, 0]);
    tick(B2, [4, 0]);
    const corner = P(Math.min(r, w / 2) * 0.3, d, hh - Math.min(r, hh / 2) * 0.3);
    const lead = P(-g - g * 0.4, d, hh + g * 1.2);
    if (boxes.r) line(corner, lead);

    // Inputs on the lines, as percentages of the drawing so they scale with the panel.
    const at = (key, p, dx = 0, dy = 0) => {
      const box = boxes[key];
      if (!box) return;
      const cx = Math.min(W - 52, Math.max(52, p[0] + dx));
      const cy = Math.min(H - 26, Math.max(26, p[1] + dy));
      box.style.left = `${(cx / W) * 100}%`;
      box.style.top = `${(cy / H) * 100}%`;
      return [cx, cy];
    };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    at("w", mid(A1, A2), 0, 30);
    at("h", mid(B1, B2), -50, 0);
    const cMid = mid(C1, C2);
    const cBox = at("d", cMid, 24, -52);
    if (cBox) line(cMid, [cBox[0], cBox[1] + 22]);
    at("r", lead, -6, -16);
    wrap.style.aspectRatio = `${W} / ${H}`;
  }

  draw();
  return wrap;
}

const GLYPH = {
  tecla: "▭",
  teclon: "▮",
  teclonMedio: "▯",
  toma: "◉",
  tomaRanuras: "⁖",
  usb: "▤",
  rj45: "▦",
  perilla: "◍",
  ciego: "▢",
};

/**
 * One column per module frame. Pick a type in the palette, then tap an empty slot to add it or a
 * placed module to swap it. Modules past the frame's capacity are drawn in red below it.
 * `flat`: a flat plate has no fixed slots; every module takes an equal share of the face.
 * Rows are half a slot tall, so a half teclon (1.5 slots) fits the grid.
 */
export function baysDiagram({ groups, slots, flat = false, onChange }) {
  let active = "tecla";
  const wrap = h("div", { class: "bays-wrap" });
  const ids = flat ? FLAT_IDS : MODULE_IDS;

  const palette = () =>
    h(
      "div",
      { class: "palette", role: "group", "aria-label": t("pick") },
      ids.map((id) =>
        h(
          "button",
          {
            class: "pal",
            "aria-pressed": String(active === id),
            title:
              !flat && MODULES[id].span !== 1 ? t("spanN", { n: MODULES[id].span }) : undefined,
            onclick: () => {
              active = id;
              render();
            },
          },
          h("span", { class: "glyph" }, GLYPH[id]),
          t(`m.${id}`),
          !flat && MODULES[id].span !== 1 ? h("small", {}, `×${MODULES[id].span}`) : null,
        ),
      ),
    );

  const removeBtn = (g, group, i) =>
    h(
      "button",
      {
        class: "x",
        title: t("remove"),
        "aria-label": t("remove"),
        onclick: () =>
          onChange(
            g,
            group.filter((_, j) => j !== i),
          ),
      },
      "×",
    );
  const swapBtn = (g, group, i, type) =>
    h(
      "button",
      {
        class: "blk-main",
        title: t("swap", { name: t(`m.${active}`) }),
        onclick: () =>
          onChange(
            g,
            group.map((m, j) => (j === i ? active : m)),
          ),
      },
      h("span", { class: "glyph" }, GLYPH[type]),
      t(`m.${type}`),
    );

  /** Flat plate: the modules share the face equally, so each is one row of the same height. */
  function flatBay(group, g) {
    const room = group.length < FLAT_MAX;
    const rows = Math.max(1, group.length + (room ? 1 : 0));
    const body = h("div", { class: "cells flat", style: `--rows:${rows}` });
    group.forEach((type, i) =>
      body.append(
        h(
          "div",
          { class: "blk", dataset: { type }, style: `grid-row:${i + 1}` },
          swapBtn(g, group, i, type),
          group.length > 1 ? removeBtn(g, group, i) : null,
        ),
      ),
    );
    if (room)
      body.append(
        h(
          "button",
          {
            class: "add-slot",
            style: `grid-row:${group.length + 1}`,
            title: t("addHere", { name: t(`m.${active}`) }),
            onclick: () => onChange(g, [...group, active]),
          },
          `+ ${t(`m.${active}`)}`,
        ),
      );
    return h(
      "div",
      { class: "bay" },
      h(
        "div",
        { class: "bay-head" },
        h("b", {}, t("group", { n: g + 1 })),
        h("small", { class: "muted" }, t("equalShares", { n: group.length })),
      ),
      body,
    );
  }

  function bay(group, g) {
    if (flat) return flatBay(group, g);
    const used = usedSlots(group);
    const rows = Math.ceil(Math.max(slots, used) * 2);
    const body = h("div", { class: "cells", style: `--rows:${rows}` });
    // Empty slot outlines first, so blocks sit on top.
    for (let i = 0; i < Math.ceil(Math.max(slots, used)); i++)
      body.append(
        h("span", {
          class: `cell${i >= slots ? " over" : ""}`,
          style: `grid-row:${i * 2 + 1} / span 2`,
        }),
      );
    let cursor = 0;
    group.forEach((type, i) => {
      const span = MODULES[type].span;
      const over = cursor + span > slots + 1e-9;
      body.append(
        h(
          "div",
          {
            class: `blk${over ? " over" : ""}`,
            dataset: { type },
            style: `grid-row:${Math.round(cursor * 2) + 1} / span ${Math.round(span * 2)}`,
          },
          swapBtn(g, group, i, type),
          removeBtn(g, group, i),
        ),
      );
      cursor += span;
    });
    // Free slots become add buttons, one per remaining slot.
    const free = slots - used;
    const need = MODULES[active].span;
    if (free > 1e-9) {
      body.append(
        h(
          "button",
          {
            class: "add-slot",
            style: `grid-row:${Math.round(used * 2) + 1} / span ${Math.round(free * 2)}`,
            disabled: need > free + 1e-9,
            title:
              need > free + 1e-9
                ? t("noRoom", { name: t(`m.${active}`), n: need, free })
                : t("addHere", { name: t(`m.${active}`) }),
            onclick: () => onChange(g, [...group, active]),
          },
          need > free + 1e-9
            ? t("noRoom", { name: t(`m.${active}`), n: need, free })
            : `+ ${t(`m.${active}`)}`,
        ),
      );
    }
    return h(
      "div",
      { class: "bay" },
      h(
        "div",
        { class: "bay-head" },
        h("b", {}, t("group", { n: g + 1 })),
        h("small", { class: used > slots ? "bad" : "muted" }, `${used}/${slots}`),
      ),
      body,
      used > slots ? h("p", { class: "bad over-note" }, t("overBy", { n: used - slots })) : null,
    );
  }

  function render() {
    if (!ids.includes(active)) active = "tecla";
    wrap.replaceChildren(
      palette(),
      h(
        "div",
        { class: "bays" },
        groups.map((grp, g) => bay(grp, g)),
      ),
    );
  }
  render();
  return wrap;
}
