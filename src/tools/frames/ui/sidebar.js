import { h } from "../../../shell/h.js";
import { checkbox, numField, row, segmented } from "../../../shell/widgets.js";
import { PROFILES, PROFILE_IDS, crossSection } from "../geom/profiles.js";
import { encodeShare } from "../model/project.js";
import { STYLES, STYLE_IDS, applyStyle, matchesStyle } from "../model/styles.js";
import { PHOTO_IDS, PHOTO_SIZES } from "../model/presets.js";
import { PRINTERS } from "../model/printers.js";
import { downloadCoupon, downloadGallery, download3mf, downloadStl, platePlan } from "./export.js";
import {
  addItem,
  clearPicture,
  gallery,
  loadPicture,
  patchItem,
  picture,
  project,
  removeItem,
  result,
  selectItem,
  update,
  view,
} from "./state.js";

const WARNINGS = {
  heightRaised: "Moulding height was raised to keep the lip over the stack.",
  thinWall: "The wall outside the rabbet is under 1.6 mm. It may print weak.",
  thinLip: "The lip is under 1.2 mm. It may print weak.",
  noConnectors: "Too narrow for connectors: glue the pieces.",
  partTooBig: "A part is larger than the bed even when split.",
  glueBack: "Polygon frames have no clip grooves: glue or tape the back.",
  invalidMesh: "A part did not build into a clean solid.",
};

const section = (id, title, ...body) =>
  h(
    "details",
    { class: "sec", open: true, dataset: { sec: id } },
    h("summary", {}, title),
    h("div", { class: "sec-body" }, ...body),
  );

