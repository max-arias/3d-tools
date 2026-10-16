import { GF, floorHeight } from "../constants.js";

/** Height budget for bins: drawer height minus the baseplate floor and top clearance. */
export function heightLimit(project) {
  const floor = floorHeight(project.baseplate);
  const clearance = project.drawer.topClearance;
  const limit = Math.max(0, project.drawer.h - floor - clearance);
  return {
    floor,
    clearance,
    limit,
    maxUnitsLip: Math.max(0, Math.floor((limit - GF.lipH) / GF.heightUnit)),
    maxUnits: Math.max(0, Math.floor(limit / GF.heightUnit)),
  };
}
