import { PROFILES, crossSection, minHeight, topRange } from "./profiles.js";
import { effectiveWin, windowPath } from "./path.js";
import { backCuts, clipFeatures, stackLayout, stackParts, standPart } from "./parts.js";
import { connectors, cutGrid, planGrid } from "./split.js";
import { textureOffset } from "./texture.js";
import { lithophane } from "./litho.js";

/** Outer size and window of a project (mm), photo orientation and shape applied. */
export function frameSizes(p) {
  const [pw, ph] = p.photo.landscape ? [p.photo.h, p.photo.w] : [p.photo.w, p.photo.h];
  const win0 = [Math.max(pw - 2 * p.photo.overlap, 2), Math.max(ph - 2 * p.photo.overlap, 2)];
  const win = effectiveWin(p.shape, win0);
  return {
    photo: [pw, ph],
    win,
    outer: [win[0] + 2 * p.moulding.width, win[1] + 2 * p.moulding.width],
  };
}

/** Moulding height after the lip rule: the lip over the rabbet stays at least `lip` thick. */
export function mouldingHeight(p, rd, ru) {
  const low = minHeight(p.moulding.profile, ru / p.moulding.width);
  const need = (rd + p.rabbet.lip) / low;
  return need > p.moulding.height
    ? { hgt: need, raised: true }
    : { hgt: p.moulding.height, raised: false };
}

const perimeter = (path) =>
  path.reduce(
    (a, q, i) =>
      a + Math.hypot(path[(i + 1) % path.length][0] - q[0], path[(i + 1) % path.length][1] - q[1]),
    0,
  );

function record(kit, body, name, role, extra = {}) {
  const out = kit.export(body, [0, 0, 0]);
  return {
    name,
    role,
    mesh: out.mesh,
    min: out.min,
    size: out.size,
    volume: out.volume,
    valid: out.valid,
    triangles: out.triangles,
    ...extra,
  };
}

/** Split a flat part (back, mat, ...) to fit the bed; no connectors, the frame holds the pieces. */
function fitPart(kit, body, name, role, bed, warnings) {
  const bb = body.boundingBox();
  const W = bb.max[0] - bb.min[0];
  const H = bb.max[1] - bb.min[1];
  const plan = planGrid(W, H, bed);
  if (!plan.fits) warnings.add("partTooBig");
  const pieces = cutGrid(kit, body, bb, plan.nx, plan.ny);
  return pieces.map(({ body: b, r, c }) =>
    record(kit, b, pieces.length > 1 ? `${name}_r${r + 1}c${c + 1}` : name, role, {
      angle: plan.angle,
    }),
  );
}

/**
 * Builds every part of a frame in assembled coordinates (back face on z = 0, centred on the origin).
 * Returns { name, parts, size, volume, valid, warnings, plan, layers }.
 */