const select = (key, value, options, onChange) =>
  h(
    "select",
    { dataset: { key }, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
  );

/** Length field that shows mm or cm, always stores mm. */
function mmField(key, { value, min, max, step = 1, onChange }) {
  if (view.get().unit !== "cm")
    return numField({ value, min, max, step, unit: "mm", key, onChange });
  const f = (v) => +(v / 10).toFixed(3);
  return numField({
    value: f(value),
    min: f(min),
    max: f(max),
    step: Math.max(0.01, step / 10),
    unit: "cm",
    key,
    onChange: (v) => onChange(+(v * 10).toFixed(3)),
  });
}

const swatch = (key, label, value, onChange) =>
  row(
    label,
    h("input", {
      type: "color",
      value,
      dataset: { key },
      class: "swatch",
      oninput: (e) => onChange(e.target.value),
    }),
  );

/** Small SVG of a profile's cross-section, drawn from the same data the generator uses. */
function thumb(id) {
  const poly = crossSection(id, { w: 20, hgt: 12, rd: 3, ru: 3 });
  const pts = poly.map(([u, z]) => `${u.toFixed(2)},${(13 - z).toFixed(2)}`).join(" ");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-1 -1 22 15");
  const p = document.createElementNS(ns, "polygon");
  p.setAttribute("points", pts);
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}

/** Front view of a preset: frame outline, opening and mat, to scale. */
function styleThumb(id) {
  const q = applyStyle({}, id);
  const [pw, ph] = q.photo.landscape ? [q.photo.w, q.photo.h].reverse() : [q.photo.w, q.photo.h];
  const m = q.moulding.width;
  const W = pw + 2 * m;
  const H = ph + 2 * m;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const add = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  const outline = (x, y, w, hh, fill, shrink = 0) => {
    const t = q.shape.type;
    if (t === "oval")
      add("ellipse", { cx: x + w / 2, cy: y + hh / 2, rx: w / 2, ry: hh / 2, fill });
    else if (t === "circle")
      add("circle", { cx: x + w / 2, cy: y + hh / 2, r: Math.min(w, hh) / 2, fill });
    else
      add("rect", {
        x,
        y,
        width: w,
        height: hh,
        fill,
        rx: t === "rounded" ? Math.max(q.shape.radius - shrink, 1) : 0,
      });
  };
  outline(0, 0, W, H, q.colors.frame);
  outline(m, m, pw, ph, "#7a8794", m);
  if (q.mat.on) {
    const b = q.mat.border;
    outline(m, m, pw, ph, q.colors.mat, m);
    outline(m + b, m + b, pw - 2 * b, ph - 2 * b, "#7a8794", m + b);
    if (q.mat.edge !== "straight")
      add("rect", {
        x: m + 0.5,
        y: m + 0.5,
        width: pw - 1,
        height: ph - 1,
        fill: "none",
        stroke: "#7a8794",
        "stroke-width": Math.max(pw / 40, 0.6),
        "stroke-dasharray": `${Math.max(pw / 25, 1)} ${Math.max(pw / 25, 1)}`,
      });
  }
  return svg;
}

export function createSidebar(toast) {
  const root = h("aside", { class: "side" });
  let busy = false;

  const gallerySection = () => {
    const { items, active } = gallery.get();
    const total = items.reduce((n, i) => n + i.qty, 0);
    const all = h(
      "button",
      {
        class: "primary",
        hidden: items.length < 2 && items[0].qty < 2,
        onclick: async (e) => {
          if (busy) return;
          busy = true;
          const btn = e.currentTarget;
          try {
            await downloadGallery(
              items,
              bed(),
              (d, n) => (btn.textContent = d < n ? `${d + 1}/${n}…` : "Done"),
            );
          } finally {
            busy = false;
            paint();
          }
        },
      },
      `All ${total} in one 3MF`,
    );
    return section(
      "gallery",
      `Frames (${items.length})`,
      h(
        "ul",
        { class: "items" },
        items.map((it) =>
          h(
            "li",
            { class: it.id === active ? "on" : "" },
            h("button", { class: "pick", onclick: () => selectItem(it.id) }, it.name),
            h("span", { class: "qty muted" }, "×"),
            numField({
              value: it.qty,
              min: 1,
              max: 99,
              key: `qty.${it.id}`,
              onChange: (v) => patchItem(it.id, { qty: Math.round(v) }),
            }),
            items.length > 1 &&
              h(
                "button",
                { class: "x", "aria-label": "Remove", onclick: () => removeItem(it.id) },
                "×",
              ),
          ),
        ),
      ),
      h(
        "div",
        { class: "chips" },
        h("button", { onclick: () => addItem(false) }, "+ New"),
        h("button", { onclick: () => addItem(true) }, "Duplicate"),
        all,
      ),
    );
  };

  const bed = () => ({ x: project.get().print.x, y: project.get().print.y });

  const paint = () => {
    const p = project.get();
    const open = new Set([...root.querySelectorAll("details[open]")].map((d) => d.dataset.sec));
    const scroll = root.scrollTop;
    const focus = document.activeElement;
    const focusKey = root.contains(focus) ? focus.dataset?.key : null;
    const caret =
      focusKey && focus.selectionStart != null ? [focus.selectionStart, focus.selectionEnd] : null;

    const custom = p.photo.size === "custom";
    const boxy = p.shape.type === "rect" || p.shape.type === "rounded";
    const { status, part } = result.get();
    const ready = status === "ok" && part;
    const plan = ready ? platePlan(part, bed()) : null;
    const pic = picture.get();

    const profiles = h(
      "div",
      { class: "profiles" },
      PROFILE_IDS.map((id) =>
        h(
          "button",
          {
            class: "profile",
            "aria-pressed": String(id === p.moulding.profile),
            title: PROFILES[id].label,
            onclick: () => update((q) => (q.moulding.profile = id)),
          },
          thumb(id),
          h("span", {}, PROFILES[id].label),
        ),
      ),
    );

    const fileInput = h("input", {
      type: "file",
      accept: "image/*",
      hidden: true,
      onchange: async (e) => {
        const f = e.target.files?.[0];
        if (f) await loadPicture(f).catch(() => toast("Could not read that image"));
      },
    });

    const presets = h(
      "div",
      { class: "presets" },
      STYLE_IDS.map((id) =>
        h(
          "button",
          {
            class: "preset",
            "aria-pressed": String(matchesStyle(p, id)),
            title: STYLES[id].note,
            onclick: () => update((q) => Object.assign(q, applyStyle(q, id))),
          },
          styleThumb(id),
          h("span", {}, STYLES[id].label),
        ),
      ),
    );

    root.replaceChildren(
      section(
        "presets",
        "Presets",
        presets,
        h("p", { class: "muted small" }, "A starting look. Everything below stays editable."),
      ),
      gallerySection(),
      section(
        "photo",
        "Photo",
        row(
          "Size",
          select(
            "photo.size",
            p.photo.size,
            PHOTO_IDS.map((id) => [id, PHOTO_SIZES[id].label]),
            (v) => update((q) => (q.photo.size = v)),
          ),
        ),
        custom &&
          row(
            "Width",
            mmField("photo.w", {
              value: p.photo.w,
              min: 10,
              max: 600,
              onChange: (v) => update((q) => (q.photo.w = v)),
            }),
          ),
        custom &&
          row(
            "Height",
            mmField("photo.h", {
              value: p.photo.h,
              min: 10,
              max: 600,
              onChange: (v) => update((q) => (q.photo.h = v)),
            }),
          ),
        row(
          "Orientation",
          segmented({
            value: p.photo.landscape,
            options: [
              { value: false, label: "Portrait" },
              { value: true, label: "Landscape" },
            ],
            onChange: (v) => update((q) => (q.photo.landscape = v)),
          }),
        ),
        row(
          "Overlap",
          mmField("photo.overlap", {
            value: p.photo.overlap,
            min: 0.8,
            max: 15,
            step: 0.5,
            onChange: (v) => update((q) => (q.photo.overlap = v)),
          }),
          "How much the lip covers the photo's edge.",
        ),
        h(
          "div",
          { class: "chips" },
          h(
            "button",
            { onclick: () => fileInput.click() },
            pic.src ? "Change picture" : "Preview with my picture",
          ),
          pic.src && h("button", { onclick: clearPicture }, "Remove"),
        ),
        fileInput,
        h(
          "p",
          { class: "muted small" },
          "The picture stays in your browser. It is only used for the preview and the lithophane.",
        ),
      ),
      section(
        "shape",
        "Shape",
        row(
          "Outline",
          select(
            "shape.type",
            p.shape.type,
            [
              ["rect", "Rectangle"],
              ["rounded", "Rounded"],
              ["oval", "Oval"],
              ["circle", "Circle"],
              ["arch", "Arch"],
              ["polygon", "Polygon"],
            ],
            (v) => update((q) => (q.shape.type = v)),
          ),
        ),
        p.shape.type === "rounded" &&
          row(
            "Corner radius",
            mmField("shape.radius", {
              value: p.shape.radius,
              min: 1,
              max: 100,
              onChange: (v) => update((q) => (q.shape.radius = v)),
            }),
          ),
        p.shape.type === "polygon" &&
          row(
            "Sides",
            numField({
              value: p.shape.sides,
              min: 3,
              max: 12,
              key: "shape.sides",
              onChange: (v) => update((q) => (q.shape.sides = v)),
            }),
          ),
        (p.shape.type === "circle" || p.shape.type === "polygon") &&
          h("p", { class: "muted small" }, "Uses the shorter side of the photo."),
      ),
      section(
        "frame",
        "Frame",
        profiles,
        row(
          "Width",
          mmField("moulding.width", {
            value: p.moulding.width,
            min: 3,
            max: 80,
            onChange: (v) => update((q) => (q.moulding.width = v)),
          }),
        ),
        row(
          "Height",
          mmField("moulding.height", {
            value: p.moulding.height,
            min: 4,
            max: 60,
            onChange: (v) => update((q) => (q.moulding.height = v)),
          }),
          "Raised automatically when the stack is deep.",
        ),
        row(
          "Texture",
          select(
            "texture.type",
            p.texture.type,
            [
              ["none", "Smooth"],
              ["woodgrain", "Wood grain"],
              ["hammered", "Hammered"],
              ["linen", "Linen"],
              ["reeded", "Reeded"],
            ],
            (v) => update((q) => (q.texture.type = v)),
          ),
        ),
        p.texture.type !== "none" &&
          row(
            "Depth",
            mmField("texture.depth", {
              value: p.texture.depth,
              min: 0.05,
              max: 1,
              step: 0.05,
              onChange: (v) => update((q) => (q.texture.depth = v)),
            }),
          ),
        p.texture.type !== "none" &&
          row(
            "Scale",
            numField({
              value: p.texture.scale,
              min: 0.3,
              max: 4,
              step: 0.1,
              key: "texture.scale",
              onChange: (v) => update((q) => (q.texture.scale = v)),
            }),
          ),
        p.texture.type !== "none" &&
          row(
            "Seed",
            numField({
              value: p.texture.seed,
              min: 1,
              max: 999,
              key: "texture.seed",
              onChange: (v) => update((q) => (q.texture.seed = v)),
            }),
          ),
      ),
      section(
        "stack",
        "Rabbet and mat",
        row(
          "Glass or acetate",
          mmField("stack.glass", {
            value: p.stack.glass,
            min: 0,
            max: 4,
            step: 0.1,
            onChange: (v) => update((q) => (q.stack.glass = v)),
          }),
          "0 for none. Thickness of the clear sheet you will cut.",
        ),
        row(
          "Photo thickness",
          mmField("stack.photo", {
            value: p.stack.photo,
            min: 0.1,
            max: 4,
            step: 0.1,
            onChange: (v) => update((q) => (q.stack.photo = v)),
          }),
        ),
        row(
          "Air gap",
          mmField("stack.gap", {
            value: p.stack.gap,
            min: 0,
            max: 20,
            step: 0.5,
            onChange: (v) => update((q) => (q.stack.gap = v)),
          }),
          "Prints a spacer ring in front of the art.",
        ),
        row(
          "Clearance",
          mmField("rabbet.clearance", {
            value: p.rabbet.clearance,
            min: 0,
            max: 2,
            step: 0.1,
            onChange: (v) => update((q) => (q.rabbet.clearance = v)),
          }),
        ),
        row(
          "Lip",
          mmField("rabbet.lip", {
            value: p.rabbet.lip,
            min: 0.8,
            max: 6,
            step: 0.2,
            onChange: (v) => update((q) => (q.rabbet.lip = v)),
          }),
        ),
        checkbox({
          checked: p.mat.on,
          label: "Mat",
          key: "mat.on",
          onChange: (v) => update((q) => (q.mat.on = v)),
        }),
        p.mat.on &&
          row(
            "Border",
            mmField("mat.border", {
              value: p.mat.border,
              min: 2,
              max: 80,
              onChange: (v) => update((q) => (q.mat.border = v)),
            }),
          ),
        p.mat.on &&
          row(
            "Mat thickness",
            mmField("mat.thickness", {
              value: p.mat.thickness,
              min: 0.4,
              max: 6,
              step: 0.2,
              onChange: (v) => update((q) => (q.mat.thickness = v)),
            }),
          ),
        p.mat.on &&
          row(
            "Opening edge",
            select(
              "mat.edge",
              p.mat.edge,
              [
                ["straight", "Straight"],
                ["scalloped", "Scalloped"],
                ["perforated", "Perforated"],
              ],
              (v) => update((q) => (q.mat.edge = v)),
            ),
          ),
        p.mat.on &&
          boxy &&
          row(
            "Photos",
            h(
              "span",
              { class: "pair" },
              numField({
                value: p.mat.cols,
                min: 1,
                max: 6,
                key: "mat.cols",
                onChange: (v) => update((q) => (q.mat.cols = v)),
              }),
              h("span", { class: "muted" }, "×"),
              numField({
                value: p.mat.rows,
                min: 1,
                max: 6,
                key: "mat.rows",
                onChange: (v) => update((q) => (q.mat.rows = v)),
              }),
            ),
            "Columns × rows of openings.",
          ),
        p.mat.on &&
          p.mat.rows * p.mat.cols > 1 &&
          row(
            "Gap",
            mmField("mat.gap", {
              value: p.mat.gap,
              min: 2,
              max: 40,
              onChange: (v) => update((q) => (q.mat.gap = v)),
            }),
          ),
        checkbox({
          checked: p.mat.backer,
          label: "Stamp backer card",
          hint: "A perforated card to glue your art onto",
          key: "mat.backer",
          onChange: (v) => update((q) => (q.mat.backer = v)),
        }),
        checkbox({
          checked: p.litho.on,
          label: "Lithophane instead of a photo",
          key: "litho.on",
          onChange: (v) => update((q) => (q.litho.on = v)),
        }),
        p.litho.on &&
          !pic.src &&
          h("p", { class: "muted small" }, "Pick a picture under Photo to build the panel."),
        p.litho.on &&
          row(
            "Thinnest",
            mmField("litho.min", {
              value: p.litho.min,
              min: 0.4,
              max: 2,
              step: 0.2,
              onChange: (v) => update((q) => (q.litho.min = v)),
            }),
          ),
        p.litho.on &&
          row(
            "Thickest",
            mmField("litho.max", {
              value: p.litho.max,
              min: 1.2,
              max: 5,
              step: 0.2,
              onChange: (v) => update((q) => (q.litho.max = v)),
            }),
          ),
        p.litho.on &&
          checkbox({
            checked: p.litho.invert,
            label: "Invert (light = thick)",
            key: "litho.invert",
            onChange: (v) => update((q) => (q.litho.invert = v)),
          }),
      ),
      section(
        "back",
        "Back and mount",
        row(
          "Back",
          segmented({
            value: p.retention,
            options: [
              { value: "clip", label: "Clip-in" },
              { value: "slide", label: "Slide-in" },
            ].filter((o) => o.value === "clip" || p.shape.type === "rect"),
            onChange: (v) => update((q) => (q.retention = v)),
          }),
        ),
        row(
          "Back thickness",
          mmField("stack.back", {
            value: p.stack.back,
            min: 1,
            max: 6,
            step: 0.2,
            onChange: (v) => update((q) => (q.stack.back = v)),
          }),
        ),
        row(
          "Mount",
          select(
            "mount.type",
            p.mount.type,
            [
              ["none", "None"],
              ["stand", "Stand (prop leg)"],
              ["hanger", "Keyhole hanger"],
              ["magnets", "Magnets"],
            ],
            (v) => update((q) => (q.mount.type = v)),
          ),
        ),
        p.mount.type === "stand" &&
          row(
            "Lean angle",
            numField({
              value: p.mount.angle,
              min: 10,
              max: 40,
              unit: "°",
              key: "mount.angle",
              onChange: (v) => update((q) => (q.mount.angle = v)),
            }),
          ),
        p.mount.type === "magnets" &&
          row(
            "Magnet Ø",
            mmField("mount.magnetD", {
              value: p.mount.magnetD,
              min: 3,
              max: 20,
              step: 0.5,
              onChange: (v) => update((q) => (q.mount.magnetD = v)),
            }),
          ),
        p.mount.type === "magnets" &&
          row(
            "Magnet height",
            mmField("mount.magnetH", {
              value: p.mount.magnetH,
              min: 1,
              max: 6,
              step: 0.5,
              onChange: (v) => update((q) => (q.mount.magnetH = v)),
            }),
          ),
      ),
      section(
        "colors",
        "Colours",
        swatch("colors.frame", "Frame", p.colors.frame, (v) => update((q) => (q.colors.frame = v))),
        swatch("colors.mat", "Mat", p.colors.mat, (v) => update((q) => (q.colors.mat = v))),
        swatch("colors.back", "Back", p.colors.back, (v) => update((q) => (q.colors.back = v))),
        h(
          "p",
          { class: "muted small" },
          "Colours are for the preview. Assign filaments in your slicer.",
        ),
      ),
      section(
        "export",
        "Print and export",
        row(
          "Printer",
          select(
            "print.printer",
            p.print.printer,
            [...PRINTERS.map((x) => [x.id, x.short ?? x.name]), ["custom", "Custom"]],
            (v) =>
              update((q) => {
                q.print.printer = v;
                const pr = PRINTERS.find((x) => x.id === v);
                if (pr) {
                  q.print.x = pr.x;
                  q.print.y = pr.y;
                }
              }),
          ),
        ),
        row(
          "Bed",
          h(
            "span",
            { class: "pair" },
            mmField("print.x", {
              value: p.print.x,
              min: 40,
              max: 1000,
              onChange: (v) => update((q) => ((q.print.x = v), (q.print.printer = "custom"))),
            }),
            h("span", { class: "muted" }, "×"),
            mmField("print.y", {
              value: p.print.y,
              min: 40,
              max: 1000,
              onChange: (v) => update((q) => ((q.print.y = v), (q.print.printer = "custom"))),
            }),
          ),
        ),
        row(
          "Connector fit",
          mmField("print.tol", {
            value: p.print.tol,
            min: 0,
            max: 0.5,
            step: 0.05,
            onChange: (v) => update((q) => (q.print.tol = v)),
          }),
          "Extra room in the bowtie pockets. Print the test strip to tune it.",
        ),
        ready &&
          h(
            "p",
            { class: "muted", dataset: { key: "size" } },
            `${part.size.map((v) => v.toFixed(1)).join(" × ")} mm · ${part.parts.length} part${part.parts.length > 1 ? "s" : ""}`,
            part.plan.nx * part.plan.ny > 1
              ? ` · frame cut in ${part.plan.nx} × ${part.plan.ny}`
              : part.plan.angle > 0
                ? ` · turned ${part.plan.angle}° to fit`
                : "",
            plan && plan.plates > 1 ? ` · ${plan.plates} plates` : "",
          ),
        ready && part.warnings.map((w) => h("p", { class: "warn" }, WARNINGS[w] ?? w)),
        h(
          "div",
          { class: "chips" },
          h(
            "button",
            { class: "primary", disabled: !ready, onclick: () => download3mf(part, bed()) },
            "3MF",
          ),
          h(
            "button",
            { disabled: !ready, onclick: () => downloadStl(part) },
            part?.parts?.length > 1 ? "STL (zip)" : "STL",
          ),
          h("button", { title: "Bowtie fit test", onclick: downloadCoupon }, "Test strip"),
        ),
      ),
    );

    root.querySelectorAll("details").forEach((d) => {
      if (open.size && !open.has(d.dataset.sec)) d.open = false;
    });
    root.scrollTop = scroll;
    if (focusKey) {
      const el = root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus();
        if (caret) el.setSelectionRange?.(...caret);
      }
    }
  };

  const shareUrl = () => `${location.origin}${location.pathname}#p=${encodeShare(project.get())}`;
  root.shareUrl = shareUrl;
  project.subscribe(paint);
  result.subscribe(paint);
  view.subscribe(paint);
  gallery.subscribe(paint);
  picture.subscribe(paint);
  paint();
  return root;
}
