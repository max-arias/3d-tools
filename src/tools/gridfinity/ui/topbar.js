import { h, clear } from "../../../shell/h.js";
import { projects, ui, setUi } from "./state.js";
import { getLayout } from "./state.js";
import { presetById } from "../model/printers.js";
import { toggleTheme } from "../../../shell/theme.js";
import { shareUrl, exportJson, importJson } from "../model/persist.js";
import { notify } from "./state.js";
import { download3mf } from "../export/actions.js";

function copyShare() {
  const url = shareUrl(projects.get(), location.origin + location.pathname);
  navigator.clipboard?.writeText(url).then(
    () => notify("Link copied"),
    () => prompt("Copy this link", url),
  );
}

function saveFile() {
  const blob = new Blob([exportJson(projects.get())], { type: "application/json" });
  const a = h("a", {
    href: URL.createObjectURL(blob),
    download: `gridfinity_${projects.get().drawer.w}x${projects.get().drawer.d}.json`,
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

export function createTopBar() {
  const root = h("header", { class: "topbar" });
  const paint = () => {
    const project = projects.get();
    const layout = getLayout(project);
    const { drawer, printer } = project;
    const preset = presetById(printer.preset);
    const chip = layout.grid
      ? `${drawer.w}×${drawer.d}×${drawer.h} | ${preset ? preset.short : "custom"} ${printer.x === printer.y ? `${printer.x}²` : `${printer.x}×${printer.y}`} | ${layout.grid.cols} × ${layout.grid.rows} · ${+layout.grid.pitchX.toFixed(1)} mm`
      : `${drawer.w}×${drawer.d}×${drawer.h}`;
    clear(root);
    root.append(
      h("a", { class: "brand", href: "/", title: "3D Tools home" }, "3D TOOLS"),
      h("span", { class: "tool-tab active" }, "DRAWER"),
      h("span", { class: "tool-tab off" }, "CASE · SOON"),
      h("span", { class: "chip" }, chip),
      h("span", { class: "spacer" }),
      h("button", { onclick: () => setUi({ guideStep: 0 }) }, "GUIDE"),
      h("button", { onclick: openFile, title: "Open a project file" }, "OPEN"),
      h("button", { onclick: saveFile, title: "Save a project file" }, "SAVE"),
      h("button", { onclick: toggleTheme }, "THEME"),
      h("button", { onclick: copyShare }, "SHARE LINK"),
      h(
        "button",
        { class: "primary", onclick: () => download3mf(ui.get().result, project) },
        "EXPORT 3MF",
      ),
    );
  };
  projects.subscribe(paint);
  paint();
  return root;
}
