// Hand-stack view: a side section through the shaft, drawn to scale, so you can see whether the
// thread reaches through the dial and the hands clear what is raised on it.
import { HAND_GAP } from "../dial/checks.js";
import { t } from "../lib/i18n.js";

const SVG = "http://www.w3.org/2000/svg";
const el = (tag, attrs, text) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

/** Draw the section for `info` (worker result) and `p` (project) into a fresh <svg>. */
export function drawStack(p, info) {
  const mv = p.movement;
  const [, bodyH, bodyD] = mv.body;
  const T = info.thickness;
  const recess = info.recess;
  // Section coordinates: x = height through the clock (back to front, mm), y = up the dial (mm).
  const zMin = recess - bodyD - 4;
  const zMax = recess + mv.secondAt + 4;
  const yMax = bodyH / 2 + 18;
  const k = 9; // px per mm
  const W = (zMax - zMin) * k + 220;
  const H = yMax * 2 * k + 40;
  const X = (z) => 30 + (z - zMin) * k;
  const Y = (y) => 20 + (yMax - y) * k;
  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "stack-svg",
    role: "img",
    "aria-label": t("mode_stack"),
  });
  const rect = (z0, z1, y0, y1, cls) =>
    svg.append(
      el("rect", { x: X(z0), y: Y(y1), width: (z1 - z0) * k, height: (y1 - y0) * k, class: cls }),
    );
  const label = (z, y, text, cls = "") =>
    svg.append(el("text", { x: X(z) + 6, y: Y(y), class: `lbl ${cls}` }, text));

  // Dial: full thickness away from the movement, thinned over it.
  rect(0, T, bodyH / 2 + 2, yMax, "s-dial");
  rect(0, T, -yMax, -bodyH / 2 - 2, "s-dial");
  rect(recess, T, mv.dialHole / 2, bodyH / 2 + 2, "s-dial");
  rect(recess, T, -bodyH / 2 - 2, -mv.dialHole / 2, "s-dial");
  if (info.raised > 0) rect(T, T + info.raised, bodyH / 2 + 4, yMax - 2, "s-raised");
  // Movement, threaded shaft, nut and hands.
  rect(recess - bodyD, recess, -bodyH / 2, bodyH / 2, "s-move");
  rect(recess, recess + mv.maxDial, -mv.dialHole / 2 + 0.4, mv.dialHole / 2 - 0.4, "s-shaft");
  rect(recess + mv.maxDial, recess + mv.hourAt, -mv.hour / 2, mv.hour / 2, "s-shaft");
  rect(recess + mv.hourAt, recess + mv.minuteAt, -mv.minute / 2, mv.minute / 2, "s-shaft");
  rect(recess + mv.minuteAt, recess + mv.secondAt, -0.5, 0.5, "s-shaft");
  const th = p.hands.thickness;
  const lens = Object.fromEntries(info.hands.map((h) => [h.id, h.length]));
  rect(
    recess + mv.hourAt,
    recess + mv.hourAt + th,
    -4,
    Math.min(yMax - 4, lens.hour ?? 30),
    "s-hand",
  );
  rect(
    recess + mv.minuteAt,
    recess + mv.minuteAt + th,
    -6,
    Math.min(yMax - 2, lens.minute ?? 45),
    "s-hand",
  );
  if (p.hands.second) rect(recess + mv.secondAt, recess + mv.secondAt + 1, -8, yMax - 2, "s-hand");

  const gap = mv.hourAt - info.hubDial - info.raised;
  label(T, yMax - 2, `${t("stackDial")} ${T} mm`);
  label(recess + mv.hourAt + th, Math.min(yMax - 6, lens.hour ?? 30), t("stackHour"));
  label(recess + mv.minuteAt + th, Math.min(yMax - 10, lens.minute ?? 45) - 4, t("stackMinute"));
  label(recess - bodyD, -bodyH / 2 - 3, `${t("stackMovement")} ${mv.body.join(" × ")} mm`);
  label(
    recess + mv.maxDial,
    -mv.dialHole / 2 - 3,
    `${t("stackDialAtHub")} ${info.hubDial} / ${mv.maxDial} mm`,
    info.hubDial > mv.maxDial ? "bad" : "",
  );
  label(T, -yMax + 3, `${t("stackGap")} ${gap.toFixed(1)} mm`, gap < HAND_GAP ? "bad" : "ok");
  return svg;
}
