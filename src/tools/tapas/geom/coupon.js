import { packResult } from "./relief.js";

const CLEARANCES = [0.1, 0.2, 0.3, 0.4, 0.5];

/**
 * Fit strip: five blocks, each a corner of the pocket at a different clearance (1 to 5 notches on
 * the edge tell them apart). Print it, try your plate in each, and set the clearance that slides in.
 * `corner` = the radius to test (tapa corner for overlays and frames, bastidor corner for a tapa).
 */
export function generateCoupon(kit, p) {
  const r = p.product === "tapa" ? 3 : p.plate.r;
  const block = 30;
  const gap = 3;
  const depth = Math.min(6, p.plate.d);
  const face = 1.6;
  const solids = CLEARANCES.map((c, i) => {
    const at = i * (block + gap);
    const slab = kit.ext(kit.rrect(block, block, 3), 0, face + depth);
    // The pocket corner sits 9 mm inside the block; the pocket is open on the other two sides.
    const pocket = kit.ext(
      kit.move(kit.rrect(60, 60, r + c), 9 - 30, 9 - 30),
      face,
      face + depth + 1,
    );
    const notches = Array.from({ length: i + 1 }, (_, n) =>
      kit.ext(
        kit.rect(-1 + (n - i / 2) * 4, 1 + (n - i / 2) * 4 - 0.2, block / 2 - 1.2, block / 2 + 1),
        -1,
        face + depth + 1,
      ),
    );
    return kit.move(kit.sub(slab, pocket, notches), at, 0, 0);
  });
  const body = kit.union(solids);
  const n = CLEARANCES.length;
  const w = n * block + (n - 1) * gap;
  return {
    kind: "coupon",
    ...packResult(kit, {
      name: "tira_de_prueba",
      body,
      patternBody: null,
      bounds: { min: [-block / 2, -block / 2], max: [w - block / 2, block / 2] },
      total: face + depth,
    }),
  };
}
