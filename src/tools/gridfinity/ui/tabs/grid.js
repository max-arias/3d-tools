import { h } from "../../../../shell/h.js";
import { card, checkbox, numField, row } from "../../../../shell/widgets.js";
import { hasFractional, roundToWholeCells } from "../../layout/bins.js";
import { getLayout, notify } from "../state.js";

export const id = "grid";
export const title = "GRID";
export const summary = (project) => {
  const layout = getLayout(project);
  return layout.error ? "–" : `${layout.grid.cols}×${layout.grid.rows}`;
};

// Padding cross: [label, padX, padY] in grid-area order (back, left, centre, right, front).
const SIDES = [
  ["BACK", "center", "start"],
  ["LEFT", "end", "center"],
  ["CENTRE", "center", "center"],
  ["RIGHT", "start", "center"],
  ["FRONT", "center", "end"],
];
const n2 = (v) => +v.toFixed(2);

function paddingCross({ project, update }) {
  const { padX, padY, mode } = project.grid;
  const custom = mode === "custom";
  return h(
    "div",
    { class: "t-cross" },
    SIDES.map(([label, x, y]) =>
      h(
        "button",
        {
          disabled: custom,
          "aria-pressed": String(!custom && padX === x && padY === y),
          onclick: () =>
            update((d) => {
              d.grid.padX = x;
              d.grid.padY = y;
            }),
        },
        label,
      ),
    ),
  );
}

function roundDialog({ project, update }, layout, dialog) {
  const count = project.bins.filter((b) => hasFractional([b])).length;
  const off = () => update((d) => void (d.grid.halfCells = false));
  const round = () => {
    const r = roundToWholeCells(layout.grid, project.bins);
    update((d) => {
      d.bins = r.bins;
      d.grid.halfCells = false;
    });
    notify(
      r.kept
        ? `Bins rounded to whole cells: ${r.rounded}. No room to round ${r.kept}: they keep their half sizes.`
        : `Bins rounded to whole cells: ${r.rounded}.`,
    );
  };
  dialog.replaceChildren(
    h("b", {}, "Turn off half cells"),
    h(
      "span",
      {},
      `Bins with half sizes or positions: ${count}. Round them to whole cells? Each grows to the next grid line where there is room, or shrinks.`,
    ),
    h(
      "div",
      { class: "t-btns" },
      h("button", { class: "primary", onclick: round }, "ROUND TO WHOLE CELLS"),
      h("button", { onclick: off }, "KEEP THEIR HALF SIZES"),
    ),
  );
  dialog.hidden = false;
}

function readout(project) {
  const layout = getLayout(project);
  if (layout.error) return h("div", { class: "t-box t-error" }, layout.error);
  const { grid } = layout;
  const pad = (a) => `pad ${n2(a.padStart)} + ${n2(a.padEnd)} mm`;
  return h(
    "div",
    { class: "t-box" },
    h("span", {}, `Cells across: ${grid.cols} (${pad(grid.x)})`),
    h("span", {}, `Cells front to back: ${grid.rows} (${pad(grid.y)})`),
  );
}

export function render(ctx) {
  const { project, ui, update } = ctx;
  const g = project.grid;
  const setMode = (mode) =>
    update((d) => {
      d.grid.mode = mode;
      d.binDefaults.lip = mode === "gridfinity";
      d.binDefaults.heightMm = mode === "custom" ? d.binDefaults.units * 7 : 0;
    });
  const dialog = h("div", { class: "t-dialog", hidden: true });
  const onHalf = (on) => {
    const layout = getLayout(project);
    if (!on && !layout.error && hasFractional(project.bins)) roundDialog(ctx, layout, dialog);
    else update((d) => void (d.grid.halfCells = on));
  };
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "GRID"),
        h(
          "div",
          { class: "t-cards" },
          card({
            title: "GRIDFINITY · 42 MM",
            desc: "Works with Gridfinity bins from Printables and MakerWorld. Leftover space becomes padding.",
            selected: g.mode === "gridfinity",
            onClick: () => setMode("gridfinity"),
          }),
          card({
            title: "CUSTOM FIT",
            desc: "Cells stretch to fill the drawer exactly. Bins are sized in mm.",
            selected: g.mode === "custom",
            onClick: () => setMode("custom"),
          }),
        ),
        checkbox({
          checked: g.halfCells,
          label: "Half cells (21 mm bins)",
          hint: "Bins can be half a cell wide or deep (also 0.5 × 0.5). Drawing and dragging snap to halves. Turning it off offers to round half bins to whole cells.",
          key: "grid.half",
          onChange: onHalf,
        }),
        dialog,
        ui.advanced &&
          g.mode === "custom" &&
          row(
            "Target cell",
            numField({
              value: g.target,
              min: 30,
              max: 60,
              unit: "mm",
              key: "grid.target",
              onChange: (v) => update((d) => void (d.grid.target = v), "grid:target"),
            }),
          ),
      ),
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "PADDING"),
        paddingCross(ctx),
        h(
          "p",
          { class: "t-note" },
          g.mode === "custom"
            ? "Custom fit leaves no leftover space: the cells fill the drawer."
            : "Where the leftover space goes. Padding is printed as solid strips on the edge tiles.",
        ),
      ),
      h("div", { class: "t-col" }, h("h3", { class: "t-h" }, "GRID"), readout(project)),
    ),
  );
}
