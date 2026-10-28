import { zipSync, strToU8 } from "fflate";
import { build3mf } from "../../frames/lib/threemf.js";
import { run } from "../lib/client.js";
import { partNames, printItems } from "../lib/plates.js";
import { toStl } from "../lib/stl.js";
import { fromSettingsJson, toSettingsJson } from "../model/project.js";

export const FORMATS = ["3mf", "stl", "json"];

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TYPES = { "3mf": "model/3mf", zip: "application/zip", json: "application/json" };

const baseName = (p) => `box_${p.grid.x}x${p.grid.y}x${p.grid.u}U`;

/** One STL per body per part; the quantity is in the name (latch_x6.stl). */
export function stlFiles(parts, grid) {
  const names = partNames(parts, grid);
  const files = {};
  for (const part of parts)
    part.bodies.forEach((b, i) => {
      const qty = part.qty > 1 ? `_x${part.qty}` : "";
      files[`${names.get(part.id)}${i ? "_text" : ""}${qty}.stl`] = toStl(b.mesh, "3D Tools Boxes");
    });
  return files;
}

/**
 * Build the chosen files and download them: one file directly, several as a zip.
 * Returns the names of the items that do not fit the bed (they are exported anyway, on their own plate).
 */
export function downloadFiles(formats, data, project) {
  const files = {};
  const name = baseName(project);
  const { items, oversize } = printItems(data.parts, project);
  if (formats.includes("3mf"))
    files[`${name}.3mf`] = build3mf({ items, bed: project.build, title: "Storage box" });
  if (formats.includes("stl"))
    files[`${name}-stl.zip`] = zipSync(stlFiles(data.parts, project.grid));
  if (formats.includes("json")) files[`${name}.json`] = strToU8(toSettingsJson(project));
  const names = Object.keys(files);
  if (names.length === 1) {
    const ext = names[0].endsWith(".zip") ? "zip" : names[0].split(".").pop();
    download(files[names[0]], names[0], TYPES[ext]);
  } else download(zipSync(files), `${name}.zip`, TYPES.zip);
  return oversize;
}

/** Print the four fit-test pieces (latch and hinge slots) as one 3MF. */
export async function downloadFitTest(project) {
  const pieces = await run("coupon", project);
  const items = pieces.map((p) => ({
    name: p.name,
    size: [p.size[0], p.size[1]],
    bodies: [{ name: p.name, mesh: p.mesh }],
  }));
  download(
    build3mf({ items, bed: project.build, title: "Fit test" }),
    "box-fit-test.3mf",
    TYPES["3mf"],
  );
}

/** Read a settings file chosen by the user. Throws when it is not one of ours. */
export async function readSettings(file) {
  return fromSettingsJson(await file.text());
}
