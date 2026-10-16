import { h } from "../../../shell/h.js";
import { projects, ui, setUi, notify } from "./state.js";
import { duplicate, fill, nudge, remove, resizeBy, selectNeighbour, taller } from "./actions.js";
import { shareUrl } from "../model/persist.js";

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl";

export const SHORTCUTS = [
  [
    "EDITING",
    [
      [`${mod}+Z`, "Undo"],
      [`${mod}+Shift+Z or ${mod}+Y`, "Redo"],
      ["F", "Fill empty cells"],
    ],
  ],
  [
    "SELECTED BIN",
    [
      ["] / [", "Select next / previous bin"],
      ["Arrow keys", "Move by one cell"],
      ["Shift+Arrows", "Resize: → ↑ grow, ← ↓ shrink"],
      ["+ / −", "Taller / lower by one step"],
      ["D", "Duplicate into the nearest free space"],
      ["Delete", "Delete"],
      ["Esc", "Deselect, close this window"],
    ],
  ],
  [
    "VIEW",
    [
      ["1 / 2 / 3", "Assembled / Exploded / Print plates"],
      ["B", "Hide / show bins"],
      ["G", "Hide / show baseplate"],
      ["R", "Reset the 3D camera"],
    ],
  ],
  [
    "PROJECT",
    [
      ["L", "Copy share link"],
      ["?", "Show these shortcuts"],
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
        return setUi({ view: "assembled" });
      case "2":
        return setUi({ view: "exploded" });
      case "3":
        return setUi({ view: "plates" });
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
          h("b", {}, "KEYBOARD SHORTCUTS"),
          h("button", { onclick: () => setUi({ helpOpen: false }) }, "Close"),
        ),
        h(
          "p",
          { class: "muted" },
          "Shortcuts are optional: every one of them repeats a button or a drag. They work when no text field has focus.",
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
          mac ? "On Mac, Ctrl is ⌘. Esc or ? closes this window." : "Esc or ? closes this window.",
        ),
      ),
    );
  };
  ui.subscribe(paint);
  modal.addEventListener("click", (e) => e.target === modal && setUi({ helpOpen: false }));
  paint();
  return modal;
}
