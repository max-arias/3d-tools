import { run } from "../lib/client.js";
import { toStl } from "../lib/stl.js";
import { build3mf, packPlates } from "../lib/threemf.js";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** { plates, fits }: how many plates `copies` of the part need, and whether one part fits a plate. */
export const platesFor = (part, copies, bed) =>
  packPlates(
    Array.from({ length: copies }, () => ({ w: part.size[0], h: part.size[1] })),
    bed,
  );

export const downloadStl = (part) => download(toStl(part.mesh), `${part.name}.stl`, "model/stl");

const itemsFor = (part, copies, prefix) =>
  Array.from({ length: copies }, (_, i) => ({
    name: `${prefix}_${i + 1}`,
    size: part.size,
    bodies: part.bodies.map((b) => ({ name: b.name, mesh: b.mesh })),
  }));

export function download3mf(part, copies, bed) {
  const items = itemsFor(part, copies, part.name);
  download(build3mf({ items, bed, title: "Tapas" }), `${part.name}_x${copies}.3mf`, "model/3mf");
}

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase() || "cubre";

/** Generate every cover in the house and write them to one 3MF. `onProgress(done, total)`. */
export async function downloadHouse(items, bed, onProgress = () => {}) {
  const all = [];
  for (const [n, item] of items.entries()) {
    onProgress(n, items.length);
    const part = await run("generate", item.project);
    all.push(...itemsFor(part, item.qty, `${String(n + 1).padStart(2, "0")}_${slug(item.name)}`));
  }
  onProgress(items.length, items.length);
  download(build3mf({ items: all, bed, title: "Tapas" }), "mi_casa.3mf", "model/3mf");
}

export async function downloadCoupon(project) {
  const strip = await run("coupon", project);
  downloadStl(strip);
}
