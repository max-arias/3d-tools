// The clock as printable parts. The dial is modelled with its front face at z = thickness and its
// back at z = 0; the movement, housing and mounts sit behind it (z < 0). The hub (shaft) is the
// origin. Every colour slot becomes its own body, so a multi-colour print is one object per part.
import { buildArt } from "../../tapas/geom/art.js";
import { layoutCutouts } from "../dial/cutouts.js";
import { defaultHandSizes } from "../dial/hands.js";
import { layoutMarkers } from "../dial/markers.js";
import { boundsOf, faceRadius, insideOutline, outlineOf, rayDistance } from "../dial/outline.js";
import { CHIPS } from "../../letters/model/strips.js";
import { buildBracket, buildCoupon, buildCradle, buildHand } from "./parts.js";

const HOUSING_WALL = 2.4;
const RIM_WALL = 2.4;

const csOf = (kit, rings, rule = "NonZero") => kit.own(kit.CrossSection.ofPolygons(rings, rule));

/** The outline as a CrossSection: every shape unioned, the cuts taken out, tiny gaps closed. */
function outlineCs(kit, outline) {
  let cs = kit.csUnion(outline.shapes.map((s) => csOf(kit, s.rings, s.rule)));
  if (outline.cuts.length)
    cs = kit.csSub(
      cs,
      outline.cuts.map((r) => csOf(kit, [r])),
    );
  return kit.grow(kit.grow(cs, 0.4), -0.4);
}

const perimeter = (polys) =>
  polys.reduce(
    (n, r) =>
      n +
      r.reduce(
        (m, p, i) =>
          m + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]),
        0,
      ),
    0,
  );

/** Where things go on the back, decided from the type: { back, hanger, magnets, stand, notes }. */
export function mountPlan(p) {
  const notes = [];
  let back = p.back.kind;
  const wall = p.type === "wall" || p.type === "wallDesk";
  let hanger = wall ? p.back.hanger : null;
  if (p.type === "twoSided" || p.leds.halo) {
    if (back !== "rim") notes.push(p.type === "twoSided" ? "rimTwoSided" : "rimHalo");
    back = "rim";
    if (p.type === "twoSided") hanger = null;
  } else if (p.type === "magnet" && back === "none") {
    back = "housing";
    notes.push("backMagnet");
  } else if (wall && hanger !== "movement" && back === "none") {
    back = "housing";
    notes.push("backKeyhole");
  }
  const stand = p.type === "desk" || p.type === "wallDesk" ? p.back.stand : null;
  return { back, hanger, magnets: p.type === "magnet", stand, notes };
}

/**
 * Build everything. `glyph(text, capHeight)` returns text rings centred on the origin.
 * Returns { parts, info } or throws when the outline is empty.
 */
