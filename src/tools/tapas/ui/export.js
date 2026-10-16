import { run } from "../lib/client.js";
import { toStl } from "../lib/stl.js";
import { build3mf, shelfPack } from "../lib/threemf.js";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fits = (part, copies, bed) =>
  shelfPack(
    Array.from({ length: copies }, () => ({ w: part.size[0], h: part.size[1] })),
    bed,
  ).fits;

export const downloadStl = (part) => download(toStl(part.mesh), `${part.name}.stl`, "model/stl");

export function download3mf(part, copies, bed) {
  const items = Array.from({ length: copies }, (_, i) => ({
    name: `${part.name}_${i + 1}`,
    size: part.size,
    bodies: part.bodies.map((b) => ({ name: b.name, mesh: b.mesh })),
  }));
  download(build3mf({ items, bed, title: "Tapas" }), `${part.name}_x${copies}.3mf`, "model/3mf");
}

export async function downloadCoupon(project) {
  const strip = await run("coupon", project);
  downloadStl(strip);
}
