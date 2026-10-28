import { h } from "../../../shell/h.js";
import { numField, row } from "../../../shell/widgets.js";
import { PRINTERS } from "../../frames/model/printers.js"; // shared printer list (TDT-33 moves it to src/lib)
import { t } from "../lib/i18n.js";
import { MAX, MIN } from "../geom/dims.js";
import { suggestBox } from "../model/packs.js";
import { openModal } from "./modal.js";
import { expandBins, newBin } from "./binMath.js";
import { project, update } from "./state.js";

/** Dialog: list the bins you need, get the smallest box that holds them on this printer. */
export function openSuggest(toast) {
  let rows = [{ w: 1, d: 1, count: 6 }];
  let minU = MIN.u;
  let found = null;
  const rowsBox = h("div", { class: "suggest-rows" });
  const out = h("p", { class: "suggest-out", role: "status", dataset: { key: "suggest.out" } });
  const apply = h(
    "button",
    {
      class: "primary",
      dataset: { key: "suggest.apply" },
      onclick: () => {
        update((d) => {
          d.grid = found.grid;
          d.bins = found.bins.map(newBin);
          d.pack = null;
        });
        modal.close();
        toast(t("suggestApplied"));
      },
    },
    t("suggestApply"),
  );

  const paintResult = () => {
    const p = project.get();
    const printer = PRINTERS.find((x) => x.id === p.printer);
    found = suggestBox(expandBins(rows), p.build, minU);
    apply.disabled = !found;
    out.dataset.state = found ? "ok" : "none";
    out.textContent = found
      ? t("suggestFound", {
          x: found.grid.x,
          y: found.grid.y,
          u: found.grid.u,
          pct: Math.round(found.fill * 100),
        })
      : t("suggestNone", {
          printer: printer?.short ?? t("yourPrinter"),
          x: p.build.x,
          y: p.build.y,
        });
  };

  const field = (r, k, i, min, max) =>
    numField({
      value: r[k],
      min,
      max,
      key: `suggest.${k}.${i}`,
      onChange: (v) => {
        r[k] = v;
        paintResult();
      },
    });

  const paintRows = () => {
    rowsBox.replaceChildren(
      ...rows.map((r, i) =>
        h(
          "div",
          { class: "suggest-row" },
          field(r, "w", i, 1, MAX.x),
          h("span", {}, "×"),
          field(r, "d", i, 1, MAX.y),
          h("span", {}, "="),
          field(r, "count", i, 1, 60),
          h(
            "button",
            {
              "aria-label": t("removeRow"),
              disabled: rows.length < 2,
              onclick: () => {
                rows = rows.filter((x) => x !== r);
                paintRows();
                paintResult();
              },
            },
            "×",
          ),
        ),
      ),
    );
  };

  const body = h(
    "div",
    { class: "suggest" },
    h("p", { class: "hint muted" }, t("suggestHint")),
    rowsBox,
    h(
      "button",
      {
        dataset: { key: "suggest.add" },
        onclick: () => {
          rows = [...rows, { w: 1, d: 1, count: 1 }];
          paintRows();
          paintResult();
        },
      },
      t("addRow"),
    ),
    row(
      t("minHeight"),
      numField({
        value: minU,
        min: MIN.u,
        max: MAX.u,
        unit: "U",
        key: "suggest.minU",
        onChange: (v) => {
          minU = v;
          paintResult();
        },
      }),
    ),
    out,
    apply,
  );
  const modal = openModal(t("suggestTitle"), body);
  paintRows();
  paintResult();
}
