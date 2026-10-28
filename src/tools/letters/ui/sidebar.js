import { h } from "../../../shell/h.js";
import { checkbox, numField, row, segmented } from "../../../shell/widgets.js";
import { PRINTERS } from "../../frames/model/printers.js"; // shared printer list (TDT-33 moves it to src/lib)
import { langStore, t } from "../lib/i18n.js";
import { bom } from "../led/bom.js";
import { powerPlan } from "../led/power.js";
import { CUSTOM_FONT, FONTS } from "../model/fonts.js";
import { MAX_TEXT, fitsBed } from "../model/project.js";
import { CHIPS, CHIP_IDS, DENSITIES, PSU_SIZES } from "../model/strips.js";
import { SvgError, importSvg } from "./svg.js";
import { project, result, update, useCustomFont } from "./state.js";
import "./strings.js";

const select = (key, value, options, onChange) =>
  h(
    "select",
    { dataset: { key }, onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
  );

export function createSidebar(toast) {
  const root = h("aside", { class: "side" });
  const readouts = h("div", { class: "readouts", "aria-live": "polite" });
  const powerBox = h("div", { class: "readouts", "aria-live": "polite" });
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
  const num = (path, opts) => {
    const [a, b] = path.split(".");
    return numField({
      value: project.get()[a][b],
      key: path,
      onChange: (v) =>
        edit((d) => {
          d[a][b] = v;
        }, path),
      ...opts,
    });
  };

  const section = (id, title, ...body) =>
    h(
      "details",
      { class: "sec", open: true, dataset: { sec: id } },
      h("summary", {}, h("span", { class: "sec-title" }, title)),
      h("div", { class: "sec-body" }, ...body),
    );

  const fail = (e) => toast(t(e instanceof SvgError ? e.message : "svgType"));

  const onSvg = async (file) => {
    if (!file) return;
    try {
      const svg = await importSvg(file);
      update((d) => {
        d.source.kind = "svg";
        d.source.svg = svg;
      });
      svgName = file.name;
      paint();
    } catch (e) {
      fail(e);
    }
  };
  let svgName = "";

  const sourceSection = () => {
    const p = project.get();
    const text = p.source.kind === "text";
    const drop = h(
      "label",
      {
        class: "drop",
        ondragover: (e) => {
          e.preventDefault();
          drop.dataset.over = "1";
        },
        ondragleave: () => delete drop.dataset.over,
        ondrop: (e) => {
          e.preventDefault();
          delete drop.dataset.over;
          onSvg(e.dataTransfer.files[0]);
        },
      },
      h("span", {}, p.source.svg ? svgName || t("svgLoaded") : t("svgDrop")),
      h("input", {
        type: "file",
        accept: ".svg,image/svg+xml",
        dataset: { key: "svg" },
        onchange: (e) => onSvg(e.target.files[0]),
      }),
    );
    const fontOptions = [
      ...FONTS.map((f) => [f.id, f.name]),
      ...(p.source.customName ? [[CUSTOM_FONT, `${t("fontCustom")}: ${p.source.customName}`]] : []),
    ];
    return section(
      "source",
      t("source"),
      segmented({
        value: p.source.kind,
        options: [
          { value: "text", label: t("text") },
          { value: "svg", label: t("svg") },
        ],
        onChange: (kind) => {
          update((d) => {
            d.source.kind = kind;
          });
          paint();
        },
      }),
      text
        ? h(
            "div",
            { class: "group" },
            row(
              t("textLabel"),
              h("input", {
                type: "text",
                maxLength: MAX_TEXT,
                value: p.source.text,
                dataset: { key: "source.text" },
                oninput: (e) =>
                  edit((d) => {
                    d.source.text = e.target.value;
                  }, "text"),
              }),
            ),
            row(
              t("font"),
              select("source.font", p.source.font, fontOptions, (v) => {
                update((d) => {
                  d.source.font = v;
                });
              }),
            ),
            h(
              "label",
              { class: "file" },
              t("uploadFont"),
              h("input", {
                type: "file",
                accept: ".ttf,.otf,.woff",
                dataset: { key: "font-file" },
                onchange: async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  try {
                    await useCustomFont(file);
                    paint();
                  } catch {
                    toast(t("fontFailed"));
                  }
                },
              }),
            ),
            row(
              t("tracking"),
              num("source.tracking", { min: -20, max: 40, step: 0.5, unit: "mm" }),
            ),
          )
        : h("div", { class: "group" }, drop, h("p", { class: "hint muted" }, t("svgHint"))),
    );
  };

  const paint = () => {
    const p = project.get();
    const printer = PRINTERS.find((x) => x.id === p.printer);
    root.replaceChildren(
      sourceSection(),
      section(
        "size",
        t("sizeTitle"),
        row(
          t("height"),
          num("size.height", { min: 20, max: 400, step: 5, unit: "mm" }),
          t("heightHint"),
        ),
        row(
          t("depth"),
          num("size.depth", { min: 10, max: 150, step: 1, unit: "mm" }),
          t("depthHint"),
        ),
        row(t("wall"), num("size.wall", { min: 1, max: 6, step: 0.2, unit: "mm" })),
        row(t("base"), num("size.base", { min: 0.8, max: 6, step: 0.2, unit: "mm" })),
      ),
      section(
        "lid",
        t("lidTitle"),
        checkbox({
          checked: p.lid.on,
          label: t("lidOn"),
          key: "lid.on",
          onChange: (v) => {
            update((d) => {
              d.lid.on = v;
            });
            paint();
          },
        }),
        p.lid.on &&
          h(
            "div",
            { class: "group" },
            row(
              t("rebate"),
              num("lid.rebate", { min: 0.8, max: 8, step: 0.5, unit: "mm" }),
              t("rebateHint"),
            ),
            row(
              t("ledge"),
              num("lid.ledge", { min: 0.4, max: 4, step: 0.2, unit: "mm" }),
              t("ledgeHint"),
            ),
            row(
              t("lidThickness"),
              num("lid.thickness", { min: 0.6, max: 6, step: 0.1, unit: "mm" }),
            ),
            row(t("clearance"), num("lid.clearance", { min: 0.1, max: 1, step: 0.05, unit: "mm" })),
          ),
      ),
      section(
        "hole",
        t("holeTitle"),
        checkbox({
          checked: p.hole.on,
          label: t("holeOn"),
          key: "hole.on",
          onChange: (v) => {
            update((d) => {
              d.hole.on = v;
            });
            paint();
          },
        }),
        p.hole.on && row(t("holeDia"), num("hole.d", { min: 3, max: 12, step: 0.5, unit: "mm" })),
        p.hole.on &&
          row(
            t("holeAt"),
            segmented({
              value: p.hole.at,
              options: [
                { value: "center", label: t("holeCenter") },
                { value: "start", label: t("holeStart") },
              ],
              onChange: (at) =>
                update((d) => {
                  d.hole.at = at;
                }),
            }),
            t("holeAtHint"),
          ),
      ),
      section(
        "leds",
        t("ledsTitle"),
        segmented({
          value: p.leds.mode,
          options: [
            { value: "rows", label: t("ledRows") },
            { value: "perimeter", label: t("ledPerimeter") },
          ],
          onChange: (mode) => {
            update((d) => {
              d.leds.mode = mode;
            });
            paint();
          },
        }),
        h(
          "p",
          { class: "hint muted" },
          t(p.leds.mode === "rows" ? "ledRowsHint" : "ledPerimeterHint"),
        ),
        row(
          t("chip"),
          select(
            "leds.chip",
            p.leds.chip,
            CHIP_IDS.map((id) => [id, CHIPS[id].name]),
            (chip) => {
              update((d) => {
                d.leds.chip = chip;
                d.leds.stripWidth = CHIPS[chip].stripWidth;
              });
              paint();
            },
          ),
          CHIPS[p.leds.chip].estimate ? t("chipEstimate") : null,
        ),
        row(
          t("density"),
          select(
            "leds.density",
            String(p.leds.density),
            DENSITIES.map((n) => [String(n), `${n} LED/m`]),
            (v) =>
              update((d) => {
                d.leds.density = +v;
              }),
          ),
        ),
        row(t("stripWidth"), num("leds.stripWidth", { min: 4, max: 30, step: 1, unit: "mm" })),
        p.leds.mode === "rows" &&
          row(
            t("rowSpacing"),
            num("leds.spacing", { min: 8, max: 80, step: 1, unit: "mm" }),
            t("rowSpacingHint"),
          ),
        p.leds.mode === "rows" &&
          row(
            t("rowDir"),
            segmented({
              value: p.leds.dir,
              options: [
                { value: "auto", label: t("dirAuto") },
                { value: "h", label: "↔" },
                { value: "v", label: "↕" },
              ],
              onChange: (dir) =>
                update((d) => {
                  d.leds.dir = dir;
                }),
            }),
          ),
        row(t("ledMargin"), num("leds.margin", { min: 0, max: 6, step: 0.5, unit: "mm" })),
      ),
      section(
        "power",
        t("powerTitle"),
        row(t("powerMargin"), num("power.margin", { min: 0, max: 50, step: 5, unit: "%" })),
        row(
          t("psu"),
          select(
            "power.psuA",
            String(p.power.psuA ?? ""),
            [["", t("psuAuto")], ...PSU_SIZES.map((a) => [String(a), `${a} A`])],
            (v) => {
              update((d) => {
                d.power.psuA = v ? +v : null;
              });
              paintReadouts();
            },
          ),
        ),
        powerBox,
      ),
      section(
        "printer",
        t("printerTitle"),
        row(
          t("printer"),
          select(
            "printer",
            p.printer,
            PRINTERS.map((x) => [x.id, x.name]),
            (id) => {
              const x = PRINTERS.find((q) => q.id === id);
              update((d) => {
                d.printer = id;
                if (x) d.build = { x: x.x, y: x.y, z: x.z };
              });
              paint();
            },
          ),
        ),
        h(
          "p",
          { class: "hint muted" },
          `${p.build.x} × ${p.build.y} × ${p.build.z} mm`,
          printer?.bambu ? " · Bambu" : "",
        ),
      ),
      section("parts", t("partsTitle"), readouts),
    );
    paintReadouts();
  };

  const paintPower = (part, p) => {
    if (!part?.ledTotal) return powerBox.replaceChildren(h("p", { class: "muted" }, t("noLeds")));
    const plan = powerPlan(part.ledTotal, p.leds.chip, p.power.margin, p.power.psuA);
    const b = bom(
      part.parts.filter((x) => x.led).map((x) => x.led),
      p.leds.density,
      p.size.depth,
    );
    const volts = CHIPS[p.leds.chip].volts;
    const rows = [
      [t("roLeds"), String(part.ledTotal)],
      [t("roWorst"), `${plan.worstA.toFixed(1)} A @ ${volts} V`],
      [t("roSupply"), `${plan.recommendedA} A (${plan.recommendedA * volts} W)`],
      [t("roLimit"), `${plan.maxpwr} mA`],
      [t("roStrip"), `${b.stripM.toFixed(2)} m · ${b.pieces} ${t("roPieces")}`],
      [t("roWire"), `${b.wireM.toFixed(1)} m · ${b.joints} ${t("roJoints")}`],
    ];
    powerBox.replaceChildren(
      h(
        "div",
        { class: "ro-grid" },
        rows.map(([k, v]) =>
          h("div", { class: "ro" }, h("span", { class: "muted" }, k), h("b", {}, v)),
        ),
      ),
      plan.cap < 1 && h("p", { class: "warn" }, t("capWarn", { pct: Math.round(plan.cap * 100) })),
      plan.injections > 0 && h("p", { class: "warn" }, t("injectWarn", { n: plan.injections })),
      volts === 12 && h("p", { class: "hint muted" }, t("bucknote")),
    );
  };

  const paintReadouts = () => {
    const { status, part, error } = result.get();
    const p = project.get();
    paintPower(part, p);
    if (status === "error") return readouts.replaceChildren(h("p", { class: "bad" }, error));
    if (!part) return readouts.replaceChildren(h("p", { class: "muted" }, t("building")));
    if (!part.parts.length)
      return readouts.replaceChildren(
        h("p", { class: "muted" }, t(p.source.kind === "svg" ? "emptySvg" : "emptyText")),
      );
    const notes = [
      part.fontMissing && h("p", { class: "warn" }, t("fontMissing")),
      part.notes.includes("island-dropped") && h("p", { class: "warn" }, t("islandDropped")),
      p.lid.on && p.lid.thickness > p.lid.rebate && h("p", { class: "warn" }, t("lidTall")),
    ].filter(Boolean);
    readouts.replaceChildren(
      ...notes,
      h(
        "ul",
        { class: "parts" },
        part.parts.map((x) => {
          const fits = fitsBed(x.size, p.build);
          const flags = [
            !fits && h("span", { class: "bad" }, t("tooBig")),
            ...x.issues.map((i) =>
              h("span", { class: "warn" }, t(`issue_${i.replaceAll("-", "_")}`)),
            ),
          ];
          return h(
            "li",
            { class: fits ? "" : "over" },
            h("span", { class: "tag" }, x.label),
            h("span", { class: "muted" }, `${x.size[0].toFixed(0)} × ${x.size[1].toFixed(0)} mm`),
            x.led && h("span", { class: "muted" }, `${x.led.count} LED`),
            ...flags,
          );
        }),
      ),
    );
  };

  langStore.subscribe(paint);
  project.subscribe(() => (selfEdit ? paintReadouts() : paint()));
  result.subscribe(paintReadouts);
  paint();
  return root;
}
