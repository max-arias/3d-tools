import { GF } from "../constants.js";

function axis(len, tol, mode, target, pad) {
  const avail = len - 2 * tol;
  const cells = Math.floor(avail / (mode === "custom" ? target : GF.pitch) + 1e-9);
  const cell = mode === "custom" ? target : GF.pitch;
  if (cells < 1) throw new Error(`Drawer axis ${len} mm is smaller than one ${cell} mm cell`);
  if (mode === "custom") return { cells, pitch: avail / cells, padStart: 0, padEnd: 0 };
  const left = avail - cells * GF.pitch;
  // `pad` names where the cells sit: "start" pushes them to the start, so the leftover is at the end.
  if (pad === "start") return { cells, pitch: GF.pitch, padStart: 0, padEnd: left };
  if (pad === "end") return { cells, pitch: GF.pitch, padStart: left, padEnd: 0 };
  return { cells, pitch: GF.pitch, padStart: left / 2, padEnd: left / 2 };
}

/**
 * Cell grid for a drawer. Leftover space becomes solid padding on the edge tiles.
 * Returns { x, y, cols, rows, pitchX, pitchY, tol } where x/y are { cells, pitch, padStart, padEnd }.
 */
export function computeGrid(project) {
  const { drawer, grid } = project;
  const x = axis(drawer.w, drawer.tol, grid.mode, grid.target, grid.padX);
  const y = axis(drawer.d, drawer.tol, grid.mode, grid.target, grid.padY);
  return { x, y, cols: x.cells, rows: y.cells, pitchX: x.pitch, pitchY: y.pitch, tol: drawer.tol };
}

/** Distance from the drawer origin to the grid's first cell edge on each axis. */
export const gridOrigin = (g) => ({ x: g.tol + g.x.padStart, y: g.tol + g.y.padStart });

/** Mm size of a bin footprint, before the per-side bin gap. */
export const binSpan = (g, bin) => ({ w: bin.w * g.pitchX, d: bin.d * g.pitchY });
