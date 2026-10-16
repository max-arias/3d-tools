import { WALLS } from "./defaults.js";

/** Bin parameters with the bin's overrides applied on top of binDefaults. */
export function effectiveBin(project, bin) {
  const d = project.binDefaults;
  const o = bin.overrides ?? {};
  const grab = {};
  for (const wall of WALLS) grab[wall] = { ...d.grab[wall], ...o.grab?.[wall] };
  const eff = { ...d, ...o, grab };
  if (project.grid.mode === "custom" && !eff.heightMm) eff.heightMm = eff.units * 7;
  return eff;
}

/** Bin body height in mm, without the stacking lip. */
export const binHeight = (eff) => eff.heightMm || eff.units * 7;
