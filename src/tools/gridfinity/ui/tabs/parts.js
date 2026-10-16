import { h } from "../../../../shell/h.js";
import { segmented } from "../../../../shell/widgets.js";
import { download3mf, downloadPartStl, downloadZip } from "../../export/actions.js";
import { getPartsData } from "../partsData.js";

export const id = "parts";
export const title = "PARTS & EXPORT";
export const summary = (project, ctx) =>
  ctx?.ui.result ? String(getPartsData(ctx.ui.result, project).groups.length) : "";

const SWATCH = { tile: "t-tile", key: "t-key", test: "t-test" };

function partsTable({ ui, setUi }, groups) {
  const rows = groups.map((g) => {
    const first = g.parts[0];
    const bad = g.parts.some((p) => p.valid === false);
    const sel = ui.partSel === first.name;
    const cls = ["t-part", sel && "t-sel", bad && "t-badrow"].filter(Boolean).join(" ");
    return h(
      "tr",
      {
        class: cls,
        onmouseenter: () => setUi({ partHover: first.name }),
        onmouseleave: () => setUi({ partHover: null }),
        onclick: () => setUi({ partSel: sel ? null : first.name }),
      },
      h("td", {}, h("span", { class: `t-swatch ${SWATCH[g.kind] ?? ""}` }), g.base, bad && " ⚠"),
      h("td", {}, String(g.count)),
      h("td", {}, g.size.map((v) => +v.toFixed(1)).join(" × ")),
      h("td", {}, g.plates.join(", ")),
      h(
        "td",
        {},
        h(
          "button",
          {
            title: "Download STL",
            onclick: (e) => {
              e.stopPropagation();
              downloadPartStl(first);
            },
          },
          "↓",
        ),
      ),
    );
  });
  return h(
    "table",
    { class: "t-table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        ["PART", "QTY", "SIZE, MM", "PLATE", ""].map((t) => h("th", {}, t)),
      ),
    ),
    h("tbody", {}, rows),
  );
}

const count = (parts, re) => parts.filter((p) => re.test(p.name)).length;

function summaryBox(result, project, plates) {
  const { parts } = result;
  const tiles = parts.filter((p) => p.kind === "tile").length;
  const bins = parts.filter((p) => p.kind === "bin" && !p.inlay).length;
  const keys = count(parts, /^hkey_/);
  const clips = count(parts, /^clip_/);
  const broken = parts.filter((p) => p.valid === false).length;
  return h(
    "div",
    { class: "t-box" },
    h("b", {}, `${tiles} tiles · ${bins} bin parts · ${plates} plates`),
    keys > 0 && h("span", {}, `${keys} H-keys including spares`),
    clips > 0 && h("span", {}, `${clips} clips including spares`),
    result.seamMagnets > 0 &&
      h("span", {}, `${result.seamMagnets} seam magnets, opposite poles facing`),
    h(
      "span",
      { class: broken ? "t-bad" : "t-ok" },
      broken ? `● ${broken} broken meshes` : "● all meshes valid",
    ),
    result.warnings?.map((w) => h("span", { class: "t-note t-bad" }, w)),
  );
}

function exportColumn({ project, ui, update }, groups, plates) {
  const result = ui.result;
  return h(
    "div",
    { class: "t-col" },
    h("h3", { class: "t-h" }, "EXPORT"),
    ui.busy && h("div", { class: "t-box" }, "Generating…"),
    ui.error && h("div", { class: "t-box t-error" }, ui.error),
    result && summaryBox(result, project, plates),
    h("h3", { class: "t-h" }, "BIN PRINT"),
    segmented({
      value: project.binPrint,
      options: [
        { value: "regular", label: "Regular" },
        { value: "light", label: "Light" },
        { value: "superlight", label: "Super light" },
      ],
      onChange: (v) => update((d) => void (d.binPrint = v)),
    }),
    h(
      "p",
      { class: "t-note" },
      "Lighter, faster bins: thinner floor shells and sparse infill, on the bins only (tiles print as usual). A little less stiff, fine in the grid. Light: top shell 3 layers / 0.8 mm (prints 4), infill 6 % adaptive cubic, bottom 2 layers. Super light: top shell 3 / 0.6 mm, infill 5 % adaptive cubic, bottom 2.",
    ),
    h(
      "button",
      {
        class: "primary",
        disabled: !result || ui.busy,
        onclick: () => download3mf(result, project),
      },
      "3MF, PACKED ON PLATES",
    ),
    h(
      "button",
      { disabled: !result || ui.busy, onclick: () => downloadZip(result, project) },
      "STLS (ZIP) + PARTS LIST",
    ),
  );
}

export function render(ctx) {
  const { project, ui } = ctx;
  const { groups, plates } = getPartsData(ui.result, project);
  return h(
    "div",
    { class: "t-tab" },
    h(
      "div",
      { class: "t-cols" },
      h(
        "div",
        { class: "t-col" },
        groups.length
          ? partsTable(ctx, groups)
          : h("p", { class: "t-note" }, ui.busy ? "Generating…" : "No parts yet."),
      ),
      exportColumn(ctx, groups, plates.length),
    ),
  );
}
