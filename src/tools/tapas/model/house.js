// "Mi casa": several covers in one project, each with a name and a quantity.
import LZString from "lz-string";
import { defaultProject, sanitize } from "./project.js";

const KEY = "3dtools.tapas.house";
const OLD_KEY = "3dtools.tapas.project";

export const newId = () => Math.random().toString(36).slice(2, 8);

export const newItem = (project = defaultProject(), name = "Cubretapa 1", qty = 1) => ({
  id: newId(),
  name,
  qty,
  project: sanitize(project),
});

function cleanItem(raw) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 12) : newId(),
    name: String(raw?.name ?? "Cubretapa").slice(0, 40),
    qty: Math.min(99, Math.max(1, Math.round(Number(raw?.qty)) || 1)),
    project: sanitize(raw?.project),
  };
}

/** Clamp a stored or shared house; always returns at least one item and a valid active id. */
export function sanitizeHouse(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 40).map(cleanItem);
  if (!items.length) items.push(newItem());
  const ids = new Set();
  for (const it of items) {
    while (ids.has(it.id)) it.id = newId();
    ids.add(it.id);
  }
  return { items, active: ids.has(raw?.active) ? raw.active : items[0].id };
}

export function loadHouse() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return sanitizeHouse(JSON.parse(stored));
    const old = localStorage.getItem(OLD_KEY); // single-cover save from before projects existed
    if (old) return sanitizeHouse({ items: [{ name: "Cubretapa 1", project: JSON.parse(old) }] });
  } catch {}
  return sanitizeHouse(null);
}

export function saveHouse(house) {
  try {
    localStorage.setItem(KEY, JSON.stringify(house));
  } catch {}
}

export const encodeHouse = (house) =>
  LZString.compressToEncodedURIComponent(
    JSON.stringify({
      items: house.items.map(({ name, qty, project }) => ({ name, qty, project })),
      active: house.items.findIndex((i) => i.id === house.active),
    }),
  );

/** `#h=` payload -> sanitized house, or null. */
export function houseFromHash(hash) {
  const m = /^#h=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const json = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1]));
    const house = sanitizeHouse({ items: json.items });
    house.active = house.items[Math.min(Math.max(0, json.active | 0), house.items.length - 1)].id;
    return house;
  } catch {
    return null;
  }
}
