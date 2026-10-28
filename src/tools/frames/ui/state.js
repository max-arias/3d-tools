import { sampleSource } from "./room.js";
import { createStore } from "../../../shell/store.js";
import { run } from "../lib/client.js";
import {
  galleryFromHash,
  loadGallery,
  newItem,
  saveGallery,
  sanitizeGallery,
} from "../model/gallery.js";
import { projectFromHash, sanitize } from "../model/project.js";

// A shared `#h=` link replaces the gallery; a shared `#p=` frame is added as a new item.
function boot() {
  const shared = galleryFromHash(location.hash);
  if (shared) return shared;
  const gallery = loadGallery();
  const single = projectFromHash(location.hash);
  if (single) {
    const item = newItem(single, "Shared frame");
    gallery.items.push(item);
    gallery.active = item.id;
  }
  return gallery;
}

const start = boot();
export const gallery = createStore(start);
export const project = createStore(start.items.find((i) => i.id === start.active).project);
export const result = createStore({ status: "loading", part: null, error: null });
export const view = createStore({ unit: "mm", mode: "assembled", photoUrl: null });
/** The picture, as a grey grid for the lithophane. Not saved with the project. */
export const picture = createStore({ src: null, name: "" });

/** Apply an edit function to a copy of the project; the result is clamped by `sanitize`. */
export function update(fn) {
  const next = structuredClone(project.get());
  fn(next);
  project.set(sanitize(next));
}

const activeItem = () => gallery.get().items.find((i) => i.id === gallery.get().active);

function syncActive() {
  const { items, active } = gallery.get();
  gallery.set({
    items: items.map((i) => (i.id === active ? { ...i, project: project.get() } : i)),
  });
}

export function selectItem(id) {
  syncActive();
  const item = gallery.get().items.find((i) => i.id === id);
  if (!item) return;
  gallery.set({ active: id });
  project.set(structuredClone(item.project));
}

/** Add a frame. `copyCurrent` duplicates the open one; otherwise it starts from defaults. */
export function addItem(copyCurrent) {
  syncActive();
  const name = copyCurrent ? `${activeItem().name} (2)` : `Frame ${gallery.get().items.length + 1}`;
  const item = newItem(copyCurrent ? structuredClone(project.get()) : undefined, name.slice(0, 40));
  gallery.set({ items: [...gallery.get().items, item], active: item.id });
  project.set(structuredClone(item.project));
}

export function removeItem(id) {
  const { items, active } = gallery.get();
  if (items.length < 2) return;
  const rest = items.filter((i) => i.id !== id);
  gallery.set({ items: rest, active: id === active ? rest[0].id : active });
  if (id === active) project.set(structuredClone(rest[0].project));
}

export function patchItem(id, patch) {
  gallery.set({ items: gallery.get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export const setGallery = (raw) => {
  const next = sanitizeGallery(raw);
  gallery.set(next);
  project.set(structuredClone(next.items.find((i) => i.id === next.active).project));
};

/** Resample the stored picture to the lithophane grid for a photo of w x h mm (about 0.4 mm/px). */
export function lithoGrid(src, w, h) {
  const px = Math.max(0.4, Math.max(w, h) / 300);
  const cols = Math.max(8, Math.round(w / px));
  const rows = Math.max(8, Math.round(h / px));
  const data = new Uint8Array(cols * rows);
  // Cover-crop the picture to the photo's aspect ratio.
  const want = cols / rows;
  const have = src.w / src.h;
  const cw = have > want ? src.h * want : src.w;
  const ch = have > want ? src.h : src.w / want;
  const ox = (src.w - cw) / 2;
  const oy = (src.h - ch) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const sx = Math.min(src.w - 1, Math.floor(ox + ((c + 0.5) / cols) * cw));
      const sy = Math.min(src.h - 1, Math.floor(oy + ((r + 0.5) / rows) * ch));
      data[r * cols + c] = src.gray[sy * src.w + sx];
    }
  return { cols, rows, data };
}

/** Read an image file: keeps a grey copy for the lithophane and a URL for the preview. */
export async function loadPicture(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  const old = view.get().photoUrl;
  if (old) URL.revokeObjectURL(old);
  view.set({ photoUrl: URL.createObjectURL(file) });
  picture.set({ src: { w, h, gray }, name: file.name });
}

export function clearPicture() {
  const old = view.get().photoUrl;
  if (old) URL.revokeObjectURL(old);
  view.set({ photoUrl: null });
  picture.set({ src: null, name: "" });
}

let seq = 0;
let timer;
function generate() {
  const mine = ++seq;
  const p = project.get();
  result.set({ status: "loading" });
  let extra;
  const src = picture.get().src ?? (p.litho.on ? sampleSource() : null);
  if (p.litho.on && src) {
    const w = p.photo.landscape ? p.photo.h : p.photo.w;
    const h = p.photo.landscape ? p.photo.w : p.photo.h;
    extra = { litho: lithoGrid(src, w, h) };
  }
  run("generate", p, extra).then(
    (part) => mine === seq && result.set({ status: "ok", part, error: null }),
    (error) => mine === seq && result.set({ status: "error", error: error.message }),
  );
}

export function startApp() {
  history.replaceState(null, "", location.pathname + location.search); // the share hash is consumed
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(generate, 150);
  };
  project.subscribe(() => {
    syncActive();
    queue();
  });
  picture.subscribe(() => project.get().litho.on && queue());
  gallery.subscribe((g) => saveGallery({ items: g.items, active: g.active }));
  saveGallery(gallery.get());
  generate();
}
