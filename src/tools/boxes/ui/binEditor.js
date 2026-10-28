import { h } from "../../../shell/h.js";
import { checkbox, row } from "../../../shell/widgets.js";
import { t } from "../lib/i18n.js";
import { MAX_DIVIDERS } from "../model/project.js";
import { binAt, cellAt, dragRect, emptyCells, newBin, overlaps } from "./binMath.js";
import { stepper } from "./controls.js";
import { project, removeBin, sel, update } from "./state.js";

const NS = "http://www.w3.org/2000/svg";
const S = 40; // drawing units per cell

const svgEl = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

/** The bin editor: a top view of the box's cells to drag bins onto, and the selected bin's options. */
export function createBinPanel() {
  const root = h("div", { class: "binpanel" });

  /** Edit one bin; any bin edit means the loaded pack is no longer exactly that pack. */
  const editBin = (id, fn) =>
    update((d) => {
      const b = d.bins.find((x) => x.id === id);
      if (b) fn(b);
      d.pack = null;
    });

  const add = (r) => {
    update((d) => {
      d.bins.push(newBin(r));
      d.pack = null;
    });
    sel.set({ id: project.get().bins.at(-1)?.id ?? null });
  };

  function grid(p) {
    const { grid: g, bins } = p;
    const y0 = (b) => (g.y - b.y - b.d) * S; // the front (y = 0) is drawn at the bottom
    const svg = svgEl("svg", {
      viewBox: `0 0 ${g.x * S} ${g.y * S}`,
      class: "bingrid",
      role: "img",
      "aria-label": t("binsGrid"),
      "data-key": "bins.grid",
    });
    for (let i = 0; i < g.x; i++)
      for (let j = 0; j < g.y; j++)
        svg.append(
          svgEl("rect", { class: "cell", x: i * S, y: (g.y - 1 - j) * S, width: S, height: S }),
        );
    for (const b of bins) {
      const gx = b.x * S;
      const gy = y0(b);
      const node = svgEl(
        "g",
        { class: "bin", "data-id": b.id, "aria-selected": String(b.id === sel.get().id) },
        svgEl("rect", { x: gx + 1, y: gy + 1, width: b.w * S - 2, height: b.d * S - 2, rx: 4 }),
      );
      for (let k = 1; k <= b.dividersX; k++) {
        const x = gx + (b.w * S * k) / (b.dividersX + 1);
        node.append(svgEl("line", { x1: x, x2: x, y1: gy + 5, y2: gy + b.d * S - 5 }));
      }
      for (let k = 1; k <= b.dividersY; k++) {
        const y = gy + (b.d * S * k) / (b.dividersY + 1);
        node.append(svgEl("line", { x1: gx + 5, x2: gx + b.w * S - 5, y1: y, y2: y }));
      }
      node.append(
        svgEl(
          "text",
          { x: gx + (b.w * S) / 2, y: gy + (b.d * S) / 2, "text-anchor": "middle" },
          `${b.w}×${b.d}`,
        ),
      );
      svg.append(node);
    }
    const preview = svgEl("rect", { class: "preview", rx: 4, visibility: "hidden" });
    svg.append(preview);

    let anchor = null;
    const cell = (e) => cellAt(e.clientX, e.clientY, svg.getBoundingClientRect(), g);
    const show = (a, c) => {
      const r = dragRect(a, c);
      preview.setAttribute("x", r.x * S + 1);
      preview.setAttribute("y", (g.y - r.y - r.d) * S + 1);
      preview.setAttribute("width", r.w * S - 2);
      preview.setAttribute("height", r.d * S - 2);
      preview.dataset.bad = overlaps(r, bins) ? "1" : "";
      preview.setAttribute("visibility", "visible");
    };
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const c = cell(e);
      const hit = binAt(bins, c);
      if (hit) return sel.set({ id: hit.id });
      anchor = c;
      svg.setPointerCapture(e.pointerId);
      show(c, c);
    });
    svg.addEventListener("pointermove", (e) => anchor && show(anchor, cell(e)));
    svg.addEventListener("pointerup", (e) => {
      if (!anchor) return;
      const r = dragRect(anchor, cell(e));
      anchor = null;
      preview.setAttribute("visibility", "hidden");
      if (!overlaps(r, bins)) add(r);
    });
    svg.addEventListener("pointercancel", () => {
      anchor = null;
      preview.setAttribute("visibility", "hidden");
    });
    return svg;
  }

  function selected(p) {
    const b = p.bins.find((x) => x.id === sel.get().id);
    if (!b) return h("p", { class: "hint muted" }, t("binsHelp"));
    return h(
      "div",
      { class: "group", dataset: { key: "bin.selected" } },
      h("div", { class: "group-head" }, h("b", {}, t("binSelected", { w: b.w, d: b.d }))),
      row(
        t("dividersX"),
        stepper({
          key: "bin.dividersX",
          value: b.dividersX,
          min: 0,
          max: MAX_DIVIDERS,
          onChange: (v) => editBin(b.id, (x) => (x.dividersX = v)),
        }),
      ),
      row(
        t("dividersY"),
        stepper({
          key: "bin.dividersY",
          value: b.dividersY,
          min: 0,
          max: MAX_DIVIDERS,
          onChange: (v) => editBin(b.id, (x) => (x.dividersY = v)),
        }),
      ),
      checkbox({
        checked: b.scoop,
        label: t("scoop"),
        key: "bin.scoop",
        onChange: (v) => editBin(b.id, (x) => (x.scoop = v)),
      }),
      checkbox({
        checked: b.label,
        label: t("labelTab"),
        key: "bin.label",
        onChange: (v) => editBin(b.id, (x) => (x.label = v)),
      }),
      h(
        "button",
        { dataset: { key: "bin.delete" }, onclick: () => removeBin(b.id) },
        t("deleteBin"),
      ),
    );
  }

  const paint = () => {
    const p = project.get();
    const empty = emptyCells(p.bins, p.grid);
    root.replaceChildren(
      grid(p),
      h("p", { class: "hint muted" }, t("binsFront")),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            dataset: { key: "bins.fill" },
            disabled: !empty.length,
            onclick: () =>
              update((d) => {
                for (const c of empty) d.bins.push(newBin({ ...c, w: 1, d: 1 }));
                d.pack = null;
              }),
          },
          t("fillEmpty"),
        ),
        h(
          "button",
          {
            dataset: { key: "bins.clear" },
            disabled: !p.bins.length,
            onclick: () => {
              update((d) => {
                d.bins = [];
                d.pack = null;
              });
              sel.set({ id: null });
            },
          },
          t("clearBins"),
        ),
      ),
      selected(p),
    );
  };
  paint();
  return { el: root, paint };
}
