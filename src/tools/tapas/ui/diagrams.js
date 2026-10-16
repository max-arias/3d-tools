// Visual inputs: an isometric plate with its measurements typed on the edges, and a schematic of
// the module frames where you tap a slot to place a module.
import { h } from "../../../shell/h.js";
import { numField } from "../../../shell/widgets.js";
import { MODULES, MODULE_IDS } from "../model/modules.js";
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

/**
 * Isometric plate: x runs right-down, y (depth, how far it stands out) left-down, z up.
 * `windows()` returns the module windows in plate coordinates for the face.
 * Inputs sit on the dimension lines: A width, B height, C stands out, R corner radius.
 */
export function plateDiagram({ plate, windows, onChange }) {
  const v = { ...plate };
  const svg = svgEl("svg", { class: "iso", role: "img", "aria-label": t("measures") });
  const fields = {};
  const wrap = h("div", { class: "diag" }, svg);

  const spec = {
    w: { letter: "A", min: 30, max: 300, step: 0.5, label: "plateW" },
    h: { letter: "B", min: 30, max: 300, step: 0.5, label: "plateH" },
    d: { letter: "C", min: 2, max: 30, step: 0.5, label: "plateD" },
    r: { letter: "R", min: 0, max: 30, step: 0.5, label: "plateR" },
  };
  for (const [key, s] of Object.entries(spec)) {
    const input = numField({
      value: v[key],
      min: s.min,
      max: s.max,
      step: s.step,
      unit: "",
      onChange: (n) => {
        v[key] = n;
        onChange(key, n);
        draw();
      },
    });
    const box = h("label", { class: "dim", title: t(s.label) }, h("b", {}, s.letter), input);
    fields[key] = box;
    wrap.append(box);
  }

  function draw() {
    const { w, h: hh, d, r } = v;
    const g = 12; // dimension lines sit this far off the plate (mm)
    // Unit-scale projection, then fit to the drawing.
    const raw = (x, y, z) => [(x - y) * C30, (x + y) * S30 - z];
    const pts = [
      raw(-40, 0, -40),
      raw(w + 40, 0, -40),
      raw(w + 40, 0, hh + 40),
      raw(-40, 0, hh + 40),
      raw(w + g + 18, d, -g - 14),
      raw(-g - 30, d, hh + 24),
      raw(w, d, hh + 6),
    ];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 20) / (x1 - x0), 300 / (y1 - y0));
    const H = Math.round((y1 - y0) * k + 20);
    const ox = 10 - x0 * k;
    const oy = 10 - y0 * k;
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
    const add = (tag, attrs, parent = svg) => {
      const el = svgEl(tag, attrs);
      parent.append(el);
      return el;
    };
    // Wall.
    const wall = [P(-40, 0, -40), P(w + 40, 0, -40), P(w + 40, 0, hh + 40), P(-40, 0, hh + 40)];
    add("polygon", { points: wall.map((p) => p.join(",")).join(" "), class: "wall" });
    // The plate: stacked outlines from the wall out to the face give the thickness with true rounded corners.
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
    // Module windows on the face.
    const facePlane = plane(d);
    for (const m of windows()) {
      const cx = w / 2 + m.x;
      const cy = hh / 2 + m.y;
      const win = m.win;
      if (!win) continue;
      if (win.kind === "circle")
        add("circle", { cx, cy, r: win.d / 2, transform: facePlane, class: "win" });
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

    // Dimension lines.
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
    const A1 = P(0, d, -g);
    const A2 = P(w, d, -g);
    line(A1, A2);
    line(P(0, d, 0), A1);
    line(P(w, d, 0), A2);
    const B1 = P(-g, d, 0);
    const B2 = P(-g, d, hh);
    line(B1, B2);
    line(P(0, d, 0), B1);
    line(P(0, d, hh), B2);
    const C1 = P(w + g, 0, 0);
    const C2 = P(w + g, d, 0);
    line(C1, C2);
    line(P(w, 0, 0), C1);
    line(P(w, d, 0), C2);
    tick(A1, [0, 4]);
    tick(A2, [0, 4]);
    tick(B1, [4, 0]);
    tick(B2, [4, 0]);
    // Corner radius marker: a leader from the top-left corner.
    const corner = P(Math.min(r, w / 2) * 0.3, d, hh - Math.min(r, hh / 2) * 0.3);
    const lead = P(-g - 4, d, hh + 14);
    line(corner, lead);

    // Inputs on the lines, as percentages of the drawing so they scale with the panel.
    const at = (key, p, dx = 0, dy = 0) => {
      const box = fields[key];
      box.style.left = `${((p[0] + dx) / W) * 100}%`;
      box.style.top = `${((p[1] + dy) / H) * 100}%`;
    };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    at("w", mid(A1, A2), 0, 12);
    at("h", mid(B1, B2), -22, 0);
    at("d", mid(C1, C2), 30, 14);
    at("r", lead, -2, -4);
    wrap.style.aspectRatio = `${W} / ${H}`;
  }

  draw();
  return wrap;
}

