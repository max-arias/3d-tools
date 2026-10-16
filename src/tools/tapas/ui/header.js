import { h } from "../../../shell/h.js";
import { toggleTheme } from "../../../shell/theme.js";
import { langStore, setLang, t } from "../lib/i18n.js";
import { encodeHouse } from "../model/house.js";
import { encodeShare } from "../model/project.js";
import { house, project } from "./state.js";

export function createHeader(toast) {
  const root = h("header", { class: "bar" });
  const render = () => {
    const { lang } = langStore.get();
    const share = async () => {
      const { items } = house.get();
      const hash =
        items.length > 1
          ? `h=${encodeHouse({ ...house.get(), items: items.map((i) => (i.id === house.get().active ? { ...i, project: project.get() } : i)) })}`
          : `p=${encodeShare(project.get())}`;
      const url = `${location.origin}${location.pathname}#${hash}`;
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