export function generateClock(kit, p, glyph) {
  const notes = [];
  const bw = p.shape.border.kind === "none" ? 0 : p.shape.border.w;
  const outline = outlineOf({ ...p.shape, width: Math.max(20, p.shape.width - 2 * bw) }, p.art);
  if (!outline) throw new Error("Nothing to build: the shape is empty.");
  const T = p.face.thickness;
  const mv = p.movement;
  const plan = mountPlan(p);
  notes.push(...plan.notes);

  // ---- 2D: face, border, total silhouette -------------------------------------------------------
  const face = outlineCs(kit, outline);
  if (face.isEmpty()) throw new Error("Nothing to build: the shape is empty.");
  const total = bw ? kit.grow(face, bw) : face;
  let borderCs = null;
  let faceArea = face;
  if (p.shape.border.kind === "flat") borderCs = kit.csSub(total, face);
  else if (p.shape.border.kind === "double") {
    const outerRing = kit.csSub(total, kit.grow(face, bw * 0.5));
    const innerRing = kit.csSub(kit.grow(face, bw * 0.22), face);
    borderCs = kit.csUnion(outerRing, innerRing);
    faceArea = kit.csSub(total, borderCs);
  }
  if (!insideOutline(outline, [0, 0])) notes.push("hubOutside");
  const R = faceRadius(outline);
  const silhouette = {
    shapes: [{ rule: "NonZero", rings: total.toPolygons() }],
    cuts: [],
    w: outline.w + 2 * bw,
    h: outline.h + 2 * bw,
  };
  const [sx0, sy0, sx1, sy1] = boundsOf(silhouette.shapes[0].rings);

  // ---- markers ----------------------------------------------------------------------------------
  const m = { ...p.markers, size: p.markers.size || Math.max(5, Math.round(R * 0.13)) };
  const marks = layoutMarkers(m, outline, R, glyph);
  let markersCs = marks.items.length
    ? kit.inter2d(kit.csUnion(marks.items.map((i) => csOf(kit, i.rings))), faceArea)
    : null;
  if (markersCs?.isEmpty()) markersCs = null;

  // ---- movement --------------------------------------------------------------------------------
  const [bodyW, bodyH, bodyD] = mv.body;
  const pw = bodyW + 2 * mv.clearance;
  const ph = bodyH + 2 * mv.clearance;
  const hubDial = Math.min(T, mv.maxDial);
  const recess = T - hubDial;
  if (recess > 0 && hubDial < 1.2) notes.push("dialThin");
  const D = bodyD + 1.5; // depth behind the dial that clears the movement
  const pocketRect = [-pw / 2, -ph / 2, pw / 2, ph / 2];
  if (plan.back !== "none") {
    const corners = [
      [-pw / 2 - HOUSING_WALL, -ph / 2 - HOUSING_WALL],
      [pw / 2 + HOUSING_WALL, ph / 2 + HOUSING_WALL],
    ];
    if (plan.back === "housing" && corners.some((c) => !insideOutline(silhouette, c)))
      notes.push("housingOut");
  }

  // ---- back features: housing or rim, bosses (keyholes, magnets, feet, two-sided screws) -----
  const back = [];
  const bosses = []; // { at, r } keep-outs for cutouts
  const rimInset = p.leds.halo ? 9 : 3;
  let rimOuter = null;
  if (plan.back === "housing") {
    const outer = kit.box(
      -pw / 2 - HOUSING_WALL,
      pw / 2 + HOUSING_WALL,
      -ph / 2 - HOUSING_WALL,
      ph / 2 + HOUSING_WALL,
      -D,
      0,
    );
    back.push(kit.sub(outer, kit.box(-pw / 2, pw / 2, -ph / 2, ph / 2, -D - 1, 1)));
    // Two feet low on the dial so it hangs (or leans) parallel to the wall.
    for (const a of [-0.65 * Math.PI, -0.35 * Math.PI]) {
      const d = Math.min(rayDistance(silhouette, a), R + bw) * 0.78;
      const at = [d * Math.cos(a), d * Math.sin(a)];
      if (!insideOutline(silhouette, at) || Math.abs(at[1]) < ph / 2 + 10) continue;
      back.push(kit.cyl(6, D, at[0], at[1], -D));
      bosses.push({ at, r: 6 });
    }
  } else if (plan.back === "rim") {
    rimOuter = kit.grow(total, -rimInset);
    if (rimOuter.isEmpty()) throw new Error("The shape is too small for a rim.");
    const rimRing = kit.csSub(rimOuter, kit.grow(rimOuter, -RIM_WALL));
    let rim = kit.ext(rimRing, -D, 0);
    if (p.leds.halo)
      rim = kit.sub(rim, kit.box(-5, 5, sy0 - 1, sy0 + rimInset + RIM_WALL + 3, -D - 1, -D + 6)); // cable notch
    back.push(rim);
  }

  const keyholes = [];
  if (plan.hanger === "keyhole")
    keyholes.push([
      0,
      Math.min(ph / 2 + HOUSING_WALL + 14, rayDistance(silhouette, Math.PI / 2) - rimInset - 16),
    ]);
  if (plan.hanger === "two") {
    const x = Math.max(pw / 2 + 18, R * 0.45);
    for (const s of [-1, 1])
      keyholes.push([
        s * x,
        Math.min(R * 0.35, rayDistance(silhouette, Math.atan2(R * 0.35, s * x)) - 20),
      ]);
  }
  for (const [x, y] of keyholes) {
    if (!insideOutline(silhouette, [x, y + 14]) || !insideOutline(silhouette, [x, y - 12])) {
      notes.push("keyholeOut");
      continue;
    }
    let boss = kit.box(x - 11, x + 11, y - 12, y + 18, -D, 0);
    // Head hole and shank slot through a 2 mm skin, with a wider pocket behind for the screw head.
    boss = kit.sub(boss, kit.cyl(4.75, 6, x, y, -D - 1));
    boss = kit.sub(boss, kit.box(x - 2.4, x + 2.4, y, y + 10, -D - 1, -D + 2));
    boss = kit.sub(boss, kit.box(x - 4.9, x + 4.9, y, y + 10, -D + 2, -D + 5.5));
    boss = kit.sub(boss, kit.cyl(4.9, 3.5, x, y + 10, -D + 2));
    back.push(boss);
    bosses.push({ rect: [x - 11, y - 12, x + 11, y + 18] });
  }
  if (plan.magnets) {
    const n = p.back.magnet.n;
    const md = p.back.magnet.d + 0.2;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2 + (n % 2 ? 0 : Math.PI / n);
      const d = Math.max(
        Math.hypot(pw, ph) / 2 + md / 2 + 4,
        Math.min(rayDistance(silhouette, a) - rimInset - md, R * 0.7),
      );
      const at = [d * Math.cos(a), d * Math.sin(a)];
      let boss = kit.cyl(md / 2 + 2.4, D, at[0], at[1], -D);
      boss = kit.sub(boss, kit.cyl(md / 2, p.back.magnet.h + 1, at[0], at[1], -D - 1));
      back.push(boss);
      bosses.push({ at, r: md / 2 + 2.4 });
    }
  }
  let twoSided = null;
  if (p.type === "twoSided") {
    // Screw bosses at the top, inside the rim; the arm's screws come down through the rim into them.
    const topY = sy1;
    const bossM = kit.inter(
      kit.box(-16, 16, topY - 16, topY + 1, -D, 0),
      kit.ext(total, -D - 1, 1),
    );
    let boss = bossM;
    for (const x of [-8, 8])
      boss = kit.sub(
        boss,
        kit.own(
          kit.Manifold.cylinder(16, 1.35, 1.35, 24)
            .rotate([-90, 0, 0])
            .translate([x, topY - 14, -D / 2]),
        ),
      );
    back.push(boss);
    bosses.push({ rect: [-16, topY - 16, 16, topY] });
    twoSided = { depth: 2 * (D + T), topY };
  }
  let foot = null;
  if (plan.stand === "foot") {
    // A base under the dial that reaches back past the movement, so it stands on its own.
    const fw = Math.min(sx1 - sx0, Math.max(80, (sx1 - sx0) * 0.7));
    foot = kit.box(-fw / 2, fw / 2, sy0, sy0 + 6, -Math.max(D + 10, 40), T);
  }

  // ---- art ----------------------------------------------------------------------------------
  const artLayers = [];
  if (p.art) {
    const a = p.art;
    const artEdge = p.shape.kind === "art";
    const fit = outline.w * (Math.max(a.w, a.h) / a.w); // size 0: the art spans the face's width
    const pat = artEdge
      ? { size: fit, ax: -p.shape.hub[0], ay: -p.shape.hub[1], rot: 0, mirror: false }
      : {
          size: p.artPlace.size || fit,
          ax: p.artPlace.x - p.shape.hub[0],
          ay: p.artPlace.y - p.shape.hub[1],
          rot: p.artPlace.rot,
          mirror: false,
        };
    for (const L of buildArt(kit, pat, a, faceArea)) {
      const i = a.layers.findIndex((x) => x.on && x.c === L.color);
      let cs = markersCs ? kit.csSub(L.cs, markersCs) : L.cs;
      if (!cs.isEmpty()) artLayers.push({ cs, slot: p.colors.art[i] ?? 0, layer: i });
    }
  }

  // ---- cutouts --------------------------------------------------------------------------------
  const keep = [
    {
      rect: [
        pocketRect[0] - HOUSING_WALL,
        pocketRect[1] - HOUSING_WALL,
        pocketRect[2] + HOUSING_WALL,
        pocketRect[3] + HOUSING_WALL,
      ],
    },
    ...marks.items.map((i) => ({ at: i.at, r: i.r })),
    ...bosses,
  ];
  if (rimOuter) {
    // Holes must not cut through the rim wall.
    const rimPolys = rimOuter.toPolygons();
    keep.push(
      ...rimPolys.flatMap((r) =>
        r.filter((_, i) => i % 3 === 0).map((pt) => ({ at: pt, r: RIM_WALL + 1 })),
      ),
    );
  }
  const holes = layoutCutouts(p.cutouts, outline, R, keep, m.hours);
  const holesCs = holes.length ? kit.csUnion(holes.map((h) => csOf(kit, [h.ring]))) : null;

  // ---- bodies per slot ------------------------------------------------------------------------
  const slots = new Map();
  const put = (slot, mf) => {
    if (!mf || mf.isEmpty()) return;
    if (!slots.has(slot)) slots.set(slot, []);
    slots.get(slot).push(mf);
  };
  const colors = p.colors;
  const decorH = p.face.raised;
  let faceBody = kit.ext(faceArea, 0, T);
  let borderBody = borderCs ? kit.ext(borderCs, 0, T) : null;
  const pockets = [];
  let raisedAny = false;
  const decor = (cs, slot, mode, h = decorH) => {
    if (mode === "inlay") {
      pockets.push(kit.ext(cs, T - p.face.inlay, T + 1));
      put(slot, kit.ext(cs, T - p.face.inlay, T));
    } else if (mode === "raised") {
      raisedAny = true;
      put(slot, kit.ext(cs, T, T + h));
    } else if (mode === "engraved") pockets.push(kit.ext(cs, T - p.face.inlay, T + 1));
    else if (mode === "through") pockets.push(kit.ext(cs, -D - 1, T + 1));
  };
  artLayers.forEach((L, i) =>
    p.style === "relief"
      ? decor(L.cs, L.slot, "raised", decorH * (1 + i * 0.6))
      : decor(L.cs, L.slot, p.face.decor),
  );
  if (markersCs) decor(markersCs, colors.markers, p.markers.finish);
  if (p.style === "ribs") {
    // Concentric grooves following the outline, kept off the art and the markers.
    const g = Math.min(1.4, p.face.ribPitch / 3);
    let grooves = [];
    for (let k = 1; k * p.face.ribPitch < R - 12; k++) {
      const a = kit.grow(faceArea, -k * p.face.ribPitch);
      if (a.isEmpty()) break;
      grooves.push(kit.csSub(a, kit.grow(a, -g)));
    }
    if (grooves.length) {
      let gcs = kit.csUnion(grooves);
      const busy = [markersCs, ...artLayers.map((l) => l.cs)].filter(Boolean);
      if (busy.length) gcs = kit.csSub(gcs, kit.grow(kit.csUnion(busy), 1));
      pockets.push(kit.ext(gcs, T - Math.min(0.8, T - 1), T + 1));
    }
  }
  if (pockets.length) {
    faceBody = kit.sub(faceBody, pockets);
    if (borderBody) borderBody = kit.sub(borderBody, pockets);
  }
  if (recess > 0)
    faceBody = kit.sub(faceBody, kit.box(-pw / 2, pw / 2, -ph / 2, ph / 2, -1, recess));

  // Raised decor and back features can not both print face-down: the back becomes its own part.
  const splitBack = raisedAny && back.length > 0;
  const faceSlot = colors.face;
  put(faceSlot, faceBody);
  if (borderBody) put(colors.border, borderBody);
  if (!splitBack) back.forEach((b) => put(faceSlot, b));
  if (foot) put(faceSlot, foot);

  const throughAll = [kit.cyl(mv.dialHole / 2, T + D + 20, 0, 0, -D - 5)];
  if (holesCs) throughAll.push(kit.ext(holesCs, -D - 1, T + 20));
  const finish = (list) => kit.sub(kit.union(list), throughAll);
  const dialBodies = [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, list]) => ({ slot, m: finish(list) }))
    .filter((b) => !b.m.isEmpty());

  // ---- hands -----------------------------------------------------------------------------------
  const auto = defaultHandSizes(R, marks.numeralR);
  const handParts = [];
  const handInfo = [];
  if (p.hands.print) {
    const specs = [
      [
        "hour",
        { ...auto.hour, ...nonZero(p.hands.hour) },
        { d: mv.hour + p.hands.fit, flat: 0 },
        false,
        mv.hourAt,
      ],
      [
        "minute",
        { ...auto.minute, ...nonZero(p.hands.minute) },
        { d: mv.minute + p.hands.fit, flat: mv.minuteFlat ? mv.minuteFlat + p.hands.fit : 0 },
        p.hands.tail,
        mv.minuteAt,
      ],
    ];
    if (p.hands.second) specs.push(["second", auto.second, { d: 1, flat: 0 }, true, mv.secondAt]);
    for (const [id, size, hole, tail, at] of specs) {
      const style = id === "second" ? "baton" : p.hands.style;
      const spec = { style, ...size, tail: tail ? size.length * 0.2 : 0 };
      const th = id === "second" ? Math.min(1.2, p.hands.thickness) : p.hands.thickness;
      const built = buildHand(kit, spec, hole, th, p.hands.glow && id !== "second");
      const bodies = [{ slot: colors.hands, m: built.base }];
      if (built.tip) bodies.push({ slot: colors.glow, m: built.tip });
      handParts.push({ id, kind: "hand", bodies, z: recess + at });
      handInfo.push({ id, length: size.length, mass: built.mass, moment: built.moment });
    }
  }

  // ---- parts ------------------------------------------------------------------------------------
  const faceDown = !raisedAny;
  const parts = [
    {
      id: "dial",
      kind: "dial",
      bodies: dialBodies,
      flip: faceDown,
      qty: p.type === "twoSided" ? 2 : 1,
    },
  ];
  if (splitBack)
    parts.push({
      id: "back",
      kind: "back",
      bodies: [{ slot: faceSlot, m: kit.union(back) }],
      flip: true,
      qty: 1,
    });
  parts.push(...handParts.map((h) => ({ ...h, flip: false, qty: p.type === "twoSided" ? 2 : 1 })));
  if (plan.stand === "cradle") {
    const length = Math.min(Math.max(70, (sx1 - sx0) * 0.55), 160);
    parts.push({
      id: "cradle",
      kind: "cradle",
      bodies: [
        { slot: faceSlot, m: buildCradle(kit, { length, slot: T + 0.5, angle: p.back.angle }) },
      ],
      flip: false,
      qty: 1,
      at: { y: sy0, angle: p.back.angle },
    });
  }
  if (twoSided)
    parts.push({
      id: "bracket",
      kind: "bracket",
      bodies: [
        {
          slot: faceSlot,
          m: buildBracket(kit, { arm: p.twoSided.arm, depth: twoSided.depth, holeX: 8, spread: D }),
        },
      ],
      flip: false,
      qty: 1,
      at: { topY: twoSided.topY, depth: twoSided.depth },
    });
  parts.push({
    id: "coupon",
    kind: "coupon",
    bodies: [{ slot: colors.hands, m: buildCoupon(kit, mv) }],
    flip: false,
    qty: 1,
    optional: true,
  });

  // ---- LEDs -------------------------------------------------------------------------------------
  let leds = null;
  if (p.leds.halo && rimOuter) {
    const chip = CHIPS[p.leds.chip];
    const length = perimeter(rimOuter.toPolygons());
    const count = Math.floor((length / 1000) * p.leds.density);
    leds = {
      length,
      count,
      amps: (count * chip.ma) / 1000,
      volts: chip.volts,
      z: -D / 2,
      path: rimOuter.toPolygons(),
    };
  }

  const out = parts.map((part) => ({
    ...part,
    bodies: part.bodies.map((b) => ({ slot: b.slot, ...kit.export(b.m, [0, 0, 0]) })),
  }));
  return {
    parts: out,
    info: {
      R,
      numeralR: marks.numeralR,
      thickness: T,
      hubDial,
      recess,
      depth: plan.back === "none" ? 0 : D,
      back: plan.back,
      faceDown,
      splitBack,
      raised: raisedAny
        ? decorH * (p.style === "relief" ? 1 + 0.6 * Math.max(0, artLayers.length - 1) : 1)
        : 0,
      size: [sx1 - sx0, sy1 - sy0],
      holes: holes.length,
      hands: handInfo,
      leds,
      notes,
      bounds: [sx0, sy0, sx1, sy1],
      silhouette: silhouette.shapes[0].rings,
      keyholes,
    },
  };
}

function nonZero(s) {
  const out = {};
  if (s.length > 0) out.length = s.length;
  if (s.width > 0) out.width = s.width;
  return out;
}
