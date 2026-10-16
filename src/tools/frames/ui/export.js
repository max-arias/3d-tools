import { toStl } from "../lib/stl.js";
import { build3mf, packPlates } from "../lib/threemf.js";

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when the part's footprint fits one bed square (either way round). */
export const fitsBed = (part, bed) =>
  packPlates([{ w: part.size[0], h: part.size[1] }], { x: bed, y: bed }).fits;

export const downloadStl = (part) => download(toStl(part.mesh), `${part.name}.stl`, "model/stl");

export function download3mf(part, bed) {
  const items = [
    {
      name: part.name,
      size: part.size,
      bodies: part.bodies.map((b) => ({ name: b.name, mesh: b.mesh })),
    },
  ];
  download(
    build3mf({ items, bed: { x: bed, y: bed }, title: "Frames" }),
    `${part.name}.3mf`,
    "model/3mf",
  );
}
