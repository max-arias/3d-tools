import { rayHit } from "./path.js";

/** z positions of everything in the rabbet, measured from the back face (z = 0). */
export function stackLayout(p) {
  const magnets = p.mount.type === "magnets";
  const bt = magnets ? Math.max(p.stack.back, p.mount.magnetH + 0.8) : p.stack.back;
  const pt = p.litho.on ? p.litho.max : p.stack.photo;
  const mt = p.mat.on ? p.mat.thickness : 0;
  const zPhoto = bt;
  const zMat = zPhoto + pt;
  const zGap = zMat + mt;
  const zGlass = zGap + p.stack.gap;
  const rd = Math.max(zGlass + p.stack.glass, bt + 0.6);
  return { bt, pt, mt, gap: p.stack.gap, gl: p.stack.glass, zPhoto, zMat, zGap, zGlass, rd };
}

/** Small circles along every boundary of a 2D shape, `shift` mm out of the solid. */
function edgeCircles(kit, cs, pitch, r, shift) {
  const out = [];
  for (const ring of cs.toPolygons()) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const n = Math.max(1, Math.round(len / pitch));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        // Right-hand side of a counter-clockwise boundary points out of the solid.
        out.push(
          kit.circle(r, a[0] + dx * t + (dy / len) * shift, a[1] + dy * t - (dx / len) * shift, 12),
        );
      }
    }
  }
  return out;
}

/** Mat openings: one cut-out inside the photo outline, or a rows x cols grid of straight ones. */
function matOpening(kit, p, photoCS) {
  const { border, rows, cols, gap } = p.mat;
  let open;
  if (rows * cols === 1) {
    open = kit.grow(photoCS, -border, "Round");
  } else {
    const b = photoCS.bounds();
    const x0 = b.min[0] + border;
    const y0 = b.min[1] + border;
    const iw = b.max[0] - b.min[0] - 2 * border;
    const ih = b.max[1] - b.min[1] - 2 * border;
    const cw = (iw - (cols - 1) * gap) / cols;
    const chh = (ih - (rows - 1) * gap) / rows;
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        cells.push(
          kit.rect(
            x0 + c * (cw + gap),
            x0 + c * (cw + gap) + cw,
            y0 + r * (chh + gap),
            y0 + r * (chh + gap) + chh,
          ),
        );
    open = kit.csUnion(cells);
  }
  if (open.isEmpty() || p.mat.edge === "straight") return open;
  const bites =
    p.mat.edge === "scalloped"
      ? edgeCircles(kit, open, 3.2, 0.9, 0)
      : edgeCircles(kit, open, 3.2, 0.7, 2.2);
  return kit.csUnion(open, ...bites);
}

/** Flat 2D parts that sit in the rabbet. Returns [{ name, role, body }]. */
export function stackParts(kit, p, L, { plateCS, winCS, photoCS }) {
  const out = [];
  if (p.mat.on) {
    const open = matOpening(kit, p, photoCS);
    if (!open.isEmpty())
      out.push({
        name: "mat",
        role: "mat",
        body: kit.ext(kit.csSub(plateCS, open), L.zMat, L.zMat + L.mt),
      });
  }
  if (p.stack.gap > 0.1) {
    const hole = kit.grow(winCS, 0.3);
    out.push({
      name: "spacer",
      role: "mat",
      body: kit.ext(kit.csSub(plateCS, hole), L.zGap, L.zGap + L.gap),
    });
  }
  if (p.mat.backer && !p.litho.on) {
    const card = kit.grow(photoCS, -0.3, "Round");
    const bites = edgeCircles(kit, card, 3.2, 0.9, 0);
    out.push({
      name: "stamp_backer",
      role: "mat",
      body: kit.ext(kit.csSub(card, bites), L.zPhoto, L.zPhoto + L.pt),
    });
  }
  return out;
}

/** Magnet pocket centres for a window of size `win`. */
export function magnetSpots(win) {
  const [w, h] = win;
  if (Math.min(w, h) < 40) return [[0, 0]];
  if (Math.min(w, h) < 90)
    return w < h
      ? [
          [0, h * 0.25],
          [0, -h * 0.25],
        ]
      : [
          [-w * 0.25, 0],
          [w * 0.25, 0],
        ];
  return [
    [-w * 0.25, h * 0.25],
    [w * 0.25, h * 0.25],
    [-w * 0.25, -h * 0.25],
    [w * 0.25, -h * 0.25],
  ];
}

