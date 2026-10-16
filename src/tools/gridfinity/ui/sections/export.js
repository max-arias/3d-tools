import { h } from "../../../../shell/h.js";
import { icon } from "../../../../shell/icons.js";
import { segmented } from "../../../../shell/widgets.js";
import { download3mf, downloadPartStl, downloadZip } from "../../export/actions.js";
import { getPartsData } from "../partsData.js";
import { ui as uiStore } from "../state.js";

export const id = "export";
export const title = "Print & export";
export const summary = (project, ctx) => {
  if (!ctx?.ui.result) return "";
  const n = getPartsData(ctx.ui.result, project).groups.length;
  return n === 1 ? "1 part type" : `${n} part types`;
};

const SWATCH = { tile: "s-tile", key: "s-key", test: "s-test", lid: "s-key" };
const sub = (text) => h("h3", { class: "s-sub" }, text);

// Re-rendering under the cursor fires mouseenter again, so only write when the hover really changed.
const hover = (name) => {
  if (uiStore.get().partHover !== name) uiStore.set({ partHover: name });
};

function partsTable({ ui, setUi }, groups) {
  const rows = groups.map((g) => {
    const first = g.parts[0];
    const bad = g.parts.some((p) => p.valid === false);
    const sel = ui.partSel === first.name;
    const cls = ["s-part", sel && "s-sel", bad && "s-badrow"].filter(Boolean).join(" ");
    return h(
      "tr",
      {
        class: cls,
        onmouseenter: () => hover(first.name),
        onmouseleave: () => hover(null),
        onclick: () => setUi({ partSel: sel ? null : first.name }),
      },
      h("td", {}, h("span", { class: `s-swatch ${SWATCH[g.kind] ?? ""}` }), g.base, bad && " ⚠"),
      h("td", {}, String(g.count)),
      h("td", {}, g.size.map((v) => +v.toFixed(1)).join(" × ")),
      h("td", {}, g.plates.join(", ")),
      h(
        "td",
        {},
        h(
          "button",
          {
            class: "icon-btn s-dl",
            title: "Download this part as an STL",
            onclick: (e) => {
              e.stopPropagation();
              downloadPartStl(first);
            },
          },
          icon("download", 14),
        ),
      ),
    );
  });
  return h(
    "table",
    { class: "s-table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        ["Part", "Qty", "Size", "Plate", ""].map((t) => h("th", {}, t)),
      ),
    ),
    h("tbody", {}, rows),
  );
}

const count = (parts, re) => parts.filter((p) => re.test(p.name)).length;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function summaryBox(result, plates) {
  const { parts } = result;
  const tiles = parts.filter((p) => p.kind === "tile").length;
  const bins = parts.filter((p) => p.kind === "bin" && !p.inlay).length;
  const keys = count(parts, /^hkey_/);
  const clips = count(parts, /^clip_/);
  const broken = parts.filter((p) => p.valid === false).length;
  return h(
    "div",
    { class: "s-box" },
    h(
      "b",
      {},
      `${plural(tiles, "tile", "tiles")} · ${plural(bins, "bin part", "bin parts")} · ${plural(plates, "plate", "plates")}`,
    ),
    keys > 0 && h("span", {}, `${plural(keys, "H-key", "H-keys")}, spares included`),
    clips > 0 && h("span", {}, `${plural(clips, "clip", "clips")}, spares included`),
    result.seamMagnets > 0 &&
      h(
        "span",
        {},
        `${plural(result.seamMagnets, "seam magnet", "seam magnets")}, glued with opposite poles facing`,
      ),
    h(
      "span",
      { class: broken ? "s-bad" : "s-ok" },
      broken
        ? `${plural(broken, "part has", "parts have")} a broken mesh`
        : "Every mesh checked out fine",
    ),
  );
}

function headsUps(result) {
  const list = result?.warnings ?? [];
  if (!list.length) return null;
  return h(
    "div",
    { class: "s-box s-warnbox" },
    h("b", { class: "s-warnhead" }, icon("warning", 14), "Heads-ups"),
    list.map((w) => h("span", {}, w)),
  );
}

function exportGroup({ project, ui, update }, plates) {
  const result = ui.result;
  return [
    ui.busy && h("div", { class: "s-box" }, icon("spinner", 14), " Building your parts…"),
    ui.error && h("div", { class: "s-box s-error" }, ui.error),
    result && summaryBox(result, plates),
    headsUps(result),

    sub("Bin print speed-up"),
    segmented({
      value: project.binPrint,
      options: [
        { value: "regular", label: "Regular" },
        { value: "light", label: "Lighter" },
        { value: "superlight", label: "Lightest" },
      ],
      onChange: (v) => update((d) => void (d.binPrint = v)),
    }),
    h(
      "p",
      { class: "hint muted" },
      "Prints bins faster and with less plastic by using thinner floor shells and sparse infill. Baseplate tiles are not affected. Bins end up slightly less stiff, which is fine once they sit in the grid. Lighter: top shell 3 layers / 0.8 mm (prints as 4), 6 % adaptive cubic infill, 2 bottom layers. Lightest: top shell 3 layers / 0.6 mm, 5 % adaptive cubic infill, 2 bottom layers.",
    ),

    sub("Download"),
    h(
      "div",
      { class: "s-stack" },
      h(
        "button",
        {
          class: "primary",
          disabled: !result || ui.busy,
          onclick: () => download3mf(result, project),
        },
        "3MF for Bambu Studio / Orca (parts placed on plates)",
      ),
      h(
        "button",
        { disabled: !result || ui.busy, onclick: () => downloadZip(result, project) },
        "STL files + parts list (zip)",
      ),
    ),
  ];
}

export function render(ctx) {
  const { project, ui } = ctx;
  const { groups, plates } = getPartsData(ui.result, project);
  return h(
    "div",
    { class: "s-sec" },
    exportGroup(ctx, plates.length),
    sub("Parts list"),
    groups.length
      ? [
          partsTable(ctx, groups),
          h(
            "p",
            { class: "hint muted" },
            "Sizes are in mm. Click a row to find the part in the views.",
          ),
        ]
      : h(
          "p",
          { class: "hint muted" },
          ui.busy ? "Building your parts…" : "Nothing to list yet. Add some bins first.",
        ),
  );
}
