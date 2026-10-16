const SPACING = 5;
const KEEP_OUT = { w: 18, d: 28 }; // Bambu P1S rear-left purge area, in bed coordinates

class MaxRects {
  constructor(w, d) {
    this.free = [{ x: 0, y: 0, w, d }];
  }

  block(r) {
    this.#cut(r);
  }

  /** Best short-side fit, rotation allowed. Returns { x, y, rot } or null. */
  place(w, d) {
    let best = null;
    for (const f of this.free) {
      for (const rot of [false, true]) {
        const pw = rot ? d : w;
        const pd = rot ? w : d;
        if (pw > f.w + 1e-9 || pd > f.d + 1e-9) continue;
        const short = Math.min(f.w - pw, f.d - pd);
        const long = Math.max(f.w - pw, f.d - pd);
        if (!best || short < best.short || (short === best.short && long < best.long)) {
          best = { x: f.x, y: f.y, rot, short, long, w: pw, d: pd };
        }
      }
    }
    if (!best) return null;
    this.#cut({ x: best.x, y: best.y, w: best.w, d: best.d });
    return { x: best.x, y: best.y, rot: best.rot, w: best.w, d: best.d };
  }

  #cut(r) {
    const out = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.d || r.y + r.d <= f.y) {
        out.push(f);
        continue;
      }
      if (r.x > f.x) out.push({ x: f.x, y: f.y, w: r.x - f.x, d: f.d });
      if (r.x + r.w < f.x + f.w)
        out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, d: f.d });
      if (r.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, d: r.y - f.y });
      if (r.y + r.d < f.y + f.d)
        out.push({ x: f.x, y: r.y + r.d, w: f.w, d: f.y + f.d - r.y - r.d });
    }
    this.free = out.filter(
      (a, i) => !out.some((b, j) => i !== j && contains(b, a) && (!contains(a, b) || j < i)),
    );
  }
}

const contains = (a, b) =>
  b.x >= a.x - 1e-9 &&
  b.y >= a.y - 1e-9 &&
  b.x + b.w <= a.x + a.w + 1e-9 &&
  b.y + b.d <= a.y + a.d + 1e-9;

/**
 * Pack parts onto print plates.
 * parts: [{ id, kind, w, d }] (footprint in mm; kind "key" parts are packed in size-grouped blocks last).
 * Returns plates: [{ index, oversize, items: [{ id, x, y, w, d, rot }] }] in usable-area mm.
 */
export function packPlates(parts, printer, { keepOut = false } = {}) {
  const usableX = printer.x - 2 * printer.margin;
  const usableY = printer.y - 2 * printer.margin;
  const cw = usableX + SPACING;
  const cd = usableY + SPACING;
  const plates = [];

  const newPlate = (oversize = false) => {
    const rects = new MaxRects(cw, cd);
    if (keepOut) {
      rects.block({
        x: 0,
        y: 0,
        w: Math.max(0, KEEP_OUT.w - printer.margin),
        d: Math.max(0, KEEP_OUT.d - printer.margin),
      });
    }
    const p = { index: plates.length, oversize, items: [], rects, used: 0 };
    plates.push(p);
    return p;
  };

  const tryPlace = (plate, w, d) => {
    const spot = plate.rects.place(w + SPACING, d + SPACING);
    if (spot) plate.used += (w + SPACING) * (d + SPACING);
    return spot;
  };

  const solo = [];
  const normal = parts.filter((p) => p.kind !== "key");
  normal.sort((a, b) => b.w * b.d - a.w * a.d || Math.max(b.w, b.d) - Math.max(a.w, a.d));
  for (const part of normal) {
    const fitsBed =
      Math.min(part.w, part.d) + SPACING <= Math.min(cw, cd) + 1e-9 &&
      Math.max(part.w, part.d) + SPACING <= Math.max(cw, cd) + 1e-9;
    if (!fitsBed) {
      solo.push(part);
      continue;
    }
    let spot = null;
    let plate = null;
    for (const p of plates) {
      if (p.oversize) continue;
      spot = tryPlace(p, part.w, part.d);
      if (spot) {
        plate = p;
        break;
      }
    }
    if (!spot) {
      plate = newPlate();
      spot = tryPlace(plate, part.w, part.d);
    }
    if (!spot) {
      solo.push(part);
      continue;
    }
    plate.items.push({
      id: part.id,
      x: spot.x,
      y: spot.y,
      w: spot.rot ? part.d : part.w,
      d: spot.rot ? part.w : part.d,
      rot: spot.rot,
    });
  }

  for (const part of solo) {
    const plate = newPlate(true);
    plate.items.push({ id: part.id, x: 0, y: 0, w: part.w, d: part.d, rot: false });
  }

  packKeyBlocks(
    parts.filter((p) => p.kind === "key"),
    plates,
    tryPlace,
    newPlate,
  );

  return plates.map(({ index, oversize, items }) => ({ index, oversize, items }));
}

function packKeyBlocks(keys, plates, tryPlace, newPlate) {
  const groups = new Map();
  for (const k of keys) {
    const key = `${k.w.toFixed(2)}x${k.d.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  const placeBlock = (items) => {
    const n = items.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const { w, d } = items[0];
    const bw = cols * (w + SPACING) - SPACING;
    const bd = rows * (d + SPACING) - SPACING;
    const order = plates.filter((p) => !p.oversize).sort((a, b) => a.used - b.used);
    for (const plate of [...order, null]) {
      const target = plate ?? newPlate();
      const spot = tryPlace(target, bw, bd);
      if (!spot) {
        if (!plate) {
          // Does not fit even an empty plate: drop the empty plate and split the block.
          plates.pop();
          if (n === 1) {
            const solo = newPlate(true);
            solo.items.push({ id: items[0].id, x: 0, y: 0, w, d, rot: false });
            return;
          }
          const mid = Math.ceil(n / 2);
          placeBlock(items.slice(0, mid));
          placeBlock(items.slice(mid));
          return;
        }
        continue;
      }
      items.forEach((it, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const px = spot.rot ? r * (d + SPACING) : c * (w + SPACING);
        const py = spot.rot ? c * (w + SPACING) : r * (d + SPACING);
        target.items.push({
          id: it.id,
          x: spot.x + px,
          y: spot.y + py,
          w: spot.rot ? d : w,
          d: spot.rot ? w : d,
          rot: spot.rot,
        });
      });
      return;
    }
  };
  for (const items of groups.values()) placeBlock(items);
}
