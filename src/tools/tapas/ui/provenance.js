// Small badges and a list that show where each data value came from, and update as you edit.
import { h } from "../../../shell/h.js";
import { t } from "../lib/i18n.js";
import { sourceOf } from "../model/provenance.js";
import { project } from "./state.js";

const tracked = new Set();
project.subscribe(() => {
  for (const item of tracked) {
    if (!item.el.isConnected)
      tracked.delete(item); // the panel was redrawn; forget the old element
    else item.paint();
  }
});

/** Run `paint` now and after every project change, for as long as `el` is on the page. */
export function track(el, paint) {
  paint();
  tracked.add({ el, paint });
  return el;
}

const paintSource = (el, source) => {
  el.className = `src src-${source}`;
  el.textContent = t(`src.${source}`);
  el.title = t(`srcTitle.${source}`);
};

/** A badge for one data field: ✓ maker, "tienda" shop, "est." estimate, "medido" yours. */
export function badge(path) {
  const el = h("span", { class: "src" });
  return track(el, () => paintSource(el, sourceOf(project.get(), path)));
}

/** A badge for a fixed source (used in lists). */
export function staticBadge(source) {
  const el = h("span", { class: "src" });
  paintSource(el, source);
  return el;
}
