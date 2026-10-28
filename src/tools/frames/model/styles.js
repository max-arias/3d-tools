// Curated starting looks. Each `patch` is a partial project laid over the defaults, photo size included.
import { defaultProject, merge, sanitize } from "./project.js";

const MINI = {
  shape: { type: "rect" },
  rabbet: { clearance: 0.3, lip: 1.2 },
  photo: { overlap: 1.5 },
  stack: { glass: 0.5, photo: 0.4, back: 1.6, gap: 0 },
  retention: "slide",
  mount: { type: "magnets", magnetD: 6, magnetH: 2 },
};

// Every preset shares this: a low bevel moulding and no mat.
const BASE = { moulding: { profile: "bevel" }, mat: { on: false } };

export const STYLES = {
  stampBlack: {
    label: "Stamp mini",
    note: "Black, slide-in back, magnet",
    patch: merge(MINI, {
      photo: { size: "stamp" },
      moulding: { width: 4, height: 7 },
      colors: { frame: "#1b1b1b", mat: "#f3efe6", back: "#1b1b1b" },
    }),
  },
  stampWood: {
    label: "Stamp mini, wood",
    note: "Light wood, larger stamp",
    patch: merge(MINI, {
      photo: { size: "stampL" },
      moulding: { width: 5, height: 7 },
      colors: { frame: "#e2c79a", mat: "#f6d36b", back: "#e2c79a" },
    }),
  },
  cardMini: {
    label: "Card mini",
    note: "Trading card, slim, magnet",
    patch: merge(MINI, {
      photo: { size: "atc" },
      moulding: { width: 6, height: 7 },
      colors: { frame: "#222222", mat: "#f3efe6", back: "#222222" },
    }),
  },
  instaxFridge: {
    label: "Instax fridge",
    note: "Rounded, pastel, magnet",
    patch: merge(MINI, {
      photo: { size: "instaxMini" },
      shape: { type: "rounded", radius: 6 },
      moulding: { width: 8, height: 7 },
      colors: { frame: "#f4b6c2", mat: "#fff7ee", back: "#f4b6c2" },
    }),
  },
  classicDesk: {
    label: "Classic desk",
    note: "4×6, wood, stand",
    patch: { photo: { size: "4x6" }, moulding: { height: 8 } },
  },
  galleryWall: {
    label: "Gallery wall",
    note: "8×10, black, hanger",
    patch: {
      photo: { size: "8x10", overlap: 4 },
      moulding: { width: 14, height: 10 },
      stack: { glass: 2, photo: 0.6, back: 2, gap: 0 },
      mount: { type: "hanger" },
      colors: { frame: "#1d1d1f", mat: "#f7f4ee", back: "#1d1d1f" },
    },
  },
  ornateGold: {
    label: "Ornate gold",
    note: "5×7, gold, hammered, stand",
    patch: {
      photo: { size: "5x7" },
      moulding: { width: 26, height: 8 },
      texture: { type: "hammered", depth: 0.3, scale: 1 },
      colors: { frame: "#c9a43a", mat: "#f3efe6", back: "#8a6f1f" },
    },
  },
  ovalKeepsake: {
    label: "Oval keepsake",
    note: "5×7 oval, woodgrain",
    patch: {
      photo: { size: "5x7" },
      shape: { type: "oval" },
      moulding: { width: 18, height: 8 },
      texture: { type: "woodgrain", depth: 0.25, scale: 1 },
      colors: { frame: "#a9794a", mat: "#f3efe6", back: "#7a5532" },
    },
  },
  lithophane: {
    label: "Lithophane",
    note: "4×6 backlit photo",
    patch: {
      photo: { size: "4x6" },
      moulding: { width: 14, height: 11 },
      litho: { on: true },
      colors: { frame: "#2b2b2b", mat: "#f3efe6", back: "#2b2b2b" },
    },
  },
};
export const STYLE_IDS = Object.keys(STYLES);

/** The look on top of defaults (so nothing leaks from the previous one), keeping the user's printer. */
export const applyStyle = (current, id) =>
  sanitize(merge(merge(merge(defaultProject(), BASE), { print: current.print }), STYLES[id].patch));

/** True while the project still equals the preset (printer settings aside). */
export const matchesStyle = (project, id) => {
  const strip = ({ print, ...rest }) => JSON.stringify(rest);
  return strip(project) === strip(applyStyle(project, id));
};
