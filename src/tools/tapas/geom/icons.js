// Small original key-cap icons, drawn from primitives. Each returns a CrossSection centred on the
// origin that fits inside a `size` x `size` square.
import { fitText, layoutText } from "../lib/text.js";

export const ICON_IDS = ["bulb", "fan", "blind", "mate", "bandoneon", "text"];

function bulb(kit, s) {
  const globe = kit.circle(s * 0.3, 0, s * 0.13, 40);
  const neck = kit.hull2d(
    kit.circle(s * 0.14, 0, -s * 0.12, 24),
    kit.rect(-s * 0.14, s * 0.14, -s * 0.25, -s * 0.2),
  );
  const base = kit.rect(-s * 0.13, s * 0.13, -s * 0.38, -s * 0.28);
  return kit.csUnion(globe, kit.hull2d(globe, neck), base);
}

function fan(kit, s) {
  const blades = [0, 120, 240].map((deg) => {
    const blade = kit.own(kit.circle(s * 0.19, 0, 0, 32).scale([1, 0.5]));
    return kit.own(kit.own(blade.translate([s * 0.24, 0])).rotate(deg + 20));
  });
  return kit.csUnion(kit.circle(s * 0.09, 0, 0, 24), blades);
}

function blind(kit, s) {
  const slats = [0, 1, 2, 3].map((i) =>
    kit.rect(-s * 0.4, s * 0.4, s * 0.3 - i * s * 0.2, s * 0.3 - i * s * 0.2 + s * 0.11),
  );
  return kit.csUnion(kit.rect(-s * 0.44, s * 0.44, s * 0.4, s * 0.48), slats);
}

/** Mate gourd with its bombilla (straw). */
export function mate(kit, s) {
  const body = kit.csSub(kit.circle(s * 0.34, 0, -s * 0.1, 40), kit.rect(-s, s, s * 0.1, s));
  const straw = kit.own(
    kit
      .own(kit.rect(-s * 0.025, s * 0.025, 0, s * 0.62).rotate(-28))
      .translate([s * 0.06, s * 0.06]),
  );
  return kit.csUnion(body, straw);
}

/** Bandoneón: two end plates joined by pleated bellows. */
function bandoneon(kit, s) {
  const bars = [-0.26, -0.13, 0, 0.13, 0.26].map((x, i) =>
    kit.rect(s * (x - 0.03), s * (x + 0.03), -s * (i % 2 ? 0.17 : 0.22), s * (i % 2 ? 0.17 : 0.22)),
  );
  return kit.csUnion(
    kit.rect(-s * 0.46, -s * 0.34, -s * 0.28, s * 0.28),
    kit.rect(s * 0.34, s * 0.46, -s * 0.28, s * 0.28),
    kit.rect(-s * 0.4, s * 0.4, -s * 0.03, s * 0.03),
    bars,
  );
}

function text(kit, s, { font, label }) {
  if (!font || !label) return null;
  const layout = layoutText(font, label);
  if (layout.empty) return null;
  const fit = fitText(font, layout, { w: s * 1.2, h: s }, { maxMm: s, autoFit: true });
  const polys = layout.contours.map((c) => {
    const pts = [];
    for (let j = 0; j < c.length; j += 2)
      pts.push([
        (c[j] - (layout.minX + layout.maxX) / 2) * fit.scale,
        (c[j + 1] - (layout.minY + layout.maxY) / 2) * fit.scale,
      ]);
    return pts;
  });
  return kit.own(kit.CrossSection.ofPolygons(polys, "NonZero"));
}

export function iconShape(kit, id, size, ctx) {
  if (id === "bulb") return bulb(kit, size);
  if (id === "fan") return fan(kit, size);
  if (id === "blind") return blind(kit, size);
  if (id === "mate") return mate(kit, size);
  if (id === "bandoneon") return bandoneon(kit, size);
  if (id === "text") return text(kit, size, ctx);
  return null;
}
