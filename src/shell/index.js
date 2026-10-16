import { h } from "./h.js";
import { applyTheme } from "./theme.js";

applyTheme();

const tools = [
  {
    href: "/gridfinity/",
    name: "Gridfinity drawer",
    desc: "Enter your drawer and printer. Get a split baseplate and bins, ready to print.",
  },
  {
    href: "/tapas/",
    name: "Tapas (Argentina)",
    desc: "Diseñá cubretapas para llaves de luz argentinas. Previsualizá y descargá el STL o 3MF.",
  },
  { name: "More tools", desc: "Coming soon." },
];

document.getElementById("app").append(
  h("h1", {}, "3D TOOLS"),
  h("p", { class: "muted" }, "Small tools for 3D printing."),
  h(
    "div",
    { class: "tools" },
    tools.map((t) =>
      h(
        t.href ? "a" : "div",
        { class: `tool${t.href ? "" : " soon"}`, href: t.href },
        h("h2", {}, t.name),
        h("p", {}, t.desc),
      ),
    ),
  ),
);
