import { h } from "../../../shell/h.js";
import { checkbox, numField, row, segmented, slider, stepper } from "../../../shell/widgets.js";
import { langStore, t } from "../lib/i18n.js";
import { MODULES } from "../model/modules.js";
import { PRESETS, presetById } from "../model/presets.js";
import { ICON_IDS } from "../geom/icons.js";
import { layoutModules } from "../geom/overlay.js";
import { ArtError, drawThumb, hasRasterSource, importFile, retrace } from "./art.js";
import { baysDiagram, plateDiagram } from "./diagrams.js";
import { PATTERN_MODES, PRODUCTS } from "../model/project.js";
import { PATTERN_IDS } from "../geom/patterns.js";
import { SHAPE_IDS } from "../geom/shapes.js";
import { download3mf, downloadCoupon, downloadHouse, downloadStl, platesFor } from "./export.js";
import {
  addItem,
  house,
  patchItem,
  project,
  removeItem,
  result,
  selectItem,
  update,
  view,
} from "./state.js";

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
  ["256 × 256 (Bambu X2D)", 256, 256],
  ["256 × 256 (Bambu P2D, a confirmar)", 256, 256],
  ["350 × 350 (grande)", 350, 350],
];

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

  const houseSection = () => {
    const { items, active } = house.get();
    const total = items.reduce((n, i) => n + i.qty, 0);
    let busy = false;
    const all = h(
      "button",
      {
        class: "primary",
        onclick: async () => {
          if (busy) return;
          busy = true;
          try {
            await downloadHouse(
              items,
              project.get().printer,
              (done, of) =>
                (all.textContent =
                  done < of ? t("houseBusy", { done: done + 1, of }) : t("houseAll")),
            );
          } finally {
            busy = false;
            all.textContent = t("houseAll");
          }
        },
      },
      t("houseAll"),
    );
    return section(
      "house",
      t("house"),
      h("p", { class: "hint muted" }, t("houseHint")),
      items.map((it) =>
        h(
          "div",
          { class: "hrow", "aria-current": String(it.id === active) },
          it.id === active
            ? h("input", {
                type: "text",
                maxLength: 40,
                value: it.name,
                "aria-label": t("coverName"),
                dataset: { key: "hname" },
                oninput: (e) => patchItem(it.id, { name: e.target.value }),
              })
            : h(
                "button",
                {
                  class: "hsel",
                  onclick: () => {
                    selectItem(it.id);
                    paint();
                  },
                },
                it.name,
                h("small", { class: "muted" }, t(it.project.product)),
              ),
          stepper({
            value: it.qty,
            min: 1,
            max: 99,
            onChange: (n) => patchItem(it.id, { qty: n }),
          }),
          h(
            "button",
            {
              class: "x",
              title: t("remove"),
              "aria-label": t("remove"),
              disabled: items.length < 2,
              onclick: () => {
                removeItem(it.id);
                paint();
              },
            },
            "×",
          ),
        ),
      ),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            onclick: () => {
              addItem(true);
              paint();
            },
          },
          t("houseCopy"),
        ),
        h(
          "button",
          {
            onclick: () => {
              addItem(false);
              paint();
            },
          },
          t("houseNew"),
        ),
      ),
      items.length > 1 || items[0].qty > 1
        ? [all, h("small", { class: "muted" }, t("houseTotal", { n: total }))]
        : null,
    );
  };

  const productSection = () => {
    const cur = project.get().product;
    return section(
      "product",
      t("product"),
      h(
        "div",
        { class: "cards" },
        PRODUCTS.map((k) =>
          h(
            "button",
            {
              class: "card",
              "aria-pressed": String(cur === k),
              onclick: () => {
                update((q) => (q.product = k));
                paint();
              },
            },
            h("b", {}, t(k)),
            h("span", { class: "muted" }, t(`${k}Desc`)),
          ),
        ),
      ),
    );
  };

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
    return section(
      "measures",
      t("measures"),
      row(t("preset"), presetSelect),
      preset.source && h("p", { class: "hint muted" }, t("presetUnverified")),
      plateDiagram({
        values: p.plate,
        windows: () =>
          layoutModules(project.get()).map((m) => ({ x: m.x, y: m.y, win: MODULES[m.type].win })),
        onChange: (key, v) => update((q) => (q.plate[key] = v)),
      }),
      h("p", { class: "hint muted" }, t("dimHint")),
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
        t("clearanceHint"),
      ),
    );
  };

  const modulesSection = () => {
    const p = project.get();
    return section(
      "modules",
      t("modules"),
      h("p", { class: "hint muted" }, t("modulesHint")),
      baysDiagram({
        groups: p.groups,
        slots: p.mods.slots,
        onChange: (g, next) => {
          update((q) => (q.groups[g] = next));
          paint();
        },
      }),
      h(
        "div",
        { class: "inline-row" },
        h(
          "span",
          {},
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
        h(
          "span",
          {},
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
      ),
      h(
        "details",
        { class: "help" },
        h("summary", {}, t("fine")),
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

  // ---- uploaded image ------------------------------------------------------------------------
  let artMsg = "";
  let artBusy = false;
  const RASTER_DEFAULTS = { n: 2, thr: 128, inv: false, bg: true };

  async function pickFile(file) {
    if (!file || artBusy) return;
    artBusy = true;
    artMsg = "";
    paint();
    try {
      const art = await importFile(file, RASTER_DEFAULTS);
      update((q) => {
        q.art = art;
        q.pattern.id = "image";
        // Start at the largest size that fits across the plate, keeping the picture's proportions.
        const along = Math.max(art.w, art.h);
        const fit =
          Math.min(q.plate.w / (art.w / along), q.plate.h / (art.h / along)) - 2 * q.pattern.margin;
        q.pattern.size = Math.max(5, Math.min(250, Math.round(fit * 0.9)));
        q.pattern.ax = 0;
        q.pattern.ay = 0;
      });
    } catch (e) {
      artMsg = e instanceof ArtError ? e.message : "artErrType";
    }
    artBusy = false;
    paint();
  }

  function retraceWith(patch) {
    const art = project.get().art;
    const next = retrace({ ...RASTER_DEFAULTS, ...art.src, ...patch });
    if (!next) {
      artMsg = "artErrEmpty";
      paint();
      return;
    }
    artMsg = "";
    update((q) => (q.art = next));
    paint();
  }

  const imagePanel = () => {
    const p = project.get();
    const art = p.art;
    const drop = h(
      "label",
      { class: "drop" },
      h("input", {
        type: "file",
        accept: ".svg,image/*",
        onchange: (e) => pickFile(e.target.files[0]),
      }),
      h("span", {}, artBusy ? t("artBusy") : art ? t("artReplace") : t("artDrop")),
    );
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("hot");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("hot");
      pickFile(e.dataTransfer.files[0]);
    });
    const parts = [
      drop,
      artMsg && h("p", { class: "bad" }, t(artMsg)),
      h("p", { class: "hint muted" }, t("artHint")),
    ];
    if (!art) return parts;

    const thumb = h("canvas", { class: "art-thumb", "aria-label": t("artPreview") });
    drawThumb(thumb, art);
    const points = art.layers.reduce(
      (n, l) => n + l.s.reduce((m, sh) => m + sh.p.reduce((k, r) => k + r.length / 2, 0), 0),
      0,
    );
    parts.push(
      h(
        "div",
        { class: "art-head" },
        thumb,
        h("small", { class: "muted" }, t("artStats", { n: art.layers.length, p: points })),
      ),
    );

    if (art.kind === "raster") {
      const src = { ...RASTER_DEFAULTS, ...art.src };
      if (hasRasterSource()) {
        parts.push(
          row(
            t("artColors"),
            stepper({ value: src.n, min: 1, max: 4, onChange: (n) => retraceWith({ n }) }),
          ),
          src.n === 1
            ? [
                row(
                  t("artThreshold"),
                  slider({
                    value: src.thr,
                    min: 10,
                    max: 245,
                    step: 5,
                    onChange: (v) => retraceWith({ thr: v }),
                  }),
                ),
                checkbox({
                  checked: src.inv,
                  label: t("artInvert"),
                  onChange: (v) => retraceWith({ inv: v }),
                }),
              ]
            : checkbox({
                checked: src.bg,
                label: t("artBg"),
                onChange: (v) => retraceWith({ bg: v }),
              }),
        );
      } else parts.push(h("p", { class: "hint muted" }, t("artRetrace")));
    }

    parts.push(
      h("b", { class: "sub" }, t("artLayers")),
      art.layers.map((L, i) =>
        h(
          "div",
          { class: "layer" },
          checkbox({
            checked: L.on,
            label: t("artColour", { n: i + 1 }),
            onChange: (v) => {
              update((q) => (q.art.layers[i].on = v));
              paint();
            },
          }),
          h("input", {
            type: "color",
            value: L.c,
            "aria-label": t("artColour", { n: i + 1 }),
            oninput: (e) => update((q) => (q.art.layers[i].c = e.target.value)),
            onchange: () => paint(),
          }),
        ),
      ),
      row(
        t("artSize"),
        numField({
          value: p.pattern.size,
          min: 5,
          max: 250,
          step: 1,
          unit: "mm",
          onChange: (v) => update((q) => (q.pattern.size = v)),
        }),
      ),
      row(
        t("artX"),
        numField({
          value: p.pattern.ax,
          min: -250,
          max: 250,
          step: 1,
          unit: "mm",
          onChange: (v) => update((q) => (q.pattern.ax = v)),
        }),
      ),
      row(
        t("artY"),
        numField({
          value: p.pattern.ay,
          min: -250,
          max: 250,
          step: 1,
          unit: "mm",
          onChange: (v) => update((q) => (q.pattern.ay = v)),
        }),
      ),
      row(
        t("pRot"),
        slider({
          value: p.pattern.rot,
          min: 0,
          max: 359,
          step: 5,
          onChange: (v) => update((q) => (q.pattern.rot = v)),
        }),
      ),
      checkbox({
        checked: p.pattern.mirror,
        label: t("artMirror"),
        onChange: (v) => update((q) => (q.pattern.mirror = v)),
      }),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            onclick: () => {
              update((q) => {
                const along = Math.max(art.w, art.h);
                q.pattern.size = Math.round(
                  Math.min(q.plate.w / (art.w / along), q.plate.h / (art.h / along)) -
                    2 * q.pattern.margin,
                );
                q.pattern.ax = 0;
                q.pattern.ay = 0;
              });
              paint();
            },
          },
          t("artFit"),
        ),
        h(
          "button",
          {
            onclick: () => {
              update((q) => (q.art = null));
              paint();
            },
          },
          t("artRemove"),
        ),
      ),
    );
    return parts;
  };

  const designSection = () => {
    const p = project.get();
    const pat = p.pattern;
    const on = pat.id !== "none";
    const isImage = pat.id === "image";
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
        ["none", ...PATTERN_IDS, "image"].map((id) =>
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
      isImage && imagePanel(),
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
        !isImage && pat.id !== "guarda" && field(t("pScale"), "scale", 4, 40, 1),
        !isImage && field(t("pWeight"), "weight", 0.15, 0.85, 0.05),
        !isImage && pat.id !== "guarda" && field(t("pRot"), "rot", 0, 180, 15),
        field(t("pMargin"), "margin", 1, 8, 0.5),
        pat.mode !== "cutthrough" && field(t("pDepth"), "depth", 0.4, 1.6, 0.2),
      ],
    );
  };

  const tapaSection = () => {
    const p = project.get();
    const f = (label, key, min, max, step) =>
      row(
        label,
        numField({
          value: p.tapa[key],
          min,
          max,
          step,
          unit: "mm",
          onChange: (v) => update((q) => (q.tapa[key] = v)),
        }),
      );
    return section(
      "tapaSpec",
      t("tapaSpec"),
      plateDiagram({
        values: { w: p.plate.w, h: p.plate.h, d: p.tapa.skirt, r: p.plate.r },
        inner: { w: p.tapa.boxW, h: p.tapa.boxH },
        fields: [
          { key: "boxW", min: 30, max: 200, step: 0.5, label: "dimBoxW", at: "w" },
          { key: "boxH", min: 30, max: 250, step: 0.5, label: "dimBoxH", at: "h" },
          { key: "skirt", min: 2, max: 20, step: 0.5, label: "dimSkirt", at: "d" },
        ],
        windows: () =>
          layoutModules(project.get()).map((m) => ({ x: m.x, y: m.y, win: MODULES[m.type].win })),
        onChange: (key, v) => update((q) => (q.tapa[key] = v)),
      }),
      h("p", { class: "hint muted" }, t("tapaDimHint")),
      h(
        "details",
        { class: "help" },
        h("summary", {}, t("fine")),
        f(t("tClearance"), "clearance", 0, 1, 0.05),
        f(t("tFace"), "face", 1.6, 8, 0.2),
        f(t("tWall"), "wall", 1.2, 5, 0.2),
        f(t("tBump"), "bump", 0, 1.2, 0.1),
        f(t("tWin"), "winMargin", -1, 2, 0.1),
      ),
    );
  };

  const frameSection = () => {
    const p = project.get();
    return section(
      "frameSpec",
      t("frameSpec"),
      row(
        t("frameH"),
        numField({
          value: p.frame.h,
          min: 2,
          max: 30,
          step: 0.5,
          unit: "mm",
          onChange: (v) => update((q) => (q.frame.h = v)),
        }),
      ),
    );
  };

  const keycapSection = () => {
    const k = project.get().keycap;
    const f = (label, key, min, max, step) =>
      row(
        label,
        numField({
          value: k[key],
          min,
          max,
          step,
          unit: "mm",
          onChange: (v) => update((q) => (q.keycap[key] = v)),
        }),
      );
    const icon = k.icon !== "none";
    return section(
      "keycap",
      t("keycapSpec"),
      plateDiagram({
        values: { w: k.w, h: k.l, d: k.h, r: k.r },
        fields: [
          { key: "w", min: 8, max: 60, step: 0.5, label: "dimW", at: "w" },
          { key: "l", min: 8, max: 80, step: 0.5, label: "dimKeyL", at: "h" },
          { key: "h", min: 2, max: 20, step: 0.5, label: "dimD", at: "d" },
          { key: "r", min: 0, max: 15, step: 0.5, label: "dimR", at: "r" },
        ],
        onChange: (key, v) => update((q) => (q.keycap[key] = v)),
      }),
      h("p", { class: "hint muted" }, t("keyDimHint")),
      h(
        "details",
        { class: "help" },
        h("summary", {}, t("fine")),
        f(t("kClear"), "clearance", 0, 1, 0.05),
        f(t("kWall"), "wall", 1.2, 4, 0.2),
        f(t("kFace"), "face", 1, 5, 0.2),
      ),
      row(
        t("kStyle"),
        segmented({
          value: k.style,
          options: [
            { value: "bevel", label: t("kBevel") },
            { value: "flat", label: t("kFlat") },
          ],
          onChange: (v) => update((q) => (q.keycap.style = v)),
        }),
      ),
      h("b", { class: "sub" }, t("icon")),
      h(
        "div",
        { class: "chips" },
        ["none", ...ICON_IDS].map((id) =>
          h(
            "button",
            {
              class: "chip",
              "aria-pressed": String(k.icon === id),
              onclick: () => {
                update((q) => (q.keycap.icon = id));
                paint();
              },
            },
            t(`i.${id}`),
          ),
        ),
      ),
      k.icon === "text" &&
        row(
          t("kText"),
          h("input", {
            type: "text",
            maxLength: 6,
            value: k.text,
            "aria-label": t("kText"),
            oninput: (e) => update((q) => (q.keycap.text = e.target.value)),
          }),
        ),
      icon && [
        h(
          "div",
          { class: "modes" },
          PATTERN_MODES.map((m) =>
            h(
              "button",
              {
                class: "card",
                "aria-pressed": String(k.iconMode === m),
                onclick: () => {
                  update((q) => (q.keycap.iconMode = m));
                  paint();
                },
              },
              h("b", {}, t(`pm.${m}`)),
              h("span", { class: "muted" }, t(`pm.${m}.d`)),
            ),
          ),
        ),
        f(t("kIconSize"), "iconSize", 4, 40, 0.5),
        f(t("pDepth"), "iconDepth", 0.4, 1.6, 0.2),
      ],
    );
  };

  const colorSection = () => {
    const p = project.get();
    const motif =
      p.product === "keycap"
        ? p.keycap.icon !== "none"
          ? p.keycap.iconMode
          : "none"
        : p.pattern.id !== "none"
          ? p.pattern.mode
          : "none";
    const two =
      ["inlay", "raised"].includes(motif) && !(p.product !== "keycap" && p.pattern.id === "image");
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
    const packed = part ? platesFor(part, copies, bed) : null;
    const ok = !packed || packed.fits;
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
      part &&
        h(
          "p",
          { class: ok ? "ok" : "bad" },
          !ok
            ? t("bedNoFit")
            : packed.plates > 1
              ? t("bedPlates", { n: packed.plates })
              : t("bedFit"),
        ),
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
      p.product !== "keycap" &&
        h(
          "div",
          { class: "actions" },
          h("button", { onclick: () => downloadCoupon(p) }, t("coupon")),
          h("small", { class: "muted" }, t("couponHint")),
        ),
    );
  };

  function paint() {
    const product = project.get().product;
    const by = {
      overlay: [measuresSection, modulesSection, shapeSection, designSection],
      tapa: [measuresSection, tapaSection, modulesSection, designSection],
      frame: [measuresSection, frameSection, shapeSection, designSection],
      keycap: [keycapSection],
    };
    const body = [
      houseSection(),
      productSection(),
      ...by[product].map((fn) => fn()),
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
  // A drag in the preview changes the position and size behind the panel's back: redraw when it ends.
  let rev = view.get().artRev ?? 0;
  view.subscribe((v) => {
    if ((v.artRev ?? 0) === rev) return;
    rev = v.artRev ?? 0;
    paint();
  });
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
