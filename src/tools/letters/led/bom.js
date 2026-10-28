/** Strip and wire needed for a layout: [{ count, runs, jumps }] per letter plus the depth. */
export function bom(letters, density, depth) {
  const pitch = 1000 / density;
  let leds = 0;
  let pieces = 0;
  let wire = 0;
  let joints = 0;
  letters.forEach((l, i) => {
    leds += l.count;
    pieces += l.runs.length;
    for (const j of l.jumps) {
      wire += j.len + 2 * (j.wall ? depth : 0) + 50;
      joints += 2;
    }
    if (i > 0 && l.count) {
      wire += depth * 2 + 50; // hop from the previous letter through both backs
      joints += 2;
    }
  });
  return { leds, pieces, joints, stripM: (leds * pitch) / 1000, wireM: wire / 1000 };
}
