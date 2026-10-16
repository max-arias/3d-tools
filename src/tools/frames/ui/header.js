import { h } from "../../../shell/h.js";
import { toggleTheme } from "../../../shell/theme.js";

export function createHeader() {
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
    h("button", { onclick: toggleTheme }, "Theme"),
  );
}
