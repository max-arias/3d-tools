import { h } from "../../../../shell/h.js";
import {
  card,
  checkbox,
  numField,
  row,
  segmented,
  slider,
  stepper,
} from "../../../../shell/widgets.js";
import { GF } from "../../constants.js";
import { isValid } from "../../layout/bins.js";
import { planBinSegments } from "../../layout/binsplit.js";
import { binOuter } from "../../layout/labels.js";
import { hidesLabelTab, lidProblem } from "../../layout/lids.js";
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
export const title = "Bins";
export const summary = (_project, ctx) => (ctx?.bin ? `${ctx.bin.w} × ${ctx.bin.d}` : "all bins");

const LABEL_NAMES = {
  none: "no tab",
  front: "one per compartment",
  full: "one across the whole wall",
};
const WALL_LABELS = { back: "Back", left: "Left", right: "Right", front: "Front" };
const n1 = (v) => +v.toFixed(1);
const sub = (text) => h("h3", { class: "s-sub" }, text);

// ---- scoped controls (also used by the Labels section) -------------------------------------------

/** "all bins" tag, or a dot + reset button, or an "n differ" button for one parameter. */
function marker({ project, bin, update }, path) {
  if (bin) {
    if (!isOverridden(bin, path)) return h("span", { class: "s-mark" }, "all bins");
    return h(
      "span",
      { class: "s-mark s-on" },
      h("i", { class: "s-dot" }),
      h(
        "button",
        {
          class: "s-mark s-btn",
          title: "Go back to the all-bins value",
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
      class: "s-mark s-btn s-on",
      title: "Reset every bin to this value",
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
    { class: "row" },
    h("span", { class: "s-lbl" }, label, marker(ctx, path)),
    control,
    hint && h("p", { class: "hint muted" }, hint),
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
  return h(
    "div",
    { class: "s-checkrow" },
    h("div", { class: "row" }, box, marker(ctx, path)),
    hint && h("p", { class: "hint muted" }, hint),
  );
}

// ---- groups ----------------------------------------------------------------------------------------

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

function sizeGroup(ctx) {
  const { project, bin } = ctx;
  const custom = project.grid.mode === "custom";
  const eff = effectiveBin(project, bin ?? {});
  const hl = heightLimit(project);
  const total = binHeight(eff) + (eff.lip ? GF.lipH : 0);
  const over = total > hl.limit;
  const readout = `${binHeight(eff)} mm${eff.lip ? ` + ${GF.lipH} mm lip` : ""}`;
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
  return [
    sub("Size"),
    scopedRow(
      ctx,
      custom ? "heightMm" : "units",
      custom ? "Height (mm)" : "Height (7 mm steps)",
      control,
    ),
    h(
      "span",
      { class: `s-note${over ? " s-bad" : ""}` },
      over
        ? `${readout} is too tall: the drawer allows ${n1(hl.limit)} mm.`
        : `${readout} · up to ${n1(hl.limit)} mm fits`,
    ),
    bin
      ? footprintFields(ctx)
      : h(
          "p",
          { class: "hint muted" },
          "A bin's width and depth are set one bin at a time: drag its edges in the plan view.",
        ),
  ];
}

function compartmentsGroup(ctx) {
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
  return [
    sub("Compartments"),
    scopedNum(ctx, "dividersX", "Splits left to right", { min: 0, max: 20, step: 1 }),
    scopedNum(ctx, "dividersY", "Splits front to back", { min: 0, max: 20, step: 1 }),
    scopedRow(
      ctx,
      "dividerPct",
      `Divider height · ${pct}%`,
      slide,
      "How tall the dividers stand, as a share of the bin's walls.",
    ),
    h(
      "span",
      { class: "s-note" },
      `Label tabs: ${LABEL_NAMES[eff.label]}. `,
      h("button", { class: "s-link", onclick: () => setDockTab("labels") }, "Go to labels →"),
    ),
  ];
}

function hasGrab(eff, wall) {
  const g = eff.grab[wall];
  return g.notch || g.scoop || g.lower;
}

function fingerGroup(ctx) {
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
        class: hasGrab(eff, w) ? "s-has" : "",
        "aria-pressed": String(w === wall),
        onclick: () => setUi({ grabWall: w }),
      },
      WALL_LABELS[w],
    ),
  );
  return [
    sub("Finger access, wall by wall"),
    h(
      "p",
      { class: "hint muted" },
      `Pick a wall, then choose how to get your fingers at things. A dot marks walls that already have something. You're editing the ${wall} wall.`,
    ),
    h("div", { class: "s-walls" }, h("div", { class: "s-binbox" }), walls),
    scopedCheck(ctx, p("notch"), "Finger notch"),
    g.notch && [
      scopedNum(ctx, p("notchW"), "Notch width", { min: 5, max: 200, unit: "mm" }),
      scopedNum(ctx, p("notchD"), "Notch depth from the top", { min: 2, max: 150, unit: "mm" }),
      scopedNum(ctx, p("notchR"), "Notch bottom radius", { min: 1, max: 100, unit: "mm" }),
    ],
    scopedCheck(ctx, p("scoop"), "Scooped floor edge"),
    g.scoop && scopedNum(ctx, p("scoopR"), "Scoop radius", { min: 2, max: 60, unit: "mm" }),
    scopedCheck(ctx, p("lower"), "Cut-down wall"),
    g.lower &&
      scopedNum(ctx, p("lowerPct"), "Wall height (% of the bin)", { min: 10, max: 95, unit: "%" }),
  ];
}

function printInfo({ project, bin }, eff) {
  const layout = getLayout(project);
  if (layout.error) return null;
  let plan;
  try {
    plan = planBinSegments(layout.grid, project.printer, bin, eff);
  } catch (e) {
    return h("span", { class: "s-note s-bad" }, e.message);
  }
  const { grid } = layout;
  const outer = binOuter(grid, bin);
  const n = plan.segments.length;
  const longest = Math.max(
    ...plan.segments.map((s) => Math.max(s.w * grid.pitchX, s.d * grid.pitchY)),
  );
  return h(
    "div",
    { class: "s-box" },
    h("b", {}, n === 1 ? "Prints as 1 piece" : `Prints as ${n} pieces`),
    h("span", {}, `${n1(outer.w)} × ${n1(outer.d)} × ${n1(binHeight(eff))} mm`),
    h(
      "span",
      { class: "s-note" },
      n > 1 ? `Longest piece ${n1(longest)} mm, cut to fit the bed` : "Fits the bed in one go",
    ),
  );
}

const LID_TYPES = [
  ["none", "No lid", "The top stays open."],
  ["dropin", "Drop-in lid", "A flat lid with a plug that sits inside the rim. Lifts straight off."],
  [
    "stackable",
    "Stackable lid",
    "Seats in the stacking lip and has sockets on top, so other bins can stack on it.",
  ],
  ["sliding", "Sliding lid", "Slides in along rails inside the walls. Replaces the stacking lip."],
  [
    "hinged",
    "Hinged lid",
    "Swings open on a pin made from 1.75 mm filament. Replaces the stacking lip.",
  ],
];

const LID_HANDLES = [
  { value: "none", label: "None" },
  { value: "dip", label: "Finger dip" },
  { value: "tab", label: "Tab" },
  { value: "knob", label: "Knob" },
];

/** Why this bin can't get the lid it asks for, or null. Only meaningful for a single selected bin. */
function lidTrouble(ctx, eff) {
  const { project, bin } = ctx;
  if (!bin || eff.lid === "none") return null;
  const layout = getLayout(project);
  if (!layout.grid) return null;
  let pieces = 1;
  try {
    pieces = planBinSegments(layout.grid, project.printer, bin, eff).segments.length;
  } catch {
    return null;
  }
  const problem = lidProblem(eff, pieces);
  return problem ? `${problem}, so no lid is made for it.` : null;
}

function lidGroup(ctx) {
  const { project, bin } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const type = getValue(project, bin, "lid");
  const trouble = lidTrouble(ctx, eff);
  const set = setter(ctx, "lid", false);
  const handles = type === "hinged" ? LID_HANDLES.slice(0, 2) : LID_HANDLES;
  return [
    sub("Lid"),
    h("div", { class: "row" }, h("span", { class: "s-lbl" }, "Lid type", marker(ctx, "lid"))),
    h(
      "div",
      { class: "s-cards" },
      LID_TYPES.map(([value, title, desc]) =>
        card({ title, desc, selected: type === value, onClick: () => set(value) }),
      ),
    ),
    type !== "none" && [
      scopedNum(ctx, "lidThickness", "Lid thickness", { min: 1.2, max: 4, step: 0.1, unit: "mm" }),
      scopedNum(ctx, "lidFit", "Lid clearance", { min: 0.1, max: 0.6, step: 0.05, unit: "mm" }),
      h(
        "p",
        { class: "hint muted" },
        "Raise the clearance if a lid sticks, lower it if it rattles. Printers differ, so test one first.",
      ),
      type !== "stackable" &&
        scopedSegmented(
          ctx,
          "lidHandle",
          "Handle",
          handles,
          type === "hinged"
            ? "Hinged lids print upside down, so the handle has to be flat."
            : undefined,
        ),
      (type === "sliding" || type === "hinged") &&
        scopedSegmented(ctx, "lidSide", type === "hinged" ? "Hinge side" : "Slides out toward", [
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ]),
      (type === "sliding" || type === "hinged") &&
        h(
          "p",
          { class: "hint muted" },
          `${type === "hinged" ? "Hinged" : "Sliding"} lids replace the stacking lip${hidesLabelTab(type) ? " and leave out label tabs" : ""}. The bin has to print in one piece.${type === "hinged" ? " The pin (1.75 mm filament) is listed with your parts." : ""}`,
        ),
      type === "stackable" &&
        h(
          "p",
          { class: "hint muted" },
          "Needs the stacking lip below. The lid is thicker because it carries baseplate-style sockets.",
        ),
      trouble && h("span", { class: "s-note s-bad" }, trouble),
    ],
  ];
}

function constructionGroup(ctx) {
  const { project, bin, ui } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const noOpenings = ui.result?.noOpenings ?? [];
  const tooSmall = bin ? noOpenings.includes(bin.id) : noOpenings.length > 0;
  return [
    sub("Construction"),
    scopedCheck(
      ctx,
      "lip",
      "Stacking lip (+4.4 mm)",
      "The rim on top that lets another bin sit on this one.",
    ),
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
      "Cuts openings into every wall that's big enough. Uses less plastic and lets air in so things dry. Prints a little slower. Openings steer clear of notches, scoops, label tabs, dividers and seams.",
    ),
    tooSmall &&
      eff.wallPattern !== "solid" &&
      h(
        "span",
        { class: "s-note s-bad" },
        bin
          ? "This bin is too small for wall openings."
          : `${noOpenings.length} bins are too small for wall openings.`,
      ),
    !bin &&
      scopedSegmented(
        ctx,
        "floorSeam",
        "Joint between split halves",
        [
          { value: "butt", label: "Flat" },
          { value: "lap", label: "Overlap" },
        ],
        "How the floors of a long bin meet when it's printed in pieces.",
      ),
    bin && printInfo(ctx, eff),
  ];
}

function advancedGroup(ctx) {
  return [
    sub("Advanced"),
    scopedNum(ctx, "wall", "Wall thickness", { min: 0.8, max: 3, step: 0.1, unit: "mm" }),
    scopedNum(ctx, "floor", "Floor thickness", { min: 0.6, max: 5, step: 0.1, unit: "mm" }),
    scopedCheck(
      ctx,
      "split",
      "Split long bins to fit the printer",
      "Bins longer than the bed are cut into pieces that print separately.",
    ),
    scopedSegmented(ctx, "seamJoint", "Hold split pieces together with", [
      { value: "none", label: "Nothing" },
      { value: "hkey", label: "H-keys" },
      { value: "magnets", label: "Magnets" },
    ]),
  ];
}

export function render(ctx) {
  return h(
    "div",
    { class: "s-sec" },
    sizeGroup(ctx),
    compartmentsGroup(ctx),
    fingerGroup(ctx),
    lidGroup(ctx),
    constructionGroup(ctx),
    ctx.ui.advanced && advancedGroup(ctx),
  );
}
