import { h, clear } from "../../../shell/h.js";
import { icon } from "../../../shell/icons.js";
import { projects, ui, setUi, getLayout, selectedBin } from "./state.js";
import { isValid, moveRect, rectFromCells, resizeRect } from "../layout/bins.js";
import { addBin, duplicate, remove, taller } from "./actions.js";
import { effectiveBin } from "../model/effective.js";
import { heightLimit } from "../layout/limits.js";

const HANDLES = [
  ["l", "w-resize", 0, 0.5],
  ["r", "e-resize", 1, 0.5],
  ["f", "s-resize", 0.5, 1],
  ["b", "n-resize", 0.5, 0],
  ["lf", "sw-resize", 0, 1],
  ["rf", "se-resize", 1, 1],
  ["lb", "nw-resize", 0, 0],
  ["rb", "ne-resize", 1, 0],
];

const heightClass = (eff) => {
  const units = (eff.heightMm || eff.units * 7) / 7;
  return units >= 6 ? "bin3" : units >= 4 ? "bin2" : "bin1";
};

export function createTopView() {
  const area = h("div", { class: "tv-area", "data-guide": "top" });
  const legend = h(
    "div",
    { class: "tv-legend" },
    h("span", {}, h("i", { class: "r1" }), "Short"),
    h("span", {}, h("i", { class: "r2" }), "Medium"),
    h("span", {}, h("i", { class: "r3" }), "Tall"),
  );
  const root = h("section", { class: "pane pane-plan" }, area, legend);
  let size = { w: 0, h: 0 };
  let drag = null; // { kind, ... , ghost }

  // ---- geometry helpers -----------------------------------------------------------------
  const metrics = (project, layout) => {
    const { w, d } = project.drawer;
    const pad = 16;
    const scale = Math.max(0.05, Math.min((size.w - 2 * pad) / w, (size.h - 2 * pad) / d));
    const g = layout.grid;
    return {
      scale,
      ox: (size.w - w * scale) / 2,
      oy: (size.h - d * scale) / 2,
      gx: project.drawer.tol + g.x.padStart,
      gy: project.drawer.tol + g.y.padStart,
      D: d,
    };
  };

  // px (relative to area) -> grid cell coordinates (floats; y up).
  const toCell = (m, g, px, py) => ({
    x: ((px - m.ox) / m.scale - m.gx) / g.pitchX,
    y: (m.D - (py - m.oy) / m.scale - m.gy) / g.pitchY,
  });

  const rectStyle = (m, g, r) => {
    const left = m.ox + (m.gx + r.x * g.pitchX) * m.scale;
    const top = m.oy + (m.D - (m.gy + (r.y + r.d) * g.pitchY)) * m.scale;
    return `left:${left}px;top:${top}px;width:${r.w * g.pitchX * m.scale}px;height:${r.d * g.pitchY * m.scale}px`;
  };

  const step = (project) => (project.grid.halfCells ? 0.5 : 1);
  const snapDown = (v, s) => Math.floor(v / s + 1e-9) * s;

  // ---- drawing ---------------------------------------------------------------------------------------
  function paint() {
    const project = projects.get();
    const state = ui.get();
    const layout = getLayout(project);
    clear(area);
    if (layout.error) {
      area.append(h("div", { class: "tv-error" }, `Layout unavailable: ${layout.error}`));
      return;
    }
    if (size.w < 10) return;
    const { grid, plan } = layout;
    const m = metrics(project, layout);
    const { w, d } = project.drawer;

    const box = h("div", {
      class: "tv-drawer",
      style: `left:${m.ox}px;top:${m.oy}px;width:${w * m.scale}px;height:${d * m.scale}px`,
    });
    const floor = h("div", {
      class: "tv-floor",
      style: rectStyle(m, grid, { x: 0, y: 0, w: grid.cols, d: grid.rows }),
    });
    area.append(box, floor);

    // grid lines
    const lines = h("div", { class: "tv-lines", style: floor.getAttribute("style") });
    const sub = project.grid.halfCells ? 0.5 : 1;
    for (let i = 0; i <= grid.cols; i += sub) {
      lines.append(
        h("i", {
          class: `v${Number.isInteger(i) ? "" : " half"}`,
          style: `left:${(i / grid.cols) * 100}%`,
        }),
      );
    }
    for (let j = 0; j <= grid.rows; j += sub) {
      lines.append(
        h("i", {
          class: `hz${Number.isInteger(j) ? "" : " half"}`,
          style: `top:${100 - (j / grid.rows) * 100}%`,
        }),
      );
    }
    area.append(lines);

    // tile seams
    const seamX = (cells) => m.ox + (m.gx + cells * grid.pitchX) * m.scale;
    const seamY = (cells) => m.oy + (m.D - (m.gy + cells * grid.pitchY)) * m.scale;
    let acc = 0;
    for (const n of plan.xs.slice(0, -1)) {
      acc += n;
      area.append(
        h("div", {
          class: "tv-seam",
          style: `left:${seamX(acc)}px;top:${seamY(grid.rows)}px;height:${grid.rows * grid.pitchY * m.scale}px`,
        }),
      );
    }
    acc = 0;
    for (const n of plan.ys.slice(0, -1)) {
      acc += n;
      area.append(
        h("div", {
          class: "tv-seam h",
          style: `left:${seamX(0)}px;top:${seamY(acc)}px;width:${grid.cols * grid.pitchX * m.scale}px`,
        }),
      );
    }

    // bins
    const limit = heightLimit(project);
    for (const bin of project.bins) paintBin(project, state, m, grid, bin, limit);

    // part highlight
    const hi = state.partSel ?? state.partHover;
    const part = hi && state.result?.parts.find((p) => p.name === hi);
    if (part) {
      const left = m.ox + part.place[0] * m.scale;
      const top = m.oy + (m.D - part.place[1] - part.size[1]) * m.scale;
      area.append(
        h("div", {
          class: "tv-part",
          style: `left:${left}px;top:${top}px;width:${part.size[0] * m.scale}px;height:${part.size[1] * m.scale}px`,
        }),
      );
    }

    const sel = selectedBin();
    if (sel && !drag) paintSelection(project, m, grid, sel);
    if (drag?.ghost) {
      const ok = isValid(grid, project.bins, drag.ghost, drag.id);
      area.append(
        h("div", { class: `tv-ghost${ok ? "" : " bad"}`, style: rectStyle(m, grid, drag.ghost) }),
      );
    }
  }

  function paintBin(project, state, m, grid, bin, limit) {
    const eff = effectiveBin(project, bin);
    const over = (eff.heightMm || eff.units * 7) + (eff.lip ? 4.4 : 0) > limit.limit + 1e-6;
    const label = eff.heightMm ? `${eff.heightMm} mm` : `${eff.units} u`;
    const el = h(
      "div",
      {
        class: `tv-bin ${heightClass(eff)}${state.selected === bin.id ? " sel" : ""}${over ? " over" : ""}`,
        style: rectStyle(m, grid, { x: bin.x, y: bin.y, w: bin.w, d: bin.d }),
        dataset: { id: bin.id },
        onpointerdown: (e) => startMove(e, bin),
      },
      h("span", { class: "tv-size" }, `${bin.w} × ${bin.d}`),
      h("span", { class: "tv-h" }, label),
    );
    // divider marks
    for (let k = 1; k <= eff.dividersX; k++)
      el.append(h("i", { class: "dv", style: `left:${(k / (eff.dividersX + 1)) * 100}%` }));
    for (let k = 1; k <= eff.dividersY; k++)
      el.append(h("i", { class: "dh", style: `top:${(k / (eff.dividersY + 1)) * 100}%` }));
    if (eff.label !== "none") el.append(h("i", { class: `lbl ${eff.labelWall}` }));
    if (eff.lid !== "none") el.append(h("i", { class: "lid", title: "Has a lid" }));
    area.append(el);
  }

  function paintSelection(project, m, grid, bin) {
    const rect = { x: bin.x, y: bin.y, w: bin.w, d: bin.d };
    const frame = h("div", { class: "tv-selframe", style: rectStyle(m, grid, rect) });
    for (const [edges, cursor, fx, fy] of HANDLES) {
      frame.append(
        h("i", {
          class: "tv-handle",
          style: `left:${fx * 100}%;top:${fy * 100}%;cursor:${cursor}`,
          onpointerdown: (e) => startResize(e, bin, edges),
        }),
      );
    }
    area.append(frame);

    const eff = effectiveBin(project, bin);
    const height = eff.heightMm ? `${eff.heightMm} mm` : `${eff.units} u`;
    const left = parseFloat(frame.style.left);
    const top = parseFloat(frame.style.top);
    const tool = (name, label, fn, text) =>
      h(
        "button",
        { class: "icon-btn ghost", title: label, "aria-label": label, onclick: fn },
        icon(name, 16),
        text,
      );
    const bar = h(
      "div",
      { class: "tv-bar", style: `left:${Math.max(4, left)}px;top:${Math.max(4, top - 44)}px` },
      h("span", { class: "tv-bar-name" }, `${bin.w} × ${bin.d}`),
      tool("arrow-up", "One step taller (+)", () => taller(bin.id), height),
      tool("copy", "Duplicate (D)", () => duplicate(bin.id)),
      tool("trash", "Delete (Del)", () => remove(bin.id)),
    );
    area.append(bar);
  }

  // ---- pointer interaction ----------------------------------------------------------------------
  const local = (e) => {
    const r = area.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function begin(e, init) {
    const project = projects.get();
    const layout = getLayout(project);
    if (!layout.grid) return;
    e.preventDefault();
    e.stopPropagation();
    const m = metrics(project, layout);
    const start = local(e);
    drag = { ...init, m, grid: layout.grid, start, step: step(project), moved: false };
    try {
      area.setPointerCapture(e.pointerId);
    } catch {
      // The pointer already ended (very quick tap); dragging still works through the area's own events.
    }
  }

  function startCreate(e) {
    if (
      e.target !== area &&
      !e.target.classList.contains("tv-floor") &&
      !e.target.closest(".tv-lines, .tv-seam, .tv-drawer")
    )
      return;
    begin(e, { kind: "create", id: null });
    if (!drag) return;
    const c = toCell(drag.m, drag.grid, drag.start.x, drag.start.y);
    drag.anchor = { x: snapDown(c.x, drag.step), y: snapDown(c.y, drag.step) };
    setUi({ selected: null });
  }

  function startMove(e, bin) {
    begin(e, { kind: "move", id: bin.id, orig: { x: bin.x, y: bin.y, w: bin.w, d: bin.d } });
    if (drag) setUi({ selected: bin.id });
  }

  function startResize(e, bin, edges) {
    begin(e, {
      kind: "resize",
      id: bin.id,
      edges,
      orig: { x: bin.x, y: bin.y, w: bin.w, d: bin.d },
    });
  }

  function onMove(e) {
    if (!drag) return;
    const p = local(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const { m, grid, step: s } = drag;
    if (drag.kind === "create") {
      const c = toCell(m, grid, p.x, p.y);
      const cell = {
        x: Math.min(Math.max(snapDown(c.x, s), 0), grid.cols - s),
        y: Math.min(Math.max(snapDown(c.y, s), 0), grid.rows - s),
      };
      drag.ghost = rectFromCells(drag.anchor, cell, s);
    } else if (drag.kind === "move") {
      drag.ghost = moveRect(
        drag.orig,
        dx / m.scale / grid.pitchX,
        -dy / m.scale / grid.pitchY,
        s,
        grid,
      );
    } else {
      const c = toCell(m, grid, p.x, p.y);
      drag.ghost = resizeRect(drag.orig, drag.edges, c, s);
    }
    paint();
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    const ghost = d.ghost;
    if (ghost && d.moved) {
      const bins = projects.get().bins;
      if (isValid(d.grid, bins, ghost, d.id)) {
        if (d.kind === "create") addBin(ghost);
        else {
          projects.update((p) => {
            Object.assign(
              p.bins.find((b) => b.id === d.id),
              ghost,
            );
          }, `bin:${d.id}:${d.kind}`);
        }
      }
    }
    paint();
  }

  area.addEventListener("pointerdown", startCreate);
  area.addEventListener("pointermove", onMove);
  area.addEventListener("pointerup", onUp);
  area.addEventListener("pointercancel", onUp);

  new ResizeObserver(() => {
    size = { w: area.clientWidth, h: area.clientHeight };
    paint();
  }).observe(area);
  projects.subscribe(paint);
  ui.subscribe(paint);

  return root;
}
