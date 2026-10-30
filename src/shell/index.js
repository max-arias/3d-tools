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
  {
    href: "/tapas/",
    name: "Tapas (Argentina)",
    desc: "Diseñá cubretapas, cubreteclas y marcos para llaves de luz argentinas. Previsualizá y descargá el STL o 3MF.",
    icon: "cube",
  },
  {
    href: "/frames/",
    name: "Frames",
    desc: "Picture frames in any size, profile and shape, with mat, back, stand or magnets. Big frames are split to your bed. Download the STL or 3MF.",
    icon: "cube",
  },
  {
    href: "/lamps/",
    name: "Lamps",
    desc: "Shape a lampshade with a drag-able profile, ribs and twist, fit an E27 or E14 socket holder, and download the STL.",
    icon: "cube",
  },
  {
    href: "/letters/",
    name: "Channel letters",
    desc: "Turn text or an SVG logo into hollow box letters for LED strips, each with a diffuser lid, laid out on your print plates.",
    icon: "cube",
  },
  {
    href: "/boxes/",
    name: "Storage boxes",
    desc: "Latching Gridfinity carry cases with hinges, label and handle, plus the bins that go inside, in ready-made packs.",
    icon: "grid",
  },
  {
    href: "/clocks/",
    name: "Clocks",
    desc: "Turn a shape, an SVG or a picture into a wall, desk or fridge clock for a quartz movement, with multi-colour inlays, printed hands and an LED halo.",
    icon: "cube",
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
