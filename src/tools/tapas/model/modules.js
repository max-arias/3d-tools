// Module types. `span` = how many 22.5 mm module slots it takes along the bastidor, `win` = the
// opening in the overlay (across x along, or a circle diameter). Values are approximate (TDT-32).
export const MODULES = {
  tecla: { span: 1, win: { kind: "rect", x: 42, y: 21, r: 1.5 } },
  toma: { span: 2, win: { kind: "circle", d: 38 } },
  usb: { span: 1, win: { kind: "rect", x: 36, y: 19, r: 1.5 } },
  rj45: { span: 1, win: { kind: "rect", x: 30, y: 19, r: 1 } },
  perilla: { span: 1, win: { kind: "circle", d: 19 } },
  ciego: { span: 1, win: null },
};
export const MODULE_IDS = Object.keys(MODULES);
