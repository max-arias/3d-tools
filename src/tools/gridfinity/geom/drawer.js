import { computeGrid } from "../layout/grid.js";
import { planTiles } from "../layout/split.js";
import { jointPositions } from "../layout/joints.js";
import { ribSegments } from "../layout/ribs.js";
import { layoutWarnings } from "../layout/warnings.js";
import { floorHeight } from "../constants.js";
import { buildTile, tileSpec } from "./baseplate.js";
import { makeClip, makeKey } from "./keys.js";
import { isValid } from "../layout/bins.js";
import { planBinSegments } from "../layout/binsplit.js";
import { effectiveBin, binHeight } from "../model/effective.js";
import { GF } from "../constants.js";
import { buildBinSegment } from "./bin.js";

const SPARES = 2;

/**
 * Build every printable part of a drawer project.
 * `wasm` is the initialised manifold-3d module. Returns { parts, grid, warnings, tiles }.
 * Throws on layout errors (drawer too small, nothing fits the bed, floor too thin).
 */
export function generateDrawer(kitFactory, project, { font = null, cache = new Map() } = {}) {
  const grid = computeGrid(project);
  const plan = planTiles(grid, project.printer);
  const bp = project.baseplate;
  const floor = floorHeight(bp);
  const every = bp.keys ? bp.keyEvery : bp.clips ? bp.clipEvery : 0;
  const joints = every ? jointPositions(plan.xs, plan.ys, every) : [];
  const ribs = bp.halfSockets === "ribs" ? ribSegments(project.bins) : [];
  const tol = project.drawer.tol;
  const parts = [];
  const warnings = layoutWarnings(project, grid);

  let labels = [];
  let seamMagnets = 0;
  let noOpenings = [];
  const kit = kitFactory();
  try {
    for (const tile of plan.tiles) {
      const spec = tileSpec(project, grid, plan, tile, joints, ribs);
      const m = buildTile(kit, project, grid, spec);
      const out = kit.export(m);
      parts.push({
        name: tile.name,
        kind: "tile",
        ...out,
        place: [tol + spec.originX + out.min[0], tol + spec.originY + out.min[1], out.min[2]],
      });
    }

    if (joints.length) {
      const keyKind = bp.keys ? "hkey" : "clip";
      const meshes = {};
      const make = (turn) => {
        if (meshes[turn]) return meshes[turn];
        const base = bp.keys
          ? makeKey(kit, { floor, clearance: project.joint.clearance, taper: project.joint.taper })
          : kit.move(makeClip(kit, project.joint.clearance), 0, 0, floor);
        const m = turn ? kit.rotZ(base, 90) : base;
        return (meshes[turn] = { out: kit.export(m) });
      };
      const gx = (cells) => tol + grid.x.padStart + cells * grid.pitchX;
      const gy = (cells) => tol + grid.y.padStart + cells * grid.pitchY;
      joints.forEach((j, i) => {
        const { out } = make(j.axis === "y" ? 90 : 0);
        const cx = j.axis === "x" ? gx(j.seam) : gx(j.along);
        const cy = j.axis === "x" ? gy(j.along) : gy(j.seam);
        parts.push({
          name: `${keyKind}_${i + 1}`,
          kind: "key",
          ...out,
          place: [cx + out.min[0], cy + out.min[1], out.min[2]],
        });
      });
      const { out } = make(0);
      for (let s = 1; s <= SPARES; s++) {
        parts.push({
          name: `${keyKind}_spare${s}`,
          kind: "key",
          spare: true,
          ...out,
          place: [0, 0, 0],
        });
      }
    }
    const bins = buildBins(kit, project, grid, floor, font, cache, parts, warnings);
    labels = bins.labels;
    seamMagnets = bins.seamMagnets;
    noOpenings = bins.noOpenings;
  } finally {
    kit.free();
  }

  for (const p of parts) if (!p.valid) warnings.push(`${p.name} is not a valid solid`);
  return {
    parts,
    grid,
    warnings,
    tiles: plan.tiles,
    joints: joints.length,
    labels,
    seamMagnets,
    noOpenings,
  };
}

const fmtCells = (n) => String(n);

