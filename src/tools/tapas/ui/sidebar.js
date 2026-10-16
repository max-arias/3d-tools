import { h } from "../../../shell/h.js";
import { numField, row, segmented, slider, stepper } from "../../../shell/widgets.js";
import { langStore, t } from "../lib/i18n.js";
import { MODULE_IDS } from "../model/modules.js";
import { PRESETS, presetById } from "../model/presets.js";
import { PATTERN_MODES, usedSlots } from "../model/project.js";
import { PATTERN_IDS } from "../geom/patterns.js";
import { SHAPE_IDS } from "../geom/shapes.js";
import { download3mf, downloadStl, fits } from "./export.js";
import { project, result, update, view } from "./state.js";

const SWATCHES = [
  "#e9e4d8",
  "#f5f5f2",
  "#1f2023",
  "#c9442f",
  "#e0a82e",
  "#4f8a5b",
  "#3c6fa8",
  "#d98fa4",
  "#8a6bbf",
  "#8b6a4a",
];
const PRINTERS = [
  ["256 × 256 (Bambu A1/P1S/X1)", 256, 256],
  ["220 × 220 (Ender-3)", 220, 220],
  ["180 × 180 (A1 mini)", 180, 180],
  ["350 × 350 (grande)", 350, 350],
];

const MEASURE_SVG = `<svg viewBox="0 0 220 150" role="img" aria-label="diagram">
  <rect x="50" y="14" width="90" height="122" rx="10" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="68" y="30" width="54" height="26" rx="3" fill="none" stroke="currentColor" opacity=".5"/>
  <rect x="68" y="62" width="54" height="26" rx="3" fill="none" stroke="currentColor" opacity=".5"/>
  <rect x="68" y="94" width="54" height="26" rx="3" fill="none" stroke="currentColor" opacity=".5"/>
  <path d="M50 8h90M50 5v6M140 5v6M146 14v122M143 14h6M143 136h6" stroke="var(--accent)" fill="none" stroke-width="1.5"/>
  <text x="95" y="7" fill="var(--accent)" font-size="9" text-anchor="middle">A</text>
  <text x="158" y="78" fill="var(--accent)" font-size="9">B</text>
  <path d="M160 130h40v12h-40z" fill="none" stroke="currentColor" opacity=".6"/>
  <path d="M160 142v-6h40" stroke="var(--accent)" fill="none" stroke-width="1.5"/>
  <text x="180" y="124" fill="var(--accent)" font-size="9" text-anchor="middle">C</text>
</svg>`;

const section = (id, title, ...body) => {
  const d = h(
    "details",
    { class: "sec", open: true, dataset: { sec: id } },
    h("summary", {}, title),
    h("div", { class: "sec-body" }, ...body),
  );
  return d;
};

