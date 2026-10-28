// The WLED pack: presets.json, ledmap1.json and a README with the exact values to enter.
import { strToU8, zipSync } from "fflate";
import { WLED_VERSION } from "./flash.js";
import { buildLedmap } from "./ledmap.js";
import { buildPresets } from "./presets.js";
import { ledSettings } from "./settings.js";

/** Every LED position in data-line order. */
export const ledPoints = (parts) => parts.flatMap((x) => (x.led?.runs ?? []).flatMap((r) => r.pts));

export function buildWledPack(result, project) {
  const total = result.ledTotal;
  const { presets, names } = buildPresets(result.parts, project.wled);
  const pitch = 1000 / project.leds.density;
  const cell =
    (project.leds.mode === "rows" ? Math.min(pitch, project.leds.spacing) : pitch) / Math.SQRT2;
  const ledmap = buildLedmap(ledPoints(result.parts), cell);
  const s = ledSettings(total, project);
  const readme = `Channel letters: WLED setup (written for WLED ${WLED_VERSION})

1. Flash WLED onto an ESP32 (the Controller dialog in the tool, or https://install.wled.me), join its
   WLED-AP WiFi network and open http://4.3.2.1 (or its address on your network).

2. Config > LED Preferences, one LED output:
     LED type ......... ${s.type}
     Color order ...... ${s.order}
     GPIO ............. ${s.gpio}
     Length ........... ${s.length}
     Maximum PSU current (mA) ... ${s.maxPsuMa}
     mA per LED ....... ${s.maPerLed}   (${s.volts} V strip)
   Keep the automatic brightness limiter on. Save and let it reboot.

3. Presets: Config > Security & Updates > Restore presets > choose presets.json.
   ${names.length} presets are written (${names.join(", ")}); every letter is its own segment,
   named after the letter.

4. Optional 2D map: ledmap1.json is a ${ledmap.width} x ${ledmap.height} map of where each LED sits.
   Upload it at http://<address>/edit, then set 2D in the LED settings and select the map.
   (This step has not been tried on a device yet; WLED's mapping page is
   https://kno.wled.ge/advanced/mapping/.)

Wiring: data from the ESP32 GPIO ${s.gpio} (through a 330 ohm resistor) to the first LED, common ground between
the supply, the strip and the ESP32. LED order follows the letters left to right.
`;
  return zipSync({
    "presets.json": strToU8(JSON.stringify(presets, null, 1)),
    "ledmap1.json": strToU8(JSON.stringify(ledmap)),
    "README.txt": strToU8(readme),
  });
}
