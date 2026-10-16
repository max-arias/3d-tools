import { GF } from "../constants.js";
import { splitAxis } from "./split.js";

const dividerCuts = (len, count) =>
  Array.from({ length: count }, (_, i) => ((i + 1) * len) / (count + 1));

/** Preferred cut indices (in half-cell units) along one bin axis: grid lines, then divider positions. */
function preferredCuts(start, len, dividers) {
  const set = new Set();
  const n = Math.round(len * 2);
  for (let i = 1; i < n; i++) if (Math.round(start * 2 + i) % 2 === 0) set.add(i);
  for (const c of dividerCuts(len, dividers)) if (Number.isInteger(c * 2)) set.add(c * 2);
  return set;
}

/**
 * Split a bin into printable segments that fit the bed.
 * Returns { segments: [{ ix, iy, x0, y0, w, d, open: {xMin,xMax,yMin,yMax} }], xs, ys } in cells, bin-relative.
 * `open` is true where the segment meets another one and the cut is not on a divider
 * (an open seam has no wall; a closed seam gets a wall on both sides).
 */
export function planBinSegments(grid, printer, bin, eff) {
  const bedX = printer.x - 2 * printer.margin + GF.binGap * 2;
  const bedY = printer.y - 2 * printer.margin + GF.binGap * 2;
  const nx = Math.round(bin.w * 2);
  const ny = Math.round(bin.d * 2);
  const split = eff.split !== false;
  const xs = split
    ? splitAxis({
        n: nx,
        size: grid.pitchX / 2,
        max: bedX,
        preferred: preferredCuts(bin.x, bin.w, eff.dividersX),
      })
    : [nx];
  const ys = split
    ? splitAxis({
        n: ny,
        size: grid.pitchY / 2,
        max: bedY,
        preferred: preferredCuts(bin.y, bin.d, eff.dividersY),
      })
    : [ny];

  const dividerXs = new Set(dividerCuts(bin.w, eff.dividersX).map((c) => Math.round(c * 2)));
  const dividerYs = new Set(dividerCuts(bin.d, eff.dividersY).map((c) => Math.round(c * 2)));

  const segments = [];
  let y0 = 0;
  ys.forEach((sy, iy) => {
    let x0 = 0;
    xs.forEach((sx, ix) => {
      segments.push({
        ix,
        iy,
        x0: x0 / 2,
        y0: y0 / 2,
        w: sx / 2,
        d: sy / 2,
        open: {
          xMin: ix > 0 && !dividerXs.has(x0),
          xMax: ix < xs.length - 1 && !dividerXs.has(x0 + sx),
          yMin: iy > 0 && !dividerYs.has(y0),
          yMax: iy < ys.length - 1 && !dividerYs.has(y0 + sy),
        },
      });
      x0 += sx;
    });
    y0 += sy;
  });
  return { segments, xs: xs.map((n) => n / 2), ys: ys.map((n) => n / 2) };
}
