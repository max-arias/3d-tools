import { h } from "../../../../shell/h.js";
import { card, checkbox, numField, row, segmented } from "../../../../shell/widgets.js";
import { hasFractional } from "../../layout/bins.js";
import { downloadKeyTest } from "../../export/actions.js";

export const id = "baseplate";
export const title = "BASEPLATE";

const STYLES = [
  { value: "thin", title: "THIN", desc: "Open sockets. Bins stand on the drawer floor.", mm: 4.65 },
  {
    value: "skeleton",
    title: "SKELETONIZED",
    desc: "Floor with cut-outs. Saves filament.",
    mm: 7.65,
  },
  {
    value: "weighted",
    title: "WEIGHTED",
    desc: "Thick solid floor. Heavier, stays put.",
    mm: 11.4,
  },
];
export const summary = (project) =>
  STYLES.find((s) => s.value === project.baseplate.style)?.title ?? "";

const FITS = [
  { value: 0.1, label: "Tighter" },
  { value: 0.15, label: "Standard" },
  { value: 0.2, label: "Looser" },
];
const FIT_HINT = {
  0.1: "0.10 mm per side. Keys won’t go in by hand? Back to Standard.",
  0.15: "Wobble or fall out? Tighter. Won’t go in by hand? Looser. Not sure? The fit-test set has all three (1, 2, 3 dimples):",
  0.2: "0.20 mm per side. Keys wobble or fall out? Back to Standard.",
};
const FIT_CUSTOM = "Your own clearance. Tighter, Standard and Looser match the fit-test set:";
const EVERY = [
  { value: 1, label: "Every cell" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
];

function styleCards(bp, update) {
  return h(
    "div",
    { class: "t-cards" },
    STYLES.map((s) =>
      card({
        title: s.title,
        desc: s.desc,
        meta: `${s.mm} mm total`,
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
  return [
    showRibs &&
      checkbox({
        checked: bp.halfSockets === "ribs",
        label: "Divider ribs (half bins)",
        hint: "A thin wall in the socket next to each bin that is half a cell wide or deep keeps it from sliding, even alone. Wider bins are held by their whole feet and get none. Off: plain standard sockets; a narrow half bin needs a neighbour in the same cell.",
        key: "bp.ribs",
        onChange: (on) => set("halfSockets")(on ? "ribs" : "shared"),
      }),
    checkbox({
      checked: bp.chamfer > 0,
      label: "Edge chamfer",
      key: "bp.chamfer",
      onChange: (on) => set("chamfer")(on ? 0.8 : 0),
    }),
    checkbox({
      checked: bp.peaks,
      label: "Pointed junctions",
      hint: "On: the ridges between cells meet in a sharp point where four cells meet, as in most Gridfinity generators. Off: the published Gridfinity rounding, which leaves a small flat spot there. Bins fit the same either way.",
      key: "bp.peaks",
      onChange: set("peaks"),
    }),
    checkbox({
      checked: bp.magnets,
      label: "Magnet holes",
      hint: "Holes for round magnets (size and depth in Advanced) in each cell’s corners, so bins with magnets snap into place. On Thin the holes sit in small corner pads.",
      key: "bp.magnets",
      onChange: set("magnets"),
    }),
    checkbox({
      checked: bp.tape,
      label: "Tape recesses",
      hint: "Pockets 3 × 20 × 0.6 mm under the grid lines inside each tile. Cut strips of double-sided tape (e.g. 3M VHB), press them in, and the plate stays put on the drawer floor.",
      key: "bp.tape",
      onChange: set("tape"),
    }),
    ui.advanced &&
      row(
        "Magnet Ø",
        numField({
          value: project.magnet.d,
          min: 1,
          max: 20,
          step: 0.1,
          unit: "mm",
          key: "bp.magnetD",
          onChange: (v) => update((d) => void (d.magnet.d = v), "magnet:d"),
        }),
        `Magnet falls out? Ø ${+(project.magnet.d - 0.1).toFixed(2)}. Won’t press in? Ø ${+(project.magnet.d + 0.1).toFixed(2)}.`,
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
        { value: "none", label: "None" },
        { value: "keys", label: "H-keys" },
        { value: "clips", label: "Clips" },
      ],
      onChange: setJoint,
    }),
    h(
      "p",
      { class: "t-note" },
      "The drawer walls hold the tiles. Clips press in from the top and keep the plate thin; H-keys push in from below and need a floor.",
    ),
    mode !== "none" &&
      h(
        "div",
        { class: "t-col" },
        h("span", {}, "Key and clip fit"),
        segmented({
          value: fit ? clearance : null,
          options: FITS,
          onChange: (v) => update((d) => void (d.joint.clearance = v)),
        }),
        h("p", { class: "t-note" }, fit ? FIT_HINT[clearance] : FIT_CUSTOM),
        h("button", { class: "t-link", onclick: () => downloadKeyTest(project) }, "↓ fit-test set"),
      ),
    ui.advanced &&
      mode !== "none" && [
        row(
          "Spacing",
          segmented({
            value: bp[everyProp],
            options: EVERY,
            onChange: (v) => update((d) => void (d.baseplate[everyProp] = v)),
          }),
        ),
        row(
          "Key clearance",
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
          label: "Taper",
          hint: "Makes the end of each key that goes in first 0.1 mm narrower, so keys start easily and tighten as they slide in.",
          key: "bp.taper",
          onChange: (v) => update((d) => void (d.joint.taper = v)),
        }),
      ],
  ];
}

export function render(ctx) {
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "STYLE"),
        styleCards(ctx.project.baseplate, ctx.update),
        h(
          "p",
          { class: "t-note" },
          "H-keys need a floor (Thin becomes Skeletonized). Magnets on Thin get corner pads. Magnet size applies to bins too.",
        ),
      ),
      h("div", { class: "t-col" }, h("h3", { class: "t-h" }, "OPTIONS"), options(ctx)),
      h("div", { class: "t-col" }, h("h3", { class: "t-h" }, "JOINTS BETWEEN TILES"), joints(ctx)),
    ),
  );
}
