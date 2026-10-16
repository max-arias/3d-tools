// Module types. `span` = how many module slots it takes along the bastidor (1.5 is a half teclon);
// a slot is `mods.pitch` mm tall (19 mm on Cambre Siglo XXII, from Cambre's technical drawings).
// `win` = this module's own opening, used only when a plate has one window per module (most plates
// have a single window for all modules, see project `window`): across x along, a circle
// diameter, or the socket slots. `key` marks the types that are pressed; on a flat plate they have
// no opening of their own. Sizes here are approximate (TDT-32); the module pitch and window width
// that matter most live in the presets.
//
// Socket slots follow the Argentine face (IRAM 2071 gauge table, checked against Macroled's Milan
// pictures): line and neutral slots 7.92 mm from the midpoint along 30 degree axes (13.7 mm apart),
// earth slot 10.31 mm below it, each about 7.5 x 2.3 mm. Angles are in design coordinates: the
// cover is shown turned over, so seen from the front the left slot leans "/" and the right "\".
const SLOT = { w: 2.3, l: 7.5 };
export const SOCKET_SLOTS = [
  { x: 6.86, y: 3.96, ang: 30, ...SLOT },
  { x: -6.86, y: 3.96, ang: -30, ...SLOT },
  { x: 0, y: -10.31, ang: 0, ...SLOT },
];

export const MODULES = {
  tecla: { span: 1, key: true, win: { kind: "rect", x: 50.4, y: 17, r: 1 } },
  teclon: { span: 3, key: true, win: { kind: "rect", x: 50.4, y: 55, r: 1 } },
  teclonMedio: { span: 1.5, key: true, win: { kind: "rect", x: 50.4, y: 26.5, r: 1 } },
  toma: { span: 2, win: { kind: "circle", d: 36 } },
  tomaRanuras: { span: 2, win: { kind: "slots", slots: SOCKET_SLOTS } },
  usb: { span: 1, win: { kind: "rect", x: 36, y: 15, r: 1 } },
  rj45: { span: 1, win: { kind: "rect", x: 30, y: 15, r: 1 } },
  perilla: { span: 1, win: { kind: "circle", d: 15 } },
  ciego: { span: 1, win: null },
};
export const MODULE_IDS = Object.keys(MODULES);
/** Types that make sense on a flat plate, where the face is divided into equal shares. */
export const FLAT_IDS = MODULE_IDS.filter((id) => !["teclon", "teclonMedio", "toma"].includes(id));
export const FLAT_MAX = 6;
