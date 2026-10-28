// The socket holder: a flat plate (hub ring + spokes) fused into the shade's rim.
import { SOCKET_SPECS } from "../model/sockets.js";
import { profileCurve } from "./profile.js";

/** Centre line of one spoke from hub to `len`, as points [r, lateral]. */
function spokeLine(style, from, len) {
  if (style !== "curved") return [from, len].map((x) => [x, 0]);
  const bow = (len - from) * 0.18;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push([from + (len - from) * u, bow * Math.sin(u * Math.PI)]);
  }
  return pts;
}

/** Closed polygon around a centre line, `w0` wide at the start and `w1` at the end. */
function ribbon(line, w0, w1) {
  const left = [];
  const right = [];
  line.forEach(([x, y], i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (line.length - 1))) / 2;
    left.push([x - (dy / l) * w, y + (dx / l) * w]);
    right.push([x + (dy / l) * w, y - (dx / l) * w]);
  });
  return [...left, ...right.reverse()];
}

/** How the plate relates to the shade: is the hub inside the rim? */
export function holderFit(p) {
  if (p.holder.at === "none") return { ok: true, hub: 0, rim: 0 };
  const spec = SOCKET_SPECS[p.holder.socket];
  const curve = profileCurve(p.nodes);
  const rim = curve(p.holder.at === "top" ? 1 : 0) * 2;
  const hub = spec.ring;
  return { ok: rim - 2 * p.wall >= hub + 2, hub, rim };
}

/**
 * Manifold of the plate, trimmed by the shade's outer skin so it ends flush with the surface.
 * `outerSolid` is a Manifold of the capped outer skin.
 */
export function buildHolder(kit, p, outerSolid) {
  const { socket, at, plate, spokes } = p.holder;
  const spec = SOCKET_SPECS[socket];
  const reach = Math.max(...p.nodes.map((n) => n.d / 2)) + p.ribs.depth + 2;
  const hub = kit.circle(spec.ring / 2, 0, 0, 96);
  const arms = [];
  for (let k = 0; k < spokes.count; k++) {
    const a = spokes.rotation + (360 / spokes.count) * k;
    const w0 = spokes.style === "tapered" ? spokes.width * 1.8 : spokes.width;
    const w1 = spokes.style === "tapered" ? spokes.width * 0.7 : spokes.width;
    const line = spokeLine(spokes.style, spec.ring / 4, reach);
    const cs = kit.poly(ribbon(line, w0, w1));
    arms.push(a ? kit.own(cs.rotate(a)) : cs);
  }
  const flat = kit.csSub(kit.csUnion(hub, ...arms), kit.circle(spec.hole / 2, 0, 0, 96));
  const z0 = at === "top" ? p.height - plate : 0;
  const slab = kit.ext(flat, z0, z0 + plate);
  return kit.inter(slab, outerSolid);
}
