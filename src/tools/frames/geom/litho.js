// Lithophane panel from a grey grid (0 = black .. 255 = white): dark pixels are thicker.
/**
 * grid: { cols, rows, data: Uint8Array(cols * rows), row 0 at the top }. The panel spans
 * [-w/2, w/2] x [-h/2, h/2], its flat back at z0, its thinnest point `min` thick, thickest `max`.
 */
export function lithophane(kit, grid, { w, h, z0, min, max, invert }) {
  const { cols, rows, data } = grid;
  const nx = cols;
  const ny = rows;
  const vx = nx + 1;
  const topCount = vx * (ny + 1);
  const verts = new Float32Array(topCount * 3);
  const px = (i) => -w / 2 + (w * i) / nx;
  const py = (j) => -h / 2 + (h * j) / ny;
  const g = (i, j) => {
    // Vertex (i, j) takes the average of the surrounding pixels. Row 0 of the image is the top.
    let sum = 0;
    let n = 0;
    for (const di of [-1, 0])
      for (const dj of [-1, 0]) {
        const ci = i + di;
        const cj = j + dj;
        if (ci < 0 || ci >= nx || cj < 0 || cj >= ny) continue;
        sum += data[(ny - 1 - cj) * nx + ci];
        n++;
      }
    return sum / n / 255;
  };
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const v = invert ? g(i, j) : 1 - g(i, j);
      const o = (j * vx + i) * 3;
      verts[o] = px(i);
      verts[o + 1] = py(j);
      verts[o + 2] = z0 + min + v * (max - min);
    }
  // Boundary ring, counter-clockwise from above: south, east, north, west.
  const v = (i, j) => j * vx + i;
  const ring = [];
  for (let i = 0; i < nx; i++) ring.push(v(i, 0));
  for (let j = 0; j < ny; j++) ring.push(v(nx, j));
  for (let i = nx; i > 0; i--) ring.push(v(i, ny));
  for (let j = ny; j > 0; j--) ring.push(v(0, j));
  const R = ring.length;
  const bottom = new Float32Array((R + 1) * 3);
  ring.forEach((t, k) => {
    bottom[k * 3] = verts[t * 3];
    bottom[k * 3 + 1] = verts[t * 3 + 1];
    bottom[k * 3 + 2] = z0;
  });
  bottom[R * 3 + 2] = z0; // centre of the bottom fan
  const all = new Float32Array(verts.length + bottom.length);
  all.set(verts);
  all.set(bottom, verts.length);
  const B = topCount; // first bottom vertex id
  const tris = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) tris.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));
  for (let k = 0; k < R; k++) {
    const k2 = (k + 1) % R;
    tris.push(B + k, B + k2, ring[k2], B + k, ring[k2], ring[k]); // wall
    tris.push(B + R, B + k2, B + k); // bottom
  }
  return kit.own(new kit.Manifold(new kit.Mesh({ numProp: 3, vertProperties: all, triVerts: Uint32Array.from(tris) })));
}
