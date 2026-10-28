// Channel letters: one hollow box and one diffuser lid per part (a letter, or letters that touch).
import { insideRings, layoutLeds } from "../led/layout.js";
import { layoutText } from "./glyphs.js";

const EPS = 0.01;
/** Parts closer than this merge into one (script fonts, negative tracking). */
const MERGE_GAP = 0.4;
/** Islands smaller than this many wall-squares are dropped from SVG artwork. */
const MIN_ISLAND = 4;

const areaOf = (cs) => cs.area();
const boxOf = (cs) => cs.bounds();

/** Union-find grouping of CrossSections that overlap or sit within `gap` of each other. */
function groupTouching(kit, items, gap) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const bb = items.map((it) => boxOf(it.cs));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = bb[i];
      const b = bb[j];
      if (
        a.min[0] > b.max[0] + gap ||
        b.min[0] > a.max[0] + gap ||
        a.min[1] > b.max[1] + gap ||
        b.min[1] > a.max[1] + gap
      )
        continue;
      const touch = kit.inter2d(kit.grow(items[i].cs, gap / 2), kit.grow(items[j].cs, gap / 2));
      if (areaOf(touch) > 1e-6) parent[find(i)] = find(j);
    }
  const groups = new Map();
  items.forEach((it, i) => {
    const g = groups.get(find(i)) ?? [];
    g.push(it);
    groups.set(find(i), g);
  });
  return [...groups.values()];
}

/** The parts to build, left to right: [{ label, cs }]. Warnings are collected in `notes`. */
function sourceParts(kit, source, size, font, notes) {
  if (source.kind === "svg") {
    const shapes = (source.svg ?? [])
      .map((e) => kit.own(kit.CrossSection.ofPolygons(e.rings.map(flipY), e.rule)))
      .filter((cs) => areaOf(cs) > 0);
    if (!shapes.length) return [];
    const all = kit.csUnion(shapes);
    const bb = boxOf(all);
    const k = size.height / Math.max(bb.max[1] - bb.min[1], 1e-6);
    const fit = kit.own(all.scale([k, k]));
    const minArea = MIN_ISLAND * size.wall * size.wall;
    const islands = fit
      .decompose()
      .map((cs) => kit.own(cs))
      .filter((cs) => {
        const keep = areaOf(cs) >= minArea;
        if (!keep) notes.push("island-dropped");
        return keep;
      });
    return readingOrder(
      islands.map((cs, i) => ({ label: `${i + 1}`, cs })),
      (it) => boxOf(it.cs),
    );
  }
  const text = source.text.trim();
  if (!text || !font) return [];
  const glyphs = layoutText(font, text, size.height, source.tracking);
  const items = glyphs.map((g) => ({
    label: g.ch,
    cs: kit.own(kit.CrossSection.ofPolygons(g.rings, "NonZero")),
  }));
  const groups = groupTouching(kit, items, MERGE_GAP);
  return readingOrder(
    groups.map((g) => ({
      label: g.map((it) => it.label).join(""),
      cs: g.length === 1 ? g[0].cs : kit.csUnion(g.map((it) => it.cs)),
    })),
    (it) => boxOf(it.cs),
  );
}

const flipY = (ring) => ring.map(([x, y]) => [x, -y]);

/** Left to right, then top to bottom for parts that share a column. */
function readingOrder(parts, bounds) {
  return parts.sort((a, b) => {
    const [ba, bb] = [bounds(a), bounds(b)];
    return ba.min[0] - bb.min[0] || bb.max[1] - ba.max[1];
  });
}

const pointInRings = (pt, rings) => {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  return inside;
};

function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : ring[0];
}

/**
 * The point of `inner` farthest from every wall: shrink until just before it vanishes.
 * Returns { at: [x, y], clearance } where clearance is the distance to the nearest wall.
 */
export function widestPoint(kit, inner) {
  const bb = boxOf(inner);
  let lo = 0;
  let hi = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (areaOf(kit.grow(inner, -mid)) > 1e-6) lo = mid;
    else hi = mid;
  }
  const rest = kit.grow(inner, -lo);
  const piece = rest
    .decompose()
    .map((cs) => kit.own(cs))
    .sort((a, b) => areaOf(b) - areaOf(a))[0];
  if (!piece) return null;
  const rings = piece.toPolygons();
  const c = centroid(rings[0]);
  return { at: pointInRings(c, rings) ? c : rings[0][0], clearance: lo };
}

