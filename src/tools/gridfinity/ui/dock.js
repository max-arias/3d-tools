import { h, clear } from "../../../shell/h.js";
import { projects, ui, setUi, setDockTab, setAdvanced, selectedBin } from "./state.js";
import * as drawer from "./tabs/drawer.js";
import * as printer from "./tabs/printer.js";
import * as grid from "./tabs/grid.js";
import * as baseplate from "./tabs/baseplate.js";
import * as bins from "./tabs/bins.js";
import * as labels from "./tabs/labels.js";
import * as parts from "./tabs/parts.js";

// Each tab module exports: id, title, summary(project, ctx), render(ctx), scoped (optional).
const TABS = [drawer, printer, grid, baseplate, bins, labels, parts];

export const tabContext = () => ({
  project: projects.get(),
  ui: ui.get(),
  bin: selectedBin(),
  update: projects.update,
  setUi,
});

/** Remember the focused field across a re-render, then restore it (typing must not lose focus). */
function withFocus(el, render) {
  const active = document.activeElement;
  const key = active?.closest?.("#dock") ? active.dataset?.key : null;
  const sel = key ? [active.selectionStart, active.selectionEnd] : null;
  render();
  if (!key) return;
  const next = el.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (next) {
    next.focus();
    if (sel && next.setSelectionRange) next.setSelectionRange(sel[0], sel[1]);
  }
}

export function createDock() {
  const root = h("section", { id: "dock", class: "dock" });
  const tabsBar = h("div", { class: "dock-tabs", role: "tablist" });
  const right = h("div", { class: "dock-right" });
  const body = h("div", { class: "dock-body", "data-guide": "dock" });
  root.append(h("div", { class: "dock-head" }, tabsBar, right), body);

  const paint = () =>
    withFocus(root, () => {
      const ctx = tabContext();
      const current = TABS.find((t) => t.id === ctx.ui.dockTab) ?? TABS[0];

      clear(tabsBar);
      for (const t of TABS) {
        tabsBar.append(
          h(
            "button",
            {
              role: "tab",
              class: "dock-tab",
              "aria-selected": String(t === current),
              onclick: () => setDockTab(t.id),
            },
            h("b", {}, t.title),
            h("small", {}, t.summary(ctx.project, ctx)),
          ),
        );
      }

      clear(right);
      if (current.scoped) {
        const n = ctx.project.bins.length;
        const bin = ctx.bin;
        right.append(
          h("span", { class: "muted" }, "EDITING"),
          h(
            "span",
            { class: "segmented" },
            h(
              "button",
              { "aria-pressed": String(!bin), onclick: () => setUi({ selected: null }) },
              `ALL BINS ${n}`,
            ),
            h(
              "button",
              { "aria-pressed": String(!!bin), disabled: !bin },
              bin ? `THIS BIN ${bin.w}×${bin.d}` : "THIS BIN",
            ),
          ),
        );
      }
      right.append(
        h("button", { class: "link", onclick: () => setUi({ helpOpen: true }) }, "Shortcuts ?"),
        h(
          "label",
          { class: "check" },
          h("input", {
            type: "checkbox",
            checked: ctx.ui.advanced,
            onchange: (e) => setAdvanced(e.target.checked),
          }),
          h("span", {}, "Advanced"),
        ),
      );

      clear(body);
      body.append(current.render(ctx));
    });

  projects.subscribe(paint);
  ui.subscribe(paint);
  paint();
  return root;
}
