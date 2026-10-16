import { h } from "../../../shell/h.js";
import { numField, row, segmented } from "../../../shell/widgets.js";
import { PROFILES, PROFILE_IDS, crossSection } from "../geom/profiles.js";
import { PHOTO_IDS, PHOTO_SIZES } from "../model/presets.js";
import { downloadStl, download3mf, fitsBed } from "./export.js";
import { project, result, update, view } from "./state.js";

const section = (id, title, ...body) =>
  h(
    "details",
    { class: "sec", open: true, dataset: { sec: id } },
    h("summary", {}, title),
    h("div", { class: "sec-body" }, ...body),
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

export function createSidebar() {
  const root = h("aside", { class: "side" });

  const paint = () => {
    const p = project.get();
    const open = new Set([...root.querySelectorAll("details[open]")].map((d) => d.dataset.sec));
    const scroll = root.scrollTop;

    const sizeSelect = h(
      "select",
      { onchange: (e) => update((q) => (q.photo.size = e.target.value)) },
      PHOTO_IDS.map((id) =>
        h("option", { value: id, selected: id === p.photo.size }, PHOTO_SIZES[id].label),
      ),
    );
    const custom = p.photo.size === "custom";

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

    const { status, part } = result.get();
    const ready = status === "ok" && part;
    const { bed } = view.get();
    const tooBig = ready && !fitsBed(part, bed);

    root.replaceChildren(
      section(
        "photo",
        "Photo",
        row("Size", sizeSelect),
        custom &&
          row(
            "Width",
            numField({
              value: p.photo.w,
              min: 10,
              max: 600,
              unit: "mm",
              onChange: (v) => update((q) => (q.photo.w = v)),
            }),
          ),
        custom &&
          row(
            "Height",
            numField({
              value: p.photo.h,
              min: 10,
              max: 600,
              unit: "mm",
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
          numField({
            value: p.photo.overlap,
            min: 1,
            max: 15,
            step: 0.5,
            unit: "mm",
            onChange: (v) => update((q) => (q.photo.overlap = v)),
          }),
        ),
      ),
      section(
        "frame",
        "Frame",
        profiles,
        row(
          "Width",
          numField({
            value: p.moulding.width,
            min: 5,
            max: 80,
            unit: "mm",
            onChange: (v) => update((q) => (q.moulding.width = v)),
          }),
        ),
        row(
          "Height",
          numField({
            value: p.moulding.height,
            min: 4,
            max: 60,
            unit: "mm",
            onChange: (v) => update((q) => (q.moulding.height = v)),
          }),
        ),
      ),
      section(
        "rabbet",
        "Rabbet",
        row(
          "Depth",
          numField({
            value: p.rabbet.depth,
            min: 1,
            max: 30,
            step: 0.5,
            unit: "mm",
            onChange: (v) => update((q) => (q.rabbet.depth = v)),
          }),
        ),
        row(
          "Clearance",
          numField({
            value: p.rabbet.clearance,
            min: 0,
            max: 2,
            step: 0.1,
            unit: "mm",
            onChange: (v) => update((q) => (q.rabbet.clearance = v)),
          }),
        ),
        row(
          "Lip",
          numField({
            value: p.rabbet.lip,
            min: 0.8,
            max: 6,
            step: 0.2,
            unit: "mm",
            onChange: (v) => update((q) => (q.rabbet.lip = v)),
          }),
        ),
      ),
      section(
        "export",
        "Export",
        row(
          "Bed",
          numField({
            value: bed,
            min: 50,
            max: 1000,
            unit: "mm",
            onChange: (v) => view.set({ bed: v }),
          }),
        ),
        ready &&
          h(
            "p",
            { class: "muted", dataset: { key: "size" } },
            `${part.size.map((v) => v.toFixed(1)).join(" × ")} mm`,
            tooBig ? " · larger than the bed (splitting is coming)" : "",
          ),
        ready &&
          part.warnings.includes("heightRaised") &&
          h("p", { class: "muted" }, "Moulding height was raised to keep the lip over the rabbet."),
        h(
          "div",
          { class: "chips" },
          h(
            "button",
            { class: "primary", disabled: !ready, onclick: () => downloadStl(part) },
            "STL",
          ),
          h("button", { disabled: !ready, onclick: () => download3mf(part, bed) }, "3MF"),
        ),
      ),
    );
    root.querySelectorAll("details").forEach((d) => {
      if (open.size && !open.has(d.dataset.sec)) d.open = false;
    });
    root.scrollTop = scroll;
  };

  project.subscribe(paint);
  result.subscribe(paint);
  view.subscribe(paint);
  paint();
  return root;
}
