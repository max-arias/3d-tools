import { h } from "../../../../shell/h.js";
import { card, checkbox, numField, row, segmented } from "../../../../shell/widgets.js";
import { downloadKeyTest } from "../../export/actions.js";
import { hasFractional, roundToWholeCells } from "../../layout/bins.js";
import { getLayout, notify } from "../state.js";

export const id = "grid";
export const title = "Grid & baseplate";

const STYLES = [
  {
    value: "thin",
    title: "Light",
    desc: "Open sockets; bins rest on the drawer floor.",
    mm: 4.65,
  },
  {
    value: "skeleton",
    title: "Cut-out floor",
    desc: "A floor with holes punched in it. Saves filament.",
    mm: 7.65,
  },
  {
    value: "weighted",
    title: "Solid floor",
    desc: "Thick and heavy, so it stays where you put it.",
    mm: 11.4,
  },
];
export const summary = (project) => {
  const layout = getLayout(project);
  const style = STYLES.find((s) => s.value === project.baseplate.style)?.title ?? "";
  return layout.error ? style : `${layout.grid.cols} × ${layout.grid.rows} · ${style}`;
};

// Position pad: [label, padX, padY]; the corners of the 3 × 3 pad stay empty.
const SIDES = [
  ["Back", "center", "start"],
  ["Left", "end", "center"],
  ["Middle", "center", "center"],
  ["Right", "start", "center"],
  ["Front", "center", "end"],
];
const n2 = (v) => +v.toFixed(2);
const sub = (text) => h("h3", { class: "s-sub" }, text);

const FITS = [
  { value: 0.1, label: "Snug" },
  { value: 0.15, label: "Standard" },
  { value: 0.2, label: "Easy" },
];
const FIT_HINT = {
  0.1: "0.10 mm per side. Joints won't go in by hand? Go back to Standard.",
  0.15: "Too loose or falling out? Try Snug. Too tight to press in by hand? Try Easy.",
  0.2: "0.20 mm per side. Joints wobble or drop out? Go back to Standard.",
};
const FIT_CUSTOM = "You've set your own clearance in the advanced options.";
const EVERY = [
  { value: 1, label: "Every cell" },
  { value: 2, label: "Every 2nd" },
  { value: 3, label: "Every 3rd" },
];

