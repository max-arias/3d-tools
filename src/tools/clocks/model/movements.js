// Quartz clock movements. Sizes differ between sellers, so every preset is an unverified starting
// point (see README): measure your movement and hands, then edit the sizes in the Movement section.
// body: [w, h, depth] mm. dialHole: hole for the threaded shaft. maxDial: thickest dial the thread
// still takes a nut on. hour/minute: hand hole diameters; minuteFlat: width across the flats of an
// I-shaft (Euro) minute bush, 0 for a round press-fit hole. hourAt/minuteAt/secondAt: height of each
// hand above the movement's front face (estimates, used by the hand-stack view and the gap check).
// torque: "std" or "high" (decides the hand-weight warning).
export const MOVEMENTS = [
  {
    id: "std",
    name: "Standard 56 mm quartz, press-fit hands",
    body: [56, 56, 16],
    dialHole: 8.5,
    maxDial: 6,
    hour: 5.4,
    minute: 3.5,
    minuteFlat: 0,
    hourAt: 8.5,
    minuteAt: 11,
    secondAt: 13.5,
    torque: "std",
  },
  {
    id: "std-short",
    name: "Standard 56 mm, short shaft (thin dials)",
    body: [56, 56, 16],
    dialHole: 8.5,
    maxDial: 3,
    hour: 5.4,
    minute: 3.5,
    minuteFlat: 0,
    hourAt: 5.5,
    minuteAt: 8,
    secondAt: 10.5,
    torque: "std",
  },
  {
    id: "std-long",
    name: "Standard 56 mm, long shaft (thick dials)",
    body: [56, 56, 16],
    dialHole: 8.5,
    maxDial: 10,
    hour: 5.4,
    minute: 3.5,
    minuteFlat: 0,
    hourAt: 12.5,
    minuteAt: 15,
    secondAt: 17.5,
    torque: "std",
  },
  {
    id: "euro",
    name: "Euro / I-shaft sweep (Takane style)",
    body: [56, 56, 16],
    dialHole: 8.5,
    maxDial: 8,
    hour: 5.2,
    minute: 4,
    minuteFlat: 3,
    hourAt: 10.5,
    minuteAt: 13,
    secondAt: 15.5,
    torque: "std",
  },
  {
    id: "high",
    name: "High-torque C-cell (large hands)",
    body: [54, 70, 25],
    dialHole: 10,
    maxDial: 9.5,
    hour: 5.6,
    minute: 4,
    minuteFlat: 3,
    hourAt: 12,
    minuteAt: 15,
    secondAt: 18,
    torque: "high",
  },
];

export const MOVEMENT_IDS = MOVEMENTS.map((m) => m.id);
export const movementById = (id) => MOVEMENTS.find((m) => m.id === id) ?? MOVEMENTS[0];

/**
 * Largest hand moment (grams × cm from the shaft) a movement is taken to turn reliably. Rough
 * estimates, not datasheet values: sellers rate movements by hand length, not by weight.
 */
export const TORQUE_LIMIT = { std: 12, high: 60 };

/** Printed PLA density, g/cm³. */
export const PLA_DENSITY = 1.24;
