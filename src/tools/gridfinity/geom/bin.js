import { BIN_FOOT, BIN_R, FOOT_H, GF, KEY, LIP, magnetOffset } from "../constants.js";
import { binHeight } from "../model/effective.js";
import { labelSlotCount, slotRanges, tabDepth, textBox } from "../layout/labels.js";
import { fitText, layoutText } from "./text.js";
import { KEY_LENGTH, keySlot } from "./keys.js";
import { RAIL, hidesLabelTab, hingeSpec, slidingLevels } from "../layout/lids.js";

const SEAM_GAP = 0.1;
const LAP_LEN = 5;
const DIVIDER_MIN = 0.8;
const BIG = 1e3;
const WALLS = ["front", "back", "left", "right"];

const OPENING_MIN_H = { slots: 10, honeycomb: 12 };
const OPENING_CLEAR = {
  floor: 5,
  scoop: 3,
  lip: 2,
  top: 4,
  lower: 4,
  tab: 2,
  side: 3,
  corner: 7.75,
};
const HEX_R = 6;
const HEX_WEB = 2.4;

/**
 * Rectangular regions of one wall where openings may go: [{ u0, u1, z0, z1 }].
 * `blocked` are [lo, hi] intervals already widened by their clearance; `tabs` is { ranges, bottom } or null.
 */
function openingRegions({ len, top, lip, floorTop, scoopTop, lowerTop, blocked, tabs }) {
  const c = OPENING_CLEAR;
  const z0 = Math.max(floorTop + c.floor, scoopTop === null ? -Infinity : scoopTop + c.scoop);
  let zTop = top - (lip ? c.lip : c.top);
  if (lowerTop !== null) zTop = Math.min(zTop, lowerTop - c.lower);
  const hard = [[-Infinity, c.corner], [len - c.corner, Infinity], ...blocked].sort(
    (x, y) => x[0] - y[0],
  );
  const free = [];
  let reach = -Infinity;
  for (const [lo, hi] of hard) {
    if (lo > reach) free.push([reach, lo]);
    reach = Math.max(reach, hi);
  }
  const tabRanges = (tabs?.ranges ?? []).map(([lo, hi]) => [lo - c.side, hi + c.side]);
  const zUnderTab = tabs ? Math.min(zTop, tabs.bottom - c.tab) : zTop;
  const out = [];
  for (const [lo, hi] of free) {
    const cuts = [lo, hi, ...tabRanges.flat().filter((v) => v > lo && v < hi)].sort(
      (x, y) => x - y,
    );
    for (let i = 0; i + 1 < cuts.length; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2;
      const z1 = tabRanges.some(([l, h]) => mid > l && mid < h) ? zUnderTab : zTop;
      if (z1 > z0 && cuts[i + 1] > cuts[i]) out.push({ u0: cuts[i], u1: cuts[i + 1], z0, z1 });
    }
  }
  return out;
}

/** Polygons (in along, z) for the openings of one region. */
function openingShapes(kind, region) {
  const height = region.z1 - region.z0;
  const width = region.u1 - region.u0;
  if (height < OPENING_MIN_H[kind] - 1e-9) return [];
  if (kind === "slots") {
    const count = Math.floor((width - 4 - 5) / 9 + 1e-9) + 1;
    if (count < 2) return [];
    const start = region.u0 + (width - (count - 1) * 9) / 2;
    const half = 2.5;
    return Array.from({ length: count }, (_, i) => {
      const u = start + i * 9;
      return [
        [u - half, region.z0],
        [u + half, region.z0],
        [u + half, region.z1 - half],
        [u, region.z1],
        [u - half, region.z1 - half],
      ];
    });
  }
  const flat = Math.sqrt(3) * HEX_R;
  const colPitch = flat + HEX_WEB;
  const rowPitch = 9 + (HEX_WEB * Math.sqrt(3)) / 2;
  const cols = Math.floor((width - HEX_WEB - flat) / colPitch + 1e-9) + 1;
  const rows = Math.floor((height - 12) / rowPitch + 1e-9) + 1;
  if (cols < 2) return [];
  const u0 = region.u0 + (width - ((cols - 1) * colPitch + flat)) / 2 + flat / 2;
  const z0 = region.z0 + (height - ((rows - 1) * rowPitch + 12)) / 2 + 6;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    for (let c = 0; c < (odd ? cols - 1 : cols); c++) {
      out.push(hexagon(u0 + c * colPitch + (odd ? colPitch / 2 : 0), z0 + r * rowPitch, HEX_R));
    }
  }
  return out;
}

