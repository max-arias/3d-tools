// Chaining strip pieces into one data line, nearest end first.
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Order and orient `runs` so the data line walks from `start` to the nearest unused end each time.
 * A loop of strip is cut like any other piece, so it also starts at one of its two ends. Returns { runs, jumps: [{ from, to, len }], end }.
 */
export function chainRuns(runs, start) {
  const left = runs.map((r) => ({ ...r }));
  const out = [];
  const jumps = [];
  let pos = start;
  while (left.length) {
    let best = { d: Infinity };
    left.forEach((r, i) => {
      const cands = [
        { rev: false, d: dist(pos, r.pts[0]) },
        { rev: true, d: dist(pos, r.pts[r.pts.length - 1]) },
      ];
      for (const c of cands) if (c.d < best.d) best = { ...c, i };
    });
    const [run] = left.splice(best.i, 1);
    const pts = best.rev ? [...run.pts].reverse() : run.pts;
    if (pos !== start || out.length) jumps.push({ from: pos, to: pts[0], len: best.d });
    out.push({ pts });
    pos = pts[pts.length - 1];
  }
  return { runs: out, jumps, end: pos };
}
