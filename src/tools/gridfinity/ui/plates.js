import { h } from "../../../shell/h.js";
import { getPartsData } from "./partsData.js";
import { projects, ui } from "./state.js";

const SPACING = 5;

/** Plates view: one scaled rectangle per print plate with every part placed on it. */
export function renderPlates(container) {
  const { result, partHover, partSel } = ui.get();
  const project = projects.get();
  container.replaceChildren();
  if (!result) return;
  const { plates } = getPartsData(result, project);
  const { printer } = project;
  const byName = new Map(result.parts.map((p) => [p.name, p]));
  const usableX = printer.x - 2 * printer.margin;
  const usableY = printer.y - 2 * printer.margin;
  const active = partSel ?? partHover;

  const grid = h("div", { class: "plates-grid" });
  for (const plate of plates) {
    const board = h("div", {
      class: `plate${plate.oversize ? " oversize" : ""}`,
      style: `aspect-ratio:${printer.x}/${printer.y}`,
      title: plate.oversize ? "too big for the bed" : `Plate ${plate.index + 1}`,
    });
    const inner = h("div", {
      class: "plate-usable",
      style: `left:${(printer.margin / printer.x) * 100}%;top:${(printer.margin / printer.y) * 100}%;width:${(usableX / printer.x) * 100}%;height:${(usableY / printer.y) * 100}%`,
    });
    for (const it of plate.items) {
      const part = byName.get(it.id);
      inner.append(
        h("div", {
          class: `plate-part ${part?.kind ?? ""}${it.id === active ? " hot" : ""}`,
          title: it.id,
          style: `left:${(it.x / usableX) * 100}%;top:${(it.y / usableY) * 100}%;width:${(it.w / usableX) * 100}%;height:${(it.d / usableY) * 100}%`,
          onmouseenter: () => ui.set({ partHover: it.id }),
          onmouseleave: () => ui.set({ partHover: null }),
          onclick: () => ui.set({ partSel: ui.get().partSel === it.id ? null : it.id }),
        }),
      );
    }
    board.append(inner, h("span", { class: "plate-n" }, `P${plate.index + 1}`));
    grid.append(board);
  }
  container.append(
    grid,
    h("p", { class: "muted plates-note" }, `Plates are laid out with ${SPACING} mm between parts.`),
  );
}
