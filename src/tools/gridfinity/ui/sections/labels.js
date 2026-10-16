import { h } from "../../../../shell/h.js";
import { checkbox, numField, row, segmented } from "../../../../shell/widgets.js";
import {
  binOuter,
  labelOrder,
  labelSlotCount,
  slotRanges,
  tabDepth,
  textBox,
} from "../../layout/labels.js";
import { effectiveBin } from "../../model/effective.js";
import { setValue } from "../scope.js";
import { getLayout, notify } from "../state.js";
import { scopedSegmented } from "./bins.js";

export const id = "labels";
export const scoped = true;
export const title = "Labels";
export const summary = (project) => {
  const n = project.bins.reduce((sum, b) => sum + (b.labels ?? []).filter(Boolean).length, 0);
  return n === 1 ? "1 label" : `${n} labels`;
};

const CAP_RATIO = 1490 / 2048;
const WALL_NAMES = {
  front: "the front wall",
  back: "the back wall",
  left: "the left wall",
  right: "the right wall",
};
const n1 = (v) => +v.toFixed(1);
const sub = (text) => h("h3", { class: "s-sub" }, text);

// Slot focused for the preview; survives re-renders (the dock rebuilds this section on every change).
let focus = null;

/** Every bin in list order with its effective settings and slot count. */
const slotsOf = (project) =>
  labelOrder(project.bins).map((bin) => {
    const eff = effectiveBin(project, bin);
    return { bin, eff, n: labelSlotCount(eff) };
  });

/** Write texts for one bin: keeps the array at slot count, trims trailing empties. */
function writeTexts(draft, binId, n, edit) {
  const b = draft.bins.find((x) => x.id === binId);
  const arr = Array.from({ length: n }, (_, k) => b.labels?.[k] ?? "");
  edit(arr);
  while (arr.length && !arr.at(-1)) arr.pop();
  if (arr.length) b.labels = arr;
  else delete b.labels;
}

// ---- label text list -----------------------------------------------------------------------------

function textRow({ update, setUi }, { bin, eff, n }, i, onFocus) {
  const input = h("input", {
    type: "text",
    maxLength: 40,
    placeholder: "Empty",
    value: bin.labels?.[i] ?? "",
    dataset: { key: `label.${bin.id}.${i}` },
    onfocus: () => {
      focus = { binId: bin.id, slot: i };
      onFocus();
    },
    oninput: () =>
      update(
        (d) => writeTexts(d, bin.id, n, (arr) => void (arr[i] = input.value)),
        `label:${bin.id}:${i}`,
      ),
  });
  const active = focus?.binId === bin.id && focus.slot === i;
  return h(
    "div",
    { class: `s-lrow${active ? " s-focus" : ""}` },
    h(
      "button",
      { class: "s-tag", title: "Select this bin", onclick: () => setUi({ selected: bin.id }) },
      `${bin.w}×${bin.d}`,
    ),
    h("span", { class: "s-note" }, eff.label === "full" ? "whole" : `${i + 1}/${n}`),
    input,
  );
}

function noTabRow({ update, setUi }, bin) {
  return h(
    "div",
    { class: "s-lrow" },
    h(
      "button",
      { class: "s-tag", title: "Select this bin", onclick: () => setUi({ selected: bin.id }) },
      `${bin.w}×${bin.d}`,
    ),
    h("span", { class: "s-note" }, "No tab"),
    h(
      "button",
      { class: "s-link", onclick: () => update((d) => setValue(d, bin.id, "label", "front")) },
      "Add a tab",
    ),
  );
}

/** Fill empty slots in list order with `next()` until it returns null. Returns the count. */
function fillEmpty({ update }, next) {
  let count = 0;
  update((d) => {
    for (const { bin, n } of slotsOf(d)) {
      if (!n) continue;
      writeTexts(d, bin.id, n, (arr) => {
        for (let i = 0; i < n; i++) {
          if (arr[i]) continue;
          const text = next();
          if (text == null) return;
          arr[i] = text;
          count++;
        }
      });
    }
  });
  return count;
}

function paste(ctx, text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().slice(0, 40))
    .filter(Boolean);
  const queue = [...lines];
  const n = fillEmpty(ctx, () => queue.shift());
  notify(n === 1 ? "Filled in 1 label" : `Filled in ${n} labels`);
}

