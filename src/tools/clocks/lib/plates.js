// Print layout shared by the plates view and the exports: every part lies flat on the bed (the dial
// face-down when it can), turned a quarter turn when that is the only way it fits, and packed onto as
// many plates as needed. Parts with qty 2 (two-sided clocks) appear twice.
import { packPlates } from "../../frames/lib/threemf.js";

/** Bodies moved so the part's footprint starts at 0,0,0; `flip` turns it over (180° about x). */
function flatten(bodies, flip, turn) {
  let [x0, y0, z0, x1, y1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity];
  const moved = bodies.map((b) => {
    const p = b.mesh.positions;
    const out = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      let x = p[i];
      let y = flip ? -p[i + 1] : p[i + 1];
      const z = flip ? -p[i + 2] : p[i + 2];
      if (turn) [x, y] = [-y, x];
      out[i] = x;
      out[i + 1] = y;
      out[i + 2] = z;
      [x0, y0, z0, x1, y1] = [
        Math.min(x0, x),
        Math.min(y0, y),
        Math.min(z0, z),
        Math.max(x1, x),
        Math.max(y1, y),
      ];
    }
    return { slot: b.slot, positions: out, indices: b.mesh.indices };
  });
  for (const m of moved)
    for (let i = 0; i < m.positions.length; i += 3) {
      m.positions[i] -= x0;
      m.positions[i + 1] -= y0;
      m.positions[i + 2] -= z0;
    }
  return {
    bodies: moved.map((m) => ({
      slot: m.slot,
      mesh: { positions: m.positions, indices: m.indices },
    })),
    size: [x1 - x0, y1 - y0],
  };
}

const footprint = (bodies, flip) => flatten(bodies, flip, false).size;

/** Items for the 3MF and the plates view: [{ name, kind, size, bodies: [{ slot, mesh }] }]. */
export function printItems(parts, build, { coupon = false } = {}) {
  const items = [];
  for (const part of parts) {
    if (part.optional && !(coupon && part.kind === "coupon")) continue;
    if (!part.bodies.length) continue;
    const [w, h] = footprint(part.bodies, part.flip);
    const fitsAsIs = w <= build.x && h <= build.y;
    const turn = !fitsAsIs && h <= build.x && w <= build.y;
    const flat = flatten(part.bodies, part.flip, turn);
    for (let n = 0; n < part.qty; n++)
      items.push({
        name: part.qty > 1 ? `${part.id}_${n + 1}` : part.id,
        kind: part.kind,
        ...flat,
      });
  }
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
