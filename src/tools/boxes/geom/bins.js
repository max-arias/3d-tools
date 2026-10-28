// Bins inside the box, built by the Gridfinity tool's bin builder. Bins are as tall as the box
// (U units) so their stacking lips reach the feet under the lid, which holds them in place.
import { GF } from "../../gridfinity/constants.js";
import { buildBinSegment } from "../../gridfinity/geom/bin.js";
import { defaultProject } from "../../gridfinity/model/defaults.js";
import { effectiveBin } from "../../gridfinity/model/effective.js";
import { FLOOR, MARGIN } from "./dims.js";

/** Per-bin options a pack may set; everything else stays at the Gridfinity defaults. */
export const BIN_OPTIONS = ["dividersX", "dividersY", "scoop", "label"];

/** A Gridfinity-tool project with the box's height and these bins. */
export function gridfinityProject(d, bins) {
  const gp = defaultProject();
  gp.binDefaults = { ...gp.binDefaults, units: d.grid.u, split: false };
  gp.bins = bins.map((b) => toGridfinityBin(b));
  return gp;
}

function toGridfinityBin(b) {
  const o = {};
  if (b.dividersX) o.dividersX = b.dividersX;
  if (b.dividersY) o.dividersY = b.dividersY;
  if (b.scoop) o.grab = { front: { scoop: true } };
  if (b.label) o.label = "tab";
  return { id: b.id, x: b.x, y: b.y, w: b.w, d: b.d, overrides: o };
}

/** Bins that print the same share one key. */
export const binKey = (b) =>
  JSON.stringify([b.w, b.d, b.dividersX ?? 0, b.dividersY ?? 0, !!b.scoop, !!b.label]);

/** Build one bin; its foot is at z = 0 and its min corner at the origin. */
export function buildBin(kit, gp, bin) {
  const gbin = toGridfinityBin(bin);
  const eff = effectiveBin(gp, gbin);
  const seg = { ix: 0, iy: 0, x0: 0, y0: 0, w: gbin.w, d: gbin.d, open: {} };
  const res = buildBinSegment(kit, {
    project: gp,
    grid: { pitchX: GF.pitch, pitchY: GF.pitch },
    bin: gbin,
    eff,
    seg,
  });
  return res.main;
}

/** Where a bin stands in the box: its foot rests in the floor sockets. */
export function binOrigin(bin) {
  return [MARGIN + bin.x * GF.pitch, MARGIN + bin.y * GF.pitch, FLOOR.socketZ];
}