const GLYPH = { tecla: "▭", toma: "◉", usb: "▤", rj45: "▦", perilla: "◍", ciego: "▢" };

/**
 * One column per module frame. Pick a type in the palette, then tap an empty slot to add it or a
 * placed module to swap it. Modules past the frame's capacity are drawn in red below it.
 */
export function baysDiagram({ groups, slots, onChange }) {
  let active = "tecla";
  const wrap = h("div", { class: "bays-wrap" });

  const palette = () =>
    h(
      "div",
      { class: "palette", role: "group", "aria-label": t("pick") },
      MODULE_IDS.map((id) =>
        h(
          "button",
          {
            class: "pal",
            "aria-pressed": String(active === id),
            title: MODULES[id].span > 1 ? t("spanN", { n: MODULES[id].span }) : undefined,
            onclick: () => {
              active = id;
              render();
            },
          },
          h("span", { class: "glyph" }, GLYPH[id]),
          t(`m.${id}`),
          MODULES[id].span > 1 ? h("small", {}, `×${MODULES[id].span}`) : null,
        ),
      ),
    );

  function bay(group, g) {
    const used = usedSlots(group);
    const rows = Math.max(slots, used);
    const body = h("div", { class: "cells", style: `--rows:${rows}` });
    // Empty slot outlines first, so blocks sit on top.
    for (let i = 0; i < rows; i++)
      body.append(
        h("span", { class: `cell${i >= slots ? " over" : ""}`, style: `grid-row:${i + 1}` }),
      );
    let cursor = 0;
    group.forEach((type, i) => {
      const span = MODULES[type].span;
      const over = cursor + span > slots;
      body.append(
        h(
          "div",
          {
            class: `blk${over ? " over" : ""}`,
            dataset: { type },
            style: `grid-row:${cursor + 1} / span ${span}`,
          },
          h(
            "button",
            {
              class: "blk-main",
              title: t("swap", { name: t(`m.${active}`) }),
              onclick: () => {
                const next = group.map((m, j) => (j === i ? active : m));
                onChange(g, next);
              },
            },
            h("span", { class: "glyph" }, GLYPH[type]),
            t(`m.${type}`),
          ),
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
          ),
        ),
      );
      cursor += span;
    });
    // Free slots become add buttons, one per remaining slot.
    const free = slots - used;
    const need = MODULES[active].span;
    if (free > 0) {
      body.append(
        h(
          "button",
          {
            class: "add-slot",
            style: `grid-row:${used + 1} / span ${free}`,
            disabled: need > free,
            title:
              need > free
                ? t("noRoom", { name: t(`m.${active}`), n: need, free })
                : t("addHere", { name: t(`m.${active}`) }),
            onclick: () => onChange(g, [...group, active]),
          },
          need > free
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
