import "../sections.css";
import { h } from "../../../../shell/h.js";
import { numField, row } from "../../../../shell/widgets.js";
import { heightLimit } from "../../layout/limits.js";
import { PRINTERS, presetById } from "../../model/printers.js";
import { getPartsData } from "../partsData.js";
import { getLayout, setDockTab } from "../state.js";

export const id = "space";
export const title = "Drawer & printer";
export const summary = (project) => {
  const name = presetById(project.printer.preset)?.short;
  const size = `${project.drawer.w} × ${project.drawer.d} mm`;
  const full = name ? `${size} · ${name}` : size;
  return full.length <= 28 ? full : size;
};

const n2 = (v) => +v.toFixed(2);
const sub = (text) => h("h3", { class: "s-sub" }, text);

function spareText(grid) {
  const a = grid.x.padStart + grid.x.padEnd;
  const b = grid.y.padStart + grid.y.padEnd;
  if (a < 0.005 && b < 0.005) return "No spare space left over";
  const centred = grid.x.padStart === grid.x.padEnd && grid.y.padStart === grid.y.padEnd;
  return `Spare space ${n2(a)} / ${n2(b)} mm${centred ? ", centred" : ""}`;
}

function resultBox(project) {
  const layout = getLayout(project);
  if (layout.error)
    return h("div", { class: "s-box s-error" }, `The grid can't be laid out yet: ${layout.error}`);
  const { grid, plan } = layout;
  const p = project.printer;
  const name = presetById(p.preset)?.short ?? `${p.x} × ${p.y} mm`;
  const tiles = plan.tiles.length;
  return h(
    "div",
    { class: "s-box" },
    h("b", {}, `${grid.cols} × ${grid.rows} cells of ${n2(grid.pitchX)} × ${n2(grid.pitchY)} mm`),
    h("span", { class: "s-note" }, spareText(grid)),
    h(
      "span",
      { class: "s-note" },
      `${tiles} baseplate ${tiles === 1 ? "tile" : "tiles"} for ${name}`,
    ),
    h("button", { class: "s-link", onclick: () => setDockTab("grid") }, "Adjust the grid →"),
  );
}

function heightBreakdown(project) {
  const hl = heightLimit(project);
  const lip = project.binDefaults.lip;
  const units = lip ? hl.maxUnitsLip : hl.maxUnits;
  return h(
    "div",
    { class: "s-box" },
    h(
      "div",
      { class: "s-calc" },
      h("span", {}, "Drawer height"),
      h("span", {}, `${project.drawer.h} mm`),
      h("span", {}, "Baseplate floor"),
      h("span", {}, `− ${n2(hl.floor)} mm`),
      h("span", {}, "Space above the bins"),
      h("span", {}, `− ${n2(hl.clearance)} mm`),
      h("b", {}, "Tallest bin"),
      h("b", {}, `${n2(hl.limit)} mm`),
    ),
    h(
      "span",
      { class: "s-note" },
      `That is ${units} height ${units === 1 ? "step" : "steps"} of 7 mm${lip ? ", counting the stacking lip" : ""}.`,
    ),
  );
}

function bedDiagram(p) {
  const mx = (p.margin / p.x) * 100;
  const my = (p.margin / p.y) * 100;
  return h(
    "div",
    { class: "s-bed", style: `aspect-ratio: ${p.x} / ${p.y}`, title: `${p.x} × ${p.y} mm` },
    h("div", { style: `left:${mx}%;right:${mx}%;top:${my}%;bottom:${my}%` }),
  );
}

function bedStats(project, ui) {
  const layout = getLayout(project);
  if (layout.error) return null;
  const { xs, ys, tiles } = layout.plan;
  const plates = ui.result ? getPartsData(ui.result, project).plates.length : null;
  return h(
    "div",
    { class: "s-box" },
    h("span", {}, `Largest tile: ${Math.max(...xs)} × ${Math.max(...ys)} cells`),
    h("span", {}, `${tiles.length} baseplate ${tiles.length === 1 ? "tile" : "tiles"}`),
    plates != null && h("b", {}, `${plates} ${plates === 1 ? "plate" : "plates"} in total`),
  );
}

// ---- isometric drawer with the three measurements on its edges ----------------------------------

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const pt = (p) => `${+p[0].toFixed(1)},${+p[1].toFixed(1)}`;
const poly = (cls, ...points) => `<polygon class="${cls}" points="${points.map(pt).join(" ")}"/>`;
const line = (cls, a, b) =>
  `<line class="${cls}" x1="${+a[0].toFixed(1)}" y1="${+a[1].toFixed(1)}" x2="${+b[0].toFixed(1)}" y2="${+b[1].toFixed(1)}"/>`;

// Fixed spots (in the 320 × 240 drawing) where the inputs sit, so they stay put while the box reshapes.
const SPOTS = { w: [76, 210], d: [244, 210], h: [29, 108] };

