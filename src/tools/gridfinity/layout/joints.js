/**
 * Joint positions along tile seams.
 * `xs`/`ys` are piece sizes in cells. Each joint is { axis, seam, along, across }:
 *  - axis "x": a vertical seam at cell column `seam`, joint centred at cell row `along` (in cells)
 *  - axis "y": a horizontal seam at cell row `seam`, joint centred at cell column `along`
 * `tiles` names the two tiles it joins as [ix, iy] pairs.
 */
export function jointPositions(xs, ys, every) {
  const joints = [];
  const spread = (count) => {
    const n = Math.ceil(count / every);
    return Array.from({ length: n }, (_, r) => Math.round(((r + 0.5) * count) / n - 0.5));
  };
  let seamX = 0;
  for (let ix = 0; ix < xs.length - 1; ix++) {
    seamX += xs[ix];
    let y0 = 0;
    ys.forEach((rows, iy) => {
      for (const i of spread(rows)) {
        joints.push({
          axis: "x",
          seam: seamX,
          along: y0 + i + 0.5,
          tiles: [
            [ix, iy],
            [ix + 1, iy],
          ],
        });
      }
      y0 += rows;
    });
  }
  let seamY = 0;
  for (let iy = 0; iy < ys.length - 1; iy++) {
    seamY += ys[iy];
    let x0 = 0;
    xs.forEach((cols, ix) => {
      for (const i of spread(cols)) {
        joints.push({
          axis: "y",
          seam: seamY,
          along: x0 + i + 0.5,
          tiles: [
            [ix, iy],
            [ix, iy + 1],
          ],
        });
      }
      x0 += cols;
    });
  }
  return joints;
}
