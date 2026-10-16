import { h } from "../../../../shell/h.js";
import { checkbox, numField, row, segmented, slider, stepper } from "../../../../shell/widgets.js";
import { GF } from "../../constants.js";
import { isValid } from "../../layout/bins.js";
import { planBinSegments } from "../../layout/binsplit.js";
import { binOuter } from "../../layout/labels.js";
import { heightLimit } from "../../layout/limits.js";
import { binHeight, effectiveBin } from "../../model/effective.js";
import { WALLS } from "../../model/defaults.js";
import {
  countOverrides,
  getValue,
  isOverridden,
  resetAll,
  resetValue,
  setValue,
} from "../scope.js";
import { getLayout, setDockTab } from "../state.js";

export const id = "bins";
export const scoped = true;
export const title = "BINS";
export const summary = (_project, ctx) => (ctx?.bin ? `${ctx.bin.w}×${ctx.bin.d}` : "all");

const LABEL_NAMES = { none: "None", front: "Per compartment", full: "Full width" };
const WALL_LABELS = { back: "BACK", left: "LEFT", right: "RIGHT", front: "FRONT" };
const n1 = (v) => +v.toFixed(1);

// ---- scoped controls (also used by the Labels tab) ----------------------------------------------

/** ALL / ● ↺ / "n differ" marker for one parameter. */
function marker({ project, bin, update }, path) {
  if (bin) {
    if (!isOverridden(bin, path)) return h("span", { class: "t-mark" }, "ALL");
    return h(
      "span",
      { class: "t-mark t-on" },
      "●",
      h(
        "button",
        {
          class: "t-mark t-btn",
          title: "Reset to All bins",
          onclick: () => update((d) => resetValue(d, bin.id, path)),
        },
        "↺",
      ),
    );
  }
  const n = countOverrides(project, path);
  if (!n) return null;
  return h(
    "button",
    {
      class: "t-mark t-btn t-on",
      title: "click to reset all",
      onclick: () => update((d) => resetAll(d, path)),
    },
    `${n} differ`,
  );
}

const pathKey = (ctx, path) =>
  `${ctx.bin ? `bin:${ctx.bin.id}` : "def"}:${[].concat(path).join(".")}`;

function setter(ctx, path, continuous) {
  const coalesce = continuous ? pathKey(ctx, path) : undefined;
  return (v) => ctx.update((d) => setValue(d, ctx.bin?.id, path, v), coalesce);
}

const scopedRow = (ctx, path, label, control, hint) =>
  h(
    "div",
    { class: "t-row" },
    h("span", { class: "t-lbl" }, label, marker(ctx, path)),
    control,
    hint && h("p", { class: "t-note" }, hint),
  );

export function scopedNum(ctx, path, label, opts) {
  const control = numField({
    value: getValue(ctx.project, ctx.bin, path),
    key: pathKey(ctx, path),
    onChange: setter(ctx, path, true),
    ...opts,
  });
  return scopedRow(ctx, path, label, control);
}

export function scopedSegmented(ctx, path, label, options, hint) {
  const control = segmented({
    value: getValue(ctx.project, ctx.bin, path),
    options,
    onChange: setter(ctx, path, false),
  });
  return scopedRow(ctx, path, label, control, hint);
}

export function scopedCheck(ctx, path, label, hint) {
  const box = checkbox({
    checked: getValue(ctx.project, ctx.bin, path),
    label,
    hint,
    key: pathKey(ctx, path),
    onChange: setter(ctx, path, false),
  });
  return h("div", { class: "t-row" }, box, marker(ctx, path));
}

// ---- columns -----------------------------------------------------------------------------------

function sizeColumn(ctx) {
  const { project, bin } = ctx;
  const custom = project.grid.mode === "custom";
  const eff = effectiveBin(project, bin ?? {});
  const hl = heightLimit(project);
  const total = binHeight(eff) + (eff.lip ? GF.lipH : 0);
  const over = total > hl.limit;
  const readout = `${binHeight(eff)}${eff.lip ? ` + ${GF.lipH} lip` : " mm"}`;
  const units = getValue(project, bin, "units");
  const control = custom
    ? numField({
        value: eff.heightMm,
        min: 10,
        max: 500,
        step: 5,
        unit: "mm",
        key: pathKey(ctx, "heightMm"),
        onChange: setter(ctx, "heightMm", true),
      })
    : stepper({ value: units, min: 2, max: 60, onChange: setter(ctx, "units", true) });
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "SIZE & HEIGHT"),
    scopedRow(
      ctx,
      custom ? "heightMm" : "units",
      custom ? "Height (mm)" : "Height (×7 mm)",
      control,
    ),
    h("span", { class: `t-note${over ? " t-bad" : ""}` }, `${readout} · max ${n1(hl.limit)} mm`),
    bin
      ? footprintFields(ctx)
      : h("p", { class: "t-note" }, "Size is set per bin by dragging in the top view."),
  );
}

function footprintFields({ project, bin, update }) {
  const layout = getLayout(project);
  const step = project.grid.halfCells ? 0.5 : 1;
  const field = (prop, label) =>
    row(
      label,
      numField({
        value: bin[prop],
        min: step,
        max: 200,
        step,
        unit: "cells",
        key: `bins.${prop}`,
        onChange: (v) => {
          const rect = { x: bin.x, y: bin.y, w: bin.w, d: bin.d, [prop]: v };
          if (layout.error || !isValid(layout.grid, project.bins, rect, bin.id)) return;
          update(
            (d) => void (d.bins.find((b) => b.id === bin.id)[prop] = v),
            `bin:${bin.id}:${prop}`,
          );
        },
      }),
    );
  return [field("w", "Width"), field("d", "Depth")];
}

