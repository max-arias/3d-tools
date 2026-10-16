import LZString from "lz-string";
import { defaultProject } from "./defaults.js";
import { sanitize } from "./sanitize.js";

export const STORAGE_KEY = "3dtools.gridfinity.project";
export const BACKUP_KEY = "3dtools.gridfinity.project.backup";

// ---- localStorage ---------------------------------------------------------

/** Returns { project, lost }. `lost` is true when stored data was unreadable (a backup copy is kept). */
export function loadStored(storage = localStorage) {
  let text = null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { project: null, lost: false };
  }
  if (text == null) return { project: null, lost: false };
  try {
    return { project: sanitize(JSON.parse(text)), lost: false };
  } catch {
    try {
      storage.setItem(BACKUP_KEY, text);
    } catch {}
    return { project: null, lost: true };
  }
}

export function saveStored(project, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {}
}

// ---- share links (same `#p=` format as Fitforge, so its links open here) ----

function isPlain(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/** Keys of `value` that differ from `base`. Arrays are kept whole. */
export function diff(value, base) {
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (isPlain(v) && isPlain(base?.[key])) {
      const d = diff(v, base[key]);
      if (Object.keys(d).length) out[key] = d;
    } else if (JSON.stringify(v) !== JSON.stringify(base?.[key])) {
      out[key] = v;
    }
  }
  return out;
}

export function encodeShare(project) {
  const { v: _v, ...rest } = diff(project, defaultProject());
  return LZString.compressToEncodedURIComponent(JSON.stringify(rest));
}

/** Decode a share payload (the part after `p=`). Returns a project, or null when unreadable. */
export function decodeShare(payload) {
  try {
    const json = LZString.decompressFromEncodedURIComponent(payload);
    if (!json) return null;
    return sanitize(mergeDeep(defaultProject(), JSON.parse(json)));
  } catch {
    return null;
  }
}

function mergeDeep(target, src) {
  if (!isPlain(src)) return target;
  for (const [key, v] of Object.entries(src)) {
    target[key] = isPlain(v) && isPlain(target[key]) ? mergeDeep(target[key], v) : v;
  }
  return target;
}

export const shareUrl = (project, base) => `${base}#p=${encodeShare(project)}`;

/** Parse `location.hash`; returns a project or null. */
export function projectFromHash(hash) {
  const m = /^#p=(.+)$/.exec(hash);
  return m ? decodeShare(m[1]) : null;
}

// ---- project file -----------------------------------------------------------

export const exportJson = (project) => JSON.stringify(project, null, 2);

/** Throws on invalid JSON. */
export const importJson = (text) => sanitize(mergeDeep(defaultProject(), JSON.parse(text)));