function buildBins(kit, project, grid, floor, font, cache, parts, warnings) {
  const tol = project.drawer.tol;
  const labels = [];
  const noOpenings = [];
  let seamMagnets = 0;
  const keyCache = new Map();
  let keyCount = 0;
  let sparesDone = false;

  for (const bin of project.bins) {
    if (!isValid(grid, [], bin)) continue;
    const eff = effectiveBin(project, bin);
    const height = binHeight(eff) + (eff.lip ? GF.lipH : 0);
    if (height > project.printer.z) {
      throw new Error(
        `Bin ${bin.w}×${bin.d} is ${+height.toFixed(1)} mm tall, taller than the ${project.printer.z} mm printer Z`,
      );
    }
    const plan = planBinSegments(grid, project.printer, bin, eff);
    const baseName = `bin_${fmtCells(bin.w)}x${fmtCells(bin.d)}`;
    const originX = tol + grid.x.padStart + bin.x * grid.pitchX;
    const originY = tol + grid.y.padStart + bin.y * grid.pitchY;

    plan.segments.forEach((seg, i) => {
      const labelsOut = [];
      const key = JSON.stringify({
        w: bin.w,
        d: bin.d,
        fx: bin.x % 1,
        fy: bin.y % 1,
        px: grid.pitchX,
        py: grid.pitchY,
        eff,
        seg,
        labels: bin.labels ?? null,
        ls: project.labelStyle,
        mg: project.magnet,
        font: !!font,
      });
      let built = cache.get(key);
      if (!built) {
        const res = buildBinSegment(kit, { project, grid, bin, eff, seg, font, labels: labelsOut });
        built = {
          main: kit.export(res.main),
          inlay: res.inlay ? kit.export(res.inlay) : null,
          keys: res.keys,
          magnets: res.magnets,
          noOpenings: res.noOpenings,
          labels: labelsOut,
        };
        cache.set(key, built);
        if (cache.size > 400) cache.delete(cache.keys().next().value);
      }
      const segSuffix = plan.segments.length > 1 ? `_seg${i + 1}` : "";
      // `name` is unique per part; `base` is what identical parts are grouped and listed under.
      const base = `${baseName}${segSuffix}`;
      const name = `${baseName}_${bin.id}${segSuffix}`;
      const out = built.main;
      parts.push({
        name,
        base,
        kind: "bin",
        binId: bin.id,
        ...out,
        place: [originX + out.min[0], originY + out.min[1], floor + out.min[2]],
      });
      if (built.inlay) {
        parts.push({
          name: `${name}_text`,
          base: `${base}_text`,
          kind: "bin",
          binId: bin.id,
          inlay: true,
          ...built.inlay,
          place: [
            originX + built.inlay.min[0],
            originY + built.inlay.min[1],
            floor + built.inlay.min[2],
          ],
        });
      }
      for (const k of built.keys) {
        const mk = `${k.axis}:${k.height.toFixed(3)}`;
        if (!keyCache.has(mk)) {
          const base = makeKey(kit, {
            floor: k.height + 0.8,
            clearance: project.joint.clearance,
            taper: project.joint.taper,
          });
          keyCache.set(mk, kit.export(k.axis === "y" ? kit.rotZ(base, 90) : base));
        }
        const ko = keyCache.get(mk);
        parts.push({
          name: `binkey_${++keyCount}`,
          kind: "key",
          binKey: true,
          ...ko,
          place: [originX + k.x + ko.min[0], originY + k.y + ko.min[1], floor + k.z + ko.min[2]],
        });
      }
      seamMagnets += built.magnets;
      if (built.noOpenings && !noOpenings.includes(bin.id)) noOpenings.push(bin.id);
      labels.push(...built.labels);
    });
  }

  if (keyCount > 0 && !sparesDone) {
    const sample = parts.find((p) => p.binKey);
    for (let s = 1; s <= 2; s++) {
      parts.push({ ...sample, name: `binkey_spare${s}`, spare: true, place: [0, 0, 0] });
    }
    sparesDone = true;
  }
  if (!font && project.bins.some((b) => (b.labels ?? []).some(Boolean))) {
    warnings.push("Label font not loaded: label text is left out");
  }
  return { labels, seamMagnets, noOpenings };
}