export function generateFrame(kit, p, extra = {}) {
  const warnings = new Set();
  const { photo, win, outer } = frameSizes(p);
  const L = stackLayout(p);
  const w = p.moulding.width;
  const ru = Math.min(p.photo.overlap + p.rabbet.clearance, w - 1);
  const { hgt, raised } = mouldingHeight(p, L.rd, ru);
  if (raised) warnings.add("heightRaised");
  if (w - ru < 1.6) warnings.add("thinWall");
  if (p.rabbet.lip < 1.2) warnings.add("thinLip");
  const bed = { x: p.print.x, y: p.print.y };

  const path = windowPath(p.shape, win);
  const winCS = kit.poly(path);
  const photoCS = kit.grow(winCS, p.photo.overlap);
  const plateCS = kit.grow(winCS, ru - 0.15);
  const profile = crossSection(p.moulding.profile, { w, hgt, rd: L.rd, ru });

  const tex = p.texture;
  const [t0, t1] = topRange(p.moulding.profile);
  const peri = perimeter(path);
  const sweepOpts =
    tex.type === "none"
      ? {}
      : {
          maxSeg: Math.max(0.6, peri / 2500),
          displace: (s, j, x, y) =>
            j > t0 && j < t1 ? textureOffset(tex, s, profile[j][0], x, y) : 0,
        };
  let frame = kit.sweepLoop(profile, path, sweepOpts);

  const slide = p.retention === "slide";
  const cuts = backCuts(kit, p, L, win, outer[1]);
  let plate = null;
  if (slide) {
    frame = kit.union(frame, kit.ext(kit.grow(winCS, ru + 0.05), 0, L.bt));
    const half = win[0] / 2 + ru;
    frame = kit.sub(frame, kit.box(-half, half, win[1] / 2, outer[1] / 2 + 1, L.bt, L.rd));
  } else {
    const { bumps, grooves } = clipFeatures(kit, p, L, win, ru);
    if (grooves.length) frame = kit.sub(frame, grooves);
    plate = kit.union(kit.ext(plateCS, 0, L.bt), ...bumps);
    if (p.shape.type === "polygon") warnings.add("glueBack");
  }
  if (cuts.length) {
    if (slide) frame = kit.sub(frame, cuts);
    else plate = kit.sub(plate, cuts);
  }

  // Fit the frame to the bed: whole, or cut in a grid with bowtie connectors on the back.
  const bb = frame.boundingBox();
  const W = bb.max[0] - bb.min[0];
  const H = bb.max[1] - bb.min[1];
  const half = [win[0] / 2 - 3, win[1] / 2 - 3];
  const plan = planGrid(W, H, bed, (axis, at) => Math.abs(at) < half[axis]);
  if (!plan.fits) warnings.add("partTooBig");
  const parts = [];
  let keys = [];
  if (plan.nx * plan.ny > 1) {
    const flatH = hgt * minHeight(p.moulding.profile, 1);
    const con = connectors(kit, {
      path,
      bb,
      nx: plan.nx,
      ny: plan.ny,
      ru,
      w,
      depthMax: Math.min(flatH, L.rd + p.rabbet.lip),
      tol: p.print.tol,
    });
    con.warnings.forEach((x) => warnings.add(x));
    if (con.pockets.length) frame = kit.sub(frame, con.pockets);
    keys = con.keys;
  }
  const pieces = cutGrid(kit, frame, bb, plan.nx, plan.ny);
  for (const { body, r, c } of pieces)
    parts.push(
      record(kit, body, pieces.length > 1 ? `frame_r${r + 1}c${c + 1}` : "frame", "frame", {
        angle: plan.angle,
      }),
    );
  keys.forEach((k, i) => parts.push(record(kit, k, `key_${i + 1}`, "key", { angle: 0 })));

  if (plate) parts.push(...fitPart(kit, plate, "back", "back", bed, warnings));
  else {
    // Slide-in: the back wall is part of the frame; nothing separate.
  }
  for (const s of stackParts(kit, p, L, { plateCS, winCS, photoCS }))
    parts.push(...fitPart(kit, s.body, s.name, s.role, bed, warnings));

  if (p.litho.on) {
    const b = photoCS.bounds();
    const body = extra.litho
      ? lithophane(kit, extra.litho, {
          w: b.max[0] - b.min[0] - 0.4,
          h: b.max[1] - b.min[1] - 0.4,
          z0: L.zPhoto,
          min: p.litho.min,
          max: p.litho.max,
          invert: p.litho.invert,
        })
      : null;
    if (body) parts.push(record(kit, body, "lithophane", "litho", { angle: 0 }));
  }

  if (p.mount.type === "stand") {
    const s = standPart(kit, p, L, win, outer[1]);
    parts.push(record(kit, s.body, "stand", "back", { rx: s.rx, angle: 0 }));
    if (s.length > Math.max(bed.x, bed.y) - 6) warnings.add("partTooBig");
  }

  const valid = parts.every((q) => q.valid);
  if (!valid) warnings.add("invalidMesh");
  const name = `frame_${PROFILES[p.moulding.profile].label.toLowerCase().replace(/\W+/g, "_")}`;
  return {
    name,
    parts,
    size: [W, H, hgt],
    outer: [W, H],
    photo,
    layers: { ...L, hgt },
    plan: { nx: plan.nx, ny: plan.ny, angle: plan.angle },
    volume: parts.reduce((a, q) => a + q.volume, 0),
    triangles: parts.reduce((a, q) => a + q.triangles, 0),
    valid,
    warnings: [...warnings],
  };
}
