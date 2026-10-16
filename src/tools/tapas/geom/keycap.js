import { iconShape } from "./icons.js";
import { applyRelief, packResult } from "./relief.js";

/**
 * Cap that slips over a switch key (tecla). Printed face down: face at z = 0, open end up.
 * `ctx.font` is needed for text icons.
 */
export function generateKeycap(kit, p, ctx = {}) {
  const k = p.keycap;
  const warnings = [];
  const pocketW = k.w + 2 * k.clearance;
  const pocketL = k.l + 2 * k.clearance;
  const pocketR = k.r + k.clearance;
  const outerW = pocketW + 2 * k.wall;
  const outerL = pocketL + 2 * k.wall;
  const lift = k.icon !== "none" && k.iconMode === "raised" ? k.iconDepth : 0;
  const total = lift + k.face + k.h;
  const outline = kit.rrect(outerW, outerL, pocketR + k.wall);

  // A soft edge on the visible face: a short taper from a slightly smaller rectangle.
  const bevel = k.style === "bevel" ? Math.min(1, k.face * 0.6) : 0;
  const solid = bevel
    ? kit.union(
        kit.hull(
          kit.slice(
            kit.rrect(
              outerW - 2 * bevel,
              outerL - 2 * bevel,
              Math.max(0.2, pocketR + k.wall - bevel),
            ),
            lift,
          ),
          kit.slice(outline, lift + bevel),
        ),
        kit.ext(outline, lift + bevel - 0.001, total),
      )
    : kit.ext(outline, lift, total);
  let body = kit.sub(
    solid,
    kit.ext(kit.rrect(pocketW, pocketL, pocketR), lift + k.face, total + 1),
  );

  let patternBody = null;
  if (k.icon !== "none") {
    const size = Math.min(outerW - 2 * k.wall, outerL - 2 * k.wall, k.iconSize);
    const cs = iconShape(kit, k.icon, size, { font: ctx.font, label: k.text });
    if (cs && !cs.isEmpty()) {
      if (bevel) warnings.push("none");
      ({ body, patternBody } = applyRelief(kit, body, cs, {
        mode: k.iconMode,
        depth: k.iconDepth,
        face: k.face,
        lift,
      }));
    } else if (k.icon === "text") warnings.push("emptyText");
  }
  return {
    kind: "keycap",
    ...packResult(kit, {
      name: "cubretecla",
      body,
      patternBody,
      bounds: outline.bounds(),
      total,
      pocket: [pocketW, pocketL, k.h],
      warnings: warnings.filter((w) => w !== "none"),
    }),
  };
}
