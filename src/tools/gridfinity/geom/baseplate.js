import {
  BASE_SOCKET,
  RIB,
  SKEL_INSET,
  SOCKET_H,
  TAPE,
  effectiveStyle,
  floorHeight,
  magnetOffset,
} from "../constants.js";
import { clipSeat, keySlot } from "./keys.js";

const TOP_PAD = 1;

/**
 * Local description of one tile: size, cell centres, and the joints / ribs that touch it.
 * All coordinates are mm from the tile's min corner.
 */
export function tileSpec(project, grid, plan, tile, joints, ribs) {
  const { pitchX: px, pitchY: py } = grid;
  const first = { x: tile.ix === 0, y: tile.iy === 0 };
  const last = { x: tile.ix === plan.xs.length - 1, y: tile.iy === plan.ys.length - 1 };
  const padL = first.x ? grid.x.padStart : 0;
  const padB = first.y ? grid.y.padStart : 0;
  const lenX = padL + tile.cols * px + (last.x ? grid.x.padEnd : 0);
  const lenY = padB + tile.rows * py + (last.y ? grid.y.padEnd : 0);
  // Tile origin inside the drawer (tol is added by the caller).
  const originX = first.x ? 0 : grid.x.padStart + tile.col * px;
  const originY = first.y ? 0 : grid.y.padStart + tile.row * py;
  const localX = (cells) => padL + (cells - tile.col) * px;
  const localY = (cells) => padB + (cells - tile.row) * py;

  const seams = [];
  for (const j of joints) {
    const side = j.tiles.findIndex(([ix, iy]) => ix === tile.ix && iy === tile.iy);
    if (side < 0) continue;
    seams.push(
      j.axis === "x"
        ? { axis: "x", x: localX(j.seam), y: localY(j.along) }
        : { axis: "y", x: localX(j.along), y: localY(j.seam) },
    );
  }

  const inTile = (r) => {
    if (r.axis === "v") {
      return (
        r.line > tile.col &&
        r.line < tile.col + tile.cols &&
        r.cell >= tile.row &&
        r.cell < tile.row + tile.rows
      );
    }
    return (
      r.line > tile.row &&
      r.line < tile.row + tile.rows &&
      r.cell >= tile.col &&
      r.cell < tile.col + tile.cols
    );
  };
  const tileRibs = ribs
    .filter(inTile)
    .map((r) =>
      r.axis === "v"
        ? { x0: localX(r.line), x1: localX(r.line), y0: localY(r.from), y1: localY(r.to) }
        : { x0: localX(r.from), x1: localX(r.to), y0: localY(r.line), y1: localY(r.line) },
    );

  return {
    px,
    py,
    cols: tile.cols,
    rows: tile.rows,
    lenX,
    lenY,
    padL,
    padB,
    originX,
    originY,
    seams,
    ribs: tileRibs,
  };
}

function drawerOutline(project) {
  const w = project.drawer.w - 2 * project.drawer.tol;
  const d = project.drawer.d - 2 * project.drawer.tol;
  return { w, d, r: Math.max(project.drawer.cornerR - project.drawer.tol, 0) };
}

