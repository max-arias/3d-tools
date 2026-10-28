// Front label: a plate that stands on the base's shelf, with optional raised text (Inter Bold,
// via the Gridfinity tool's layout). The text is its own body so it can print in a second colour.
import { fitText, layoutText } from "../../gridfinity/geom/text.js";
import { LABEL } from "./dims.js";

export const LABEL_TEXT = { rise: 0.4, margin: 2.5, gap: 1, maxTitle: 12, maxLine: 4, minMm: 2.5 };

/**
 * Lay out a title and up to four smaller lines inside the label, title on the left when there are
 * lines, as on Pred's hardware labels. Returns { polys, status } in label coordinates (mm).
 */
export function labelText(font, w, h, title, lines) {
  const T = LABEL_TEXT;
  const box = { x0: T.margin, y0: T.margin, w: w - 2 * T.margin, h: h - 2 * T.margin };
  const polys = [];
  const issues = [];
  const place = (str, x0, y0, bw, bh, maxMm, align) => {
    if (!str.trim()) return 0;
    const layout = layoutText(font, str);
    if (layout.skipped.length) issues.push({ text: str, skipped: layout.skipped });
    if (layout.empty) return 0;
    const fit = fitText(font, layout, { w: bw, h: bh }, { maxMm, autoFit: true });
    if (fit.size < T.minMm) issues.push({ text: str, small: true });
    const ox = align === "center" ? x0 + (bw - fit.inkW) / 2 : x0;
    const oy = y0 + (bh - fit.inkH) / 2;
    for (const c of layout.contours) {
      const pts = [];
      for (let j = 0; j < c.length; j += 2) {
        pts.push([
          ox + (c[j] - layout.minX) * fit.scale,
          oy + (c[j + 1] - layout.minY) * fit.scale,
        ]);
      }
      polys.push(pts);
    }
    return fit.inkW;
  };
  const rows = lines.filter((l) => l.trim()).slice(0, 4);
  if (!rows.length) {
    place(title, box.x0, box.y0, box.w, box.h, T.maxTitle, "center");
  } else {
    const titleW = title.trim()
      ? Math.min(
          box.w * 0.42,
          place(title, box.x0, box.y0, box.w * 0.42, box.h, T.maxTitle, "left"),
        )
      : 0;
    const x0 = box.x0 + (titleW ? titleW + 2 * T.gap + 0.6 : 0);
    const rowH = (box.h - (rows.length - 1) * T.gap) / rows.length;
    rows.forEach((r, i) => {
      const y0 = box.y0 + box.h - (i + 1) * rowH - i * T.gap;
      place(r, x0, y0, box.x0 + box.w - x0, rowH, T.maxLine, "center");
    });
    if (titleW)
      polys.push([
        [box.x0 + titleW + T.gap, box.y0],
        [box.x0 + titleW + T.gap + 0.6, box.y0],
        [box.x0 + titleW + T.gap + 0.6, box.y0 + box.h],
        [box.x0 + titleW + T.gap, box.y0 + box.h],
      ]);
  }
  return { polys, issues };
}

/** Label plate (and raised text body when there is text), lying flat. */
export function buildLabel(kit, d, font, title = "", lines = []) {
  const { w, h } = d.label;
  const plate = kit.chamferExt(kit.move2(kit.rrect(w, h, 1), w / 2, h / 2), 0, LABEL.t, 0, 0.2);
  if (!font || (!title.trim() && !lines.some((l) => l.trim())))
    return { plate, text: null, issues: [] };
  const { polys, issues } = labelText(font, w, h, title, lines);
  if (!polys.length) return { plate, text: null, issues };
  const cs = kit.own(kit.CrossSection.ofPolygons(polys, "NonZero"));
  const text = kit.ext(cs, LABEL.t - 0.01, LABEL.t + LABEL_TEXT.rise);
  return { plate, text, issues };
}
