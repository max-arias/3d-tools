import { h } from "../../../shell/h.js";
import { profileCurve } from "../geom/profile.js";
import { langStore, t } from "../lib/i18n.js";
import { CATEGORIES, LIBRARY, isModified, libraryItem, newDesign } from "../model/library.js";
import { openModal } from "./modal.js";
import { designs, project, replaceProject, view } from "./state.js";

const NS = "http://www.w3.org/2000/svg";

/** Silhouette of a design (both sides of the profile), drawn from the same curve the generator uses. */
function thumb(p) {
  const curve = profileCurve(p.nodes);
  const rMax = Math.max(...p.nodes.map((n) => n.d / 2)) + p.ribs.depth;
  const k = Math.min(54 / rMax, 62 / p.height);
  const pts = (side) =>
    Array.from({ length: 41 }, (_, i) => {
      const z = i / 40;
      return [60 + side * (curve(z) + p.ribs.depth / 2) * k, 4 + (1 - z) * p.height * k];
    });
  const right = pts(1);
  const left = pts(-1).reverse();
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 70");
  const poly = document.createElementNS(NS, "polygon");
  poly.setAttribute(
    "points",
    [...right, ...left].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
  );
  poly.setAttribute("fill", p.color);
  poly.setAttribute("stroke", "currentColor");
  poly.setAttribute("stroke-width", "1");
  svg.append(poly);
  return svg;
}

/** The name and badge of the design that is open: "Smooth Bell · modified". */
export function originLabel() {
  const { origin } = view.get();
  if (!origin) return null;
  const { lang } = langStore.get();
  if (origin.kind === "library") {
    const item = libraryItem(origin.id);
    if (!item) return null;
    return `${item.name[lang]} · ${t(isModified(project.get(), origin.id) ? "badge_modified" : "badge_library")}`;
  }
  const saved = designs.get().list.find((d) => d.id === origin.id);
  if (!saved) return null;
  const changed = JSON.stringify(saved.project) !== JSON.stringify(project.get());
  return `${saved.name} · ${t(changed ? "badge_modified" : "badge_custom")}`;
}

export function openLibrary(toast) {
  const { lang } = langStore.get();
  let tab = "library";
  const body = h("div", { class: "lib" });
  let modal;

  const open = (p, origin) => {
    replaceProject(structuredClone(p), origin);
    modal.close();
  };

  const libraryTab = () =>
    CATEGORIES.map((cat) => {
      const items = LIBRARY.filter((d) => d.category === cat);
      return h(
        "section",
        {},
        h("h3", {}, t(`cat_${cat}`)),
        h(
          "div",
          { class: "lib-grid" },
          items.map((d) =>
            h(
              "button",
              { class: "lib-card", onclick: () => open(d.project, { kind: "library", id: d.id }) },
              thumb(d.project),
              h("b", {}, d.name[lang]),
              h(
                "small",
                { class: "muted" },
                `${d.project.nodes.length > 0 ? Math.max(...d.project.nodes.map((n) => n.d)) : 0} × ${d.project.height} mm`,
              ),
            ),
          ),
        ),
      );
    });

  const mineTab = () => {
    const list = designs.get().list;
    return [
      h(
        "button",
        {
          class: "primary",
          onclick: () => {
            const name = prompt(t("designName"), t("untitled"));
            if (!name) return;
            const d = newDesign(name, project.get());
            designs.set({ list: [...designs.get().list, d] });
            view.set({ origin: { kind: "custom", id: d.id } });
            toast(t("saved"));
            paint();
          },
        },
        t("saveCurrent"),
      ),
      !list.length && h("p", { class: "muted" }, t("noDesigns")),
      h(
        "div",
        { class: "lib-grid" },
        list.map((d) =>
          h(
            "div",
            { class: "lib-card" },
            h(
              "button",
              { class: "lib-open", onclick: () => open(d.project, { kind: "custom", id: d.id }) },
              thumb(d.project),
              h("b", {}, d.name),
            ),
            h(
              "span",
              { class: "lib-actions" },
              h(
                "button",
                {
                  class: "mini",
                  onclick: () => {
                    const name = prompt(t("rename"), d.name);
                    if (!name) return;
                    designs.set({
                      list: designs
                        .get()
                        .list.map((x) => (x.id === d.id ? { ...x, name: name.slice(0, 40) } : x)),
                    });
                    paint();
                  },
                },
                t("rename"),
              ),
              h(
                "button",
                {
                  class: "mini",
                  onclick: () => {
                    designs.set({ list: designs.get().list.filter((x) => x.id !== d.id) });
                    paint();
                  },
                },
                t("delete"),
              ),
            ),
          ),
        ),
      ),
    ];
  };

  const paint = () =>
    body.replaceChildren(
      h(
        "div",
        { class: "segmented", role: "tablist" },
        ["library", "mine"].map((id) =>
          h(
            "button",
            { "aria-pressed": String(tab === id), onclick: () => ((tab = id), paint()) },
            t(id === "library" ? "libraryTab" : "myDesigns"),
          ),
        ),
      ),
      ...(tab === "library" ? libraryTab() : mineTab()),
    );
  paint();
  modal = openModal(t("library"), body, { wide: true });
}
