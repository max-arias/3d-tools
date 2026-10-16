// Group identical parts so the parts table and exports list them once with a count.

function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Hash of a mesh's vertex and index bytes. */
export function meshHash(mesh) {
  const p = new Uint8Array(
    mesh.positions.buffer,
    mesh.positions.byteOffset,
    mesh.positions.byteLength,
  );
  const i = new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
  return `${fnv1a(p).toString(16)}-${fnv1a(i).toString(16)}-${mesh.indices.length}`;
}

// Keys and clips are the same part whichever way they lie, so they group by size instead of mesh bytes.
const identity = (part) =>
  part.kind === "key"
    ? `${[part.size[0], part.size[1]]
        .map((v) => v.toFixed(2))
        .sort()
        .join("x")}x${part.size[2].toFixed(2)}:${part.triangles}`
    : meshHash(part.mesh);

const stripIndex = (name) =>
  name
    .replace(/_seg\d+$/, "")

    .replace(/^(hkey|clip|binkey)_(\d+|spare\d+)$/, "$1")
    .replace(/_spare\d+$/, "");

/**
 * Groups of identical parts: [{ key, name, count, size, kind, parts: [part, ...] }].
 * Names are `{base}_x{count}`; clashes between different meshes get `_b`, `_c`, ...
 */
export function groupParts(parts) {
  const byHash = new Map();
  for (const part of parts) {
    const key = `${part.kind}:${part.inlay ? "text:" : ""}${identity(part)}`;
    if (!byHash.has(key)) byHash.set(key, []);
    byHash.get(key).push(part);
  }
  const used = new Map();
  const groups = [];
  for (const [key, list] of byHash) {
    const base = list[0].base ?? stripIndex(list[0].name);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const suffix = n === 0 ? "" : `_${String.fromCharCode(97 + n)}`;
    groups.push({
      key,
      base: base + suffix,
      name: `${base}${suffix}_x${list.length}`,
      count: list.length,
      size: list[0].size,
      kind: list[0].kind,
      inlay: !!list[0].inlay,
      parts: list,
    });
  }
  return groups;
}
