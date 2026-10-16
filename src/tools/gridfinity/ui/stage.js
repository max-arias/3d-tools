import { h, clear } from "../../../shell/h.js";
import { icon } from "../../../shell/icons.js";
import { projects, ui, setUi, setStageView } from "./state.js";
import { createTopView } from "./topview.js";
import { createViewer } from "./viewer3d.js";
import { renderPlates } from "./plates.js";
import { getPartsData } from "./partsData.js";
import { fill, removeAll } from "./actions.js";

const VIEWS = [
  ["plan", "Plan", "plan"],
  ["3d", "3D", "cube"],
  ["split", "Split", "split"],
  ["plates", "Plates", "sheet"],
];

export function createStage() {
  const bar = h("div", { class: "stage-bar" });
  const plan = createTopView();
  const view3d = createViewer();
  const platesPane = h("section", { class: "pane pane-plates plates" });
  const body = h("div", { class: "stage-body" }, plan, view3d, platesPane);
  const status = h("div", { class: "stage-status" });
  const root = h("section", { class: "stage" }, bar, body, status);
  let showWarnings = false;

  const chip = (iconName, label, pressed, onclick) =>
    h(
      "button",
      { class: "icon-btn with-label", "aria-pressed": String(pressed), onclick },
      icon(iconName),
      label,
    );

  function paintBar() {
    const s = ui.get();
    const editable = s.stageView === "plan" || s.stageView === "split";
    const threeD = s.stageView === "3d" || s.stageView === "split";
    clear(bar);
    bar.append(
      ...[
        h(
          "div",
          { class: "segmented", role: "group", "aria-label": "View" },
          VIEWS.map(([id, label, ic]) =>
            h(
              "button",
              {
                class: "icon-btn with-label",
                "aria-pressed": String(s.stageView === id),
                onclick: () => setStageView(id),
              },
              icon(ic, 16),
              label,
            ),
          ),
        ),
        threeD
          ? chip("explode", "Pull apart", s.exploded, () => setUi({ exploded: !s.exploded }))
          : null,
        threeD
          ? chip(s.showBase ? "eye" : "eye-off", "Baseplate", s.showBase, () =>
              setUi({ showBase: !s.showBase }),
            )
          : null,
        threeD
          ? chip(s.showBins ? "eye" : "eye-off", "Bins", s.showBins, () =>
              setUi({ showBins: !s.showBins }),
            )
          : null,
        threeD && s.result?.parts.some((p) => p.kind === "lid")
          ? chip(s.showLids ? "eye" : "eye-off", "Lids", s.showLids, () =>
              setUi({ showLids: !s.showLids }),
            )
          : null,
        h("span", { class: "spacer" }),
        editable
          ? h(
              "button",
              { class: "icon-btn with-label", onclick: fill, title: "Fill every empty cell (F)" },
              icon("fill"),
              "Fill empty cells",
            )
          : null,
        editable
          ? h(
              "button",
              {
                class: "icon-btn with-label",
                disabled: projects.get().bins.length === 0,
                onclick: removeAll,
              },
              icon("trash"),
              "Clear bins",
            )
          : null,
      ].filter(Boolean),
    );
  }

  function paintStatus() {
    const { result, busy, error } = ui.get();
    const project = projects.get();
    clear(status);
    if (busy)
      status.append(
        h("span", { class: "status-item" }, icon("spinner", 14), "Building the model…"),
      );
    if (result) {
      const data = getPartsData(result, project);
      const tiles = result.parts.filter((p) => p.kind === "tile").length;
      const bins = result.parts.filter((p) => p.kind === "bin" && !p.inlay).length;
      status.append(
        h(
          "span",
          { class: "status-item muted" },
          `${tiles} baseplate tiles · ${bins} bin parts · ${data.plates.length} plates`,
        ),
      );
    }
    status.append(h("span", { class: "spacer" }));
    const notes = [...(error ? [error] : []), ...(result?.warnings ?? [])];
    if (notes.length) {
      status.append(
        h(
          "button",
          {
            class: `icon-btn with-label ${error ? "bad" : "warn"}`,
            onclick: () => ((showWarnings = !showWarnings), paintStatus()),
          },
          icon("warning", 16),
          `${notes.length} ${notes.length === 1 ? "heads-up" : "heads-ups"}`,
        ),
      );
      if (showWarnings) {
        status.append(
          h(
            "div",
            { class: "popover" },
            h("b", {}, "Heads-ups"),
            h(
              "ul",
              {},
              notes.map((n) => h("li", {}, n)),
            ),
          ),
        );
      }
    } else showWarnings = false;
  }

  function sync() {
    const s = ui.get();
    body.dataset.view = s.stageView;
    paintBar();
    paintStatus();
    if (s.stageView === "plates") renderPlates(platesPane);
  }

  ui.subscribe(sync);
  projects.subscribe(() => {
    paintBar();
    paintStatus();
  });
  sync();
  return root;
}
