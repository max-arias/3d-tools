import { zipSync, strToU8 } from "fflate";
import { printMesh } from "../geom/print.js";
import { toScad } from "../geom/scad.js";
import { toStl } from "../lib/stl.js";
import { fromSettingsJson, toSettingsJson } from "../model/project.js";
import { stageApi } from "./stage.js";

export const FORMATS = ["stl", "scad", "png", "json"];

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build the chosen files and download them: one file directly, several as a zip. */
export async function downloadFiles(formats, part, project) {
  const files = {};
  if (formats.includes("stl")) files["lamp.stl"] = toStl(printMesh(part, project));
  if (formats.includes("scad")) files["lamp.scad"] = strToU8(toScad(project));
  if (formats.includes("json")) files["lamp.json"] = strToU8(toSettingsJson(project));
  if (formats.includes("png")) {
    const blob = await stageApi.snapshot();
    if (blob) files["lamp.png"] = new Uint8Array(await blob.arrayBuffer());
  }
  const names = Object.keys(files);
  if (names.length === 1) {
    const type = {
      stl: "model/stl",
      scad: "text/plain",
      json: "application/json",
      png: "image/png",
    };
    return download(files[names[0]], names[0], type[names[0].split(".")[1]]);
  }
  download(zipSync(files), "lamp.zip", "application/zip");
}

/** Read a settings file chosen by the user. Throws when it is not one of ours. */
export async function readSettings(file) {
  return fromSettingsJson(await file.text());
}
