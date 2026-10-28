// The mesh as it is printed.
/** The mesh as printed: with a holder on top it is turned over so the plate lies on the bed. */
export function printMesh(part, project) {
  if (project.holder.at !== "top") return part.mesh;
  const { positions, indices } = part.mesh;
  const flipped = new Float32Array(positions.length);
  const top = part.min[2] + part.size[2];
  for (let i = 0; i < positions.length; i += 3) {
    flipped[i] = positions[i];
    flipped[i + 1] = -positions[i + 1];
    flipped[i + 2] = top - positions[i + 2];
  }
  return { positions: flipped, indices };
}
