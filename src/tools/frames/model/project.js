import { PHOTO_IDS, PHOTO_SIZES } from "./presets.js";
import { PROFILE_IDS } from "../geom/profiles.js";

const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

export function defaultProject() {
  return {
    v: 1,
    photo: { size: "4x6", w: 102, h: 152, landscape: false, overlap: 3 },
    moulding: { profile: "curve", width: 20, height: 12 },
    rabbet: { depth: 4, clearance: 0.4, lip: 2 },
  };
}

/** Clamp every field of a raw project (from storage, a share link or an edit) to a valid one. */
export function sanitize(raw) {
  const d = defaultProject();
  const r = raw ?? {};
  const size = oneOf(r.photo?.size, PHOTO_IDS, d.photo.size);
  const preset = size === "custom" ? null : PHOTO_SIZES[size];
  return {
    v: 1,
    photo: {
      size,
      w: preset ? preset.w : num(r.photo?.w, 10, 600, d.photo.w),
      h: preset ? preset.h : num(r.photo?.h, 10, 600, d.photo.h),
      landscape: !!r.photo?.landscape,
      overlap: num(r.photo?.overlap, 1, 15, d.photo.overlap),
    },
    moulding: {
      profile: oneOf(r.moulding?.profile, PROFILE_IDS, d.moulding.profile),
      width: num(r.moulding?.width, 5, 80, d.moulding.width),
      height: num(r.moulding?.height, 4, 60, d.moulding.height),
    },
    rabbet: {
      depth: num(r.rabbet?.depth, 1, 30, d.rabbet.depth),
      clearance: num(r.rabbet?.clearance, 0, 2, d.rabbet.clearance),
      lip: num(r.rabbet?.lip, 0.8, 6, d.rabbet.lip),
    },
  };
}

const KEY = "3dtools.frames.project";

export function loadProject() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaultProject();
  }
}

export function saveProject(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
