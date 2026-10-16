// Build the stored image art (see lib/trace.js packArt) into 2D layers placed on the face.

/**
 * pat = { size, ax, ay, rot, mirror } (mm, degrees); art = packed art; area = where ink may go.
 * Returns [{ cs, color }] in paint order with later layers cutting earlier ones (switched-off layers
 * still cut, so a white "hole" stays a hole), clipped to `area`.
 */
export function buildArt(kit, pat, art, area) {
  const q = pat.size / Math.max(art.w, art.h);
  const cx = art.w / 2;
  const cy = art.h / 2;
  const made = [];
  for (const layer of art.layers) {
    const shapes = [];
    for (const shape of layer.s) {
      const rings = shape.p
        .map((flat) => {
          const pts = [];
          for (let i = 0; i + 1 < flat.length; i += 2) {
            const x = (flat[i] - cx) * q;
            pts.push([pat.mirror ? -x : x, -(flat[i + 1] - cy) * q]); // image y runs down
          }
          return pts;
        })
        .filter((r) => r.length >= 3);
      if (rings.length)
        shapes.push(
          kit.own(kit.CrossSection.ofPolygons(rings, shape.r === "e" ? "EvenOdd" : "NonZero")),
        );
    }
    if (!shapes.length) continue;
    const placed = kit.own(
      kit.own(kit.csUnion(shapes).rotate(pat.rot)).translate([pat.ax, pat.ay]),
    );
    made.push({ cs: placed, color: layer.c, on: layer.on });
  }
  // Paint order: what is drawn later sits on top, so it cuts the layers below it.
  const out = [];
  let covered = null;
  for (let i = made.length - 1; i >= 0; i--) {
    const own = covered ? kit.csSub(made[i].cs, covered) : made[i].cs;
    covered = covered ? kit.csUnion(covered, made[i].cs) : made[i].cs;
    if (!made[i].on) continue; // switched off: not printed, but it still cuts what is beneath it
    const clipped = kit.inter2d(own, area);
    if (!clipped.isEmpty()) out.unshift({ cs: clipped, color: made[i].color });
  }
  return out;
}
