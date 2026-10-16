// Where each data value came from, so nothing estimated is mistaken for a measurement (TDT-32).
//   maker     the manufacturer's drawings or catalogue
//   shop      a retailer's spec field
//   estimate  no real data: a typical value or a borrowed one
//   user      measured or set by the person using the tool
export const SOURCE_IDS = ["maker", "shop", "estimate", "user"];

/** The data fields that carry a source, with the i18n key that names them. */
export const FIELDS = {
  "plate.w": "dimW",
  "plate.h": "dimH",
  "plate.d": "dimD",
  "plate.r": "dimR",
  "mods.pitch": "pitch",
  "mods.winW": "winW",
  "tapa.boxW": "dimBoxW",
  "tapa.boxH": "dimBoxH",
  "tapa.bump": "tBump",
  "keycap.w": "kW",
  "keycap.l": "kL",
  "keycap.h": "kH",
  "keycap.r": "kR",
};
export const FIELD_PATHS = Object.keys(FIELDS);

/** Sources for values that no preset provides. */
export const defaultSources = () => ({
  "tapa.boxW": "shop", // 71 x 114 mm from retailer listings of the 5x10 bastidor
  "tapa.boxH": "shop",
  "tapa.bump": "estimate",
  "keycap.w": "estimate",
  "keycap.l": "estimate",
  "keycap.h": "estimate",
  "keycap.r": "estimate",
});

/** Plate and module values a preset sets: its own `src`, anything unlisted is an estimate, custom is yours. */
export function presetSources(preset) {
  const own = preset.src ?? {};
  const out = {};
  for (const path of ["plate.w", "plate.h", "plate.d", "plate.r", "mods.pitch", "mods.winW"])
    out[path] = preset.id === "custom" ? "user" : (own[path] ?? "estimate");
  return out;
}

const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

/** `src` for `after`, with every data field whose value changed from `before` marked as the user's. */
export function markEdited(before, after) {
  const src = { ...after.src };
  for (const path of FIELD_PATHS) if (get(before, path) !== get(after, path)) src[path] = "user";
  return src;
}

export const sourceOf = (p, path) => p.src?.[path] ?? "estimate";

/** Fields that matter for what is being built, given the product and plate type. */
function relevantPaths(p) {
  const plate = ["plate.w", "plate.h", "plate.d", "plate.r"];
  const mods =
    p.style === "flat" ? [] : p.window === "single" ? ["mods.pitch", "mods.winW"] : ["mods.pitch"];
  if (p.product === "keycap") return ["keycap.w", "keycap.l", "keycap.h", "keycap.r"];
  if (p.product === "frame") return plate;
  if (p.product === "tapa")
    return ["plate.w", "plate.h", "plate.r", ...mods, "tapa.boxW", "tapa.boxH", "tapa.bump"];
  return [...plate, ...mods];
}

/**
 * Everything the current build rests on that is not backed by real data:
 * [{ key, field?, value?, source }]. Fields the user has set are not listed. The `static.*` items
 * are estimates with no input to edit.
 */
export function unverified(p) {
  const out = [];
  for (const path of relevantPaths(p)) {
    const source = sourceOf(p, path);
    if (source === "maker" || source === "user") continue;
    out.push({ key: path, field: FIELDS[path], value: get(p, path), source });
  }
  const modules = p.groups.flat();
  const each = p.style !== "flat" && p.window === "each";
  if (p.product === "tapa") out.push({ key: "static.snap", source: "estimate" });
  if (modules.includes("tomaRanuras") && p.product !== "keycap" && p.product !== "frame")
    out.push({ key: "static.slots", source: "estimate" });
  if (
    (p.product === "overlay" || p.product === "tapa") &&
    modules.some((m) => ["usb", "rj45", "perilla", "toma", "teclon", "teclonMedio"].includes(m)) &&
    (each || p.style === "flat")
  )
    out.push({ key: "static.moduleWindows", source: "estimate" });
  return out;
}
