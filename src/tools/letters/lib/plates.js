// Print layout shared by the plates view and the exports: every box and lid lies flat on the bed,
// turned a quarter turn when that is the only way it fits, and packed onto as many plates as needed.
import { packPlates } from "../../frames/lib/threemf.js";

/** { mesh, size: [x, y] } of a part mesh moved so its footprint starts at 0,0 (z is already 0). */
function flat(src, turn) {
  const p = src.positions;
  const out = new Float32Array(p.length);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    const x = turn ? -p[i + 1] : p[i];
    const y = turn ? p[i] : p[i + 1];
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = p[i + 2];
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= x0;
    out[i + 1] -= y0;
  }
  return { mesh: { positions: out, indices: src.indices }, size: [x1 - x0, y1 - y0] };
}

/** Items for the 3MF and the plates view: [{ name, kind, part, size, mesh }], boxes then lids. */
export function printItems(parts, build) {
  const items = [];
  const add = (kind, part, m) => {
    const [w, h] = m.size;
    const fitsAsIs = w <= build.x && h <= build.y;
    const turn = !fitsAsIs && h <= build.x && w <= build.y;
    const f = flat(m.mesh, turn);
    items.push({
      name: `${String(part.id + 1).padStart(2, "0")}_${kind}_${part.label.replace(/[^\p{L}\p{N}]/gu, "") || "x"}`,
      kind,
      part: part.id,
      ...f,
    });
  };
  for (const part of parts) add("box", part, part.box);
  for (const part of parts) if (part.lid) add("lid", part, part.lid);
  return items;
}

/** Plate positions for the items, in the same arrangement build3mf writes. */
export function arrange(items, build) {
  const { positions, plates, fits } = packPlates(
    items.map((i) => ({ w: i.size[0], h: i.size[1] })),
    build,
  );
  const cols = Math.ceil(Math.sqrt(plates));
  return {
    plates,
    fits,
    cols,
    at: positions.map((at) => ({
      x: (at.plate % cols) * build.x * 1.2 + at.x,
      y: -Math.floor(at.plate / cols) * build.y * 1.2 + at.y,
    })),
  };
}
