// Perimeter run: LEDs at exactly the strip pitch along each loop of a ring set, strip on edge.

/** One run per loop. A loop shorter than two pitches is dropped (counted in `dropped`). */
export function loopRuns(rings, pitch) {
  const runs = [];
  let dropped = 0;
  for (const ring of rings) {
    const m = ring.length;
    const seg = ring.map((p, i) =>
      Math.hypot(ring[(i + 1) % m][0] - p[0], ring[(i + 1) % m][1] - p[1]),
    );
    const total = seg.reduce((a, b) => a + b, 0);
    const n = Math.floor(total / pitch);
    if (n < 2) {
      dropped++;
      continue;
    }
    const pts = [];
    let i = 0;
    let walked = 0; // arc length at the start of segment i
    for (let k = 0; k < n; k++) {
      const s = k * pitch;
      while (walked + seg[i] < s) walked += seg[i++];
      const u = seg[i] ? (s - walked) / seg[i] : 0;
      const a = ring[i];
      const b = ring[(i + 1) % m];
      pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    runs.push({ pts });
  }
  return { runs, dropped };
}