/** The point of `region` closest to `target` (the target itself when it is inside). */
function nearestInside(region, target) {
  const rings = region.toPolygons();
  if (insideRings(rings, target)) return target;
  let best = null;
  let bestD = Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const dx = bx - ax;
      const dy = by - ay;
      const u = Math.max(
        0,
        Math.min(1, ((target[0] - ax) * dx + (target[1] - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      const q = [ax + dx * u, ay + dy * u];
      const d = Math.hypot(q[0] - target[0], q[1] - target[1]);
      if (d < bestD) [best, bestD] = [q, d];
    }
  return best;
}

/** Build one part: { box, lid, hole, issues } as Manifolds plus the XY of the cable hole. */
function buildPart(kit, outline, inner, p, led) {
  const { depth, wall, base } = p.size;
  const lidOn = p.lid.on;
  const issues = [];
  const thin = areaOf(inner) < 0.05 * areaOf(outline);
  let box;
  let lid = null;
  let hole = null;
  if (thin) {
    issues.push("thin");
    box = kit.ext(outline, 0, depth);
  } else {
    let cavity = kit.ext(inner, base, depth + 1);
    if (lidOn) {
      const rebate = kit.grow(outline, -(wall - p.lid.ledge));
      cavity = kit.union(cavity, kit.ext(rebate, depth - p.lid.rebate, depth + 1));
      const lidShape = kit.grow(outline, -(wall - p.lid.ledge + p.lid.clearance));
      if (areaOf(lidShape) > 1e-6) lid = kit.ext(lidShape, 0, p.lid.thickness);
      else issues.push("no-lid");
    }
    box = kit.sub(kit.ext(outline, 0, depth), cavity);
    if (p.hole.on) {
      const w = widestPoint(kit, inner);
      if (w && w.clearance >= p.hole.d / 2 + 1) {
        hole = w.at;
        const first = led?.runs[0]?.pts[0];
        if (p.hole.at === "start" && first)
          hole = nearestInside(kit.grow(inner, -(p.hole.d / 2 + 1)), first);
        box = kit.sub(box, kit.cyl(p.hole.d / 2, base + 2 * EPS + 2, hole[0], hole[1], -1));
      } else issues.push("no-hole");
    }
  }
  return { box, lid, hole, issues };
}

/**
 * Generate every part for a project. `font` is a parsed opentype font (text mode).
 * Returns { parts: [{ id, label, box, lid, hole, size, issues }], notes }.
 * Meshes are in assembled coordinates, the whole word centred on the origin; `lidZ` is where the
 * lid rests in the assembly.
 */
export function generateLetters(kit, p, font) {
  const notes = [];
  const parts = sourceParts(kit, p.source, p.size, font, notes);
  if (!parts.length) return { parts: [], notes, size: [0, 0, 0] };
  const all = boxOf(kit.csUnion(parts.map((x) => x.cs)));
  const shift = [-(all.min[0] + all.max[0]) / 2, -(all.min[1] + all.max[1]) / 2];
  let prevEnd = null;
  let ledStart = 0;
  const out = parts.map((part, i) => {
    const outline = kit.own(part.cs.translate(shift));
    const inner = kit.grow(outline, -p.size.wall);
    const thin = areaOf(inner) < 0.05 * areaOf(outline);
    const led = thin ? null : layoutLeds(kit, inner, p, prevEnd);
    if (led?.count) prevEnd = led.end;
    const built = buildPart(kit, outline, inner, p, led);
    const box = kit.export(built.box, [0, 0, 0]);
    const lid = built.lid ? kit.export(built.lid, [0, 0, 0]) : null;
    const start = ledStart;
    ledStart += led?.count ?? 0;
    return {
      id: i,
      label: part.label,
      box,
      lid,
      hole: built.hole,
      size: [box.size[0], box.size[1]],
      issues: [...built.issues, ...(led?.issues ?? [])],
      led: led && { runs: led.runs, jumps: led.jumps, count: led.count, z: led.z, start },
    };
  });
  return {
    parts: out,
    notes: [...new Set(notes)],
    size: [all.max[0] - all.min[0], all.max[1] - all.min[1], p.size.depth],
    lidZ: p.size.depth - p.lid.rebate,
    ledTotal: ledStart,
  };
}
