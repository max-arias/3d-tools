// Print layout shared by the exports: every part repeated qty times, grouped so the base, the lid,
// the small parts and the bins each start on their own plate, and turned a quarter turn when that
// is the only way a footprint fits the bed.
import { fitsBed } from "../model/project.js";

const GROUPS = ["base", "lid", "small", "bin"];
const groupOf = (kind) => (kind === "base" || kind === "lid" || kind === "bin" ? kind : "small");

/** Names per part id: base_5x4x6U, lid_5x4, bin_2x1; parts that would share a name get _1, _2... */
export function partNames(parts, grid) {
  const raw = parts.map((p) => {
    if (p.kind === "base") return `base_${grid.x}x${grid.y}x${grid.u}U`;
    if (p.kind === "lid") return `lid_${grid.x}x${grid.y}`;
    if (p.kind === "bin") return `bin_${p.bin.w}x${p.bin.d}`;
    return p.kind;
  });
  const seen = new Map();
  const total = (n) => raw.filter((r) => r === n).length;
  return new Map(
    parts.map((p, i) => {
      const n = (seen.get(raw[i]) ?? 0) + 1;
      seen.set(raw[i], n);
      return [p.id, total(raw[i]) > 1 ? `${raw[i]}_${n}` : raw[i]];
    }),
  );
}

/** Bodies of one item turned a quarter turn about z, moved back so the footprint starts at 0,0. */
function turned(bodies) {
  const rot = bodies.map((b) => {
    const p = b.mesh.positions;
    const out = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      out[i] = -p[i + 1];
      out[i + 1] = p[i];
      out[i + 2] = p[i + 2];
    }
    return out;
  });
  let x0 = Infinity;
  let y0 = Infinity;
  for (const out of rot)
    for (let i = 0; i < out.length; i += 3) {
      x0 = Math.min(x0, out[i]);
      y0 = Math.min(y0, out[i + 1]);
    }
  return bodies.map((b, k) => {
    const out = rot[k];
    for (let i = 0; i < out.length; i += 3) {
      out[i] -= x0;
      out[i + 1] -= y0;
    }
    return { ...b, mesh: { positions: out, indices: b.mesh.indices } };
  });
}

/**
 * Items for the 3MF: [{ name, size: [x, y], bodies: [{ name, mesh }], newPlate }], one per copy,
 * in group order. `oversize` lists the item names that do not fit the bed even when turned.
 */
export function printItems(parts, project) {
  const names = partNames(parts, project.grid);
  const ordered = [...parts].sort(
    (a, b) => GROUPS.indexOf(groupOf(a.kind)) - GROUPS.indexOf(groupOf(b.kind)),
  );
  const items = [];
  const oversize = [];
  let lastGroup = null;
  for (const part of ordered) {
    const group = groupOf(part.kind);
    const base = names.get(part.id);
    for (let n = 1; n <= part.qty; n++) {
      const name = part.qty > 1 ? `${base}_${n}` : base;
      let bodies = part.bodies.map((b, i) => ({ name: i ? `${name}_text` : name, mesh: b.mesh }));
      let [w, h] = part.size;
      if (!fitsBed([w, h], project.build)) oversize.push(name);
      else if (w > project.build.x || h > project.build.y) {
        bodies = turned(bodies);
        [w, h] = [h, w];
      }
      items.push({ name, size: [w, h], bodies, newPlate: group !== lastGroup });
      lastGroup = group;
    }
  }
  return { items, oversize };
}
