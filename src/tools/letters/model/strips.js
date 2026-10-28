// LED strip chips. `ma` is the full-white current per LED that WLED's limiter assumes, so our power
// plan and WLED's limit agree. Values marked estimate are not from a datasheet: check your strip.
export const CHIPS = {
  ws2812b: { name: "WS2812B (5 V)", volts: 5, ma: 55, stripWidth: 10, wledType: 22, rgbw: false },
  sk6812rgbw: {
    name: "SK6812 RGBW (5 V)",
    volts: 5,
    ma: 80,
    stripWidth: 10,
    wledType: 30,
    rgbw: true,
    estimate: true,
  },
  ws2815: {
    name: "WS2815 (12 V)",
    volts: 12,
    ma: 25,
    stripWidth: 12,
    wledType: 22,
    rgbw: false,
    estimate: true,
  },
};
export const CHIP_IDS = Object.keys(CHIPS);
export const DENSITIES = [30, 60, 144];
/** Standard supply sizes in amps. */
export const PSU_SIZES = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 60];