/** Stand geometry numbers shared by the slot in the back and the leg itself. */
export function standDims(p, L, win, outerH) {
  const alpha = (p.mount.angle * Math.PI) / 180;
  const gamma = (20 * Math.PI) / 180;
  const yp = 0.25 * (win[1] / 2);
  const hp = (yp + outerH / 2) * Math.cos(alpha);
  const length = hp / Math.cos(gamma);
  return { yp, length, theta: alpha + gamma, width: 12, thick: 3, slotW: 12.6, slotT: 3.6 };
}

/** Everything cut through the back wall: magnet pockets, the keyhole and the stand slot. */
export function backCuts(kit, p, L, win, outerH) {
  const cuts = [];
  if (p.mount.type === "magnets") {
    const r = (p.mount.magnetD + 0.3) / 2;
    for (const [x, y] of magnetSpots(win)) cuts.push(kit.cyl(r, p.mount.magnetH + 0.2, x, y, -0.1));
  } else if (p.mount.type === "hanger") {
    const y = win[1] / 2 - Math.min(14, win[1] * 0.2);
    cuts.push(kit.cyl(4.2, L.bt + 0.2, 0, y, -0.1));
    cuts.push(kit.box(-2.1, 2.1, y - 9, y, -0.1, L.bt + 0.1));
  } else if (p.mount.type === "stand") {
    const s = standDims(p, L, win, outerH);
    cuts.push(
      kit.box(-s.slotW / 2, s.slotW / 2, s.yp - s.slotT / 2, s.yp + s.slotT / 2, -0.1, L.bt + 0.1),
    );
  }
  return cuts;
}

/** The prop leg: a tab through the back slot and an angled bar down to the table. */
export function standPart(kit, p, L, win, outerH) {
  const s = standDims(p, L, win, outerH);
  const d = [-Math.cos(s.theta), -Math.sin(s.theta)]; // (y, z) direction of the leg
  const n = [Math.sin(s.theta), -Math.cos(s.theta)];
  const start = [s.yp, -1.5];
  const q = (k, m) => [start[0] + d[0] * k + n[0] * m, start[1] + d[1] * k + n[1] * m];
  const bar = kit.poly([
    q(0, s.thick / 2),
    q(s.length, s.thick / 2),
    q(s.length, -s.thick / 2),
    q(0, -s.thick / 2),
  ]);
  const tab = kit.rect(s.yp - s.thick / 2, s.yp + s.thick / 2, -2.5, L.bt - 0.3);
  // Sketched as (y, z); extruded along x across the width.
  const body = kit.cabToXyz(kit.ext(kit.csUnion(bar, tab), -s.width / 2, s.width / 2));
  return { name: "stand", role: "back", body, rx: -(s.theta * 180) / Math.PI, length: s.length };
}

/** Bumps on the clip-in back plate and the matching grooves in the pocket wall. */
export function clipFeatures(kit, p, L, win, ru) {
  if (p.shape.type === "polygon") return { bumps: [], grooves: [] };
  const bumps = [];
  const grooves = [];
  const z0 = L.bt * 0.25;
  const z1 = L.bt * 0.75;
  const plateGap = 0.15;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const reach = rayHit(win, dx, dy);
    const wall = reach + ru; // pocket wall along this axis
    const along = Math.min(8, (dx ? win[1] : win[0]) * 0.3);
    const edge = wall - plateGap;
    const box = (a, b) => {
      const lo = Math.min(a * (dx || dy), b * (dx || dy));
      const hi = Math.max(a * (dx || dy), b * (dx || dy));
      return dx
        ? kit.box(lo, hi, -along / 2, along / 2, z0, z1)
        : kit.box(-along / 2, along / 2, lo, hi, z0, z1);
    };
    bumps.push(box(edge - 0.2, edge + 0.35));
    grooves.push(box(wall - 0.1, wall + 0.5));
  }
  return { bumps, grooves };
}
