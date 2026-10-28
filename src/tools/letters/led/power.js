import { CHIPS, PSU_SIZES } from "../model/strips.js";

/** ESP32 board draw, from the 5 V rail. */
export const ESP_MA = 250;

/**
 * Power plan for `count` LEDs at full white. Amps are at the strip voltage.
 * `maxpwr` is the current limit to give WLED (LED current only, in mA); `cap` is the brightness
 * fraction it allows at full white with the chosen supply.
 */
export function powerPlan(count, chipId, marginPct, psuA = null) {
  const chip = CHIPS[chipId];
  const worstMa = count * chip.ma;
  const board = chip.volts === 5 ? ESP_MA : 0;
  const needA = ((worstMa + board) * (1 + marginPct / 100)) / 1000;
  const recommendedA = PSU_SIZES.find((a) => a >= needA) ?? Math.ceil(needA);
  const supplyA = psuA ?? recommendedA;
  const maxpwr = Math.max(0, Math.floor((supplyA * 1000 - board) / (1 + marginPct / 100)));
  return {
    worstA: worstMa / 1000,
    needA,
    recommendedA,
    supplyA,
    watts: supplyA * chip.volts,
    maxpwr,
    cap: worstMa ? Math.min(1, maxpwr / worstMa) : 1,
    // Feed power in about every 150 LEDs at 5 V (300 at 12 V) or the far end sags and yellows.
    injections: Math.max(0, Math.ceil(count / (chip.volts === 5 ? 150 : 300)) - 1),
  };
}
