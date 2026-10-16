// Shared by every product: apply a 2D motif to a face in one of four modes, and pack the bodies.

/**
 * body: the main solid with its face at z = lift .. lift + face.
 * mode: "inlay" (second body, flush), "engraved", "cutthrough" or "raised" (body below the face).
 * Returns { body, patternBody | null }.
 */
export function applyRelief(kit, body, cs, { mode, depth, face, lift }) {
  const d = Math.min(depth, face);
  if (mode === "raised") return { body, patternBody: kit.ext(cs, 0, lift) };
  if (mode === "inlay")
    return { body: kit.sub(body, kit.ext(cs, -1, d)), patternBody: kit.ext(cs, 0, d) };
  if (mode === "engraved") return { body: kit.sub(body, kit.ext(cs, -1, d)), patternBody: null };
  return { body: kit.sub(body, kit.ext(cs, -1, lift + face)), patternBody: null };
}

const concat = (meshes) => {
  const positions = new Float32Array(meshes.reduce((a, m) => a + m.positions.length, 0));
  const indices = new Uint32Array(meshes.reduce((a, m) => a + m.indices.length, 0));
  let po = 0;
  let io = 0;
  for (const m of meshes) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
};

/**
 * Export the bodies in one shared coordinate system.
 * bounds: { min, max } of the outline in design coordinates; total: part height.
 * Design (0, 0) lands at `center` in mesh coordinates. Parts are printed face down (flip).
 */
export function packResult(
  kit,
  { name, body, patternBody, bounds, total, pocket = null, warnings = [] },
) {
  const origin = [bounds.min[0], bounds.min[1], 0];
  const main = kit.export(body, origin);
  const bodies = [{ name, role: "main", mesh: main.mesh, volume: main.volume }];
  const w = new Set(warnings);
  if (!main.valid) w.add("invalidMesh");
  if (patternBody) {
    const pb = kit.export(patternBody, origin);
    if (!pb.valid) w.add("invalidMesh");
    bodies.push({ name: "patron", role: "pattern", mesh: pb.mesh, volume: pb.volume });
  }
  return {
    name,
    flip: true,
    bodies,
    mesh: bodies.length > 1 ? concat(bodies.map((b) => b.mesh)) : main.mesh,
    size: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], total],
    center: [-bounds.min[0], -bounds.min[1]],
    triangles: bodies.reduce((a, b) => a + b.mesh.indices.length / 3, 0),
    volume: bodies.reduce((a, b) => a + b.volume, 0),
    valid: main.valid,
    pocket,
    warnings: [...w],
  };
}
