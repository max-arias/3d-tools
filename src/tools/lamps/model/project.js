import LZString from "lz-string";

export const TYPES = ["table", "pendant"];
export const WAVES = ["sine", "scallop", "triangle"];
export const SOCKETS = ["E27", "E14"];
export const HOLDER_AT = ["none", "top", "bottom"];
export const SPOKE_STYLES = ["straight", "tapered", "curved"];
export const MIN_NODES = 2;
export const MAX_NODES = 12;
/** Sections that Random can lock and that have their own Reset. */
export const SECTIONS = ["shape", "ribs", "holder"];

const num = (v, lo, hi, d) =>
  Number.isFinite(+v) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, +v)) : d;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const hex = (v, d) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d);

export function defaultProject() {
  return {
    v: 1,
    type: "table",
    height: 200,
    nodes: [
      { z: 0, d: 190 },
      { z: 0.4, d: 200 },
      { z: 0.75, d: 160 },
      { z: 1, d: 120 },
    ],
    ribs: { count: 12, depth: 3, twist: 0, wave: "sine" },
    wall: 1.2,
    holder: {
      socket: "E27",
      at: "bottom",
      plate: 3,
      spokes: { count: 3, style: "straight", width: 8, rotation: 0 },
    },
    build: { x: 256, y: 256, z: 256 },
    seed: 1,
    color: "#e8d9b5",
  };
}

/** Section defaults, used by the per-section Reset. */
export function sectionOf(project, section) {
  if (section === "shape")
    return { type: project.type, height: project.height, nodes: project.nodes };
  if (section === "ribs") return { ribs: project.ribs };
  return { holder: project.holder };
}

export function resetSection(project, section) {
  const d = defaultProject();
  return sanitize({ ...project, ...sectionOf(d, section) });
}

/** Clamp every field of a raw project (storage, share link, JSON or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const rawNodes = Array.isArray(r.nodes) ? r.nodes : d.nodes;
  let nodes = rawNodes
    .slice(0, MAX_NODES)
    .map((n) => ({ z: num(n?.z, 0, 1, 0), d: num(n?.d, 10, 600, 100) }))
    .sort((a, b) => a.z - b.z);
  if (nodes.length < MIN_NODES) nodes = d.nodes;
  // The profile always spans the full height; keep the ends pinned and the middle strictly between.
  nodes[0].z = 0;
  nodes[nodes.length - 1].z = 1;
  for (let i = 1; i < nodes.length - 1; i++)
    nodes[i].z = Math.min(Math.max(nodes[i].z, nodes[i - 1].z + 0.01), 0.99);
  const height = num(r.height, 30, 600, d.height);
  const wall = num(r.wall, 0.8, 6, d.wall);
  const at = oneOf(r.holder?.at, HOLDER_AT, d.holder.at);
  return {
    v: 1,
    type: oneOf(r.type, TYPES, d.type),
    height,
    nodes,
    ribs: {
      count: Math.round(num(r.ribs?.count, 3, 80, d.ribs.count)),
      depth: num(r.ribs?.depth, 0, 20, d.ribs.depth),
      twist: num(r.ribs?.twist, -720, 720, d.ribs.twist),
      wave: oneOf(r.ribs?.wave, WAVES, d.ribs.wave),
    },
    wall,
    holder: {
      socket: oneOf(r.holder?.socket, SOCKETS, d.holder.socket),
      at,
      plate: num(r.holder?.plate, 1.5, 8, d.holder.plate),
      spokes: {
        count: Math.round(num(r.holder?.spokes?.count, 2, 8, d.holder.spokes.count)),
        style: oneOf(r.holder?.spokes?.style, SPOKE_STYLES, d.holder.spokes.style),
        width: num(r.holder?.spokes?.width, 3, 30, d.holder.spokes.width),
        rotation: num(r.holder?.spokes?.rotation, -180, 180, d.holder.spokes.rotation),
      },
    },
    build: {
      x: num(r.build?.x, 50, 1000, d.build.x),
      y: num(r.build?.y, 50, 1000, d.build.y),
      z: num(r.build?.z, 50, 1000, d.build.z),
    },
    seed: Math.round(num(r.seed, 1, 999999, d.seed)),
    color: hex(r.color, d.color),
  };
}

/** Deep-merge `patch` into a copy of `base` (objects merge, everything else replaces). */
export function merge(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(out[k] ?? {}, v) : v;
  }
  return out;
}

const KEY = "3dtools.lamps.project";

export function loadProject() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? sanitize(JSON.parse(stored)) : defaultProject();
  } catch {
    return defaultProject();
  }
}

export function saveProject(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export const encodeShare = (project) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(project));

export function projectFromHash(hash) {
  const m = /^#p=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    return json ? sanitize(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

/** The settings file: the project plus a marker so a stray JSON is rejected. */
export const toSettingsJson = (project) =>
  JSON.stringify({ app: "3dtools-lamps", ...project }, null, 2);

export function fromSettingsJson(text) {
  const raw = JSON.parse(text);
  if (raw?.app !== "3dtools-lamps") throw new Error("Not a Lamps settings file");
  return sanitize(raw);
}

/** Where the build volume is exceeded: "ok", "near" (within 10 mm of a limit) or "over". */
export function fitStatus(size, build) {
  const margin = [build.x - size[0], build.y - size[1], build.z - size[2]];
  if (margin.some((m) => m < 0)) return "over";
  if (margin.some((m) => m < 10)) return "near";
  return "ok";
}
