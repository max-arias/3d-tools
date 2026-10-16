import { h } from "../../../shell/h.js";
import { toggleTheme } from "../../../shell/theme.js";
import { langStore, setLang, t } from "../lib/i18n.js";
import { encodeShare } from "../model/project.js";
import { project } from "./state.js";

export function createHeader(toast) {
  const root = h("header", { class: "bar" });
  const render = () => {
    const { lang } = langStore.get();
    const share = async () => {
      const url = `${location.origin}${location.pathname}#p=${encodeShare(project.get())}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(t("shared"));
      } catch {
        prompt(t("share"), url);
      }
    };
    root.replaceChildren(
      h("a", { class: "back", href: "/" }, "← ", t("back")),
      h(
        "div",
        { class: "brand" },
        h("b", {}, t("app")),
        h("span", { class: "muted" }, t("appSub")),
      ),
      h("span", { class: "grow" }),
      h(
        "span",
        { class: "segmented", role: "group", "aria-label": "Idioma / Language" },
        ["es", "en"].map((l) =>
          h(
            "button",
            { "aria-pressed": String(l === lang), onclick: () => setLang(l) },
            l.toUpperCase(),
          ),
        ),
      ),
      h("button", { onclick: share }, t("share")),
      h("button", { onclick: toggleTheme }, t("theme")),
    );
  };
  langStore.subscribe(render);
  render();
  return root;
}
