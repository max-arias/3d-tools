import { h } from "../../../shell/h.js";
import { checkbox, numField, row, segmented } from "../../../shell/widgets.js";
import { PRINTERS } from "../../frames/model/printers.js"; // shared printer list (TDT-33 moves it to src/lib)
import { CHIPS } from "../../letters/model/strips.js";
import { ArtError, drawThumb, hasRasterSource, importFile, retrace } from "../../tapas/ui/art.js";
import { SvgError, importSvg } from "../../letters/ui/svg.js";
import { fitChecks } from "../dial/checks.js";
import { CUTOUTS } from "../dial/cutouts.js";
import { HAND_STYLES } from "../dial/hands.js";
import { NUMERALS, TICKS } from "../dial/markers.js";
import { PRESET_IDS, defaultHub } from "../dial/outline.js";
import { langStore, t } from "../lib/i18n.js";
import { GALLERY, galleryProject } from "../model/gallery.js";
import { MOVEMENTS } from "../model/movements.js";
import {
  BACKS,
  BORDERS,
  DECOR,
  FINISHES,
  FONTS,
  HANGERS,
  MAX_SLOTS,
  STANDS,
  STYLES,
  TYPES,
  movementFields,
  slotFor,
} from "../model/project.js";
import { project, replaceProject, result, update } from "./state.js";
import "./strings.js";

const get = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
const set = (o, path, v) => {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((x, k) => x[k], o)[last] = v;
};
const TRACE = { n: 3, thr: 128, inv: false, bg: true };

