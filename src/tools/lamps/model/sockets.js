// Socket holder sizes in mm. Every value here is a starting point, NOT checked against a datasheet:
// lamp holders vary by maker, so measure yours and adjust `hole`. `source: null` marks that.
export const SOCKET_SPECS = {
  E27: {
    label: "E27 (large Edison)",
    hole: 40.5, // clear hole for the holder's threaded neck
    ring: 56, // outside diameter of the hub around the hole
    source: null,
  },
  E14: {
    label: "E14 (small Edison)",
    hole: 29.5,
    ring: 44,
    source: null,
  },
};
