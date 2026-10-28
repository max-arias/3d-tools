import { h } from "../../../shell/h.js";
import { numField, row, segmented } from "../../../shell/widgets.js";
import { holderFit } from "../geom/holder.js";
import { PRINTERS } from "../../frames/model/printers.js"; // shared printer list (TDT-33 moves it to src/lib)
import { langStore, t } from "../lib/i18n.js";
import { MAX_NODES, MIN_NODES, SECTIONS, fitStatus, resetSection } from "../model/project.js";
import { SOCKET_SPECS } from "../model/sockets.js";
import { newSeed, randomize } from "../model/random.js";
import { createProfileEditor } from "./profileEditor.js";
import { project, replaceProject, result, update, view } from "./state.js";
import "./strings.js";

const PLA_G_PER_CM3 = 1.24;

const select = (key, value, options, onChange) =>
  h(
    "select",
    { dataset: { key }, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
  );

export function createSidebar(toast) {
  const root = h("aside", { class: "side" });
  const profile = createProfileEditor();
  const readouts = h("div", { class: "readouts", "aria-live": "polite" });
  let selfEdit = false;

  /** Edit from a sidebar field: the fields keep focus, only the readouts refresh. */
  const edit = (fn, key) => {
    selfEdit = true;
    try {
      update(fn, key);
    } finally {
      selfEdit = false;
    }
  };

  const sectionHead = (id, title) => {
    const locks = view.get().locks;
    const tools = SECTIONS.includes(id)
      ? [
          h(
            "button",
            {
              class: "mini",
              "aria-pressed": String(locks[id]),
              title: t("lockHint"),
              onclick: (e) => {
                e.preventDefault();
                view.set({ locks: { ...view.get().locks, [id]: !view.get().locks[id] } });
                paint();
              },
            },
            locks[id] ? t("locked") : t("lock"),
          ),
          h(
            "button",
            {
              class: "mini",
              title: t("resetHint"),
              onclick: (e) => {
                e.preventDefault();
                project.replace(resetSection(project.get(), id));
                paint();
              },
            },
            t("reset"),
          ),
        ]
      : [];
    return h("summary", {}, h("span", { class: "sec-title" }, title), ...tools);
  };

  const section = (id, title, ...body) =>
    h(
      "details",
      { class: "sec", open: true, dataset: { sec: id } },
      sectionHead(id, title),
      h("div", { class: "sec-body" }, ...body),
    );

  const nodeControls = () => {
    const p = project.get();
    const i = Math.min(view.get().selected, p.nodes.length - 1);
    const n = p.nodes[i];
    const end = i === 0 || i === p.nodes.length - 1;
    return h(
      "div",
      { class: "group" },
      h(
        "div",
        { class: "group-head" },
        h("b", {}, t("nodeOf", { n: i + 1, total: p.nodes.length })),
        h("span", { class: "muted" }, t("nodeCount", { n: p.nodes.length, max: MAX_NODES })),
      ),
      row(
        t("nodeDiameter"),
        numField({
          value: n.d,
          min: 10,
          max: 600,
          step: 1,
          unit: "mm",
          key: "node.d",
          onChange: (v) =>
            edit((d) => {
              d.nodes[i].d = v;
            }, `node${i}d`),
        }),
      ),
      !end &&
        row(
          t("nodeHeight"),
          numField({
            value: Math.round(n.z * 100),
            min: 1,
            max: 99,
            step: 1,
            unit: "%",
            key: "node.z",
            onChange: (v) =>
              edit((d) => {
                d.nodes[i].z = v / 100;
              }, `node${i}z`),
          }),
        ),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            disabled: p.nodes.length >= MAX_NODES,
            onclick: () => {
              update((d) => {
                const k = Math.min(i, d.nodes.length - 2);
                const a = d.nodes[k];
                const b = d.nodes[k + 1];
                d.nodes.splice(k + 1, 0, { z: (a.z + b.z) / 2, d: Math.round((a.d + b.d) / 2) });
                view.set({ selected: k + 1 });
              });
              paint();
            },
          },
          t("addNode"),
        ),
        h(
          "button",
          {
            disabled: end || p.nodes.length <= MIN_NODES,
            onclick: () => {
              update((d) => d.nodes.splice(i, 1));
              view.set({ selected: Math.max(0, i - 1) });
              paint();
            },
          },
          t("removeNode"),
        ),
      ),
    );
  };

  const paint = () => {
    const p = project.get();
    const scroll = root.scrollTop;
    const fit = holderFit(p);
    const holderOn = p.holder.at !== "none";
    root.replaceChildren(
      section(
        "lamp",
        t("lamp"),
        segmented({
          value: p.type,
          options: [
            { value: "table", label: t("table") },
            { value: "pendant", label: t("pendant") },
          ],
          onChange: (type) => {
            update((d) => {
              d.type = type;
              if (d.holder.at !== "none") d.holder.at = type === "pendant" ? "top" : "bottom";
            });
            paint();
          },
        }),
        h("p", { class: "hint muted" }, t(p.type === "table" ? "tableHint" : "pendantHint")),
      ),
      section(
        "shape",
        t("shape"),
        row(
          t("height"),
          numField({
            value: p.height,
            min: 30,
            max: 600,
            step: 1,
            unit: "mm",
            key: "height",
            onChange: (v) =>
              edit((d) => {
                d.height = v;
              }, "height"),
          }),
        ),
        h("p", { class: "hint muted" }, t("profileHelp")),
        profile,
        nodeControls(),
      ),
      section(
        "ribs",
        t("ribs"),
        row(
          t("ribShape"),
          select(
            "ribs.wave",
            p.ribs.wave,
            [
              ["sine", t("waveSine")],
              ["scallop", t("waveScallop")],
              ["triangle", t("waveTriangle")],
            ],
            (v) =>
              edit((d) => {
                d.ribs.wave = v;
              }),
          ),
        ),
        row(
          t("ribCount"),
          numField({
            value: p.ribs.count,
            min: 3,
            max: 80,
            step: 1,
            key: "ribs.count",
            onChange: (v) =>
              edit((d) => {
                d.ribs.count = v;
              }, "ribs.count"),
          }),
        ),
        row(
          t("ribDepth"),
          numField({
            value: p.ribs.depth,
            min: 0,
            max: 20,
            step: 0.5,
            unit: "mm",
            key: "ribs.depth",
            onChange: (v) =>
              edit((d) => {
                d.ribs.depth = v;
              }, "ribs.depth"),
          }),
        ),
        row(
          t("ribTwist"),
          numField({
            value: p.ribs.twist,
            min: -720,
            max: 720,
            step: 5,
            unit: "°",
            key: "ribs.twist",
            onChange: (v) =>
              edit((d) => {
                d.ribs.twist = v;
              }, "ribs.twist"),
          }),
          t("ribTwistHint"),
        ),
      ),
      section(
        "wall",
        t("wall"),
        row(
          t("wallThickness"),
          numField({
            value: p.wall,
            min: 0.8,
            max: 6,
            step: 0.1,
            unit: "mm",
            key: "wall",
            onChange: (v) =>
              edit((d) => {
                d.wall = v;
              }, "wall"),
          }),
          t("wallHint"),
        ),
      ),
      section(
        "holder",
        t("holder"),
        row(
          t("holderAt"),
          segmented({
            value: p.holder.at,
            options: [
              { value: "none", label: t("none") },
              { value: "top", label: t("top") },
              { value: "bottom", label: t("bottom") },
            ],
            onChange: (at) => {
              update((d) => {
                d.holder.at = at;
              });
              paint();
            },
          }),
        ),
        holderOn && [
          row(
            t("socket"),
            segmented({
              value: p.holder.socket,
              options: Object.keys(SOCKET_SPECS).map((s) => ({ value: s, label: s })),
              onChange: (socket) => {
                update((d) => {
                  d.holder.socket = socket;
                });
                paint();
              },
            }),
            t("socketHint", { hole: SOCKET_SPECS[p.holder.socket].hole }),
          ),
          !fit.ok &&
            h("p", { class: "bad" }, t("holderTooBig", { rim: Math.round(fit.rim), hub: fit.hub })),
          row(
            t("spokeStyle"),
            select(
              "spokes.style",
              p.holder.spokes.style,
              [
                ["straight", t("spokeStraight")],
                ["tapered", t("spokeTapered")],
                ["curved", t("spokeCurved")],
              ],
              (v) =>
                edit((d) => {
                  d.holder.spokes.style = v;
                }),
            ),
          ),
          row(
            t("spokeCount"),
            numField({
              value: p.holder.spokes.count,
              min: 2,
              max: 8,
              step: 1,
              key: "spokes.count",
              onChange: (v) =>
                edit((d) => {
                  d.holder.spokes.count = v;
                }, "spokes.count"),
            }),
          ),
          row(
            t("spokeWidth"),
            numField({
              value: p.holder.spokes.width,
              min: 3,
              max: 30,
              step: 0.5,
              unit: "mm",
              key: "spokes.width",
              onChange: (v) =>
                edit((d) => {
                  d.holder.spokes.width = v;
                }, "spokes.width"),
            }),
          ),
          row(
            t("spokeRotation"),
            numField({
              value: p.holder.spokes.rotation,
              min: -180,
              max: 180,
              step: 1,
              unit: "°",
              key: "spokes.rotation",
              onChange: (v) =>
                edit((d) => {
                  d.holder.spokes.rotation = v;
                }, "spokes.rotation"),
            }),
            t("spokeRotationHint"),
          ),
          row(
            t("plateThickness"),
            numField({
              value: p.holder.plate,
              min: 1.5,
              max: 8,
              step: 0.5,
              unit: "mm",
              key: "plate",
              onChange: (v) =>
                edit((d) => {
                  d.holder.plate = v;
                }, "plate"),
            }),
            t("plateHint"),
          ),
        ],
      ),
      section(
        "build",
        t("build"),
        row(
          t("printer"),
          select(
            "printer",
            "",
            [["", t("pickPrinter")], ...PRINTERS.map((pr) => [pr.id, pr.name])],
            (id) => {
              const pr = PRINTERS.find((x) => x.id === id);
              if (!pr) return;
              update((d) => {
                d.build = { x: pr.x, y: pr.y, z: pr.z };
              });
              paint();
            },
          ),
        ),
        ["x", "y", "z"].map((axis) =>
          row(
            t(`build_${axis}`),
            numField({
              value: p.build[axis],
              min: 50,
              max: 1000,
              step: 1,
              unit: "mm",
              key: `build.${axis}`,
              onChange: (v) =>
                edit((d) => {
                  d.build[axis] = v;
                }, `build.${axis}`),
            }),
          ),
        ),
        h(
          "button",
          {
            onclick: () => {
              const part = result.get().part;
              if (!part) return;
              const { x, y, z } = p.build;
              const k = Math.min(
                1,
                (x - 1) / part.size[0],
                (y - 1) / part.size[1],
                (z - 1) / part.size[2],
              );
              if (k >= 1) return toast(t("alreadyFits"));
              update((d) => {
                d.height *= k;
                for (const n of d.nodes) n.d *= k;
                d.ribs.depth *= k;
              });
              paint();
            },
          },
          t("scaleToFit"),
        ),
      ),
      section(
        "random",
        t("random"),
        row(
          t("seed"),
          numField({
            value: p.seed,
            min: 1,
            max: 999999,
            step: 1,
            key: "seed",
            onChange: (v) => {
              replaceProject(randomize(project.get(), Math.round(v), view.get().locks));
              paint();
            },
          }),
        ),
        h(
          "button",
          {
            class: "primary",
            onclick: () => {
              replaceProject(randomize(project.get(), newSeed(), view.get().locks));
              paint();
            },
          },
          t("randomize"),
        ),
        h("p", { class: "hint muted" }, t("randomHint")),
      ),
      h("div", { class: "pad" }, readouts),
    );
    root.scrollTop = scroll;
    paintReadouts();
  };

  const paintReadouts = () => {
    const p = project.get();
    const part = result.get().part;
    if (!part) return readouts.replaceChildren(h("p", { class: "muted" }, t("loading")));
    const status = fitStatus(part.size, p.build);
    const vol = part.volume / 1000;
    const cell = (label, value, cls = "") =>
      h("div", { class: `ro ${cls}` }, h("span", { class: "muted" }, label), h("b", {}, value));
    readouts.replaceChildren(
      h(
        "div",
        { class: "ro-grid" },
        cell(t("roDiameter"), `${Math.max(part.size[0], part.size[1]).toFixed(0)} mm`),
        cell(t("roHeight"), `${part.size[2].toFixed(0)} mm`),
        cell(t("roWeight"), `${(vol * PLA_G_PER_CM3).toFixed(0)} g`),
        cell(t("roVolume"), `${vol.toFixed(0)} cm³`),
      ),
      h(
        "div",
        { class: `size ${status}`, dataset: { key: "size" } },
        `${part.size.map((v) => v.toFixed(0)).join(" × ")} mm`,
        h("span", {}, t(`fit_${status}`)),
      ),
      part.warnings?.includes("ribsLimited") &&
        h(
          "p",
          { class: "bad", dataset: { key: "limited" } },
          t("ribsLimited", { d: part.ribDepth, set: p.ribs.depth }),
        ),
      part.warnings?.includes("thinWall") &&
        h(
          "p",
          { class: "bad", dataset: { key: "thin" } },
          t("thinWall", { w: part.wall.toFixed(2), set: p.wall }),
        ),
      p.holder.at !== "none" && h("p", { class: "hint muted" }, t("printOrientation")),
    );
  };

  project.subscribe(() => {
    if (view.get().dragging || selfEdit) return paintReadouts();
    paint();
  });
  result.subscribe(paintReadouts);
  let lastSelected = view.get().selected;
  view.subscribe((v) => {
    if (v.dragging) root.dataset.dragged = "1";
    else if (root.dataset.dragged || v.selected !== lastSelected) {
      delete root.dataset.dragged;
      paint();
    }
    lastSelected = v.selected;
  });
  langStore.subscribe(paint);
  paint();
  return root;
}
