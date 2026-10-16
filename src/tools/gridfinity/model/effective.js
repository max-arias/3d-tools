import { WALLS } from "./defaults.js";

/** Bin parameters with the bin's overrides applied on top of binDefaults. */
export function effectiveBin(project, bin) {
  const d = project.binDefaults;
  const o = bin.overrides ?? {};
  const grab = {};
  for (const wall of WALLS) grab[wall] = { ...d.grab[wall], ...o.grab?.[wall] };
  const eff = { ...d, ...o, grab };
  if (project.grid.mode === "custom" && !eff.heightMm) eff.heightMm = eff.units * 7;
  // Sliding rails and hinge posts need a straight wall, so those lids replace the stacking lip.
  if (eff.lid === "sliding" || eff.lid === "hinged") eff.lip = false;
  // A hinged lid prints upside down, so its handle has to be flat.
  if (eff.lid === "hinged" && (eff.lidHandle === "tab" || eff.lidHandle === "knob"))
    eff.lidHandle = "dip";
  return eff;
}

/** Bin body height in mm, without the stacking lip. */
export const binHeight = (eff) => eff.heightMm || eff.units * 7;
