import { h, clear } from "../../../shell/h.js";
import { icon } from "../../../shell/icons.js";
import { projects, ui, setUi, setDockTab, setAdvanced, selectedBin } from "./state.js";
import * as space from "./sections/space.js";
import * as grid from "./sections/grid.js";
import * as bins from "./sections/bins.js";
import * as labels from "./sections/labels.js";
import * as exportSection from "./sections/export.js";

// Each section exports: id, title, summary(project, ctx), render(ctx), scoped (optional).
const SECTIONS = [space, grid, bins, labels, exportSection];

export const tabContext = () => ({
  project: projects.get(),
  ui: ui.get(),
  bin: selectedBin(),
  update: projects.update,
  setUi,
});

/** Keep the focused field (and scroll position) across a full re-render so typing is not interrupted. */
function preserve(root, scroller, render) {
  const active = document.activeElement;
  const key = active?.closest?.(".sidebar") ? active.dataset?.key : null;
  const sel = key ? [active.selectionStart, active.selectionEnd] : null;
  const top = scroller.scrollTop;
  render();
  scroller.scrollTop = top;
  if (!key) return;
  const next = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (next) {
    next.focus();
    if (sel && next.setSelectionRange) next.setSelectionRange(sel[0], sel[1]);
  }
}

function scopeBanner(ctx) {
  const n = ctx.project.bins.length;
  const bin = ctx.bin;
  return bin
    ? h(
        "div",
        { class: "scope-banner on" },
        h("span", {}, `Editing bin ${bin.w} × ${bin.d}`),
        h(
          "button",
          { class: "link", onclick: () => setUi({ selected: null }) },
          "Edit all bins instead",
        ),
      )
    : h(
        "div",
        { class: "scope-banner" },
        h("span", {}, `Editing all ${n} bins`),
        h("small", { class: "muted" }, "Select a bin to change just that one"),
      );
}

export function createSidebar() {
  const root = h("aside", { id: "dock", class: "sidebar" });
  const scroller = h("div", { class: "sidebar-scroll" });
  root.append(scroller);

  const paint = () =>
    preserve(root, scroller, () => {
      const ctx = tabContext();
      clear(scroller);
      for (const s of SECTIONS) {
        const open = ctx.ui.dockTab === s.id;
        const body = open
          ? h(
              "div",
              { class: "acc-body", "data-guide": "dock" },
              s.scoped ? scopeBanner(ctx) : null,
              s.render(ctx),
            )
          : null;
        scroller.append(
          h(
            "section",
            { class: "acc", "data-open": String(open), "data-section": s.id },
            h(
              "button",
              {
                class: "acc-head ghost",
                "aria-expanded": String(open),
                onclick: () => setDockTab(open ? null : s.id),
              },
              h("b", {}, s.title),
              h("small", { class: "muted" }, s.summary(ctx.project, ctx)),
              icon("chevron", 16),
            ),
            body,
          ),
        );
      }
      scroller.append(
        h(
          "label",
          { class: "check adv" },
          h("input", {
            type: "checkbox",
            checked: ctx.ui.advanced,
            onchange: (e) => setAdvanced(e.target.checked),
          }),
          h("span", {}, "Show advanced options"),
        ),
      );
    });

  // Picking a bin opens the bin settings (labels stay open if that is where you were).
  let lastSelected = ui.get().selected;
  ui.subscribe((s) => {
    if (s.selected && s.selected !== lastSelected && !["bins", "labels"].includes(s.dockTab)) {
      lastSelected = s.selected;
      setDockTab("bins");
      return;
    }
    lastSelected = s.selected;
    paint();
  });
  projects.subscribe(paint);
  paint();
  return root;
}
