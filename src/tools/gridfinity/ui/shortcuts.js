import { h } from "../../../shell/h.js";
import { projects, ui, setUi, setStageView, notify } from "./state.js";
import { duplicate, fill, nudge, remove, resizeBy, selectNeighbour, taller } from "./actions.js";
import { shareUrl } from "../model/persist.js";

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl";

export const SHORTCUTS = [
  [
    "Editing",
    [
      [`${mod}+Z`, "Undo"],
      [`${mod}+Shift+Z or ${mod}+Y`, "Redo"],
      ["F", "Fill every empty cell"],
    ],
  ],
  [
    "Selected bin",
    [
      ["] / [", "Select the next / previous bin"],
      ["Arrow keys", "Nudge by one cell"],
      ["Shift+Arrows", "Resize (→ ↑ grow, ← ↓ shrink)"],
      ["+ / −", "One step taller / shorter"],
      ["D", "Copy into the nearest free space"],
      ["Delete", "Delete"],
      ["Esc", "Deselect, or close this window"],
    ],
  ],
  [
    "View",
    [
      ["1 / 2 / 3 / 4", "Plan / 3D / Split / Print plates"],
      ["E", "Pull the model apart / put it back"],
      ["B", "Show or hide bins"],
      ["G", "Show or hide the baseplate"],
      ["R", "Re-centre the 3D camera"],
    ],
  ],
  [
    "Project",
    [
      ["L", "Copy a link to this design"],
      ["?", "Open this list"],
    ],
  ],
];

function copyLink() {
  const url = shareUrl(projects.get(), location.origin + location.pathname);
  navigator.clipboard?.writeText(url).then(
    () => notify("Link copied"),
    () => prompt("Copy this link", url),
  );
}

const typing = () => /^(input|textarea|select)$/i.test(document.activeElement?.tagName ?? "");

/** Global keyboard shortcuts. Every one repeats a button or a drag. */
export function installShortcuts() {
  addEventListener("keydown", (e) => {
    const s = ui.get();
    if (s.helpOpen) {
      if (e.key === "Escape" || e.key === "?") setUi({ helpOpen: false });
      return;
    }
    if (s.guideStep >= 0) {
      if (e.key === "Escape") setUi({ guideStep: -1 });
      return;
    }
    if (typing()) return;
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? projects.redo() : projects.undo();
    }
    if (ctrl && key.toLowerCase() === "y") {
      e.preventDefault();
      return projects.redo();
    }
    if (ctrl || e.altKey) return;

    const id = s.selected;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[key] && id) {
      e.preventDefault();
      const [dx, dy] = arrows[key];
      return e.shiftKey ? resizeBy(id, dx, dy) : nudge(id, dx, dy);
    }

    switch (key) {
      case "f":
      case "F":
        return fill();
      case "]":
        return selectNeighbour(1);
      case "[":
        return selectNeighbour(-1);
      case "+":
      case "=":
        return id && taller(id, 1);
      case "-":
      case "_":
        return id && taller(id, -1);
      case "d":
      case "D":
        return id && duplicate(id);
      case "Delete":
      case "Backspace":
        return id && remove(id);
      case "Escape":
        return setUi({ selected: null });
      case "1":
        return setStageView("plan");
      case "2":
        return setStageView("3d");
      case "e":
      case "E":
        return setUi({ exploded: !s.exploded });
      case "3":
        return setStageView("split");
      case "4":
        return setStageView("plates");
      case "b":
      case "B":
        return setUi({ showBins: !s.showBins });
      case "g":
      case "G":
        return setUi({ showBase: !s.showBase });
      case "r":
      case "R":
        return setUi({ frameNonce: s.frameNonce + 1 });
      case "l":
      case "L":
        return copyLink();
      case "?":
        return setUi({ helpOpen: true });
      default:
    }
  });
}

/** Modal listing the shortcuts. */
export function createHelp() {
  const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true" });
  const paint = () => {
    const open = ui.get().helpOpen;
    modal.style.display = open ? "" : "none";
    if (!open) return;
    modal.replaceChildren(
      h(
        "div",
        { class: "modal-box" },
        h(
          "div",
          { class: "modal-head" },
          h("h2", {}, "Keyboard shortcuts"),
          h("button", { onclick: () => setUi({ helpOpen: false }) }, "Close"),
        ),
        h(
          "p",
          { class: "muted" },
          "Nothing here is required: each shortcut repeats something you can do with the mouse. They work whenever you are not typing in a field.",
        ),
        h(
          "div",
          { class: "kgroups" },
          SHORTCUTS.map(([group, rows]) =>
            h(
              "section",
              {},
              h("h3", {}, group),
              rows.map(([k, label]) =>
                h("div", { class: "krow" }, h("kbd", {}, k), h("span", {}, label)),
              ),
            ),
          ),
        ),
        h(
          "p",
          { class: "muted" },
          mac ? "On a Mac, Ctrl means ⌘. Press Esc or ? to close." : "Press Esc or ? to close.",
        ),
      ),
    );
  };
  ui.subscribe(paint);
  modal.addEventListener("click", (e) => e.target === modal && setUi({ helpOpen: false }));
  paint();
  return modal;
}
