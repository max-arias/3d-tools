import { h } from "../../../shell/h.js";
import { segmented } from "../../../shell/widgets.js";
import { toggleTheme } from "../../../shell/theme.js";
import { encodeGallery } from "../model/gallery.js";
import { encodeShare } from "../model/project.js";
import { gallery, project, view } from "./state.js";

export function createHeader(toast) {
  const share = async () => {
    const { items, active } = gallery.get();
    const hash =
      items.length > 1
        ? `h=${encodeGallery({ items: items.map((i) => (i.id === active ? { ...i, project: project.get() } : i)), active })}`
        : `p=${encodeShare(project.get())}`;
    const url = `${location.origin}${location.pathname}#${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      prompt("Share link", url);
    }
  };
  return h(
    "header",
    { class: "bar" },
    h("a", { class: "back", href: "/" }, "← All tools"),
    h(
      "div",
      { class: "brand" },
      h("b", {}, "Frames"),
      h("span", { class: "muted" }, "Picture-frame generator"),
    ),
    h("span", { class: "grow" }),
    segmented({
      value: view.get().unit,
      options: [
        { value: "mm", label: "mm" },
        { value: "cm", label: "cm" },
      ],
      onChange: (unit) => view.set({ unit }),
    }),
    h("button", { onclick: share }, "Share"),
    h("button", { onclick: toggleTheme }, "Theme"),
  );
}
