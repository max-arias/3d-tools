// The effects the tool previews and writes into WLED presets. `fx` is WLED's effect id (FX.h);
// sx is speed and ix intensity, both 0-255. The preview in led/effects.js only approximates each one.
export const EFFECTS = [
  { key: "solid", fx: 0, sx: 128, ix: 128 },
  { key: "rainbow", fx: 9, sx: 100, ix: 128 },
  { key: "fire", fx: 66, sx: 120, ix: 160 },
  { key: "breathe", fx: 2, sx: 90, ix: 128 },
  { key: "wipe", fx: 3, sx: 110, ix: 128 },
  { key: "waves", fx: 67, sx: 110, ix: 128 },
  { key: "meteor", fx: 76, sx: 150, ix: 128 },
  { key: "colorloop", fx: 8, sx: 90, ix: 128 },
  { key: "running", fx: 15, sx: 120, ix: 128 },
  { key: "theater", fx: 13, sx: 120, ix: 128 },
];
export const EFFECT_KEYS = EFFECTS.map((e) => e.key);
