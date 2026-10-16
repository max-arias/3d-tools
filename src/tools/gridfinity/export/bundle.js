import { strToU8, zipSync } from "fflate";
import { toStl } from "./stl.js";
import { build3mf, isBambu } from "./threemf.js";
import { groupParts } from "./group.js";
import { presetById } from "../model/printers.js";

const fmt = (n) => (Math.round(n * 10) / 10).toString();
const fileBase = (project) => `gridfinity_${fmt(project.drawer.w)}x${fmt(project.drawer.d)}`;

/** Items for build3mf: every part placed on its plate. `data` is getPartsData(result, project). */
export function plateItems(result, data) {
  const byName = new Map(result.parts.map((p) => [p.name, p]));
  const items = [];
  for (const plate of data.plates) {
    for (const it of plate.items) {
      const part = byName.get(it.id);
      const item = {
        name: part.name,
        mesh: part.mesh,
        size: part.size,
        plate: plate.index,
        x: it.x,
        y: it.y,
        rot: it.rot,
        binPrint: part.kind === "bin" || part.binKey,
      };
      const text = byName.get(`${part.name}_text`);
      if (text?.inlay) {
        item.text = {
          mesh: text.mesh,
          offset: [
            text.place[0] - part.place[0],
            text.place[1] - part.place[1],
            text.place[2] - part.place[2],
          ],
        };
      }
      items.push(item);
    }
  }
  return items;
}

export function make3mf(result, project, data) {
  return build3mf({
    items: plateItems(result, data),
    printer: project.printer,
    binPrint: project.binPrint,
  });
}

export function partsText(result, project, data) {
  const { drawer, printer } = project;
  const preset = presetById(printer.preset);
  const groups = groupParts(result.parts);
  const lines = [
    "Gridfinity drawer: parts list",
    "",
    `Drawer inside: ${fmt(drawer.w)} x ${fmt(drawer.d)} x ${fmt(drawer.h)} mm`,
    `Printer: ${preset ? preset.name : "custom"}, bed ${printer.x} x ${printer.y} x ${printer.z} mm, edge margin ${printer.margin} mm`,
    `Grid: ${result.grid.cols} x ${result.grid.rows} cells of ${fmt(result.grid.pitchX)} x ${fmt(result.grid.pitchY)} mm`,
    `Plates: ${data.plates.length}`,
    "",
  ];
  if (result.seamMagnets)
    lines.push(`Seam magnets: ${result.seamMagnets}, opposite poles facing each other.`, "");
  if (project.baseplate.keys)
    lines.push("H-keys push into the slots from below; two spares are included.", "");
  if (project.baseplate.clips && !project.baseplate.keys)
    lines.push("Clips press in from the top across tile seams; two spares are included.", "");
  if (project.binPrint !== "regular")
    lines.push(
      `Bin print: ${project.binPrint}. Set the bin object settings listed in the 3MF in your slicer.`,
      "",
    );
  if (result.parts.some((p) => p.inlay))
    lines.push(
      "Two-colour labels: assign a second filament to the _text bodies in your slicer.",
      "",
    );
  for (const g of groups) {
    lines.push(
      `${g.count} x ${g.base}  ${fmt(g.size[0])} x ${fmt(g.size[1])} x ${fmt(g.size[2])} mm`,
    );
  }
  return lines.join("\n") + "\n";
}

/** ZIP with one STL per group of identical parts plus parts.txt. */
export function makeZip(result, project, data) {
  const files = {};
  for (const g of groupParts(result.parts)) files[`${g.name}.stl`] = toStl(g.parts[0].mesh);
  files["parts.txt"] = strToU8(partsText(result, project, data));
  return zipSync(files, { level: 6 });
}

export { fileBase, isBambu };
