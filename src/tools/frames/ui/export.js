import { zipSync } from "fflate";
import { run } from "../lib/client.js";
import { printable } from "../lib/place.js";
import { toStl } from "../lib/stl.js";
import { build3mf, packPlates } from "../lib/threemf.js";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase() || "frame";

/** Parts laid flat in print orientation and shelf-packed on the bed: { items, plates, fits }. */
export function platePlan(result, bed) {
  const items = result.parts.map((q) => {
    const pr = printable(q);
    return {
      name: q.name,
      role: q.role,
      size: pr.size,
      mesh: pr.mesh,
      bodies: [{ name: q.name, mesh: pr.mesh }],
    };
  });
  const { positions, plates, fits } = packPlates(
    items.map((i) => ({ w: i.size[0], h: i.size[1] })),
    bed,
  );
  items.forEach((it, i) => Object.assign(it, positions[i]));
  return { items, plates, fits };
}

/** STL for a single part, otherwise a zip with one STL per part. */
export function downloadStl(result) {
  const { items } = platePlan(result, { x: 1e6, y: 1e6 });
  if (items.length === 1)
    return download(toStl(items[0].mesh), `${items[0].name}.stl`, "model/stl");
  const files = {};
  for (const it of items) files[`${it.name}.stl`] = toStl(it.mesh);
  download(zipSync(files), `${slug(result.name)}_stl.zip`, "application/zip");
}

export function download3mf(result, bed) {
  const { items } = platePlan(result, bed);
  download(build3mf({ items, bed, title: "Frames" }), `${slug(result.name)}.3mf`, "model/3mf");
}

/** Every frame in the gallery, `qty` copies each, in one 3MF. `onProgress(done, total)`. */
export async function downloadGallery(entries, bed, onProgress = () => {}) {
  const all = [];
  for (const [n, entry] of entries.entries()) {
    onProgress(n, entries.length);
    const res = await run("generate", entry.project);
    for (let c = 0; c < entry.qty; c++)
      for (const it of platePlan(res, bed).items)
        all.push({
          ...it,
          name: `${String(n + 1).padStart(2, "0")}_${slug(entry.name)}${entry.qty > 1 ? `_${c + 1}` : ""}_${it.name}`,
        });
  }
  onProgress(entries.length, entries.length);
  download(
    build3mf({ items: all, bed, title: "Frames gallery" }),
    "frames_gallery.3mf",
    "model/3mf",
  );
}

export async function downloadCoupon() {
  const res = await run("coupon", {});
  download3mf(res, { x: 256, y: 256 });
}
