export const WALLS = ["front", "back", "left", "right"];

export const defaultGrab = () => ({
  notch: false,
  notchW: 20,
  notchD: 15,
  notchR: 10,
  scoop: false,
  scoopR: 15,
  lower: false,
  lowerPct: 50,
});

export const defaultBinDefaults = () => ({
  units: 6,
  heightMm: 0,
  wall: 1.2,
  floor: 1.2,
  lip: true,
  magnets: false,
  dividersX: 0,
  dividersY: 0,
  dividerPct: 100,
  label: "none",
  labelWall: "front",
  grab: Object.fromEntries(WALLS.map((w) => [w, defaultGrab()])),
  split: true,
  floorSeam: "butt",
  seamJoint: "none",
  wallPattern: "solid",
});

export function defaultProject() {
  return {
    v: 1,
    drawer: { w: 560, d: 470, h: 180, cornerR: 0, tol: 0.5, topClearance: 3 },
    printer: { x: 256, y: 256, z: 256, margin: 5, preset: "bambu-p1s" },
    grid: { mode: "gridfinity", target: 42, padX: "center", padY: "center", halfCells: false },
    baseplate: {
      style: "thin",
      peaks: true,
      magnets: false,
      keys: false,
      clips: false,
      keyEvery: 2,
      clipEvery: 1,
      tape: false,
      chamfer: 0.8,
      halfSockets: "ribs",
    },
    magnet: { d: 6.5, depth: 2.4 },
    joint: { clearance: 0.15, taper: false },
    labelStyle: { kind: "raised", case: "as", autoFit: true, maxMm: 7, depthMm: 0.6 },
    binPrint: "regular",
    binDefaults: defaultBinDefaults(),
    bins: [],
  };
}
