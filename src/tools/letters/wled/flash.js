// ESP Web Tools manifest for flashing WLED onto a classic ESP32 from the page (Web Serial).
// WLED's release files are fetched by the browser from WLED's own CORS-enabled mirror at flash time;
// nothing of WLED is stored or served by this site. The boot parts come from WLED's installer site.
import { patchFlashSize } from "./bootloader.js";

/** The WLED release the flasher installs. Bump after trying the new one on a board. */
export const WLED_VERSION = "16.0.1";
export const FLASH_SIZES = ["4MB", "8MB", "16MB"];

const MIRROR = "https://download.wled.me";
const BOOT = "https://install.wled.me/bin/boot";
export const FALLBACK_URL = "https://install.wled.me";

// As WLED's installer does for the ESP32: the 8 MB bootloader is the reference and the other sizes
// are it re-flagged; 4 MB uses the 4 MB partition table from the C3 set, 16 MB its own.
const PARTITIONS = {
  "4MB": "partitions_c3_4m.bin",
  "8MB": "partitions_esp32_8m.bin",
  "16MB": "partitions_esp32_16m.bin",
};

export const firmwareUrl = (version = WLED_VERSION) =>
  `${MIRROR}/wled/WLED/releases/download/v${version}/WLED_${version}_ESP32.bin`;

/** The manifest object (parts and offsets for one chip, no network needed). */
export function manifestFor(flashSize, bootloaderUrl) {
  return {
    name: "WLED",
    version: WLED_VERSION,
    new_install_prompt_erase: true,
    builds: [
      {
        chipFamily: "ESP32",
        parts: [
          { path: bootloaderUrl, offset: 4096 },
          { path: `${BOOT}/partitions/${PARTITIONS[flashSize]}`, offset: 32768 },
          { path: firmwareUrl(), offset: 65536 },
        ],
      },
    ],
  };
}

/** A blob: URL of the manifest for ESP Web Tools, patching the bootloader for the flash size. */
export async function manifestUrl(flashSize) {
  const file = `${BOOT}/bootloaders/esp32/bootloader_esp32_8m.bin`;
  let bootloader = file;
  if (flashSize !== "8MB") {
    const patched = await patchFlashSize(await (await fetch(file)).arrayBuffer(), flashSize);
    bootloader = URL.createObjectURL(new Blob([patched], { type: "application/octet-stream" }));
  }
  const json = JSON.stringify(manifestFor(flashSize, bootloader));
  return URL.createObjectURL(new Blob([json], { type: "application/json" }));
}
