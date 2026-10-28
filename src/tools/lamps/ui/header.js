import { h } from "../../../shell/h.js";
import { checkbox } from "../../../shell/widgets.js";
import { toggleTheme } from "../../../shell/theme.js";
import { langStore, setLang, t } from "../lib/i18n.js";
import { encodeShare } from "../model/project.js";
import { FORMATS, downloadFiles, readSettings } from "./export.js";
import { openLibrary, originLabel } from "./library.js";
import { openModal } from "./modal.js";
import { project, replaceProject, result, view } from "./state.js";

export function createHeader(toast) {
  const root = h("header", { class: "bar" });

  const share = async () => {
    const url = `${location.origin}${location.pathname}#p=${encodeShare(project.get())}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("shared"));
    } catch {
      prompt(t("share"), url);
    }
  };

  const openExport = () => {
    const chosen = new Set(["stl"]);
    const body = h("div", { class: "export" });
    const paint = () =>
      body.replaceChildren(
        ...FORMATS.map((f) =>
          checkbox({
            checked: chosen.has(f),
            label: t(`fmt_${f}`),
            hint: t(`fmtHint_${f}`),
            key: `fmt.${f}`,
            onChange: (on) => {
              if (on) chosen.add(f);
              else chosen.delete(f);
              go.disabled = !chosen.size;
            },
          }),
        ),
        result.get().part?.warnings?.includes("ribsLimited") &&
          h(
            "p",
            { class: "bad" },
            t("ribsLimited", { d: result.get().part.ribDepth, set: project.get().ribs.depth }),
          ),
        result.get().part?.warnings?.includes("thinWall") &&
          h(
            "p",
            { class: "bad" },
            t("thinWall", { w: result.get().part.wall.toFixed(2), set: project.get().wall }),
          ),
        h("p", { class: "hint muted" }, t("exportHint")),
        go,
        h(
          "label",
          { class: "file" },
          t("loadSettings"),
          h("input", {
            type: "file",
            accept: ".json,application/json",
            "data-key": "load",
            onchange: async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                replaceProject(await readSettings(file), null);
                modal.close();
                toast(t("loaded"));
              } catch {
                toast(t("loadFailed"));
              }
            },
          }),
        ),
      );
    const go = h(
      "button",
      {
        class: "primary",
        onclick: async () => {
          const part = result.get().part;
          if (!part) return toast(t("loading"));
          await downloadFiles([...chosen], part, project.get());
          modal.close();
        },
      },
      t("downloadSelected"),
    );
    paint();
    const modal = openModal(t("export"), body);
  };

  const render = () => {
    const { lang } = langStore.get();
    const label = originLabel();
    root.replaceChildren(
      h("a", { class: "back", href: "/" }, "← ", t("back")),
      h(
        "div",
        { class: "brand" },
        h("b", {}, t("app")),
        h("span", { class: "muted" }, label ?? t("appSub")),
      ),
      h("span", { class: "grow" }),
      h("button", { onclick: () => openLibrary(toast) }, t("library")),
      h(
        "button",
        {
          disabled: !project.canUndo(),
          onclick: () => project.undo(),
          title: "Ctrl+Z",
          "aria-label": t("undo"),
        },
        "↶",
      ),
      h(
        "button",
        {
          disabled: !project.canRedo(),
          onclick: () => project.redo(),
          title: "Ctrl+Shift+Z",
          "aria-label": t("redo"),
        },
        "↷",
      ),
      h(
        "span",
        { class: "segmented", role: "group", "aria-label": "Language / Idioma" },
        ["en", "es"].map((l) =>
          h(
            "button",
            { "aria-pressed": String(l === lang), onclick: () => setLang(l) },
            l.toUpperCase(),
          ),
        ),
      ),
      h("button", { onclick: share }, t("share")),
      h("button", { onclick: toggleTheme }, t("theme")),
      h("button", { class: "primary", onclick: openExport }, t("export")),
    );
  };
  langStore.subscribe(render);
  project.subscribe(render);
  view.subscribe(render);
  render();
  return root;
}
