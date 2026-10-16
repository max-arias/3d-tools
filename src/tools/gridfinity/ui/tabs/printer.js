import { h } from "../../../../shell/h.js";
import { numField, row } from "../../../../shell/widgets.js";
import { PRINTERS, presetById } from "../../model/printers.js";
import { getPartsData } from "../partsData.js";
import { getLayout } from "../state.js";

export const id = "printer";
export const title = "PRINTER";
export const summary = (project) => {
  const p = project.printer;
  return presetById(p.preset)?.short ?? `${p.x}×${p.y}`;
};

function diagram(p) {
  const mx = (p.margin / p.x) * 100;
  const my = (p.margin / p.y) * 100;
  return h(
    "div",
    { class: "t-bed", style: `aspect-ratio: ${p.x} / ${p.y}`, title: `${p.x} × ${p.y} mm` },
    h("div", {
      style: `left:${mx}%;right:${mx}%;top:${my}%;bottom:${my}%`,
    }),
  );
}

function stats(project, ui) {
  const layout = getLayout(project);
  if (layout.error) return null;
  const { xs, ys, tiles } = layout.plan;
  const plates = ui.result ? getPartsData(ui.result, project).plates.length : null;
  return h(
    "div",
    { class: "t-box" },
    h("span", {}, `${Math.max(...xs)} × ${Math.max(...ys)} cells per tile, max`),
    h("span", {}, `${tiles.length} baseplate tiles`),
    plates != null && h("b", {}, `${plates} plates total`),
  );
}

export function render({ project, ui, update }) {
  const p = project.printer;
  const field = (prop, label, min, max) =>
    row(
      label,
      numField({
        value: p[prop],
        min,
        max,
        unit: "mm",
        key: `printer.${prop}`,
        onChange: (v) =>
          update((d) => {
            d.printer[prop] = v;
            if (prop !== "margin") d.printer.preset = "custom";
          }, `printer:${prop}`),
      }),
    );
  const choose = (preset) =>
    update((d) => {
      d.printer.preset = preset.id;
      Object.assign(d.printer, { x: preset.x, y: preset.y, z: preset.z });
    });
  const pickBtn = (label, pressed, onclick, title) =>
    h("button", { "aria-pressed": String(pressed), onclick, title }, label);
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "PRINTER"),
        h(
          "div",
          { class: "t-presets" },
          PRINTERS.map((pr) => pickBtn(pr.short, p.preset === pr.id, () => choose(pr), pr.name)),
          pickBtn("Custom", p.preset === "custom", () =>
            update((d) => void (d.printer.preset = "custom")),
          ),
        ),
      ),
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "BED"),
        field("x", "Bed X", 60, 2000),
        field("y", "Bed Y", 60, 2000),
        field("z", "Max Z", 20, 2000),
        field("margin", "Edge margin", 0, 30),
      ),
      h(
        "div",
        { class: "t-col" },
        h("h3", { class: "t-h" }, "USABLE AREA"),
        diagram(p),
        h("span", { class: "t-note" }, `${p.x - 2 * p.margin} × ${p.y - 2 * p.margin} mm`),
        stats(project, ui),
      ),
    ),
  );
}