/** One baseplate tile as a manifold (local coordinates, min corner at the origin). */
export function buildTile(kit, project, grid, spec) {
  const bp = project.baseplate;
  const style = effectiveStyle(bp);
  const h = floorHeight(bp);
  const { px, py } = spec;
  const mag = project.magnet;
  const H = h + SOCKET_H;

  if (bp.magnets && h - mag.depth < 0.4) {
    throw new Error(
      `Magnet holes ${mag.depth} mm deep need a floor of at least ${+(mag.depth + 0.4).toFixed(1)} mm`,
    );
  }
  if (bp.keys && h < 2.1) throw new Error("H-keys need a floor of at least 2.1 mm");

  // --- block, trimmed to the drawer outline when corners or chamfer apply ---
  let block = kit.box(0, spec.lenX, 0, spec.lenY, 0, H);
  const out = drawerOutline(project);
  if (out.r > 0 || bp.chamfer > 0) {
    const c = bp.chamfer;
    const full = kit.rrect(out.w, out.d, out.r);
    let shape;
    if (c > 0) {
      const small = kit.rrect(out.w - 2 * c, out.d - 2 * c, Math.max(out.r - c, 0));
      shape = kit.hull(kit.ext(small, -1, 0), kit.ext(full, c, H + 1));
    } else {
      shape = kit.ext(full, -1, H + 1);
    }
    const placed = kit.move(shape, out.w / 2 - spec.originX, out.d / 2 - spec.originY, 0);
    block = kit.inter(block, placed);
  }

  // --- socket cutter, built once, placed at every cell ---
  const cut = [kit.move(kit.loft(BASE_SOCKET, px, py, h > 0 ? 0 : 1, 1), 0, 0, h)];
  if (bp.peaks) {
    const sharp = kit.hull(
      kit.ext(kit.rrect(px - 4.3, py - 4.3, 0), h + 2.5, h + 2.501),
      kit.ext(kit.rrect(px, py, 0), h + SOCKET_H - 0.001, h + SOCKET_H),
    );
    cut.push(
      sharp,
      kit.box(-px / 2, px / 2, -py / 2, py / 2, h + SOCKET_H - 0.001, h + SOCKET_H + TOP_PAD),
    );
  }
  if (style !== "weighted" && h > 0) {
    let hole =
      style === "thin"
        ? kit.rrect(px - 5.7, py - 5.7, 1.15)
        : kit.rrect(px - SKEL_INSET * 2, py - SKEL_INSET * 2, 3);
    if (bp.magnets) {
      const mo = magnetOffset(px);
      const R = mag.d / 2 + 1.6;
      const pads = [];
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const cx = sx * mo;
          const cy = sy * mo;
          pads.push(
            kit.circle(R, cx, cy),
            kit.rect(Math.min(cx, sx * px), Math.max(cx, sx * px), cy - R, cy + R),
            kit.rect(cx - R, cx + R, Math.min(cy, sy * py), Math.max(cy, sy * py)),
          );
        }
      hole = kit.csSub(hole, ...pads);
    }
    cut.push(kit.ext(hole, -1, h + 0.001));
  }
  if (bp.magnets) {
    const mo = magnetOffset(px);
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        cut.push(kit.cyl(mag.d / 2, mag.depth + 0.001, sx * mo, sy * mo, h - mag.depth));
      }
  }
  const cutter = kit.union(cut);
  const cutters = [];
  for (let i = 0; i < spec.cols; i++) {
    for (let j = 0; j < spec.rows; j++) {
      cutters.push(kit.move(cutter, spec.padL + (i + 0.5) * px, spec.padB + (j + 0.5) * py, 0));
    }
  }
  let tile = kit.sub(block, kit.union(cutters));

  // --- half-socket ribs ---
  if (spec.ribs.length) {
    const ribs = spec.ribs.map((r) =>
      kit.box(
        r.x0 - (r.x0 === r.x1 ? RIB.w / 2 : 0),
        r.x1 + (r.x0 === r.x1 ? RIB.w / 2 : 0),
        r.y0 - (r.y0 === r.y1 ? RIB.w / 2 : 0),
        r.y1 + (r.y0 === r.y1 ? RIB.w / 2 : 0),
        h - 0.001,
        h + RIB.h,
      ),
    );
    tile = kit.union(tile, ...ribs);
  }

  // --- cuts made last: tape recesses, clip seats, key slots ---
  const late = [];
  if (bp.tape) {
    for (let i = 1; i < spec.cols; i++) {
      for (let j = 0; j < spec.rows; j++) {
        late.push(
          kit.box(
            spec.padL + i * px - TAPE.w / 2,
            spec.padL + i * px + TAPE.w / 2,
            spec.padB + (j + 0.5) * py - TAPE.l / 2,
            spec.padB + (j + 0.5) * py + TAPE.l / 2,
            -1,
            TAPE.d,
          ),
        );
      }
    }
    for (let j = 1; j < spec.rows; j++) {
      for (let i = 0; i < spec.cols; i++) {
        late.push(
          kit.box(
            spec.padL + (i + 0.5) * px - TAPE.l / 2,
            spec.padL + (i + 0.5) * px + TAPE.l / 2,
            spec.padB + j * py - TAPE.w / 2,
            spec.padB + j * py + TAPE.w / 2,
            -1,
            TAPE.d,
          ),
        );
      }
    }
  }
  if (spec.seams.length) {
    const useKeys = bp.keys;
    const useClips = bp.clips && !bp.keys;
    const seat = useClips ? clipSeat(kit) : null;
    const slot = useKeys ? keySlot(kit, h) : null;
    for (const s of spec.seams) {
      const turn = s.axis === "y" ? 90 : 0;
      if (seat) late.push(kit.move(turn ? kit.rotZ(seat, turn) : seat, s.x, s.y, h));
      if (slot) late.push(kit.move(turn ? kit.rotZ(slot, turn) : slot, s.x, s.y, 0));
    }
  }
  if (late.length) tile = kit.sub(tile, ...late);
  return tile;
}
