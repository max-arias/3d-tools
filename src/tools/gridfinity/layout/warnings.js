import { GF, floorHeight, magnetOffset } from "../constants.js";
import { effectiveBin, binHeight } from "../model/effective.js";
import { isValid, overlaps } from "./bins.js";

const fmt = (n) => String(+n.toFixed(1));

/** Layout-level warnings: placement problems and clearance. Geometry adds its own. */
export function layoutWarnings(project, grid) {
  const out = [];
  const floor = floorHeight(project.baseplate);
  const usableX = project.printer.x - 2 * project.printer.margin;
  const usableY = project.printer.y - 2 * project.printer.margin;

  for (const bin of project.bins) {
    const name = `Bin ${bin.w}×${bin.d} at (${bin.x}, ${bin.y})`;
    if (!isValid(grid, [], bin)) {
      out.push(`${name} does not fit the ${grid.cols}×${grid.rows} grid and is left out`);
      continue;
    }
    if (project.bins.some((o) => o.id !== bin.id && overlaps(o, bin))) {
      out.push(`${name} overlaps another bin`);
    }
    const eff = effectiveBin(project, bin);
    const topZ = floor + binHeight(eff) + (eff.lip ? GF.lipH : 0);
    if (project.drawer.h - topZ < project.drawer.topClearance - 1e-9) {
      out.push(
        `${name}: top at ${fmt(topZ)} mm leaves less than the ${fmt(project.drawer.topClearance)} mm top clearance in a ${fmt(project.drawer.h)} mm drawer`,
      );
    }
    if (!eff.split) {
      const w = bin.w * grid.pitchX;
      const d = bin.d * grid.pitchY;
      const fits = (a, b) => a <= usableX && b <= usableY;
      if (!fits(w, d) && !fits(d, w))
        out.push(
          `${name} is not split and is larger than the ${usableX} × ${usableY} mm bed: cut it in your slicer`,
        );
    }
  }

  const wantsMagnets =
    project.baseplate.magnets ||
    project.binDefaults.magnets ||
    project.bins.some((b) => b.overrides?.magnets);
  if (wantsMagnets && magnetOffset(grid.pitchX) < 4)
    out.push(`Cells of ${fmt(grid.pitchX)} mm are too small for magnet holes`);
  return out;
}