function dividersColumn(ctx) {
  const { project, bin } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const pct = getValue(project, bin, "dividerPct");
  const slide = slider({
    value: pct,
    min: 10,
    max: 100,
    step: 5,
    key: pathKey(ctx, "dividerPct"),
    onChange: setter(ctx, "dividerPct", true),
  });
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "DIVIDERS"),
    scopedNum(ctx, "dividersX", "Across", { min: 0, max: 20, step: 1 }),
    scopedNum(ctx, "dividersY", "Front to back", { min: 0, max: 20, step: 1 }),
    scopedRow(ctx, "dividerPct", `Divider height · ${pct}%`, slide),
    h("span", { class: "t-note" }, `Label tab: ${LABEL_NAMES[eff.label]}`),
    h("button", { class: "t-link", onclick: () => setDockTab("labels") }, "LABELS →"),
  );
}

function hasGrab(eff, wall) {
  const g = eff.grab[wall];
  return g.notch || g.scoop || g.lower;
}

function grabColumn(ctx) {
  const { project, bin, ui, setUi } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const wall = ui.grabWall ?? "front";
  const p = (k) => ["grab", wall, k];
  const g = eff.grab[wall];
  const walls = WALLS.map((w) =>
    h(
      "button",
      {
        dataset: { wall: w },
        class: hasGrab(eff, w) ? "t-has" : "",
        "aria-pressed": String(w === wall),
        onclick: () => setUi({ grabWall: w }),
      },
      WALL_LABELS[w],
    ),
  );
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "GRAB FEATURES · PER WALL"),
    h("div", { class: "t-diagram" }, h("div", { class: "t-binbox" }), walls),
    scopedCheck(ctx, p("notch"), "Finger notch"),
    g.notch && [
      scopedNum(ctx, p("notchW"), "Notch width, mm", { min: 5, max: 200 }),
      scopedNum(ctx, p("notchD"), "Notch depth from the top, mm", { min: 2, max: 150 }),
      scopedNum(ctx, p("notchR"), "Notch bottom radius, mm", { min: 1, max: 100 }),
    ],
    scopedCheck(ctx, p("scoop"), "Scoop"),
    g.scoop && scopedNum(ctx, p("scoopR"), "Scoop radius, mm", { min: 2, max: 60 }),
    scopedCheck(ctx, p("lower"), "Lowered wall"),
    g.lower && scopedNum(ctx, p("lowerPct"), "Wall height, % of the bin", { min: 10, max: 95 }),
  );
}

function printInfo({ project, bin }, eff) {
  const layout = getLayout(project);
  if (layout.error) return null;
  let plan;
  try {
    plan = planBinSegments(layout.grid, project.printer, bin, eff);
  } catch (e) {
    return h("span", { class: "t-note t-bad" }, e.message);
  }
  const { grid } = layout;
  const outer = binOuter(grid, bin);
  const n = plan.segments.length;
  const longest = Math.max(
    ...plan.segments.map((s) => Math.max(s.w * grid.pitchX, s.d * grid.pitchY)),
  );
  return h(
    "div",
    { class: "t-box" },
    h("b", {}, `Prints as ${n} part${n === 1 ? "" : "s"}`),
    h("span", {}, `${n1(outer.w)} × ${n1(outer.d)} × ${n1(binHeight(eff))} mm`),
    h(
      "span",
      { class: "t-note" },
      n > 1 ? `longest ${n1(longest)} mm, cut to fit the bed` : "not split",
    ),
  );
}

function buildColumn(ctx) {
  const { project, bin, ui } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const noOpenings = ui.result?.noOpenings ?? [];
  const tooSmall = bin ? noOpenings.includes(bin.id) : noOpenings.length > 0;
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "BUILD"),
    scopedCheck(ctx, "lip", "Stacking lip (+4.4 mm)"),
    scopedCheck(ctx, "magnets", "Magnet holes in feet"),
    scopedSegmented(
      ctx,
      "wallPattern",
      "Wall pattern",
      [
        { value: "solid", label: "Solid" },
        { value: "honeycomb", label: "Honeycomb" },
        { value: "slots", label: "Slots" },
      ],
      "Openings in every wall big enough for them: less plastic, and air gets in so cutlery dries. Prints a little slower. They keep clear of notches, scoops, label tabs, dividers and seams.",
    ),
    tooSmall &&
      eff.wallPattern !== "solid" &&
      h(
        "span",
        { class: "t-note t-bad" },
        bin
          ? "This bin is too small for openings."
          : `${noOpenings.length} bins are too small for openings.`,
      ),
    !bin &&
      scopedSegmented(ctx, "floorSeam", "Floor seam", [
        { value: "butt", label: "Butt joint" },
        { value: "lap", label: "Lap tongue" },
      ]),
    bin && printInfo(ctx, eff),
  );
}

function advancedColumn(ctx) {
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "ADVANCED"),
    scopedNum(ctx, "wall", "Wall", { min: 0.8, max: 3, step: 0.1, unit: "mm" }),
    scopedNum(ctx, "floor", "Floor", { min: 0.6, max: 5, step: 0.1, unit: "mm" }),
    scopedCheck(ctx, "split", "Split to fit the bed"),
    scopedSegmented(ctx, "seamJoint", "Seam joint", [
      { value: "none", label: "None" },
      { value: "hkey", label: "H-keys" },
      { value: "magnets", label: "Magnets" },
    ]),
  );
}

export function render(ctx) {
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      sizeColumn(ctx),
      dividersColumn(ctx),
      grabColumn(ctx),
      buildColumn(ctx),
      ctx.ui.advanced && advancedColumn(ctx),
    ),
  );
}
