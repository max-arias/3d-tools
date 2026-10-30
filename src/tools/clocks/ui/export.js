import { zipSync, strToU8 } from "fflate";
import { build3mf } from "../../tapas/lib/threemf.js";
import { toStl } from "../lib/stl.js";
import { printItems } from "../lib/plates.js";
import { fromSettingsJson, toSettingsJson } from "../model/project.js";
import { stageApi } from "./stage.js";

export const FORMATS = ["3mf", "stl", "coupon", "template", "png", "json"];

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
  svg: "image/svg+xml",
};

const slotName = (project, slot) => `colour${slot + 1}_${project.colors.slots[slot].slice(1)}`;

/** 3MF with every part on plates; each colour slot is a body on extruder slot + 1. */
function threeMf(items, project, title) {
  return build3mf({
    items: items.map((i) => ({
      name: i.name,
      size: i.size,
      bodies: i.bodies.map((b) => ({
        name: `${i.name}_${slotName(project, b.slot)}`,
        mesh: b.mesh,
        extruder: b.slot + 1,
      })),
    })),
    bed: project.build,
    title,
  });
}

/**
 * A 1:1 drilling template: the clock's outline, the hub and every keyhole screw position, to tape
 * to the wall. Printed at 100 % it measures true.
 */
export function drillTemplate(info) {
  const [x0, y0, x1, y1] = info.bounds;
  const m = 10;
  const w = x1 - x0 + 2 * m;
  const hh = y1 - y0 + 2 * m;
  const pt = ([x, y]) => `${(x - x0 + m).toFixed(2)},${(y1 - y + m).toFixed(2)}`;
  const outline = info.silhouette.map((r) => `<polygon points="${r.map(pt).join(" ")}"/>`).join("");
  const cross = ([x, y], label) => {
    const [cx, cy] = pt([x, y]).split(",").map(Number);
    return `<path d="M${cx - 6} ${cy}H${cx + 6}M${cx} ${cy - 6}V${cy + 6}"/><circle cx="${cx}" cy="${cy}" r="2"/><text x="${cx + 4}" y="${cy - 4}">${label}</text>`;
  };
  // The screw sits at the top of the keyhole slot once the clock drops onto it.
  const screws = info.keyholes.map(([x, y], i) => cross([x, y + 10], `screw ${i + 1}`)).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${hh}mm" viewBox="0 0 ${w} ${hh}">` +
    `<g fill="none" stroke="#000" stroke-width="0.4" font-family="sans-serif" font-size="4">${outline}${cross([0, 0], "hub")}${screws}` +
    `<text x="${m}" y="${hh - 3}" stroke="none" fill="#000">Print at 100 %. ${(x1 - x0).toFixed(0)} × ${(y1 - y0).toFixed(0)} mm</text></g></svg>`
  );
}

/** Build the chosen files and download them: one file directly, several as a zip. */
export async function downloadFiles(formats, clock, project) {
  const files = {};
  const items = printItems(clock.parts, project.build);
  if (formats.includes("3mf")) files["clock.3mf"] = threeMf(items, project, "Clock");
  if (formats.includes("stl"))
    files["clock-stl.zip"] = zipSync(
      Object.fromEntries(
        items.flatMap((i) =>
          i.bodies.map((b) => [`${i.name}_${slotName(project, b.slot)}.stl`, toStl(b.mesh)]),
        ),
      ),
    );
  if (formats.includes("coupon")) {
    const coupon = printItems(
      clock.parts.filter((p) => p.kind === "coupon"),
      project.build,
      { coupon: true },
    );
    files["fit-coupon.3mf"] = threeMf(coupon, project, "Clock fit coupon");
  }
  if (formats.includes("template") && clock.info.keyholes.length)
    files["drill-template.svg"] = strToU8(drillTemplate(clock.info));
  if (formats.includes("json")) files["clock.json"] = strToU8(toSettingsJson(project));
  if (formats.includes("png")) {
    const blob = await stageApi.snapshot();
    if (blob) files["clock.png"] = new Uint8Array(await blob.arrayBuffer());
  }
  const names = Object.keys(files);
  if (!names.length) return;
  if (names.length === 1) {
    const ext = names[0].split(".").pop();
    return download(files[names[0]], names[0], TYPES[ext]);
  }
  download(zipSync(files), "clock.zip", TYPES.zip);
}

/** Read a settings file chosen by the user. Throws when it is not one of ours. */
export async function readSettings(file) {
  return fromSettingsJson(await file.text());
}