/**
 * Wall frame: depth +X (into the bin from the wall's cell edge), along +Y, z up.
 * Features are built in this frame and placed on a wall with `toWall`.
 */
export const wallLength = (wall, W, D) => (wall === "front" || wall === "back" ? W : D);

export function toWall(kit, m, wall, W, D) {
  switch (wall) {
    case "left":
      return m;
    case "right":
      return kit.move(kit.mirrorX(m), W, 0, 0);
    case "front":
      return kit.mirrorX(kit.rotZ(m, 90));
    default:
      return kit.move(kit.mirrorY(kit.mirrorX(kit.rotZ(m, 90))), 0, D, 0);
  }
}

/** 2D (along, z) profile extruded through the wall depth [d0, d1], in wall frame. */
export function alongProfile(kit, cs, d0, d1) {
  const solid = kit.rotZ(kit.rot(kit.ext(cs, 0, d1 - d0), 90, 0, 0), 90);
  return kit.move(solid, d0, 0, 0);
}

/** 2D (depth, z) profile extruded along the wall from a0 to a1, in wall frame. */
export function depthProfile(kit, cs, a0, a1) {
  return kit.move(kit.rot(kit.ext(cs, 0, a1 - a0), 90, 0, 0), 0, a1, 0);
}

function hexagon(cx, cy, r) {
  // Pointy-top hexagon, counter-clockwise.
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

/**
 * One printable segment of a bin, in bin-local coordinates (bin cell block min corner at the origin).
 * ctx: { project, grid, bin, eff, seg, font, labels }
 * Returns { main, inlay, keys: [{ x, y, z, axis, height }], magnets: n, noOpenings: bool }.
 */
export function buildBinSegment(kit, ctx) {
  const { project, grid, bin, eff, seg } = ctx;
  const px = grid.pitchX;
  const py = grid.pitchY;
  const W = bin.w * px;
  const D = bin.d * py;
  const gap = GF.binGap;
  const H = binHeight(eff);
  const top = H + (eff.lip ? GF.lipH : 0);
  const topInner = H - (eff.lip ? 0.6 : 0);
  const floorTop = FOOT_H + eff.floor;
  const wall = eff.wall;
  const tEdge = gap + wall;
  const ow = W - 2 * gap;
  const od = D - 2 * gap;
  const cx = W / 2;
  const cy = D / 2;

  const x0 = seg.x0 * px;
  const x1 = (seg.x0 + seg.w) * px;
  const y0 = seg.y0 * py;
  const y1 = (seg.y0 + seg.d) * py;
  const hasXMin = seg.x0 > 0;
  const hasXMax = x1 < W - 1e-6;
  const hasYMin = seg.y0 > 0;
  const hasYMax = y1 < D - 1e-6;
  const open = seg.open;

  // Bounds: unbounded on outer sides, 0.1 mm in from every cut.
  const bx0 = hasXMin ? x0 + SEAM_GAP : -BIG;
  const bx1 = hasXMax ? x1 - SEAM_GAP : BIG;
  const by0 = hasYMin ? y0 + SEAM_GAP : -BIG;
  const by1 = hasYMax ? y1 - SEAM_GAP : BIG;
  const region = (z0, z1) => kit.box(bx0, bx1, by0, by1, z0, z1);

  // --- body and feet ---
  const outline = kit.move(kit.rrect(ow, od, BIN_R), cx, cy);
  let body = kit.inter(kit.ext(outline, FOOT_H - 0.001, top), region(0, top + 1));

  const cellX0 = Math.floor(bin.x + seg.x0 + 1e-6);
  const cellX1 = Math.ceil(bin.x + seg.x0 + seg.w - 1e-6);
  const cellY0 = Math.floor(bin.y + seg.y0 + 1e-6);
  const cellY1 = Math.ceil(bin.y + seg.y0 + seg.d - 1e-6);
  const foot = kit.loft(BIN_FOOT, px, py);
  const feet = [];
  for (let gx = cellX0; gx < cellX1; gx++) {
    for (let gy = cellY0; gy < cellY1; gy++) {
      feet.push(kit.move(foot, (gx + 0.5 - bin.x) * px, (gy + 0.5 - bin.y) * py, 0));
    }
  }
  const feetClip = kit.inter(kit.ext(outline, -1, FOOT_H + 0.5), region(-1, FOOT_H + 1));
  body = kit.union(body, kit.inter(kit.union(feet), feetClip));

  // --- cavity ---
  const slice = (z, inset) =>
    kit.slice(
      kit.move(kit.rrect(ow - 2 * inset, od - 2 * inset, Math.max(BIN_R - inset, 0.1)), cx, cy),
      z,
    );
  const cav = [];
  if (eff.lip) {
    const e = H + 0.5;
    const n = Math.max(e - Math.max(2.6 - wall, 0), floorTop);
    cav.push(kit.hull(slice(floorTop, wall), slice(n, wall)));
    cav.push(kit.hull(slice(n, wall), slice(e, LIP[0][1])));
    for (let i = 0; i < LIP.length - 1; i++) {
      cav.push(kit.hull(slice(e + LIP[i][0], LIP[i][1]), slice(e + LIP[i + 1][0], LIP[i + 1][1])));
    }
    const last = LIP[LIP.length - 1];
    cav.push(kit.hull(slice(e + last[0], last[1]), slice(e + last[0] + 1, last[1])));
  } else {
    cav.push(kit.hull(slice(floorTop, wall), slice(H + 1, wall)));
  }
  // The cavity reaches through open seams (no wall) and stops one wall short of closed seams.
  const cvx0 = hasXMin ? (open.xMin ? x0 - 1 : x0 + wall) : -BIG;
  const cvx1 = hasXMax ? (open.xMax ? x1 + 1 : x1 - wall) : BIG;
  const cvy0 = hasYMin ? (open.yMin ? y0 - 1 : y0 + wall) : -BIG;
  const cvy1 = hasYMax ? (open.yMax ? y1 + 1 : y1 - wall) : BIG;
  const cavity = kit.inter(kit.union(cav), kit.box(cvx0, cvx1, cvy0, cvy1, 0, top + 10));
  body = kit.sub(body, cavity);

  const adds = [];
  const cuts = [];
  const inlayParts = [];
  const blocked = Object.fromEntries(WALLS.map((w) => [w, []]));
  const scoopTop = Object.fromEntries(WALLS.map((w) => [w, null]));
  const lowerTop = Object.fromEntries(WALLS.map((w) => [w, null]));
  let tabInfo = null;

  // --- dividers ---
  const sliding = eff.lid === "sliding" ? slidingLevels(eff) : null;
  // Dividers must not reach into the path of a sliding lid.
  const dh = Math.min(
    floorTop + ((H - floorTop) * eff.dividerPct) / 100,
    topInner,
    sliding ? sliding.ledgeTop : Infinity,
  );
  const dt = Math.max(wall, DIVIDER_MIN);
  const inner0 = tEdge - 0.01;
  const isCut = (v, a, b, len) =>
    [a, b].some((c) => c > 1e-6 && c < len - 1e-6 && Math.abs(c - v) < 1e-3);
  for (let k = 1; k <= eff.dividersX; k++) {
    const pos = (k * W) / (eff.dividersX + 1);
    blocked.front.push([pos - dt / 2 - 3, pos + dt / 2 + 3]);
    blocked.back.push([pos - dt / 2 - 3, pos + dt / 2 + 3]);
    if (isCut(pos, x0, x1, W)) continue;
    adds.push(kit.box(pos - dt / 2, pos + dt / 2, inner0, D - inner0, floorTop - 0.01, dh));
  }
  for (let k = 1; k <= eff.dividersY; k++) {
    const pos = (k * D) / (eff.dividersY + 1);
    blocked.left.push([pos - dt / 2 - 3, pos + dt / 2 + 3]);
    blocked.right.push([pos - dt / 2 - 3, pos + dt / 2 + 3]);
    if (isCut(pos, y0, y1, D)) continue;
    adds.push(kit.box(inner0, W - inner0, pos - dt / 2, pos + dt / 2, floorTop - 0.01, dh));
  }

  // --- label tab and text ---
  const tab = eff.label !== "none" && !hidesLabelTab(eff.lid) ? tabDepth(eff, { w: ow, d: od }) : 0;
  const lw = eff.labelWall;
  const lLen = wallLength(lw, W, D);
  if (tab > 0) {
    const wedge = kit.poly([
      [tEdge - 0.3, topInner - tab - 0.3],
      [tEdge, topInner - tab],
      [tEdge + tab, topInner],
      [tEdge - 0.3, topInner],
    ]);
    const slots = slotRanges(lLen, labelSlotCount(eff), eff.label);
    for (const [r0, r1] of slots)
      adds.push(toWall(kit, depthProfile(kit, wedge, r0, r1), lw, W, D));
    tabInfo = { wall: lw, ranges: slots, bottom: topInner - tab };
    if (ctx.font) {
      const style = project.labelStyle;
      slots.forEach((range, i) => {
        const raw = (bin.labels?.[i] ?? "").trim();
        if (!raw) return;
        const box = textBox({ r0: range[0], r1: range[1], len: lLen, wall, depth: tab });
        const layout = layoutText(ctx.font, raw, style.case === "upper");
        const info = {
          binId: bin.id,
          slot: i,
          text: raw,
          status: "ok",
          size: 0,
          skipped: layout.skipped,
        };
        // Both segments of a split bin build the same label; report it once.
        if (seg.ix === 0 && seg.iy === 0) ctx.labels?.push(info);
        if (!box || layout.empty) return;
        const fit = fitText(ctx.font, layout, box, style);
        info.status = fit.status;
        info.size = +fit.size.toFixed(2);
        // Reading direction runs +along on front/right walls and -along on back/left walls.
        const reversed = lw === "back" || lw === "left";
        const startAlong = reversed
          ? box.u0 + box.w - (box.w - fit.inkW) / 2
          : box.u0 + (box.w - fit.inkW) / 2;
        const depth0 = tEdge + 1 + (box.h - fit.inkH) / 2;
        const polys = layout.contours.map((c) => {
          const pts = [];
          for (let j = 0; j < c.length; j += 2) {
            const gx = (c[j] - layout.minX) * fit.scale;
            const gy = (c[j + 1] - layout.minY) * fit.scale;
            pts.push([depth0 + gy, reversed ? startAlong - gx : startAlong + gx]);
          }
          return pts;
        });
        let cs = kit.own(kit.CrossSection.ofPolygons(polys, "NonZero"));
        if (fit.status === "overflow")
          cs = kit.inter2d(cs, kit.rect(tEdge, tEdge + tab, box.u0, box.u0 + box.w));
        if (style.kind === "raised") {
          const rise = eff.lip
            ? Math.min(style.depthMm, top + 0.15 - 0.1 - topInner)
            : style.depthMm;
          adds.push(toWall(kit, kit.ext(cs, topInner - 0.01, topInner + rise), lw, W, D));
        } else {
          cuts.push(toWall(kit, kit.ext(cs, topInner - style.depthMm, topInner + 0.05), lw, W, D));
          if (style.kind === "inlay") {
            inlayParts.push(toWall(kit, kit.ext(cs, topInner - style.depthMm, topInner), lw, W, D));
          }
        }
      });
    }
  }

  // --- grab features ---
  for (const wname of WALLS) {
    const g = eff.grab[wname];
    const L = wallLength(wname, W, D);
    const depth = Math.max(wall, eff.lip ? 2.6 : 0) + 0.05 + gap;
    if (g.scoop) {
      const r = Math.min(g.scoopR, topInner - floorTop - 0.5, (L - 2 * tEdge) / 2);
      if (r > 0.5) {
        const fillet = kit.csSub(
          kit.rect(tEdge - 0.01, tEdge + r, floorTop - 0.01, floorTop + r),
          kit.circle(r, tEdge + r, floorTop + r, 64),
        );
        adds.push(toWall(kit, depthProfile(kit, fillet, -1, L + 1), wname, W, D));
        scoopTop[wname] = floorTop + r;
      }
    }
    if (g.lower) {
      const zc = Math.max(floorTop + 0.5, (H * g.lowerPct) / 100);
      const cs = kit.rect(-1, L + 1, zc, top + 2);
      cuts.push(toWall(kit, alongProfile(kit, cs, -1, depth), wname, W, D));
      lowerTop[wname] = zc;
    }
    if (g.notch) {
      const width = Math.min(g.notchW, L - 2 * BIN_R - 2);
      if (width > 1) {
        const zb = Math.max(floorTop + 0.5, top - g.notchD);
        const r = Math.max(0.1, Math.min(g.notchR, width / 2, top - zb));
        const c = L / 2;
        const cs = kit.csUnion(
          kit.hull2d(
            kit.circle(r, c - width / 2 + r, zb + r),
            kit.circle(r, c + width / 2 - r, zb + r),
          ),
          kit.rect(c - width / 2, c + width / 2, zb + r, top + 2),
        );
        cuts.push(toWall(kit, alongProfile(kit, cs, -1, depth), wname, W, D));
        blocked[wname].push([c - width / 2 - 3, c + width / 2 + 3]);
      }
    }
  }

  // Sliding lid: two shelves (ledge below, guide above) along the walls parallel to the slide, and the
  // entry wall cut down so the lid can be pushed in.
  if (sliding) {
    const alongY = eff.lidSide === "front" || eff.lidSide === "back";
    const shelf = (z0, z1) =>
      alongY
        ? [
            kit.box(tEdge - 0.01, tEdge + RAIL.depth, gap, D - gap, z0, z1),
            kit.box(W - tEdge - RAIL.depth, W - tEdge + 0.01, gap, D - gap, z0, z1),
          ]
        : [
            kit.box(gap, W - gap, tEdge - 0.01, tEdge + RAIL.depth, z0, z1),
            kit.box(gap, W - gap, D - tEdge - RAIL.depth, D - tEdge + 0.01, z0, z1),
          ];
    adds.push(
      ...shelf(sliding.ledgeBottom, sliding.ledgeTop),
      ...shelf(sliding.guideBottom, sliding.guideTop),
    );
    const z0 = sliding.ledgeTop;
    const z1 = H + 1;
    // The slot also clears the rounded inside corners at the entry end, which would catch the lid.
    const reach = tEdge + Math.max(BIN_R - wall, 0.1) + 0.3;
    const slot = {
      front: () => kit.box(tEdge, W - tEdge, -1, reach, z0, z1),
      back: () => kit.box(tEdge, W - tEdge, D - reach, D + 1, z0, z1),
      left: () => kit.box(-1, reach, tEdge, D - tEdge, z0, z1),
      right: () => kit.box(W - reach, W + 1, tEdge, D - tEdge, z0, z1),
    }[eff.lidSide];
    cuts.push(slot());
  }

  // Hinged lid: two posts inside the hinge wall with a pin hole through them.
  if (eff.lid === "hinged") {
    const wall_ = eff.lidSide;
    const hinge = hingeSpec(eff, { gap, wall, H, L: wallLength(wall_, W, D) });
    for (const [a0, a1] of hinge.posts) {
      adds.push(
        toWall(
          kit,
          kit.box(
            hinge.innerFace - 0.01,
            hinge.innerFace + hinge.postDepth,
            a0,
            a1,
            floorTop - 0.01,
            H,
          ),
          wall_,
          W,
          D,
        ),
      );
    }
    const [s0, s1] = hinge.span;
    const hole = kit.move(
      kit.rot(kit.cyl(hinge.holeR, s1 - s0 + 2), -90, 0, 0),
      hinge.uAxis,
      s0 - 1,
      hinge.zAxis,
    );
    cuts.push(toWall(kit, hole, wall_, W, D));
  }

  // A foot cut by the bin's edge inside a cell (half bins) gets a 45° chamfer at that outer edge.
  const footCut = (v) => Math.abs(v - Math.round(v)) > 1e-6;
  const chamfer = kit.poly([
    [-1, -1],
    [0.6, -1],
    [0.6, FOOT_H],
    [-1, 6.35],
  ]);
  const cutSides = [
    ["left", !hasXMin && footCut(bin.x + seg.x0)],
    ["right", !hasXMax && footCut(bin.x + seg.x0 + seg.w)],
    ["front", !hasYMin && footCut(bin.y + seg.y0)],
    ["back", !hasYMax && footCut(bin.y + seg.y0 + seg.d)],
  ];
  for (const [wname, cutHere] of cutSides) {
    if (!cutHere) continue;
    cuts.push(
      toWall(kit, depthProfile(kit, chamfer, -1, wallLength(wname, W, D) + 1), wname, W, D),
    );
  }

  // --- seams: joints between segments and the lap floor seam ---
  const keys = [];
  const lapAdds = [];
  let magnets = 0;
  const perSlot = H > 60 ? 2 : 1;
  const keyH = Math.min(12, (topInner - floorTop - 0.6 - 1) / perSlot);
  const placeFrame = (m, swap) => (swap ? kit.mirrorX(kit.rotZ(m, 90)) : m);

  // A cut plane perpendicular to x at `c`; walls it meets are y=0 and y=D. `swap` handles y-cuts.
  const seamJoint = (c, across, swap, emit) => {
    const L = across; // length of the walls the plane meets
    for (const side of [0, 1]) {
      const mirrorSide = (m) => (side ? kit.move(kit.mirrorY(m), 0, L, 0) : m);
      const joint = eff.seamJoint;
      if (joint === "hkey" && keyH >= 3) {
        const bossLen = KEY_LENGTH + 2.4;
        const bossW = 2 * 1.2 + KEY.headW;
        const yc = tEdge + 1.2 + KEY.headW / 2;
        adds.push(
          placeFrame(
            mirrorSide(
              kit.box(
                c - bossLen / 2,
                c + bossLen / 2,
                tEdge - 0.01,
                tEdge + bossW,
                floorTop - 0.01,
                topInner,
              ),
            ),
            swap,
          ),
        );
        const slot = kit.mirrorZ(keySlot(kit, keyH + 0.8));
        for (let k = 0; k < perSlot; k++) {
          const zTop = topInner - k * keyH;
          const placed = kit.move(slot, c, yc, zTop);
          cuts.push(placeFrame(mirrorSide(placed), swap));
          if (emit) {
            const ky = side ? L - yc : yc;
            keys.push({
              x: swap ? ky : c,
              y: swap ? c : ky,
              z: zTop - keyH,
              axis: swap ? "y" : "x",
              height: keyH,
            });
          }
        }
      } else if (joint === "magnets") {
        const md = project.magnet.d;
        const dep = project.magnet.depth;
        const half = 0.1 + dep + 1.2;
        const spanY = md + 2.4;
        const yc = tEdge + spanY / 2;
        adds.push(
          placeFrame(
            mirrorSide(
              kit.box(c - half, c + half, tEdge - 0.01, tEdge + spanY, floorTop - 0.01, topInner),
            ),
            swap,
          ),
        );
        const zs = [topInner - md / 2 - 1];
        if (H > 60) zs.push(floorTop + md / 2 + 1);
        for (const zc of zs) {
          const drop = kit.hull2d(
            kit.circle(md / 2, yc, zc),
            kit.poly([
              [yc - 0.01, zc + (md / 2) * 1.414],
              [yc + 0.01, zc + (md / 2) * 1.414],
              [yc, zc + (md / 2) * 1.414 + 0.01],
            ]),
          );
          const lo = alongProfile(kit, drop, c + SEAM_GAP, c + SEAM_GAP + dep);
          const hi = alongProfile(kit, drop, c - SEAM_GAP - dep, c - SEAM_GAP);
          for (const m of [lo, hi]) cuts.push(placeFrame(mirrorSide(m), swap));
          if (emit) magnets += 2;
        }
      }
    }
  };

  const lap = eff.floorSeam === "lap";
  const lapT = eff.floor / 2;
  const lapZ0 = FOOT_H;
  const hasJoint = eff.seamJoint !== "none";
  if (hasXMax) {
    if (hasJoint) seamJoint(x1, D, false, true);
    if (lap && open.xMax) {
      lapAdds.push(
        kit.inter(
          kit.box(
            x1 - 1,
            x1 + LAP_LEN - SEAM_GAP,
            y0 + 0.2 - (hasYMin ? 0 : BIG),
            y1 - 0.2 + (hasYMax ? 0 : BIG),
            lapZ0,
            lapZ0 + lapT,
          ),
          kit.ext(outline, 0, top),
        ),
      );
    }
  }
  if (hasXMin) {
    if (hasJoint) seamJoint(x0, D, false, false);
    if (lap && open.xMin)
      cuts.push(kit.box(x0 - 1, x0 + LAP_LEN, -BIG, BIG, lapZ0 - 0.01, lapZ0 + lapT + 0.1));
  }
  if (hasYMax) {
    if (hasJoint) seamJoint(y1, W, true, true);
    if (lap && open.yMax) {
      lapAdds.push(
        kit.inter(
          kit.box(
            x0 + 0.2 - (hasXMin ? 0 : BIG),
            x1 - 0.2 + (hasXMax ? 0 : BIG),
            y1 - 1,
            y1 + LAP_LEN - SEAM_GAP,
            lapZ0,
            lapZ0 + lapT,
          ),
          kit.ext(outline, 0, top),
        ),
      );
    }
  }
  if (hasYMin) {
    if (hasJoint) seamJoint(y0, W, true, false);
    if (lap && open.yMin)
      cuts.push(kit.box(-BIG, BIG, y0 - 1, y0 + LAP_LEN, lapZ0 - 0.01, lapZ0 + lapT + 0.1));
  }
  {
    const jointHalf =
      eff.seamJoint === "hkey"
        ? (KEY_LENGTH + 2.4) / 2
        : eff.seamJoint === "magnets"
          ? 0.1 + project.magnet.depth + 1.2
          : 0;
    const seams = [
      [x0, W, ["front", "back"]],
      [x1, W, ["front", "back"]],
      [y0, D, ["left", "right"]],
      [y1, D, ["left", "right"]],
    ];
    for (const [cut, len, ws] of seams) {
      if (cut > 1e-6 && cut < len - 1e-6) {
        for (const w of ws) blocked[w].push([cut - jointHalf - 3, cut + jointHalf + 3]);
      }
    }
  }

  // Seam bosses extend past the cut: keep them only inside this segment's bounds (+ the lap tongue).
  let main = body;
  if (adds.length) {
    const clip = kit.inter(region(-1, top + 5), kit.ext(outline, -1, top + 5));
    main = kit.union(main, kit.inter(kit.union(adds), clip));
  }
  if (lapAdds.length) main = kit.union(main, ...lapAdds);

  // --- wall openings (only on walls that are outer faces of this segment) ---
  let noOpenings = false;
  if (eff.wallPattern !== "solid") {
    const outer = { front: !hasYMin, back: !hasYMax, left: !hasXMin, right: !hasXMax };
    const openings = [];
    for (const wname of WALLS) {
      if (!outer[wname]) continue;
      // Openings are measured from where the straight wall ends, not from the stacking lip's top.
      const wallTop = eff.lip ? Math.max(H + 0.5 - Math.max(2.6 - wall, 0), floorTop) : H;
      const regions = openingRegions({
        len: wallLength(wname, W, D),
        top: wallTop,
        lip: eff.lip,
        floorTop,
        scoopTop: scoopTop[wname],
        lowerTop: lowerTop[wname],
        blocked: blocked[wname],
        tabs: tabInfo?.wall === wname ? tabInfo : null,
      });
      const depth = gap + wall + 0.05;
      for (const region of regions) {
        for (const poly of openingShapes(eff.wallPattern, region)) {
          openings.push(toWall(kit, alongProfile(kit, kit.poly(poly), -1, depth), wname, W, D));
        }
      }
    }
    if (openings.length) cuts.push(...openings);
    else noOpenings = true;
  }

  // --- foot magnets ---
  if (eff.magnets) {
    const mo = magnetOffset(px);
    for (let gx = cellX0; gx < cellX1; gx++) {
      for (let gy = cellY0; gy < cellY1; gy++) {
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const mx = (gx + 0.5 - bin.x) * px + sx * mo;
            const my = (gy + 0.5 - bin.y) * py + sy * mo;
            if (mx > bx0 && mx < bx1 && my > by0 && my < by1) {
              cuts.push(
                kit.cyl(project.magnet.d / 2, project.magnet.depth + 0.001, mx, my, -0.001),
              );
            }
          }
        }
      }
    }
  }
  if (cuts.length) main = kit.sub(main, ...cuts);

  const inlay = inlayParts.length ? kit.inter(kit.union(inlayParts), region(-1, top + 5)) : null;
  // What a lid needs to know: the bin's frame, and the interior features (dividers, label tab, text)
  // that a lid plug has to stay clear of.
  const frame = {
    W,
    D,
    gap,
    ow,
    od,
    cx,
    cy,
    H,
    top,
    topInner,
    wall,
    floorTop,
    bounds: { bx0, bx1, by0, by1 },
  };
  return {
    main,
    inlay,
    keys,
    magnets,
    noOpenings,
    frame,
    interior: adds.length ? kit.union(adds) : null,
  };
}
