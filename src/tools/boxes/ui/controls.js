import { h } from "../../../shell/h.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** - / + stepper with data-keys (`<key>.dec`, `<key>.inc`, `<key>`) so focus survives a repaint. */
export function stepper({ key, value, min, max, onChange }) {
  const go = (dir) => onChange(clamp(value + dir, min, max));
  return h(
    "span",
    { class: "stepper" },
    h(
      "button",
      {
        dataset: { key: `${key}.dec` },
        disabled: value <= min,
        onclick: () => go(-1),
        "aria-label": "less",
      },
      "−",
    ),
    h("output", { dataset: { key } }, String(value)),
    h(
      "button",
      {
        dataset: { key: `${key}.inc` },
        disabled: value >= max,
        onclick: () => go(1),
        "aria-label": "more",
      },
      "+",
    ),
  );
}
