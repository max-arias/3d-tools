import { h } from "./h.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const decimals = (n) => (String(n).split(".")[1] ?? "").length;

/** Numeric text field. Commits live when valid, clamps on blur/Enter, arrows + wheel step. */
export function numField({ value, min = -Infinity, max = Infinity, step, unit, key, onChange }) {
  const st = step ?? (Number.isInteger(value) && Number.isInteger(min) ? 1 : 0.1);
  const input = h("input", {
    type: "text",
    inputMode: "decimal",
    value: String(value),
    dataset: key ? { key } : undefined,
  });
  const fmt = (n) => String(+n.toFixed(Math.max(decimals(st), 2)));
  const parse = () => Number(input.value.trim().replace(",", "."));
  const commit = (v) => {
    const c = clamp(v, min, max);
    input.value = fmt(c);
    if (c !== value) {
      value = c;
      onChange(c);
    }
  };
  const nudge = (dir, big) => commit(Math.round((value + dir * st * (big ? 10 : 1)) / st) * st);

  input.addEventListener("input", () => {
    const v = parse();
    if (input.value.trim() !== "" && Number.isFinite(v) && v >= min && v <= max && v !== value) {
      value = v;
      onChange(v);
    }
  });
  input.addEventListener("blur", () => {
    const v = parse();
    commit(Number.isFinite(v) ? v : value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
    }
  });
  input.addEventListener(
    "wheel",
    (e) => {
      if (document.activeElement !== input) return;
      e.preventDefault();
      nudge(e.deltaY < 0 ? 1 : -1, e.shiftKey);
    },
    { passive: false },
  );
  return h("span", { class: "num" }, input, unit && h("span", { class: "unit muted" }, unit));
}

/** - / + stepper. */
export function stepper({ value, min, max, step = 1, onChange }) {
  const out = h("output", {}, String(value));
  const go = (dir) => {
    value = clamp(+(value + dir * step).toFixed(4), min, max);
    out.textContent = String(value);
    onChange(value);
  };
  return h(
    "span",
    { class: "stepper" },
    h("button", { onclick: () => go(-1), "aria-label": "less" }, "−"),
    out,
    h("button", { onclick: () => go(1), "aria-label": "more" }, "+"),
  );
}

/** Segmented control: options = [{ value, label }]. */
export function segmented({ value, options, onChange }) {
  const wrap = h("span", { class: "segmented", role: "group" });
  const paint = () =>
    [...wrap.children].forEach((b, i) =>
      b.setAttribute("aria-pressed", String(options[i].value === value)),
    );
  options.forEach((o) =>
    wrap.append(
      h(
        "button",
        {
          onclick: () => {
            value = o.value;
            paint();
            onChange(value);
          },
        },
        o.label,
      ),
    ),
  );
  paint();
  return wrap;
}

export function checkbox({ checked, label, hint, key, onChange }) {
  const box = h("input", {
    type: "checkbox",
    checked,
    dataset: key ? { key } : undefined,
    onchange: () => onChange(box.checked),
  });
  return h("label", { class: "check", title: hint }, box, h("span", {}, label));
}

export function slider({ value, min, max, step = 1, key, onChange }) {
  const out = h("output", {}, String(value));
  const input = h("input", {
    type: "range",
    dataset: key ? { key } : undefined,
    min,
    max,
    step,
    value,
    oninput: () => {
      out.textContent = input.value;
      onChange(Number(input.value));
    },
  });
  return h("span", { class: "slider" }, input, out);
}

/** Option card with title, description and optional meta. */
export function card({ title, desc, meta, selected, onClick }) {
  return h(
    "button",
    { class: "card", "aria-pressed": String(!!selected), onclick: onClick },
    h("b", {}, title),
    desc && h("span", { class: "muted" }, desc),
    meta && h("small", {}, meta),
  );
}

/** Labelled row: label on the left, control on the right. */
export function row(label, control, hint) {
  return h(
    "div",
    { class: "row" },
    h("label", {}, label),
    control,
    hint && h("p", { class: "hint muted" }, hint),
  );
}
