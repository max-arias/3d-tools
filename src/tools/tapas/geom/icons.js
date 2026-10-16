// Small original key-cap icons, drawn from primitives. Each returns a CrossSection centred on the
// origin that fits inside a `size` x `size` square.
import { fitText, layoutText } from "../lib/text.js";

export const ICON_IDS = ["bulb", "fan", "blind", "text"];

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
  if (id === "text") return text(kit, size, ctx);
  return null;
}
