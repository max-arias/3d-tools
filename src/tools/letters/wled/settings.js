import { CHIPS } from "../model/strips.js";
import { powerPlan } from "../led/power.js";

/** The values to type into WLED's LED Preferences page. */
export function ledSettings(ledTotal, project) {
  const chip = CHIPS[project.leds.chip];
  const plan = powerPlan(ledTotal, project.leds.chip, project.power.margin, project.power.psuA);
  return {
    gpio: project.wled.gpio,
    length: ledTotal,
    type: chip.rgbw ? "SK6812/WS2814 RGBW" : "WS281x",
    order: "GRB",
    maxPsuMa: plan.maxpwr,
    maPerLed: chip.ma,
    volts: chip.volts,
  };
}
