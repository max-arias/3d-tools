import { h } from "../../../shell/h.js";
import { checkbox, row, segmented, slider } from "../../../shell/widgets.js";
import { PRINTERS } from "../../frames/model/printers.js"; // shared printer list (TDT-33 moves it to src/lib)
import { LATCH_COUNTS, MAX, MIN } from "../geom/dims.js";
import { langStore, t } from "../lib/i18n.js";
import { PACKS, packPatch } from "../model/packs.js";
import { MAX_LABEL, MAX_LINES, boxFits, fitsBed } from "../model/project.js";
import { createBinPanel } from "./binEditor.js";
import { stepper } from "./controls.js";
import { project, result, sel, update } from "./state.js";
import { binDetails, estimateText, packSheet, partTitle, printNote, sizeText } from "./summary.js";
import { openSuggest } from "./suggest.js";
import "./strings.js";

export function createSidebar(toast) {
  const root = h("aside", { class: "side" });
  const sizeBox = h("div", { class: "readouts", "aria-live": "polite" });
  const issuesBox = h("div", { class: "readouts" });
  const summaryBox = h("div", { class: "readouts" });
  const bins = createBinPanel();
  let selfEdit = false;

  /** Edit from a text field or slider: the fields keep focus, only the readouts refresh. */
  const edit = (fn, key) => {
    selfEdit = true;
    try {
      update(fn, key);
    } finally {
      selfEdit = false;
    }
  };

  const section = (id, title, ...body) =>
    h(
      "details",
      { class: "sec", open: true, dataset: { sec: id } },
      h("summary", {}, h("span", { class: "sec-title" }, title)),
      h("div", { class: "sec-body" }, ...body),
    );

  const grid = (k, min, max) =>
    row(
      t(`dim_${k}`),
      stepper({
        key: `grid.${k}`,
        value: project.get().grid[k],
        min,
        max,
        onChange: (v) =>
          update((d) => {
            d.grid[k] = v;
          }),
      }),
    );

  const packsSection = (p) =>
    section(
      "packs",
      t("packsTitle"),
      h("p", { class: "hint muted" }, t("packsHint")),
      h(
        "div",
        { class: "cards" },
        PACKS.map((pack) =>
          h(
            "button",
            {
              class: "card",
              dataset: { key: `pack.${pack.id}` },
              "aria-pressed": String(p.pack === pack.id),
              onclick: () => {
                update((d) => Object.assign(d, packPatch(pack)));
                sel.set({ id: null });
              },
            },
            h("b", {}, t(`pack.${pack.id}.name`)),
            h("span", { class: "muted" }, t(`pack.${pack.id}.desc`)),
            h(
              "small",
              {},
              t("packMeta", {
                x: pack.grid.x,
                y: pack.grid.y,
                u: pack.grid.u,
                n: pack.bins.length,
              }),
            ),
          ),
        ),
      ),
      h(
        "button",
        { dataset: { key: "suggest.open" }, onclick: () => openSuggest(toast) },
        t("suggestOpen"),
      ),
    );

  const sizeSection = () =>
    section(
      "size",
      t("sizeTitle"),
      grid("x", MIN.x, MAX.x),
      grid("y", MIN.y, MAX.y),
      grid("u", MIN.u, MAX.u),
      sizeBox,
    );

  const partsSection = (p) =>
    section(
      "parts",
      t("partsTitle"),
      row(
        t("latches"),
        segmented({
          value: p.latches,
          options: LATCH_COUNTS.map((n) => ({ value: n, label: String(n) })),
          onChange: (n) =>
            update((d) => {
              d.latches = n;
            }),
        }),
        t("latchesHint"),
      ),
      row(
        t("hinge"),
        segmented({
          value: p.hinge,
          options: [
            { value: "pin", label: t("hingePin") },
            { value: "screw", label: t("hingeScrew") },
          ],
          onChange: (v) =>
            update((d) => {
              d.hinge = v;
            }),
        }),
        t(p.hinge === "pin" ? "hingePinHint" : "hingeScrewHint"),
      ),
      checkbox({
        checked: p.handle.on,
        label: t("handleOn"),
        key: "handle.on",
        onChange: (v) =>
          update((d) => {
            d.handle.on = v;
          }),
      }),
      p.handle.on &&
        row(
          t("handleFix"),
          segmented({
            value: p.handle.fix,
            options: [
              { value: "bolt", label: t("fixBolt") },
              { value: "pin", label: t("fixPin") },
            ],
            onChange: (v) =>
              update((d) => {
                d.handle.fix = v;
              }),
          }),
          t(p.handle.fix === "bolt" ? "fixBoltHint" : "fixPinHint"),
        ),
      row(
        t("tolerance"),
        slider({
          value: p.fit.tolerance,
          min: -0.2,
          max: 0.4,
          step: 0.05,
          key: "fit.tolerance",
          onChange: (v) =>
            edit((d) => {
              d.fit.tolerance = v;
            }, "tol"),
        }),
        t("toleranceHint"),
      ),
    );

  const labelSection = (p) => {
    const field = (key, value, onInput) =>
      h("input", {
        type: "text",
        maxLength: MAX_LABEL,
        value,
        dataset: { key },
        placeholder: t(key === "label.title" ? "labelTitle" : "labelLine"),
        oninput: (e) => onInput(e.target.value),
      });
    return section(
      "label",
      t("labelTitleSection"),
      field("label.title", p.label.title, (v) =>
        edit((d) => {
          d.label.title = v;
        }, "label"),
      ),
      Array.from({ length: MAX_LINES }, (_, i) =>
        field(`label.line.${i}`, p.label.lines[i] ?? "", (v) =>
          edit((d) => {
            const lines = Array.from({ length: MAX_LINES }, (_, k) => d.label.lines[k] ?? "");
            lines[i] = v;
            while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
            d.label.lines = lines;
          }, "label"),
        ),
      ),
      h("p", { class: "hint muted" }, t("labelHint", { n: MAX_LABEL })),
      issuesBox,
    );
  };

  const printerSection = (p) =>
    section(
      "printer",
      t("printerTitle"),
      row(
        t("printer"),
        h(
          "select",
          {
            dataset: { key: "printer" },
            onchange: (e) => {
              const x = PRINTERS.find((q) => q.id === e.target.value);
              update((d) => {
                d.printer = e.target.value;
                if (x) d.build = { x: x.x, y: x.y, z: x.z };
              });
            },
          },
          PRINTERS.map((x) => h("option", { value: x.id, selected: x.id === p.printer }, x.name)),
        ),
      ),
      h("p", { class: "hint muted" }, `${p.build.x} × ${p.build.y} × ${p.build.z} mm`),
    );

  function paint() {
    const p = project.get();
    const focus = document.activeElement?.dataset?.key;
    const top = root.scrollTop;
    root.replaceChildren(
      packsSection(p),
      sizeSection(),
      section("bins", t("binsTitle"), bins.el),
      partsSection(p),
      labelSection(p),
      printerSection(p),
      section("summary", t("summaryTitle"), summaryBox),
    );
    bins.paint();
    paintLive();
    root.scrollTop = top;
    if (focus && root.contains(document.activeElement) === false)
      root.querySelector(`[data-key="${focus}"]`)?.focus();
  }

  /** The readouts that follow the project and the build result. */
  function paintLive() {
    const p = project.get();
    const { dims, base } = boxFits(p);
    const printer = PRINTERS.find((x) => x.id === p.printer);
    sizeBox.replaceChildren(
      h(
        "div",
        { class: `size${base ? "" : " over"}`, dataset: { key: "size.outer" } },
        h("span", {}, t("outer")),
        h("span", {}, `${dims.W} × ${dims.D} × ${dims.closedH} mm`),
      ),
      !base &&
        h(
          "p",
          { class: "bad small", dataset: { key: "size.warn" } },
          t("baseTooBig", {
            printer: printer?.short ?? t("yourPrinter"),
            w: dims.W,
            d: dims.D,
            h: dims.baseH,
            x: p.build.x,
            y: p.build.y,
            z: p.build.z,
          }),
        ),
    );

    const data = result.get().data;
    issuesBox.replaceChildren(
      ...(data?.issues ?? [])
        .filter((i) => i.kind === "label")
        .map((i) =>
          h(
            "p",
            { class: "warn", dataset: { key: "issue" } },
            i.small
              ? t("issueSmall", { text: i.text })
              : t("issueSkipped", { text: i.text, chars: (i.skipped ?? []).join(" ") }),
          ),
        ),
    );

    if (!data) return summaryBox.replaceChildren(h("p", { class: "muted" }, t("building")));
    const est = estimateText(data.parts);
    summaryBox.replaceChildren(
      h(
        "ul",
        { class: "parts" },
        data.parts.map((part) => {
          const over = !fitsBed([part.size[0], part.size[1]], p.build) || part.size[2] > p.build.z;
          const details = part.kind === "bin" ? binDetails(part) : [];
          return h(
            "li",
            { class: over ? "over" : "", dataset: { part: part.id } },
            h("span", { class: "tag" }, `${part.qty}×`),
            h(
              "span",
              { class: "info" },
              h("b", {}, partTitle(part)),
              h("span", { class: "muted" }, ` ${sizeText(part.size)} mm`),
              details.length ? h("span", { class: "muted" }, ` · ${details.join(", ")}`) : null,
              h("span", { class: "note muted" }, printNote(part, p.hinge)),
              !part.valid && h("span", { class: "bad" }, t("notWatertight")),
            ),
          );
        }),
      ),
      h("p", { class: "totals", dataset: { key: "totals" } }, t("totals", est)),
      h(
        "button",
        {
          dataset: { key: "sheet.copy" },
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(packSheet(project.get(), data));
              toast(t("sheetCopied"));
            } catch {
              prompt(t("copySheet"), packSheet(project.get(), data));
            }
          },
        },
        t("copySheet"),
      ),
    );
  }

  langStore.subscribe(paint);
  project.subscribe(() => (selfEdit ? paintLive() : paint()));
  result.subscribe(paintLive);
  sel.subscribe(() => bins.paint());
  paint();
  return root;
}
