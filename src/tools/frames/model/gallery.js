// Gallery: several frames in one project, each with a name and a quantity.
import LZString from "lz-string";
import { defaultProject, sanitize } from "./project.js";

const KEY = "3dtools.frames.gallery";

export const newId = () => Math.random().toString(36).slice(2, 8);

export const newItem = (project = defaultProject(), name = "Frame 1", qty = 1) => ({
  id: newId(),
  name,
  qty,
  project: sanitize(project),
});

function cleanItem(raw) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id.slice(0, 12) : newId(),
    name: String(raw?.name ?? "Frame").slice(0, 40),
    qty: Math.min(99, Math.max(1, Math.round(Number(raw?.qty)) || 1)),
    project: sanitize(raw?.project),
  };
}

/** Clamp a stored or shared gallery; always returns at least one item and a valid active id. */
export function sanitizeGallery(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 40).map(cleanItem);
  if (!items.length) items.push(newItem());
  const ids = new Set();
  for (const it of items) {
    while (ids.has(it.id)) it.id = newId();
    ids.add(it.id);
  }
  return { items, active: ids.has(raw?.active) ? raw.active : items[0].id };
}

export function loadGallery() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return sanitizeGallery(JSON.parse(stored));
  } catch {}
  return sanitizeGallery(null);
}

export function saveGallery(gallery) {
  try {
    localStorage.setItem(KEY, JSON.stringify(gallery));
  } catch {}
}

export const encodeGallery = (gallery) =>
  LZString.compressToEncodedURIComponent(
    JSON.stringify({
      items: gallery.items.map(({ name, qty, project }) => ({ name, qty, project })),
      active: gallery.items.findIndex((i) => i.id === gallery.active),
    }),
  );

/** `#h=` payload -> sanitized gallery, or null. */
export function galleryFromHash(hash) {
  const m = /^#h=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const json = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1]));
    const gallery = sanitizeGallery({ items: json.items });
    gallery.active = gallery.items[Math.min(Math.max(0, json.active | 0), gallery.items.length - 1)].id;
    return gallery;
  } catch {
    return null;
  }
}
