// What the summary list and the copyable pack sheet say about the generated parts. Pure text, no DOM.
import { t } from "../lib/i18n.js";
import { printEstimate } from "../model/packs.js";

/** "2 x 1" style detail of a bin part, from its id (`bin:<key>`, key = [w, d, dx, dy, scoop, label]). */
export function binDetails(part) {
  try {
    const [, , dx, dy, scoop, label] = JSON.parse(part.id.slice(4));
    return [
      dx || dy ? t("binDividers", { x: dx, y: dy }) : "",
      scoop ? t("scoop") : "",
      label ? t("labelTab") : "",
    ].filter(Boolean);
  } catch {
    return [];
  }
}

export function partTitle(part) {
  return part.kind === "bin"
    ? `${t("part_bin")} ${part.bin.w}×${part.bin.d}`
    : t(`part_${part.kind}`);
}

/** Layer height, walls and infill from the geometry, then the notes for that kind of part. */
export function printNote(part, hinge) {
  const { layer, walls, infill } = part.print;
  const base = t("printLine", { layer, walls, infill });
  const extra =
    part.kind === "base" || part.kind === "lid"
      ? t(`note_${part.kind}`)
      : part.kind === "hinge"
        ? t(hinge === "screw" ? "note_hingeScrew" : "note_hingePin")
        : part.kind === "latch"
          ? t("note_latch")
          : part.kind === "label" && part.bodies.length > 1
            ? t("note_labelTwo")
            : "";
  return [base, extra].filter(Boolean).join(" · ");
}

export const sizeText = (size) => size.map((v) => v.toFixed(1)).join(" × ");

/** Screws and nuts the printed box needs, as [qty, text]. */
export function hardware(project) {
  const out = [];
  if (project.handle.on && project.handle.fix === "bolt") out.push([2, t("hwHandleBolt")]);
  if (project.hinge === "screw") {
    out.push([2, t("hwHingeBolt")]);
    out.push([2, t("hwHingeNut")]);
  }
  return out;
}

export const estimateText = (parts) => {
  const { grams, minutes } = printEstimate(parts);
  return { grams: Math.round(grams), hours: (minutes / 60).toFixed(1) };
};

/** Plain-text pack sheet for a listing or a note: box size, parts with quantities, hardware, totals. */
export function packSheet(project, data) {
  const { grid } = project;
  const { dims, parts } = data;
  const est = estimateText(parts);
  const lines = [
    t("sheetTitle", { x: grid.x, y: grid.y, u: grid.u }),
    t("sheetOuter", {
      size: [dims.W, dims.D, dims.closedH].map((v) => v.toFixed(1)).join(" × "),
    }),
  ];
  if (project.pack) lines.push(t("sheetPack", { name: t(`pack.${project.pack}.name`) }));
  lines.push("", t("sheetParts"));
  for (const p of parts) {
    const details = p.kind === "bin" ? binDetails(p) : [];
    lines.push(
      `- ${p.qty}× ${partTitle(p)} (${sizeText(p.size)} mm)${details.length ? ` - ${details.join(", ")}` : ""}`,
    );
  }
  const hw = hardware(project);
  lines.push("", t("sheetHardware"));
  if (hw.length) for (const [qty, text] of hw) lines.push(`- ${qty}× ${text}`);
  else lines.push(`- ${t("hwNone")}`);
  lines.push("", t("sheetTotals", est));
  return lines.join("\n");
}
