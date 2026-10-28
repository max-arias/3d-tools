import { zipSync, strToU8 } from "fflate";
import { build3mf } from "../../frames/lib/threemf.js";
import { toStl } from "../lib/stl.js";
import { printItems } from "../lib/plates.js";
import { fromSettingsJson, toSettingsJson } from "../model/project.js";
import { stageApi } from "./stage.js";

export const FORMATS = ["3mf", "stl", "png", "json"];

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TYPES = {
  "3mf": "model/3mf",
  zip: "application/zip",
  json: "application/json",
  png: "image/png",
};

/** Build the chosen files and download them: one file directly, several as a zip. */
export async function downloadFiles(formats, part, project) {
  const files = {};
  const items = printItems(part.parts, project.build);
  if (formats.includes("3mf"))
    files["letters.3mf"] = build3mf({
      items: items.map((i) => ({
        name: i.name,
        size: i.size,
        bodies: [{ name: i.name, mesh: i.mesh }],
      })),
      bed: project.build,
      title: "Channel letters",
    });
  if (formats.includes("stl"))
    files["letters-stl.zip"] = zipSync(
      Object.fromEntries(items.map((i) => [`${i.name}.stl`, toStl(i.mesh)])),
    );
  if (formats.includes("json")) files["letters.json"] = strToU8(toSettingsJson(project));
  if (formats.includes("png")) {
    const blob = await stageApi.snapshot();
    if (blob) files["letters.png"] = new Uint8Array(await blob.arrayBuffer());
  }
  const names = Object.keys(files);
  if (names.length === 1) {
    const ext = names[0].split(".").pop();
    return download(files[names[0]], names[0], TYPES[ext]);
  }
  download(zipSync(files), "letters.zip", TYPES.zip);
}

/** Read a settings file chosen by the user. Throws when it is not one of ours. */
export async function readSettings(file) {
  return fromSettingsJson(await file.text());
}