function textGroup(ctx) {
  const { project, update } = ctx;
  const slots = slotsOf(project);
  const list = h("div", { class: "s-labels" });
  let preview = previewBox(ctx);
  const paintPreview = () => {
    const next = previewBox(ctx);
    preview.replaceWith(next);
    preview = next;
  };
  for (const s of slots) {
    if (!s.n) list.append(noTabRow(ctx, s.bin));
    for (let i = 0; i < s.n; i++) list.append(textRow(ctx, s, i, paintPreview));
  }
  const area = h("div", { class: "s-dialog", hidden: true });
  const askList = () => {
    const box = h("textarea", { rows: 5, placeholder: "One name per line" });
    const close = () => ((area.hidden = true), area.replaceChildren());
    area.hidden = false;
    area.replaceChildren(
      h(
        "p",
        { class: "s-note" },
        "Type or paste one name per line. They go into the empty labels, in plan-view order.",
      ),
      box,
      h(
        "div",
        { class: "s-btns" },
        h(
          "button",
          { class: "primary", onclick: () => (paste(ctx, box.value), close()) },
          "Fill labels",
        ),
        h("button", { onclick: close }, "Cancel"),
      ),
    );
  };
  const onPaste = async () => {
    try {
      paste(ctx, await navigator.clipboard.readText());
    } catch {
      askList();
    }
  };
  const number = () => {
    let k = 0;
    fillEmpty(ctx, () => String(++k));
  };
  return [
    sub("Label text"),
    h(
      "p",
      { class: "hint muted" },
      "Click a field to see that label in the preview. Up to 40 characters each.",
    ),
    preview,
    slots.length
      ? list
      : h("p", { class: "hint muted" }, "There are no bins yet. Draw some in the plan view."),
    h(
      "div",
      { class: "s-btns" },
      h("button", { onclick: onPaste }, "Paste a list of names"),
      h("button", { onclick: number }, "Number the empty ones"),
      h(
        "button",
        { onclick: () => update((d) => d.bins.forEach((b) => void delete b.labels)) },
        "Clear all labels",
      ),
    ),
    area,
  ];
}

// ---- tab / style -----------------------------------------------------------------------------------

function tabHint(ctx) {
  const { project, bin } = ctx;
  const eff = effectiveBin(project, bin ?? {});
  const wall = WALL_NAMES[eff.labelWall];
  if (eff.label === "none") return `No tab, so ${wall} stays plain.`;
  if (!bin) {
    return eff.label === "full"
      ? `One tab runs along ${wall}.`
      : `${wall[0].toUpperCase()}${wall.slice(1)} gets one tab for each compartment.`;
  }
  const layout = getLayout(project);
  const outer = layout.error ? null : binOuter(layout.grid, bin);
  const frontBack = eff.labelWall === "front" || eff.labelWall === "back";
  if (eff.label === "full") {
    const mm = outer ? `, ${n1(frontBack ? outer.w : outer.d)} mm wide` : "";
    return `One tab runs along ${wall}${mm}.`;
  }
  const n = labelSlotCount(eff);
  return n === 1
    ? `One tab on ${wall}, because this bin has a single compartment. Add splits in Bins for more.`
    : `${n} tabs on ${wall}, one per compartment. Change the splits in Bins.`;
}

