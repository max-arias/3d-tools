import { h, clear } from "../../../shell/h.js";
import { brandMark, icon } from "../../../shell/icons.js";
import { getTheme, toggleTheme } from "../../../shell/theme.js";
import { exportJson, importJson, shareUrl } from "../model/persist.js";
import { presetById } from "../model/printers.js";
import { download3mf, downloadKeyTest, downloadZip } from "../export/actions.js";
import { getLayout, notify, projects, setUi, ui } from "./state.js";

function copyShare() {
  const url = shareUrl(projects.get(), location.origin + location.pathname);
  navigator.clipboard?.writeText(url).then(
    () => notify("Link copied"),
    () => prompt("Copy this link", url),
  );
}

function saveFile() {
  const { drawer } = projects.get();
  const blob = new Blob([exportJson(projects.get())], { type: "application/json" });
  const a = h("a", {
    href: URL.createObjectURL(blob),
    download: `drawer_${drawer.w}x${drawer.d}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function openFile() {
  const input = h("input", { type: "file", accept: "application/json,.json" });
  input.addEventListener("change", async () => {
    try {
      projects.load(importJson(await input.files[0].text()));
      setUi({ selected: null, frameNonce: ui.get().frameNonce + 1 });
    } catch {
      notify("That file is not a drawer project");
    }
  });
  input.click();
}

const summary = (project) => {
  const layout = getLayout(project);
  const { drawer, printer } = project;
  const preset = presetById(printer.preset);
  const parts = [
    `${drawer.w} × ${drawer.d} × ${drawer.h} mm`,
    preset ? preset.short : "Custom printer",
  ];
  if (layout.grid) parts.push(`${layout.grid.cols} × ${layout.grid.rows} cells`);
  return parts.join("  ·  ");
};

function iconButton(name, label, onclick, extra = {}) {
  return h(
    "button",
    { class: "icon-btn ghost", title: label, "aria-label": label, onclick, ...extra },
    icon(name),
  );
}

export function createHeader() {
  const root = h("header", { class: "app-header" });
  let menuOpen = false;

  const exportMenu = () => {
    const run = (fn) => () => {
      menuOpen = false;
      paint();
      fn();
    };
    const { result } = ui.get();
    const project = projects.get();
    const item = (label, hint, fn) =>
      h(
        "button",
        { class: "menu-item ghost", onclick: run(fn) },
        h("b", {}, label),
        h("small", { class: "muted" }, hint),
      );
    return h(
      "div",
      { class: "menu", role: "menu" },
      item("3MF, ready for the plates", "Every part placed on print plates", () =>
        download3mf(result, project),
      ),
      item("STL files (zip)", "One file per part, plus a parts list", () =>
        downloadZip(result, project),
      ),
      item("Key fit-test set", "Print first to pick the right key fit", () =>
        downloadKeyTest(project),
      ),
    );
  };

  function paint() {
    const project = projects.get();
    const dark = getTheme() === "dark";
    clear(root);
    root.append(
      h(
        "a",
        { class: "brand", href: "/", title: "3D Tools home" },
        brandMark(26),
        h("span", {}, "3D Tools"),
      ),
      h("span", { class: "tool-name" }, "Gridfinity drawer"),
      h("span", { class: "summary" }, summary(project)),
      h("span", { class: "spacer" }),
      iconButton("undo", "Undo", () => projects.undo(), { disabled: !projects.canUndo() }),
      iconButton("redo", "Redo", () => projects.redo(), { disabled: !projects.canRedo() }),
      h("span", { class: "sep" }),
      iconButton("open", "Open a project file", openFile),
      iconButton("save", "Save a project file", saveFile),
      iconButton("share", "Copy a link to this design", copyShare),
      h("span", { class: "sep" }),
      iconButton("keyboard", "Keyboard shortcuts", () => setUi({ helpOpen: true })),
      iconButton("help", "Take the tour", () => setUi({ guideStep: 0 })),
      iconButton(dark ? "sun" : "moon", dark ? "Light theme" : "Dark theme", () => {
        toggleTheme();
        paint();
      }),
      h(
        "div",
        { class: "menu-wrap" },
        h(
          "button",
          {
            class: "primary icon-btn with-label",
            "aria-haspopup": "menu",
            "aria-expanded": String(menuOpen),
            onclick: (e) => {
              e.stopPropagation();
              menuOpen = !menuOpen;
              paint();
            },
          },
          icon("download"),
          "Export",
          icon("chevron", 14),
        ),
        menuOpen ? exportMenu() : null,
      ),
    );
  }

  document.addEventListener("click", () => {
    if (menuOpen) {
      menuOpen = false;
      paint();
    }
  });
  projects.subscribe(paint);
  paint();
  return root;
}
