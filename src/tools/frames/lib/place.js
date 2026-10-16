// Print placement: turn an assembled-coordinates part so it lies flat, with its box starting at 0.
/** { mesh, size } of `part` after rotating `rx` degrees about x, then `angle` degrees about z. */
export function printable(part) {
  const src = part.mesh.positions;
  const out = new Float32Array(src.length);
  const rx = ((part.rx ?? 0) * Math.PI) / 180;
  const az = ((part.angle ?? 0) * Math.PI) / 180;
  const [c1, s1, c2, s2] = [Math.cos(rx), Math.sin(rx), Math.cos(az), Math.sin(az)];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1] * c1 - src[i + 2] * s1;
    const z = src[i + 1] * s1 + src[i + 2] * c1;
    const X = x * c2 - y * s2;
    const Y = x * s2 + y * c2;
    out[i] = X;
    out[i + 1] = Y;
    out[i + 2] = z;
    for (const [k, v] of [
      [0, X],
      [1, Y],
      [2, z],
    ]) {
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    out[i] -= min[0];
    out[i + 1] -= min[1];
    out[i + 2] -= min[2];
  }
  return {
    mesh: { positions: out, indices: part.mesh.indices },
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
