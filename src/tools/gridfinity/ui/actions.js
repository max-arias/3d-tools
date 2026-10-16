// Bin editing actions shared by the top view, its bin bar and the keyboard shortcuts.
import { projects, ui, setUi, getLayout, notify } from "./state.js";
import { duplicateSpot, fillEmpty, isValid, moveRect, nextId, resizeRect } from "../layout/bins.js";
import { effectiveBin } from "../model/effective.js";
import { labelOrder } from "../layout/labels.js";

const step = () => (projects.get().grid.halfCells ? 0.5 : 1);
const findBin = (id) => projects.get().bins.find((b) => b.id === id);

export function addBin(rect) {
  const id = nextId(projects.get().bins);
  projects.update((p) => p.bins.push({ id, ...rect }));
  setUi({ selected: id });
}

/** One step taller: +1 unit, or +5 mm in custom-fit mode. */
export function taller(id, dir = 1) {
  const project = projects.get();
  const bin = findBin(id);
  if (!bin) return;
  const eff = effectiveBin(project, bin);
  projects.update((p) => {
    const b = p.bins.find((x) => x.id === id);
    b.overrides ??= {};
    if (project.grid.mode === "custom" && eff.heightMm) {
      b.overrides.heightMm = Math.min(500, Math.max(10, eff.heightMm + 5 * dir));
    } else {
      b.overrides.units = Math.min(60, Math.max(2, eff.units + dir));
    }
  }, `height:${id}`);
}

export function duplicate(id) {
  const bin = findBin(id);
  const layout = getLayout();
  if (!bin || !layout.grid) return;
  const spot = duplicateSpot(layout.grid, projects.get().bins, bin);
  if (!spot) return notify(`No free ${bin.w}×${bin.d} space for a copy`);
  const copy = nextId(projects.get().bins);
  projects.update((p) => {
    p.bins.push({ ...structuredClone(p.bins.find((b) => b.id === id)), id: copy, ...spot });
  });
  setUi({ selected: copy });
}

export function remove(id) {
  projects.update((p) => {
    p.bins = p.bins.filter((b) => b.id !== id);
  });
  setUi({ selected: null });
}

export function removeAll() {
  projects.update((p) => {
    p.bins = [];
  });
  setUi({ selected: null });
}

export function fill() {
  const layout = getLayout();
  if (!layout.grid) return;
  const rects = fillEmpty(layout.grid, projects.get().bins);
  if (!rects.length) return;
  projects.update((p) => {
    for (const r of rects) p.bins.push({ id: nextId(p.bins), ...r });
  });
}

/** Move the bin by whole steps (dx, dy in steps); ignored when it would leave the grid or overlap. */
export function nudge(id, dx, dy) {
  const bin = findBin(id);
  const layout = getLayout();
  if (!bin || !layout.grid) return;
  const s = step();
  const rect = moveRect(bin, dx * s, dy * s, s, layout.grid);
  if (isValid(layout.grid, projects.get().bins, rect, id)) {
    projects.update(
      (p) =>
        Object.assign(
          p.bins.find((b) => b.id === id),
          rect,
        ),
      `bin:${id}:move`,
    );
  }
}

/** Grow or shrink the bin's right/back edge by whole steps. */
export function resizeBy(id, dw, dd) {
  const bin = findBin(id);
  const layout = getLayout();
  if (!bin || !layout.grid) return;
  const s = step();
  const rect = {
    x: bin.x,
    y: bin.y,
    w: Math.max(s, bin.w + dw * s),
    d: Math.max(s, bin.d + dd * s),
  };
  if (isValid(layout.grid, projects.get().bins, rect, id)) {
    projects.update(
      (p) =>
        Object.assign(
          p.bins.find((b) => b.id === id),
          rect,
        ),
      `bin:${id}:resize`,
    );
  }
}

/** Select the next or previous bin, ordered back to front then left to right. */
export function selectNeighbour(dir) {
  const bins = labelOrder(projects.get().bins);
  if (!bins.length) return;
  const i = bins.findIndex((b) => b.id === ui.get().selected);
  const next = bins[(i + dir + bins.length) % bins.length];
  setUi({ selected: next.id });
}

export { resizeRect };