export function createSidebar(toast) {
  const root = h("aside", { class: "side" });
  const notesBox = h("div", { class: "notes", "aria-live": "polite" });
  const ledBox = h("div", { class: "readouts" });
  const closed = new Set(["movement", "printer", "cutouts", "leds"]);
  let selfEdit = false;
  let trace = { ...TRACE };
  let wantSvg = false;

  /** Edit from a sidebar field: the fields keep focus, only the readouts refresh. */
  const edit = (fn, key) => {
    selfEdit = true;
    try {
      update(fn, key);
    } finally {
      selfEdit = false;
    }
  };
  const setNow = (path, v) =>
    update((d) => {
      set(d, path, v);
    });
  const num = (path, opts = {}) =>
    numField({
      value: get(project.get(), path),
      key: path,
      onChange: (v) => edit((d) => set(d, path, v), path),
      ...opts,
    });
  const seg = (path, values, label = (v) => t(`${path.split(".").pop()}_${v}`)) =>
    segmented({
      value: get(project.get(), path),
      options: values.map((v) => ({ value: v, label: label(v) })),
      onChange: (v) => setNow(path, v),
    });
  const sel = (path, options) =>
    h(
      "select",
      {
        dataset: { key: path },
        onchange: (e) =>
          setNow(
            path,
            isNaN(+e.target.value) || e.target.value === "" ? e.target.value : +e.target.value,
          ),
      },
      options.map(([v, label]) =>
        h("option", { value: v, selected: v === get(project.get(), path) }, label),
      ),
    );
  const chk = (path, label, hint) =>
    checkbox({
      checked: get(project.get(), path),
      label,
      hint,
      key: path,
      onChange: (v) => setNow(path, v),
    });
  const slotSel = (path) =>
    h(
      "span",
      { class: "slotpick" },
      project.get().colors.slots.map((c, i) =>
        h("button", {
          class: "swatch",
          style: `background:${c}`,
          title: `${t("colour")} ${i + 1}`,
          "aria-pressed": String(get(project.get(), path) === i),
          dataset: { key: `${path}.${i}` },
          onclick: () => setNow(path, i),
        }),
      ),
    );

  const section = (id, title, ...body) => {
    const d = h(
      "details",
      { class: "sec", open: !closed.has(id), dataset: { sec: id } },
      h("summary", {}, h("span", { class: "sec-title" }, title)),
      h("div", { class: "sec-body" }, ...body),
    );
    d.addEventListener("toggle", () => (d.open ? closed.delete(id) : closed.add(id)));
    return d;
  };
  const drop = (label, accept, key, onFile) => {
    const el = h(
      "label",
      {
        class: "drop",
        ondragover: (e) => {
          e.preventDefault();
          el.dataset.over = "1";
        },
        ondragleave: () => delete el.dataset.over,
        ondrop: (e) => {
          e.preventDefault();
          delete el.dataset.over;
          onFile(e.dataTransfer.files[0]);
        },
      },
      h("span", {}, label),
      h("input", {
        type: "file",
        accept,
        dataset: { key },
        onchange: (e) => onFile(e.target.files[0]),
      }),
    );
    return el;
  };

  // ---- gallery ---------------------------------------------------------------------------------
  const gallerySection = () =>
    section(
      "gallery",
      t("gallery"),
      h(
        "div",
        { class: "gallery" },
        GALLERY.map((g) =>
          h(
            "button",
            {
              class: "gal",
              dataset: { key: `gallery.${g.id}` },
              title: t(`gd_${g.id}`),
              onclick: () => {
                replaceProject(galleryProject(g, project.get()));
                toast(t("galleryLoaded", { name: t(`g_${g.id}`) }));
              },
            },
            h(
              "span",
              { class: "dots" },
              g.patch.colors.slots.slice(0, 3).map((c) => h("i", { style: `background:${c}` })),
            ),
            h("b", {}, t(`g_${g.id}`)),
          ),
        ),
      ),
    );

  // ---- shape -------------------------------------------------------------------------------------
  const onOutlineSvg = async (file) => {
    if (!file) return;
    try {
      const svg = await importSvg(file);
      wantSvg = false;
      update((d) => {
        d.shape.kind = "svg";
        d.shape.svg = svg;
        d.shape.hub = [0, 0];
      });
    } catch (e) {
      toast(t(e instanceof SvgError ? e.message : "svgType"));
    }
  };
  const shapeSection = () => {
    const p = project.get();
    return section(
      "shape",
      t("shape"),
      segmented({
        value: wantSvg ? "svg" : p.shape.kind,
        options: ["preset", "svg", "art"].map((v) => ({ value: v, label: t(`kind_${v}`) })),
        onChange: (kind) => {
          if (kind === "art" && !p.art) return toast(t("artFirst"));
          // An SVG outline needs a file first: show the drop zone until one arrives.
          if (kind === "svg" && !p.shape.svg) {
            wantSvg = true;
            return paint();
          }
          wantSvg = false;
          setNow("shape.kind", kind);
        },
      }),
      p.shape.kind === "preset" &&
        h(
          "div",
          { class: "chips" },
          PRESET_IDS.map((id) =>
            h(
              "button",
              {
                class: "chip",
                "aria-pressed": String(p.shape.preset === id),
                dataset: { key: `preset.${id}` },
                onclick: () =>
                  update((d) => {
                    d.shape.preset = id;
                    d.shape.hub = defaultHub(id, d.shape.width);
                  }),
              },
              t(`preset_${id}`),
            ),
          ),
        ),
      (p.shape.kind === "svg" || wantSvg) &&
        drop(t("svgDrop"), ".svg,image/svg+xml", "shape.svg", onOutlineSvg),
      p.shape.kind === "art" && h("p", { class: "hint muted" }, t("artEdgeHint")),
      row(t("width"), num("shape.width", { min: 60, max: 600, unit: "mm" }), t("widthHint")),
      row(t("border"), seg("shape.border.kind", BORDERS)),
      p.shape.border.kind !== "none" &&
        row(t("borderW"), num("shape.border.w", { min: 2, max: 30, unit: "mm" })),
      row(
        t("hub"),
        h(
          "span",
          { class: "pair" },
          num("shape.hub.0", { min: -300, max: 300, step: 0.5, unit: "x" }),
          num("shape.hub.1", { min: -600, max: 600, step: 0.5, unit: "y" }),
          h(
            "button",
            {
              class: "mini",
              onclick: () => setNow("shape.hub", defaultHub(p.shape.preset, p.shape.width)),
            },
            t("centre"),
          ),
        ),
        t("hubHint"),
      ),
    );
  };

  // ---- artwork ------------------------------------------------------------------------------------
  const takeArt = (art) =>
    update((d) => {
      d.art = art;
      // Fit inside the face circle; size 0 (span the whole width) suits art drawn for the shape.
      const R = result.get().clock?.info.R;
      d.artPlace = { size: R ? Math.round(R * 1.6) : 0, x: 0, y: 0, rot: 0 };
      // Each colour of the drawing goes to the nearest filament slot, or a new one.
      d.colors.art = art.layers.map((L) => slotFor(d.colors.slots, L.c));
    });
  const onArt = async (file) => {
    if (!file) return;
    try {
      takeArt(await importFile(file, trace));
    } catch (e) {
      toast(t(e instanceof ArtError ? e.message : "artErrType"));
    }
  };
  const artSection = () => {
    const p = project.get();
    const thumb = h("canvas", { class: "thumb" });
    if (p.art) drawThumb(thumb, p.art);
    return section(
      "art",
      t("art"),
      drop(
        p.art ? t("artReplace") : t("artDrop"),
        ".svg,image/svg+xml,image/png,image/jpeg,image/webp",
        "art",
        onArt,
      ),
      h("p", { class: "hint muted" }, t("artHint")),
      p.art &&
        h(
          "div",
          { class: "group" },
          thumb,
          hasRasterSource() &&
            row(
              t("traceColours"),
              segmented({
                value: trace.n,
                options: [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })),
                onChange: (n) => {
                  trace = { ...trace, n };
                  const art = retrace(trace);
                  if (art) takeArt(art);
                },
              }),
            ),
          p.art.layers.map((L, i) =>
            i === 0 && !L.on && p.art.kind === "svg" && p.art.layers.length > 1 && L.c === "#000000"
              ? null
              : row(
                  h(
                    "span",
                    { class: "layer" },
                    h("i", { style: `background:${L.c}` }),
                    `${t("layer")} ${i + 1}`,
                  ),
                  h(
                    "span",
                    { class: "pair" },
                    h("input", {
                      type: "checkbox",
                      checked: L.on,
                      title: t("layerOn"),
                      dataset: { key: `art.layers.${i}.on` },
                      onchange: (e) => setNow(`art.layers.${i}.on`, e.target.checked),
                    }),
                    slotSel(`colors.art.${i}`),
                  ),
                ),
          ),
          p.shape.kind !== "art" &&
            h(
              "div",
              { class: "group" },
              row(
                t("artSize"),
                num("artPlace.size", { min: 0, max: 600, unit: "mm" }),
                t("artSizeHint"),
              ),
              row(
                t("artMove"),
                h(
                  "span",
                  { class: "pair" },
                  num("artPlace.x", { min: -300, max: 300, unit: "x" }),
                  num("artPlace.y", { min: -300, max: 300, unit: "y" }),
                ),
              ),
              row(t("artRot"), num("artPlace.rot", { min: -180, max: 180, unit: "°" })),
            ),
          h(
            "div",
            { class: "actions" },
            h(
              "button",
              { onclick: () => setNow("shape.kind", "art"), disabled: p.shape.kind === "art" },
              t("artAsOutline"),
            ),
            h(
              "button",
              {
                onclick: () =>
                  update((d) => {
                    d.art = null;
                    if (d.shape.kind === "art") d.shape.kind = "preset";
                  }),
              },
              t("artRemove"),
            ),
          ),
        ),
    );
  };

  // ---- type and mounting ---------------------------------------------------------------------------
  const typeSection = () => {
    const p = project.get();
    const wall = p.type === "wall" || p.type === "wallDesk";
    const desk = p.type === "desk" || p.type === "wallDesk";
    return section(
      "type",
      t("type"),
      h(
        "div",
        { class: "cards two" },
        TYPES.map((ty) =>
          h(
            "button",
            {
              class: "card",
              "aria-pressed": String(p.type === ty),
              dataset: { key: `type.${ty}` },
              onclick: () => setNow("type", ty),
            },
            h("b", {}, t(`type_${ty}`)),
            h("span", { class: "muted" }, t(`typeHint_${ty}`)),
          ),
        ),
      ),
      p.type !== "twoSided" &&
        row(t("backLabel"), seg("back.kind", BACKS), t(`backHint_${p.back.kind}`)),
      wall && row(t("hanger"), seg("back.hanger", HANGERS), t(`hangerHint_${p.back.hanger}`)),
      p.type === "magnet" &&
        row(
          t("magnets"),
          h(
            "span",
            { class: "pair" },
            num("back.magnet.d", { min: 3, max: 30, unit: "⌀" }),
            num("back.magnet.h", { min: 1, max: 10, unit: "h" }),
            num("back.magnet.n", { min: 1, max: 8, step: 1, unit: "×" }),
          ),
        ),
      desk && row(t("stand"), seg("back.stand", STANDS), t(`standHint_${p.back.stand}`)),
      desk &&
        p.back.stand === "cradle" &&
        row(t("lean"), num("back.angle", { min: 0, max: 30, unit: "°" })),
      p.type === "twoSided" &&
        row(t("arm"), num("twoSided.arm", { min: 40, max: 300, unit: "mm" }), t("armHint")),
    );
  };

  // ---- face and style ---------------------------------------------------------------------------
  const styleSection = () => {
    const p = project.get();
    return section(
      "style",
      t("style"),
      row(t("styleLabel"), seg("style", STYLES), t(`styleHint_${p.style}`)),
      row(t("thickness"), num("face.thickness", { min: 1.6, max: 12, unit: "mm" })),
      p.style !== "relief" && row(t("decor"), seg("face.decor", DECOR), t("decorHint")),
      row(t("inlayDepth"), num("face.inlay", { min: 0.2, max: 3, unit: "mm" })),
      row(t("raisedH"), num("face.raised", { min: 0.2, max: 6, unit: "mm" })),
      p.style === "ribs" &&
        row(t("ribPitch"), num("face.ribPitch", { min: 3, max: 40, unit: "mm" })),
    );
  };

  // ---- numbers and markers -------------------------------------------------------------------------
  const markerSection = () => {
    const p = project.get();
    return section(
      "markers",
      t("markers"),
      row(
        t("numerals"),
        sel(
          "markers.numerals",
          NUMERALS.map((v) => [v, t(`numerals_${v}`)]),
        ),
      ),
      row(
        t("ticks"),
        sel(
          "markers.ticks",
          TICKS.map((v) => [v, t(`ticks_${v}`)]),
        ),
      ),
      row(
        t("hours"),
        seg("markers.hours", [12, 24], (v) => `${v} h`),
      ),
      row(t("orient"), seg("markers.orient", ["upright", "radial"])),
      row(t("path"), seg("markers.path", ["circle", "outline"]), t("pathHint")),
      row(
        t("font"),
        sel(
          "markers.font",
          FONTS.map((f) => [f, t(`font_${f}`)]),
        ),
      ),
      row(t("numSize"), num("markers.size", { min: 0, max: 80, unit: "mm" }), t("autoHint")),
      row(t("inset"), num("markers.inset", { min: 0, max: 60, unit: "mm" })),
      row(
        t("finish"),
        sel(
          "markers.finish",
          FINISHES.map((v) => [v, t(`finish_${v}`)]),
        ),
      ),
      row(t("markerColour"), slotSel("colors.markers")),
      chk("markers.minutes", t("minutes")),
      chk("markers.reverse", t("reverse"), t("reverseHint")),
      row(
        t("text"),
        h("input", {
          type: "text",
          maxLength: 24,
          value: p.markers.text,
          dataset: { key: "markers.text" },
          oninput: (e) => edit((d) => (d.markers.text = e.target.value), "text"),
        }),
      ),
      p.markers.text &&
        row(t("textSize"), num("markers.textSize", { min: 3, max: 40, unit: "mm" })),
    );
  };

  // ---- hands ---------------------------------------------------------------------------------------
  const handSection = () => {
    const p = project.get();
    return section(
      "hands",
      t("hands"),
      chk("hands.print", t("printHands"), t("printHandsHint")),
      p.hands.print &&
        h(
          "div",
          { class: "group" },
          row(
            t("handStyle"),
            sel(
              "hands.style",
              HAND_STYLES.map((v) => [v, t(`hand_${v}`)]),
            ),
          ),
          row(t("handColour"), slotSel("colors.hands")),
          row(t("handThick"), num("hands.thickness", { min: 0.8, max: 4, unit: "mm" })),
          row(
            t("hourHand"),
            h(
              "span",
              { class: "pair" },
              num("hands.hour.length", { min: 0, max: 400, unit: "L" }),
              num("hands.hour.width", { min: 0, max: 30, unit: "W" }),
            ),
          ),
          row(
            t("minuteHand"),
            h(
              "span",
              { class: "pair" },
              num("hands.minute.length", { min: 0, max: 400, unit: "L" }),
              num("hands.minute.width", { min: 0, max: 30, unit: "W" }),
            ),
            t("autoHint"),
          ),
          chk("hands.tail", t("tail"), t("tailHint")),
          chk("hands.second", t("second"), t("secondHint")),
          chk("hands.glow", t("glow"), t("glowHint")),
          p.hands.glow && row(t("glowColour"), slotSel("colors.glow")),
          row(
            t("fit"),
            num("hands.fit", { min: -0.4, max: 0.4, step: 0.05, unit: "mm" }),
            t("fitHint"),
          ),
        ),
    );
  };

  // ---- cutouts ---------------------------------------------------------------------------------------
  const cutSection = () => {
    const p = project.get();
    return section(
      "cutouts",
      t("cutouts"),
      row(
        t("cutKind"),
        sel(
          "cutouts.kind",
          CUTOUTS.map((v) => [v, t(`cut_${v}`)]),
        ),
      ),
      p.cutouts.kind !== "none" &&
        h(
          "div",
          { class: "group" },
          p.cutouts.kind !== "slots" &&
            row(t("cutCount"), num("cutouts.count", { min: 1, max: 80, step: 1 })),
          row(t("cutSize"), num("cutouts.size", { min: 3, max: 60, unit: "mm" })),
          p.cutouts.kind === "cheese" &&
            row(
              t("seed"),
              h(
                "span",
                { class: "pair" },
                num("cutouts.seed", { min: 0, max: 99999, step: 1 }),
                h(
                  "button",
                  {
                    class: "mini",
                    dataset: { key: "reroll" },
                    onclick: () => setNow("cutouts.seed", Math.floor(Math.random() * 99999)),
                  },
                  t("reroll"),
                ),
              ),
            ),
        ),
    );
  };

  // ---- colours -------------------------------------------------------------------------------------
  const colourSection = () => {
    const p = project.get();
    return section(
      "colours",
      t("colours"),
      h("p", { class: "hint muted" }, t("coloursHint")),
      h(
        "div",
        { class: "palette" },
        p.colors.slots.map((c, i) =>
          h(
            "label",
            { class: "slot" },
            h("input", {
              type: "color",
              value: c,
              dataset: { key: `colors.slots.${i}` },
              oninput: (e) => edit((d) => (d.colors.slots[i] = e.target.value), `slot${i}`),
            }),
            h("span", { class: "muted" }, String(i + 1)),
          ),
        ),
        p.colors.slots.length < MAX_SLOTS &&
          h(
            "button",
            { class: "mini", onclick: () => update((d) => d.colors.slots.push("#888888")) },
            "+",
          ),
        p.colors.slots.length > 1 &&
          h("button", { class: "mini", onclick: () => update((d) => d.colors.slots.pop()) }, "−"),
      ),
      row(t("faceColour"), slotSel("colors.face")),
      p.shape.border.kind !== "none" && row(t("borderColour"), slotSel("colors.border")),
      row(t("markerColour"), slotSel("colors.markers")),
      p.hands.print && row(t("handColour"), slotSel("colors.hands")),
    );
  };

  // ---- movement ------------------------------------------------------------------------------------
  const movementSection = () =>
    section(
      "movement",
      t("movement"),
      row(
        t("movementPreset"),
        h(
          "select",
          {
            dataset: { key: "movement.preset" },
            onchange: (e) =>
              update((d) => {
                d.movement = movementFields(MOVEMENTS.find((m) => m.id === e.target.value));
              }),
          },
          MOVEMENTS.map((m) =>
            h("option", { value: m.id, selected: m.id === project.get().movement.preset }, m.name),
          ),
        ),
      ),
      h("p", { class: "warn" }, t("movementWarn")),
      row(
        t("body"),
        h(
          "span",
          { class: "pair" },
          num("movement.body.0", { min: 20, max: 120, unit: "w" }),
          num("movement.body.1", { min: 20, max: 120, unit: "h" }),
          num("movement.body.2", { min: 5, max: 50, unit: "d" }),
        ),
      ),
      row(t("dialHole"), num("movement.dialHole", { min: 3, max: 16, unit: "mm" })),
      row(t("maxDial"), num("movement.maxDial", { min: 1, max: 25, unit: "mm" }), t("maxDialHint")),
      row(t("hourHole"), num("movement.hour", { min: 2, max: 10, unit: "mm" })),
      row(t("minuteHole"), num("movement.minute", { min: 1, max: 8, unit: "mm" })),
      row(
        t("minuteFlat"),
        num("movement.minuteFlat", { min: 0, max: 8, unit: "mm" }),
        t("minuteFlatHint"),
      ),
      row(t("clearance"), num("movement.clearance", { min: 0, max: 2, unit: "mm" })),
      row(t("torque"), seg("movement.torque", ["std", "high"])),
    );

  // ---- LEDs ----------------------------------------------------------------------------------------
  const ledSection = () => {
    const p = project.get();
    return section(
      "leds",
      t("leds"),
      chk("leds.halo", t("halo"), t("haloHint")),
      p.leds.halo &&
        h(
          "div",
          { class: "group" },
          row(
            t("chip"),
            sel(
              "leds.chip",
              Object.entries(CHIPS).map(([k, c]) => [k, c.name]),
            ),
          ),
          row(
            t("density"),
            seg("leds.density", [30, 60, 144], (v) => `${v}/m`),
          ),
          ledBox,
        ),
    );
  };

  // ---- printer -------------------------------------------------------------------------------------
  const printerSection = () => {
    const p = project.get();
    return section(
      "printer",
      t("printer"),
      row(
        t("printerModel"),
        h(
          "select",
          {
            dataset: { key: "printer" },
            onchange: (e) =>
              update((d) => {
                const pr = PRINTERS.find((x) => x.id === e.target.value);
                d.printer = e.target.value;
                if (pr) d.build = { x: pr.x, y: pr.y, z: pr.z };
              }),
          },
          [
            ...PRINTERS.map((pr) =>
              h("option", { value: pr.id, selected: pr.id === p.printer }, pr.name),
            ),
            h(
              "option",
              { value: "custom", selected: !PRINTERS.some((x) => x.id === p.printer) },
              t("custom"),
            ),
          ],
        ),
      ),
      row(
        t("bed"),
        h(
          "span",
          { class: "pair" },
          num("build.x", { min: 50, max: 1000, unit: "x" }),
          num("build.y", { min: 50, max: 1000, unit: "y" }),
        ),
      ),
    );
  };

  const paintNotes = () => {
    const { status, clock, error } = result.get();
    const p = project.get();
    if (status === "error") return notesBox.replaceChildren(h("p", { class: "bad" }, error));
    if (!clock) return notesBox.replaceChildren(h("p", { class: "muted" }, t("building")));
    const checks = fitChecks(p, clock.info);
    const hands = clock.info.hands;
    notesBox.replaceChildren(
      h(
        "div",
        { class: "ro-grid" },
        [
          [t("roSize"), `${clock.info.size.map((v) => v.toFixed(0)).join(" × ")} mm`],
          [t("roDepth"), `${(clock.info.thickness + clock.info.depth).toFixed(1)} mm`],
          [t("roHub"), `${clock.info.hubDial} / ${p.movement.maxDial} mm`],
          ...hands.map((x) => [t(`ro_${x.id}`), `${x.length} mm · ${x.mass.toFixed(1)} g`]),
        ].map(([k, v]) =>
          h("div", { class: "ro" }, h("span", { class: "muted" }, k), h("b", {}, v)),
        ),
      ),
      checks.length
        ? h(
            "ul",
            { class: "checklist" },
            checks.map((c) =>
              h(
                "li",
                { class: c.level },
                t(`chk_${c.key}`, c.vars?.id ? { ...c.vars, id: t(`ro_${c.vars.id}`) } : c.vars),
              ),
            ),
          )
        : h("p", { class: "ok" }, t("allGood")),
    );
    const l = clock.info.leds;
    if (l) {
      const chip = CHIPS[p.leds.chip];
      ledBox.replaceChildren(
        h(
          "div",
          { class: "ro-grid" },
          [
            [t("roStrip"), `${(l.length / 1000).toFixed(2)} m`],
            [t("roLeds"), String(l.count)],
            [t("roPower"), `${l.amps.toFixed(1)} A @ ${chip.volts} V`],
          ].map(([k, v]) =>
            h("div", { class: "ro" }, h("span", { class: "muted" }, k), h("b", {}, v)),
          ),
        ),
        h("p", { class: "hint muted" }, t("ledNote")),
      );
    }
  };

  const paint = () => {
    root.replaceChildren(
      h("div", { class: "notes-wrap" }, h("b", {}, t("notes")), notesBox),
      gallerySection(),
      shapeSection(),
      artSection(),
      typeSection(),
      styleSection(),
      markerSection(),
      handSection(),
      cutSection(),
      colourSection(),
      ledSection(),
      movementSection(),
      printerSection(),
    );
    paintNotes();
  };

  langStore.subscribe(paint);
  project.subscribe(() => (selfEdit ? paintNotes() : paint()));
  result.subscribe(paintNotes);
  paint();
  return root;
}
