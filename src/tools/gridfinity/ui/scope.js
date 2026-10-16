// ALL BINS / THIS BIN scoping for the Bins and Labels tabs.
import { defaultBinDefaults } from "../model/defaults.js";
import { effectiveBin } from "../model/effective.js";

/** Current value of a bin parameter. `path` is "units" or ["grab", "front", "notch"]. */
export function getValue(project, bin, path) {
  const eff = bin ? effectiveBin(project, bin) : project.binDefaults;
  return [].concat(path).reduce((o, k) => o[k], eff);
}

/** Write `value` to binDefaults (no bin) or to the bin's overrides. Call inside projects.update. */
export function setValue(draft, binId, path, value) {
  const keys = [].concat(path);
  let target = binId ? draft.bins.find((b) => b.id === binId) : draft;
  if (!target) return;
  target = binId ? (target.overrides ??= {}) : target.binDefaults;
  for (const k of keys.slice(0, -1)) target = target[k] ??= {};
  target[keys.at(-1)] = value;
}

/** True when this bin sets its own value for `path`. */
export function isOverridden(bin, path) {
  if (!bin?.overrides) return false;
  const v = [].concat(path).reduce((o, k) => o?.[k], bin.overrides);
  return v !== undefined;
}

/** Number of bins that set their own value for `path`. */
export const countOverrides = (project, path) =>
  project.bins.filter((b) => isOverridden(b, path)).length;

/** Remove one override so the bin follows ALL BINS again. */
export function resetValue(draft, binId, path) {
  const bin = draft.bins.find((b) => b.id === binId);
  if (!bin?.overrides) return;
  const keys = [].concat(path);
  let o = bin.overrides;
  for (const k of keys.slice(0, -1)) {
    o = o[k];
    if (!o) return;
  }
  delete o[keys.at(-1)];
}

/** Clear every override on every bin for `path` (clicking the "n differ" marker). */
export function resetAll(draft, path) {
  for (const b of draft.bins) resetValue(draft, b.id, path);
}

export const binDefaultsReference = defaultBinDefaults;