function tabGroup(ctx) {
  return [
    sub("Label tab"),
    scopedSegmented(ctx, "label", "Tab", [
      { value: "none", label: "No tab" },
      { value: "front", label: "One per compartment" },
      { value: "full", label: "One across the whole wall" },
    ]),
    scopedSegmented(ctx, "labelWall", "Wall", [
      { value: "front", label: "Front" },
      { value: "back", label: "Back" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ]),
    h("p", { class: "hint muted" }, tabHint(ctx)),
  ];
}

function styleGroup({ project, ui, update }) {
  const s = project.labelStyle;
  const set = (prop, coalesce) => (v) =>
    update((d) => void (d.labelStyle[prop] = v), coalesce && `labelStyle:${prop}`);
  const hints = {
    raised: `Letters stand ${s.depthMm} mm proud of the tab. Single colour, nothing to set up in the slicer.`,
    engraved: `Letters are cut ${s.depthMm} mm into the tab. Single colour, and easy to fill with paint.`,
    inlay:
      "Letters sit flush as a separate body in the 3MF. Give that body its own filament in your slicer.",
  };
  return [
    sub("Lettering (applies to every label)"),
    segmented({
      value: s.kind,
      options: [
        { value: "raised", label: "Raised letters" },
        { value: "engraved", label: "Engraved letters" },
        { value: "inlay", label: "Two-colour inlay" },
      ],
      onChange: set("kind"),
    }),
    h("p", { class: "hint muted" }, hints[s.kind]),
    row(
      "Capital letters",
      segmented({
        value: s.case,
        options: [
          { value: "as", label: "Keep my capitals" },
          { value: "upper", label: "ALL CAPS" },
        ],
        onChange: set("case"),
      }),
    ),
    checkbox({
      checked: s.autoFit,
      label: "Shrink long text to fit the tab",
      key: "label.fit",
      onChange: set("autoFit"),
    }),
    ui.advanced && [
      row(
        "Largest letter height",
        numField({
          value: s.maxMm,
          min: 3,
          max: 12,
          step: 0.5,
          unit: "mm",
          key: "label.max",
          onChange: set("maxMm", true),
        }),
      ),
      row(
        "Letter depth",
        numField({
          value: s.depthMm,
          min: 0.2,
          max: 1.2,
          step: 0.1,
          unit: "mm",
          key: "label.depth",
          onChange: set("depthMm", true),
        }),
      ),
    ],
  ];
}

// ---- preview ---------------------------------------------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

/** Slot shown in the preview: the focused one, else the first slot that has a tab. */
function previewTarget(project) {
  const slots = slotsOf(project);
  const f = slots.find((s) => s.bin.id === focus?.binId && s.n > focus.slot);
  if (f) return { ...f, slot: focus.slot };
  const first = slots.find((s) => s.n > 0);
  return first ? { ...first, slot: 0 } : null;
}

function previewBox({ project, ui }) {
  const box = h("div", { class: "s-stack" });
  const target = previewTarget(project);
  const layout = getLayout(project);
  if (!target || layout.error) {
    box.append(h("p", { class: "hint muted" }, "Give a bin a label tab to see a preview here."));
    return box;
  }
  const { bin, eff, n, slot } = target;
  const outer = binOuter(layout.grid, bin);
  const frontBack = eff.labelWall === "front" || eff.labelWall === "back";
  const len = frontBack ? outer.w : outer.d;
  const depth = tabDepth(eff, outer);
  const [r0, r1] = slotRanges(len, n, eff.label)[slot];
  const text = bin.labels?.[slot] ?? "";
  const info = ui.result?.labels?.find(
    (l) => l.binId === bin.id && l.slot === slot && l.text === text,
  );
  const tw = r1 - r0;
  if (!depth) {
    box.append(h("p", { class: "hint muted" }, "This bin is too small to fit a label tab."));
    return box;
  }

  const pad = 2;
  const el = svg("svg", {
    class: "s-preview",
    viewBox: `${-pad} ${-pad} ${tw + 2 * pad} ${depth + 2 * pad}`,
  });
  el.append(
    svg("rect", {
      x: 0,
      y: 0,
      width: tw,
      height: depth,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.3,
    }),
  );
  const tb = textBox({ r0, r1, len, wall: eff.wall, depth });
  if (text && tb && info) {
    const shown = project.labelStyle.case === "upper" ? text.toUpperCase() : text;
    const size = info.size ?? tb.h;
    el.append(
      svg(
        "text",
        {
          x: tb.u0 - r0 + tb.w / 2,
          y: depth - 1 - (tb.h - size) / 2 - 0.5,
          "text-anchor": "middle",
          "font-size": size / CAP_RATIO,
        },
        shown,
      ),
    );
  }
  box.append(el);
  if (info) {
    box.append(
      h(
        "span",
        { class: "s-note" },
        `Tab ${n1(tw)} × ${n1(depth)} mm · letters ${n1(info.size)} mm`,
      ),
    );
    if (info.status === "small")
      box.append(
        h(
          "span",
          { class: "s-note s-bad" },
          `The text was shrunk to ${n1(info.size)} mm. Below 4 mm it may not print cleanly with a 0.4 mm nozzle.`,
        ),
      );
    if (info.status === "overflow")
      box.append(
        h(
          "span",
          { class: "s-note s-bad" },
          `Too long for the tab even at ${n1(info.size)} mm, so the ends get cut off. Shorten it or turn on shrinking.`,
        ),
      );
    if (info.skipped?.length)
      box.append(
        h("span", { class: "s-note s-bad" }, `Can't be printed: ${info.skipped.join(" ")}`),
      );
  } else {
    box.append(h("span", { class: "s-note" }, `Tab ${n1(tw)} × ${n1(depth)} mm`));
  }
  return box;
}

export function render(ctx) {
  return h("div", { class: "s-sec" }, tabGroup(ctx), textGroup(ctx), styleGroup(ctx));
}