function positionPad({ project, update }) {
  const { padX, padY, mode } = project.grid;
  const custom = mode === "custom";
  return h(
    "div",
    { class: "s-pad" },
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
  const keep = () => update((d) => void (d.grid.halfCells = false));
  const round = () => {
    const r = roundToWholeCells(layout.grid, project.bins);
    update((d) => {
      d.bins = r.bins;
      d.grid.halfCells = false;
    });
    notify(
      r.kept
        ? `Rounded ${r.rounded} to whole cells. ${r.kept} had no room and kept their half sizes.`
        : `Rounded ${r.rounded} to whole cells.`,
    );
  };
  dialog.replaceChildren(
    h("b", {}, "Switching off half-size bins"),
    h(
      "span",
      { class: "s-note" },
      `${count} of your bins use half sizes or half positions. Round them to whole cells? Each one grows to the next grid line if there is room, otherwise it shrinks.`,
    ),
    h(
      "div",
      { class: "s-btns" },
      h("button", { class: "primary", onclick: round }, "Round to whole cells"),
      h("button", { onclick: keep }, "Leave them as they are"),
    ),
  );
  dialog.hidden = false;
}

function readout(project) {
  const layout = getLayout(project);
  if (layout.error) return h("div", { class: "s-box s-error" }, layout.error);
  const { grid } = layout;
  const spare = (a) => `spare ${n2(a.padStart)} + ${n2(a.padEnd)} mm`;
  return h(
    "div",
    { class: "s-box" },
    h("span", {}, `${grid.cols} cells left to right (${spare(grid.x)})`),
    h("span", {}, `${grid.rows} cells front to back (${spare(grid.y)})`),
  );
}

function styleCards(bp, update) {
  return h(
    "div",
    { class: "s-cards" },
    STYLES.map((s) =>
      card({
        title: s.title,
        desc: s.desc,
        meta: `${s.mm} mm tall`,
        selected: bp.style === s.value,
        onClick: () =>
          update((d) => {
            d.baseplate.style = s.value;
            if (s.value === "thin") d.baseplate.keys = false;
          }),
      }),
    ),
  );
}

function options({ project, ui, update }) {
  const bp = project.baseplate;
  const set = (prop) => (v) => update((d) => void (d.baseplate[prop] = v));
  const showRibs = project.grid.halfCells || hasFractional(project.bins);
  const checks = [
    showRibs &&
      checkbox({
        checked: bp.halfSockets === "ribs",
        label: "Hold half-size bins in place",
        hint: "Adds a thin rib to the socket beside each half-size bin so it can't slide, even on its own. Bins a full cell or wider don't need one. Off: plain sockets, and a half-size bin needs a neighbour in the same cell.",
        key: "bp.ribs",
        onChange: (on) => set("halfSockets")(on ? "ribs" : "shared"),
      }),
    checkbox({
      checked: bp.chamfer > 0,
      label: "Bevelled edge",
      hint: "Softens the outer top edge of the baseplate.",
      key: "bp.chamfer",
      onChange: (on) => set("chamfer")(on ? 0.8 : 0),
    }),
    checkbox({
      checked: bp.peaks,
      label: "Sharp corner joins",
      hint: "On: the ridges meet in a sharp point where four cells touch, like most generators do. Off: the rounded join from the official spec, which leaves a tiny flat spot. Bins fit either way.",
      key: "bp.peaks",
      onChange: set("peaks"),
    }),
    checkbox({
      checked: bp.magnets,
      label: "Magnet holes",
      hint: "Round holes in each cell's corners so bins with magnets snap into place. On the Light style they sit in small corner pads.",
      key: "bp.magnets",
      onChange: set("magnets"),
    }),
    checkbox({
      checked: bp.tape,
      label: "Double-sided tape pockets",
      hint: "Shallow slots (3 × 20 × 0.6 mm) under the grid lines of each tile. Press strips of double-sided tape into them and the plate grips the drawer floor.",
      key: "bp.tape",
      onChange: set("tape"),
    }),
  ];
  return [
    h("div", { class: "s-stack" }, checks),
    ui.advanced &&
      row(
        "Magnet diameter",
        numField({
          value: project.magnet.d,
          min: 1,
          max: 20,
          step: 0.1,
          unit: "mm",
          key: "bp.magnetD",
          onChange: (v) => update((d) => void (d.magnet.d = v), "magnet:d"),
        }),
        `Magnet drops out? Try ${+(project.magnet.d - 0.1).toFixed(2)} mm. Too tight to press in? Try ${+(project.magnet.d + 0.1).toFixed(2)} mm. Bins use the same size.`,
      ),
    ui.advanced &&
      row(
        "Magnet depth",
        numField({
          value: project.magnet.depth,
          min: 0.5,
          max: 6,
          step: 0.1,
          unit: "mm",
          key: "bp.magnetDepth",
          onChange: (v) => update((d) => void (d.magnet.depth = v), "magnet:depth"),
        }),
      ),
  ];
}

function joints({ project, ui, update }) {
  const bp = project.baseplate;
  const mode = bp.keys ? "keys" : bp.clips ? "clips" : "none";
  const clearance = project.joint.clearance;
  const fit = FITS.find((f) => f.value === clearance);
  const setJoint = (v) =>
    update((d) => {
      d.baseplate.keys = v === "keys";
      d.baseplate.clips = v === "clips";
      if (v === "keys" && d.baseplate.style === "thin") d.baseplate.style = "skeleton";
    });
  const everyProp = bp.keys ? "keyEvery" : "clipEvery";
  return [
    segmented({
      value: mode,
      options: [
        { value: "none", label: "No joints" },
        { value: "keys", label: "H-keys" },
        { value: "clips", label: "Clips" },
      ],
      onChange: setJoint,
    }),
    h(
      "p",
      { class: "hint muted" },
      "Joints tie neighbouring tiles together. Without them the drawer walls hold the tiles in place. Clips press in from the top and work with the Light style; H-keys slide in from below and need a floor.",
    ),
    mode !== "none" &&
      row(
        "Joint fit",
        segmented({
          value: fit ? clearance : null,
          options: FITS,
          onChange: (v) => update((d) => void (d.joint.clearance = v)),
        }),
        fit ? FIT_HINT[clearance] : FIT_CUSTOM,
      ),
    mode !== "none" &&
      h(
        "button",
        { class: "s-link", onclick: () => downloadKeyTest(project) },
        "Print a fit-test set first ↓",
      ),
    ui.advanced &&
      mode !== "none" && [
        row(
          "Joint spacing",
          segmented({
            value: bp[everyProp],
            options: EVERY,
            onChange: (v) => update((d) => void (d.baseplate[everyProp] = v)),
          }),
        ),
        row(
          "Joint clearance",
          numField({
            value: clearance,
            min: 0,
            max: 0.5,
            step: 0.01,
            unit: "mm",
            key: "bp.clearance",
            onChange: (v) => update((d) => void (d.joint.clearance = v), "joint:clearance"),
          }),
        ),
        checkbox({
          checked: project.joint.taper,
          label: "Tapered tip",
          hint: "Makes the leading end of each key 0.1 mm narrower, so it starts easily and tightens as it slides in.",
          key: "bp.taper",
          onChange: (v) => update((d) => void (d.joint.taper = v)),
        }),
      ],
  ];
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
  const dialog = h("div", { class: "s-dialog", hidden: true });
  const onHalf = (on) => {
    const layout = getLayout(project);
    if (!on && !layout.error && hasFractional(project.bins)) roundDialog(ctx, layout, dialog);
    else update((d) => void (d.grid.halfCells = on));
  };
  return h(
    "div",
    { class: "s-sec" },
    sub("Grid type"),
    h(
      "div",
      { class: "s-cards" },
      card({
        title: "Gridfinity standard (42 mm)",
        desc: "Works with community bins from Printables and MakerWorld. Any leftover space becomes a spare border.",
        selected: g.mode === "gridfinity",
        onClick: () => setMode("gridfinity"),
      }),
      card({
        title: "Stretch to fit",
        desc: "Stretches the cells so they fill the drawer exactly. Only works with bins made here.",
        selected: g.mode === "custom",
        onClick: () => setMode("custom"),
      }),
    ),
    ui.advanced &&
      g.mode === "custom" &&
      row(
        "Preferred cell size",
        numField({
          value: g.target,
          min: 30,
          max: 60,
          unit: "mm",
          key: "grid.target",
          onChange: (v) => update((d) => void (d.grid.target = v), "grid:target"),
        }),
        "The cells get as close to this size as the drawer allows.",
      ),
    h("div", { class: "s-stack" }, [
      checkbox({
        checked: g.halfCells,
        label: "Allow half-size bins (21 mm)",
        hint: "Bins may be half a cell wide or deep, and drawing or dragging snaps to halves. Switching it off offers to round half-size bins to whole cells.",
        key: "grid.half",
        onChange: onHalf,
      }),
      dialog,
    ]),

    sub("Spare space"),
    positionPad(ctx),
    h(
      "p",
      { class: "hint muted" },
      g.mode === "custom"
        ? "Stretch to fit leaves nothing over, because the cells fill the whole drawer."
        : "Push cells towards a side and the leftover space collects on the opposite side, printed as solid strips on the edge tiles.",
    ),
    readout(project),

    sub("Baseplate style"),
    styleCards(project.baseplate, update),
    h(
      "p",
      { class: "hint muted" },
      "H-keys need a floor, so choosing them switches Light to Cut-out floor.",
    ),

    sub("Extras"),
    options(ctx),

    sub("Joints between tiles"),
    joints(ctx),
  );
}
