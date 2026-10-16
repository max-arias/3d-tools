import { PROFILES, crossSection, minHeight } from "./profiles.js";

/** Outer size and window of a project (mm), photo orientation applied. */
export function frameSizes(p) {
  const [pw, ph] = p.photo.landscape ? [p.photo.h, p.photo.w] : [p.photo.w, p.photo.h];
  const win = [Math.max(pw - 2 * p.photo.overlap, 2), Math.max(ph - 2 * p.photo.overlap, 2)];
  return {
    photo: [pw, ph],
    win,
    outer: [win[0] + 2 * p.moulding.width, win[1] + 2 * p.moulding.width],
  };
}

/** Counter-clockwise rectangle path centred on the origin. */
const rectPath = (w, h) => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];

/**
 * Mitred frame, back on z = 0 (print back down), face up. Returns the standard part result
 * { name, bodies, mesh, size, volume, valid, warnings }.
 */
export function generateFrame(kit, p) {
  const warnings = [];
  const { win, outer } = frameSizes(p);
  const w = p.moulding.width;
  const ru = Math.min(p.photo.overlap + p.rabbet.clearance, w - 1);
  const rd = p.rabbet.depth;
  // The lip over the rabbet must stay at least `lip` thick at the lowest point above it.
  const low = minHeight(p.moulding.profile, ru / w);
  let hgt = p.moulding.height;
  if (hgt * low < rd + p.rabbet.lip) {
    hgt = (rd + p.rabbet.lip) / low;
    warnings.push("heightRaised");
  }
  const profile = crossSection(p.moulding.profile, { w, hgt, rd, ru });
  const body = kit.sweepLoop(profile, rectPath(win[0], win[1]));
  const out = kit.export(body, [-outer[0] / 2, -outer[1] / 2, 0]);
  if (!out.valid) warnings.push("invalidMesh");
  const name = `frame_${PROFILES[p.moulding.profile].label.toLowerCase().replace(/\W+/g, "_")}`;
  return {
    name,
    flip: false,
    bodies: [{ name, role: "main", mesh: out.mesh, volume: out.volume }],
    mesh: out.mesh,
    size: out.size,
    center: [outer[0] / 2, outer[1] / 2],
    triangles: out.triangles,
    volume: out.volume,
    valid: out.valid,
    warnings,
  };
}
