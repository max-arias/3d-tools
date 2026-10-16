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

/**
 * Like applyRelief for several colours: layers = [{ cs, color }]. Inlay and raised give one body per
 * colour; engraving and cut-through remove all of them from the face together.
 */
export function applyReliefLayers(kit, body, layers, { mode, depth, face, lift }) {
  if (!layers.length) return { body, patternBodies: [] };
  const d = Math.min(depth, face);
  if (mode === "engraved" || mode === "cutthrough") {
    const all = kit.csUnion(layers.map((l) => l.cs));
    return {
      body: kit.sub(body, kit.ext(all, -1, mode === "engraved" ? d : lift + face)),
      patternBodies: [],
    };
  }
  const patternBodies = [];
  for (const l of layers) {
    if (mode === "inlay") {
      body = kit.sub(body, kit.ext(l.cs, -1, d));
      patternBodies.push({ solid: kit.ext(l.cs, 0, d), color: l.color });
    } else patternBodies.push({ solid: kit.ext(l.cs, 0, lift), color: l.color });
  }
  return { body, patternBodies };
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
  { name, body, patternBody, patternBodies, bounds, total, pocket = null, warnings = [] },
) {
  const origin = [bounds.min[0], bounds.min[1], 0];
  const main = kit.export(body, origin);
  const bodies = [{ name, role: "main", mesh: main.mesh, volume: main.volume }];
  const w = new Set(warnings);
  if (!main.valid) w.add("invalidMesh");
  // One body per colour; a lone pattern keeps the plain name "patron".
  const extra = patternBodies ?? (patternBody ? [{ solid: patternBody }] : []);
  extra.forEach((pb, i) => {
    const out = kit.export(pb.solid, origin);
    if (!out.valid) return; // an empty colour (everything clipped away) is not an error
    bodies.push({
      name: extra.length > 1 ? `patron_${i + 1}` : "patron",
      role: "pattern",
      color: pb.color,
      mesh: out.mesh,
      volume: out.volume,
    });
  });
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