export function createSidebar() {
  const root = h("aside", { class: "side" });
  let presetSelect;

  const productSection = () =>
    section(
      "product",
      t("product"),
      h(
        "div",
        { class: "cards" },
        h(
          "button",
          { class: "card", "aria-pressed": "true" },
          h("b", {}, t("overlay")),
          h("span", { class: "muted" }, t("overlayDesc")),
        ),
        ["tapa", "keycap", "frame"].map((k) =>
          h(
            "button",
            { class: "card", disabled: true },
            h("b", {}, t(k)),
            h("small", {}, t("soon")),
          ),
        ),
      ),
    );

  const measuresSection = () => {
    const p = project.get();
    const preset = presetById(p.preset);
    presetSelect = h(
      "select",
      {
        onchange: (e) => {
          const next = presetById(e.target.value);
          update((q) => {
            q.preset = next.id;
            if (next.plate) q.plate = { ...next.plate };
            q.mods.slots = next.slots;
            q.groups = Array.from({ length: next.groups }, () =>
              ["tecla", "tecla", "tecla"].slice(0, next.slots),
            );
          });
          paint();
        },
      },
      PRESETS.map((x) => h("option", { value: x.id, selected: x.id === p.preset }, x.label)),
    );
    const num = (label, key, min, max, step = 0.5, unit = "mm") =>
      row(
        label,
        numField({
          value: p.plate[key],
          min,
          max,
          step,
          unit,
          onChange: (v) => update((q) => (q.plate[key] = v)),
        }),
      );
    return section(
      "measures",
      t("measures"),
      row(t("preset"), presetSelect),
      preset.source && h("p", { class: "hint muted" }, t("presetUnverified")),
      num(t("plateW"), "w", 30, 300),
      num(t("plateH"), "h", 30, 300),
      num(t("plateD"), "d", 2, 30),
      num(t("plateR"), "r", 0, 30),
      row(
        t("clearance"),
        numField({
          value: p.overlay.clearance,
          min: 0,
          max: 1.5,
          step: 0.05,
          unit: "mm",
          onChange: (v) => update((q) => (q.overlay.clearance = v)),
        }),
      ),
      h(
        "details",
        { class: "help" },
        h("summary", {}, t("measureHelp")),
        h("div", { class: "diagram", innerHTML: MEASURE_SVG }),
        h(
          "p",
          { class: "muted" },
          "A = ",
          t("plateW"),
          " · B = ",
          t("plateH"),
          " · C = ",
          t("plateD"),
          ". ",
          t("measureHelpText"),
        ),
      ),
    );
  };

  const modulesSection = () => {
    const p = project.get();
    return section(
      "modules",
      t("modules"),
      h("p", { class: "hint muted" }, t("modulesHint")),
      row(
        t("groups"),
        stepper({
          value: p.groups.length,
          min: 1,
          max: 3,
          onChange: (n) => {
            update((q) => {
              while (q.groups.length < n)
                q.groups.push(["tecla", "tecla", "tecla"].slice(0, q.mods.slots));
              q.groups.length = n;
            });
            paint();
          },
        }),
      ),
      row(
        t("slots"),
        stepper({
          value: p.mods.slots,
          min: 1,
          max: 6,
          onChange: (n) => {
            update((q) => (q.mods.slots = n));
            paint();
          },
        }),
      ),
      p.groups.map((group, g) => {
        const used = usedSlots(group);
        return h(
          "div",
          { class: "group" },
          h(
            "div",
            { class: "group-head" },
            h("b", {}, t("group", { n: g + 1 })),
            h("small", { class: used > p.mods.slots ? "bad" : "muted" }, `${used}/${p.mods.slots}`),
          ),
          h(
            "div",
            { class: "mods" },
            group.map((m, i) =>
              h(
                "span",
                { class: "mod" },
                h(
                  "select",
                  {
                    "aria-label": t(`m.${m}`),
                    onchange: (e) => {
                      update((q) => (q.groups[g][i] = e.target.value));
                      paint();
                    },
                  },
                  MODULE_IDS.map((id) =>
                    h("option", { value: id, selected: id === m }, t(`m.${id}`)),
                  ),
                ),
                h(
                  "button",
                  {
                    class: "x",
                    title: t("remove"),
                    "aria-label": t("remove"),
                    onclick: () => {
                      update((q) => q.groups[g].splice(i, 1));
                      paint();
                    },
                  },
                  "×",
                ),
              ),
            ),
            h(
              "button",
              {
                class: "add",
                onclick: () => {
                  update((q) => q.groups[g].push("tecla"));
                  paint();
                },
              },
              "+ ",
              t("add"),
            ),
          ),
          used > p.mods.slots &&
            h("p", { class: "bad" }, t("slotsOver", { used, slots: p.mods.slots })),
        );
      }),
      row(
        t("pitch"),
        numField({
          value: p.mods.pitch,
          min: 15,
          max: 40,
          step: 0.5,
          unit: "mm",
          onChange: (v) => update((q) => (q.mods.pitch = v)),
        }),
      ),
      row(
        t("margin"),
        numField({
          value: p.mods.margin,
          min: 0,
          max: 3,
          step: 0.1,
          unit: "mm",
          onChange: (v) => update((q) => (q.mods.margin = v)),
        }),
      ),
    );
  };

  const shapeSection = () => {
    const p = project.get();
    return section(
      "shape",
      t("shape"),
      h("p", { class: "hint muted" }, t("shapeHint")),
      h(
        "div",
        { class: "chips" },
        SHAPE_IDS.map((id) =>
          h(
            "button",
            {
              class: "chip",
              "aria-pressed": String(p.overlay.shape === id),
              onclick: () => {
                update((q) => (q.overlay.shape = id));
                paint();
              },
            },
            t(`s.${id}`),
          ),
        ),
      ),
      p.overlay.shape === "rounded" &&
        row(
          t("corner"),
          numField({
            value: p.overlay.corner,
            min: 0,
            max: 40,
            step: 0.5,
            unit: "mm",
            onChange: (v) => update((q) => (q.overlay.corner = v)),
          }),
        ),
      row(
        t("wall"),
        numField({
          value: p.overlay.wall,
          min: 1.2,
          max: 8,
          step: 0.2,
          unit: "mm",
          onChange: (v) => update((q) => (q.overlay.wall = v)),
        }),
      ),
      row(
        t("face"),
        numField({
          value: p.overlay.face,
          min: 1,
          max: 6,
          step: 0.2,
          unit: "mm",
          onChange: (v) => update((q) => (q.overlay.face = v)),
        }),
      ),
    );
  };

  const designSection = () => {
    const p = project.get();
    const pat = p.pattern;
    const on = pat.id !== "none";
    const field = (label, key, min, max, step) =>
      row(
        label,
        slider({
          value: pat[key],
          min,
          max,
          step,
          onChange: (v) => update((q) => (q.pattern[key] = v)),
        }),
      );
    return section(
      "design",
      t("design"),
      h("p", { class: "hint muted" }, t("designHint")),
      h(
        "div",
        { class: "chips" },
        ["none", ...PATTERN_IDS].map((id) =>
          h(
            "button",
            {
              class: "chip",
              "aria-pressed": String(pat.id === id),
              onclick: () => {
                update((q) => (q.pattern.id = id));
                paint();
              },
            },
            t(`p.${id}`),
          ),
        ),
      ),
      on && [
        h(
          "div",
          { class: "modes" },
          PATTERN_MODES.map((m) =>
            h(
              "button",
              {
                class: "card",
                "aria-pressed": String(pat.mode === m),
                onclick: () => {
                  update((q) => (q.pattern.mode = m));
                  paint();
                },
              },
              h("b", {}, t(`pm.${m}`)),
              h("span", { class: "muted" }, t(`pm.${m}.d`)),
            ),
          ),
        ),
        pat.id !== "guarda" && field(t("pScale"), "scale", 4, 40, 1),
        field(t("pWeight"), "weight", 0.15, 0.85, 0.05),
        pat.id !== "guarda" && field(t("pRot"), "rot", 0, 180, 15),
        field(t("pMargin"), "margin", 1, 8, 0.5),
        pat.mode !== "cutthrough" && field(t("pDepth"), "depth", 0.4, 1.6, 0.2),
      ],
    );
  };

  const colorSection = () => {
    const p = project.get();
    const two = p.pattern.id !== "none" && ["inlay", "raised"].includes(p.pattern.mode);
    const swatches = (key) =>
      h(
        "div",
        { class: "swatches" },
        SWATCHES.map((c) =>
          h("button", {
            class: "swatch",
            style: `background:${c}`,
            "aria-label": c,
            "aria-pressed": String(p[key].toLowerCase() === c),
            onclick: () => {
              update((q) => (q[key] = c));
              paint();
            },
          }),
        ),
        h("input", {
          type: "color",
          value: p[key],
          "aria-label": t("color"),
          oninput: (e) => update((q) => (q[key] = e.target.value)),
        }),
      );
    return section(
      "color",
      t("color"),
      swatches("color"),
      two && [
        h("b", { class: "sub" }, t("color2")),
        swatches("color2"),
        h("p", { class: "hint muted" }, t("twoColors")),
      ],
    );
  };

  const exportSection = () => {
    const p = project.get();
    const { part } = result.get();
    const copies = view.get().copies;
    const bed = p.printer;
    const ok = part ? fits(part, copies, bed) : true;
    const preset = PRINTERS.find(([, x, y]) => x === bed.x && y === bed.y);
    return section(
      "export",
      t("export"),
      row(
        t("copies"),
        stepper({
          value: copies,
          min: 1,
          max: 24,
          onChange: (n) => {
            view.set({ copies: n });
            paint();
          },
        }),
      ),
      row(
        t("printer"),
        h(
          "select",
          {
            onchange: (e) => {
              const [, x, y] = PRINTERS[e.target.value];
              update((q) => (q.printer = { x, y }));
              paint();
            },
          },
          PRINTERS.map(([label], i) =>
            h("option", { value: i, selected: PRINTERS[i] === preset }, label),
          ),
        ),
      ),
      part && h("p", { class: ok ? "ok" : "bad" }, ok ? t("bedFit") : t("bedNoFit")),
      h("p", { class: "hint muted" }, t("printHint")),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          { class: "primary", disabled: !part, onclick: () => downloadStl(part) },
          t("stl"),
        ),
        h(
          "button",
          { disabled: !part, onclick: () => download3mf(part, copies, bed) },
          t("threemf"),
        ),
      ),
    );
  };

  function paint() {
    const body = [
      productSection(),
      measuresSection(),
      modulesSection(),
      shapeSection(),
      designSection(),
      colorSection(),
      exportSection(),
    ];
    const open = new Map(
      [...root.querySelectorAll("details.sec")].map((d) => [d.dataset.sec, d.open]),
    );
    const scroll = root.scrollTop;
    const focus = document.activeElement?.dataset?.key;
    root.replaceChildren(...body);
    for (const d of root.querySelectorAll("details.sec"))
      if (open.has(d.dataset.sec)) d.open = open.get(d.dataset.sec);
    root.scrollTop = scroll;
    if (focus) root.querySelector(`[data-key="${focus}"]`)?.focus();
  }

  paint();
  langStore.subscribe(() => paint());
  // Typing in a numeric field must not rebuild the panel; structural changes do it explicitly via paint().
  project.subscribe(() => {
    if (presetSelect) {
      const p = project.get();
      const pre = presetById(p.preset);
      const same = pre.plate && ["w", "h", "d", "r"].every((k) => pre.plate[k] === p.plate[k]);
      presetSelect.value = same || p.preset === "custom" ? p.preset : "custom";
    }
  });
  // The export section depends on the result (fit check), which arrives later.
  result.subscribe((r) => {
    if (r.status !== "ok") return;
    const old = root.querySelector('[data-sec="export"]');
    old?.replaceWith(exportSection());
  });
  return root;
}
