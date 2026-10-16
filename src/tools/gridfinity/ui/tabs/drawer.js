import "../tabs.css";
import { h } from "../../../../shell/h.js";
import { numField, row } from "../../../../shell/widgets.js";
import { heightLimit } from "../../layout/limits.js";
import { presetById } from "../../model/printers.js";
import { getLayout, setDockTab } from "../state.js";

export const id = "drawer";
export const title = "DRAWER";
export const summary = (project) => `${project.drawer.w}×${project.drawer.d}`;

const n2 = (v) => +v.toFixed(2);

function padText(grid) {
  const a = grid.x.padStart + grid.x.padEnd;
  const b = grid.y.padStart + grid.y.padEnd;
  if (a < 0.005 && b < 0.005) return "no padding";
  const centred = grid.x.padStart === grid.x.padEnd && grid.y.padStart === grid.y.padEnd;
  return `padding ${n2(a)} / ${n2(b)} mm${centred ? ", centred" : ""}`;
}

function result(project) {
  const layout = getLayout(project);
  if (layout.error)
    return h("div", { class: "t-box t-error" }, `Layout unavailable: ${layout.error}`);
  const { grid, plan } = layout;
  const p = project.printer;
  const name = presetById(p.preset)?.short ?? `${p.x}×${p.y}`;
  return h(
    "div",
    { class: "t-box" },
    h("b", {}, `${grid.cols} × ${grid.rows} cells of ${n2(grid.pitchX)} × ${n2(grid.pitchY)} mm`),
    h("span", { class: "t-note" }, padText(grid)),
    h("span", { class: "t-note" }, `${plan.tiles.length} baseplate tiles for ${name}`),
    h("button", { class: "t-link", onclick: () => setDockTab("grid") }, "ADJUST GRID →"),
  );
}

function limitBox(project) {
  const hl = heightLimit(project);
  const lip = project.binDefaults.lip;
  const units = lip ? hl.maxUnitsLip : hl.maxUnits;
  return h(
    "div",
    { class: "t-box" },
    h("span", {}, `${project.drawer.h} mm drawer`),
    h("span", {}, `− ${n2(hl.floor)} mm baseplate floor`),
    h("span", {}, `− ${n2(hl.clearance)} mm top clearance`),
    h("b", {}, `= ${n2(hl.limit)} mm`),
    h("span", { class: "t-note" }, `max bin height · ${units} u${lip ? " with lip" : ""}`),
  );
}

export function render({ project, ui, update }) {
  const d = project.drawer;
  const field = (prop, label, min, max, extra = {}) =>
    row(
      label,
      numField({
        value: d[prop],
        min,
        max,
        unit: "mm",
        key: `drawer.${prop}`,
        onChange: (v) => update((p) => void (p.drawer[prop] = v), `drawer:${prop}`),
        ...extra,
      }),
    );
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "DRAWER, INSIDE"),
        field("w", "Width", 50, 3000),
        field("d", "Depth", 50, 3000),
        field("h", "Height", 10, 1000),
      ),
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "FIT"),
        field("tol", "Fit gap / side", 0, 5, { step: 0.1 }),
        h(
          "p",
          { class: "t-note" },
          "Baseplate won’t go into the drawer? Raise it (try 1.0). Slides around? Lower it (try 0.3).",
        ),
        field("cornerR", "Corner radius", 0, 200),
      ),
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "HEIGHT LIMIT"),
        limitBox(project),
        ui.advanced && field("topClearance", "Top clearance", 0, 100, { step: 0.5 }),
      ),
      h("div", { class: "t-col" }, h("h3", { class: "t-h" }, "RESULT"), result(project)),
    ),
  );
}
