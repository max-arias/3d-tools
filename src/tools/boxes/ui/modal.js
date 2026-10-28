// Copied from src/tools/letters/ui/modal.js (TDT-33 dedupes).
import { h } from "../../../shell/h.js";

/** A dialog over the page. Returns { el, close }. Esc and a click outside close it. */
export function openModal(title, body, { wide = false } = {}) {
  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    el.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const el = h(
    "div",
    { class: "modal-back", onclick: (e) => e.target === el && close() },
    h(
      "div",
      { class: `modal${wide ? " wide" : ""}`, role: "dialog", "aria-label": title },
      h(
        "div",
        { class: "modal-head" },
        h("b", {}, title),
        h("button", { onclick: close, "aria-label": "×" }, "×"),
      ),
      h("div", { class: "modal-body" }, body),
    ),
  );
  document.addEventListener("keydown", onKey, true);
  document.body.append(el);
  return { el, close };
}
