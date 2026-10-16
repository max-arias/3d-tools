// Download actions used by the Parts & Export tab and the top bar.
import { strToU8, zipSync } from "fflate";
import { notify, ui } from "../ui/state.js";
import { getPartsData } from "../ui/partsData.js";
import { run } from "../geom/client.js";
import { fileBase, make3mf, makeZip } from "./bundle.js";
import { toStl } from "./stl.js";
import { build3mf } from "./threemf.js";

function save(bytes, filename, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const ready = (result) => {
  if (!result) notify("Nothing to export yet: the model is still being built");
  return !!result;
};

export function download3mf(result, project) {
  if (!ready(result)) return;
  save(
    make3mf(result, project, getPartsData(result, project)),
    `${fileBase(project)}.3mf`,
    "model/3mf",
  );
  ui.set({ exports: ui.get().exports + 1 });
}

export function downloadZip(result, project) {
  if (!ready(result)) return;
  save(
    makeZip(result, project, getPartsData(result, project)),
    `${fileBase(project)}.zip`,
    "application/zip",
  );
  ui.set({ exports: ui.get().exports + 1 });
}

export function downloadPartStl(part) {
  save(toStl(part.mesh), `${part.name}.stl`, "model/stl");
}

const KEYTEST_README =
  "Key fit-test set\n\nPrint the two blocks and the three keys. Push each key into the slot between the blocks.\n" +
  "The dimples count the clearance: 1 = 0.10 mm (tighter), 2 = 0.15 mm (standard), 3 = 0.20 mm (looser).\n" +
  "Pick the one that goes in by hand and stays put, then set Key and clip fit in the Baseplate tab.\n";

export async function downloadKeyTest(project) {
  try {
    const { parts } = await run("keytest", project);
    const files = {};
    for (const p of parts) files[`${p.name}.stl`] = toStl(p.mesh);
    const items = parts.map((p, i) => ({
      name: p.name,
      mesh: p.mesh,
      size: p.size,
      plate: 0,
      x: i * 40,
      y: 0,
      rot: false,
    }));
    files["keytest.3mf"] = build3mf({ items, printer: project.printer, title: "Key fit-test set" });
    files["README.txt"] = strToU8(KEYTEST_README);
    save(zipSync(files), "gridfinity_keytest.zip", "application/zip");
  } catch (e) {
    notify(`Could not build the fit-test set: ${e.message}`);
  }
}