function drawerSvg(d) {
  const m = Math.max(d.w, d.d, d.h);
  const W = 96 * (0.62 + 0.38 * (d.w / m));
  const D = 96 * (0.62 + 0.38 * (d.d / m));
  const H = 66 * (0.45 + 0.55 * (d.h / m));
  const F = [160, 188];
  const L = [F[0] - W * COS, F[1] - W * SIN];
  const R = [F[0] + D * COS, F[1] - D * SIN];
  const B = [L[0] + D * COS, L[1] - D * SIN];
  const up = (p) => [p[0], p[1] - H];
  // Dimension lines run beside the bottom edges and the left vertical edge, with end ticks.
  const dim = (a, b, off) => {
    const a2 = [a[0] + off[0], a[1] + off[1]];
    const b2 = [b[0] + off[0], b[1] + off[1]];
    const tick = (p) =>
      line(
        "iso-tick",
        [p[0] - off[0] * 0.3, p[1] - off[1] * 0.3],
        [p[0] + off[0] * 0.3, p[1] + off[1] * 0.3],
      );
    return line("iso-dim", a2, b2) + tick(a2) + tick(b2);
  };
  return `<svg viewBox="0 0 320 240" role="img" aria-label="Isometric drawer showing width, depth and height">
    ${poly("iso-floor", L, B, R, F)}
    ${poly("iso-back", L, B, up(B), up(L))}
    ${poly("iso-back iso-back2", B, R, up(R), up(B))}
    ${poly("iso-front", F, L, up(L), up(F))}
    ${poly("iso-front iso-front2", F, R, up(R), up(F))}
    ${line("iso-rim", up(F), up(L))}${line("iso-rim", up(F), up(R))}${line("iso-rim", up(L), up(B))}${line("iso-rim", up(R), up(B))}
    ${dim(F, L, [-8, 14])}
    ${dim(F, R, [8, 14])}
    ${dim(L, up(L), [-16, 0])}
  </svg>`;
}

function drawerDiagram(d, field) {
  const box = h("div", { class: "s-iso" });
  box.innerHTML = drawerSvg(d);
  for (const [prop, label, min, max] of [
    ["w", "Width (mm)", 50, 3000],
    ["d", "Depth (mm)", 50, 3000],
    ["h", "Height (mm)", 10, 1000],
  ]) {
    const [x, y] = SPOTS[prop];
    box.append(
      h(
        "label",
        { class: "s-dimfield", style: `left:${(x / 320) * 100}%;top:${(y / 240) * 100}%` },
        h("span", {}, label),
        field(prop, min, max),
      ),
    );
  }
  return box;
}

export function render({ project, ui, update }) {
  const d = project.drawer;
  const p = project.printer;
  const drawerField = (prop, label, min, max, extra = {}, hint) =>
    row(
      label,
      numField({
        value: d[prop],
        min,
        max,
        unit: "mm",
        key: `drawer.${prop}`,
        onChange: (v) => update((x) => void (x.drawer[prop] = v), `drawer:${prop}`),
        ...extra,
      }),
      hint,
    );
  const printerField = (prop, label, min, max, hint) =>
    row(
      label,
      numField({
        value: p[prop],
        min,
        max,
        unit: "mm",
        key: `printer.${prop}`,
        onChange: (v) =>
          update((x) => {
            x.printer[prop] = v;
            if (prop !== "margin") x.printer.preset = "custom";
          }, `printer:${prop}`),
      }),
      hint,
    );
  const choose = (preset) =>
    update((x) => {
      x.printer.preset = preset.id;
      Object.assign(x.printer, { x: preset.x, y: preset.y, z: preset.z });
    });
  const chip = (label, pressed, onclick, tip) =>
    h("button", { "aria-pressed": String(pressed), onclick, title: tip }, label);

  return h(
    "div",
    { class: "s-sec" },
    sub("Your drawer"),
    h(
      "p",
      { class: "hint muted" },
      "Measure the inside of your drawer, floor to rim. Everything else is worked out from these three numbers.",
    ),
    drawerDiagram(d, (prop, min, max) =>
      numField({
        value: d[prop],
        min,
        max,

        key: `drawer.${prop}`,
        onChange: (v) => update((x) => void (x.drawer[prop] = v), `drawer:${prop}`),
      }),
    ),

    sub("Fit"),
    drawerField(
      "tol",
      "Clearance to drawer walls",
      0,
      5,
      { step: 0.1 },
      "Baseplate jams when you test it? Add some (try 1.0 mm). Slides around? Take some off (try 0.3 mm).",
    ),
    drawerField("cornerR", "Drawer corner radius", 0, 200, {}, "Leave at 0 for square corners."),

    sub("How tall can bins be?"),
    heightBreakdown(project),
    ui.advanced &&
      drawerField(
        "topClearance",
        "Space above the bins",
        0,
        100,
        { step: 0.5 },
        "Air gap kept between the tallest bin and whatever closes the drawer.",
      ),

    sub("Your printer"),
    h(
      "div",
      { class: "s-chips" },
      PRINTERS.map((pr) => chip(pr.short, p.preset === pr.id, () => choose(pr), pr.name)),
      chip("Custom", p.preset === "custom", () =>
        update((x) => void (x.printer.preset = "custom")),
      ),
    ),
    printerField("x", "Bed width", 60, 2000),
    printerField("y", "Bed depth", 60, 2000),
    printerField("z", "Max print height", 20, 2000),
    printerField(
      "margin",
      "Unusable bed edge",
      0,
      30,
      "Strip around the bed that your printer can't use reliably (purge lines, clips).",
    ),

    sub("Printable area"),
    bedDiagram(p),
    h("span", { class: "s-note" }, `${p.x - 2 * p.margin} × ${p.y - 2 * p.margin} mm`),
    bedStats(project, ui),

    sub("What you'll get"),
    resultBox(project),
  );
}
