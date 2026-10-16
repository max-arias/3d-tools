import { h } from "./h.js";
import { applyTheme } from "./theme.js";
import { brandMark, icon } from "./icons.js";

applyTheme();

const tools = [
  {
    href: "/gridfinity/",
    name: "Gridfinity drawer",
    desc: "Measure your drawer, pick your printer, and get a split baseplate with bins that are ready to print.",
    icon: "grid",
  },
  { name: "More coming", desc: "Other small tools for printing will live here.", icon: "cube" },
];

document.getElementById("app").append(
  h("div", { class: "brand-row" }, brandMark(36), h("h1", {}, "3D Tools")),
  h("p", { class: "lede" }, "Small, fast tools for 3D printing. Everything runs in your browser."),
  h(
    "div",
    { class: "tools" },
    tools.map((t) =>
      h(
        t.href ? "a" : "div",
        { class: `tool${t.href ? "" : " soon"}`, href: t.href },
        icon(t.icon, 28),
        h("h2", {}, t.name),
        h("p", {}, t.desc),
      ),
    ),
  ),
);
