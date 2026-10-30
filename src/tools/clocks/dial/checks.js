// Fit checks shown as notes: { level: "bad" | "warn" | "info", key, vars }. Pure: reads the project
// and the worker's info.
import { TORQUE_LIMIT } from "../model/movements.js";

/** Smallest gap kept between the hour hand and anything raised on the dial, mm. */
export const HAND_GAP = 0.5;

export function fitChecks(p, info) {
  const out = [];
  const add = (level, key, vars) => out.push({ level, key, vars });
  for (const n of info.notes) add(n === "hubOutside" || n === "dialThin" ? "bad" : "info", n);
  const mv = p.movement;
  // Raised art and markers must stay under the hour hand.
  const gap = mv.hourAt - info.hubDial - info.raised;
  if (gap < HAND_GAP) add("bad", "handsHitDecor", { gap: gap.toFixed(1) });
  if (info.recess > 0) add("info", "recessed", { d: info.recess.toFixed(1), max: mv.maxDial });
  for (const h of info.hands) {
    if (h.id !== "hour" && h.length > info.R + 2) add("warn", "handLong", { id: h.id });
    const limit = TORQUE_LIMIT[mv.torque];
    if (Math.abs(h.moment) > limit)
      add("warn", "heavyHand", { id: h.id, m: Math.abs(h.moment).toFixed(1), limit });
  }
  const [w, h] = info.size;
  const b = p.build;
  if (!((w <= b.x && h <= b.y) || (h <= b.x && w <= b.y)))
    add("bad", "tooBig", { w: w.toFixed(0), h: h.toFixed(0) });
  if (info.splitBack) add("info", "splitBack");
  if (p.markers.numerals !== "none" && p.markers.size > 0 && p.markers.size < 5)
    add("warn", "smallNumerals");
  if (p.cutouts.kind !== "none" && info.holes === 0) add("warn", "noHoles");
  return out;
}
