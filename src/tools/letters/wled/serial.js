// Push segments and presets to a WLED board over USB (Web Serial). WLED reads a line of JSON on its
// serial port as a state change, and "psave" stores the state as a preset. This works from an https
// page, unlike calling http://wled.local. LED length and GPIO are config, not state: set those by hand.
// WLED listens on the USB serial pin, so the data pin must not be GPIO 1 or 3.

export const serialSupported = () => "serial" in navigator;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The messages to send: the letter segments, then each preset saved under its id. */
export function messagesFor(segments, presets) {
  return [
    { on: true, seg: segments },
    ...Object.entries(presets)
      .filter(([id]) => id !== "0")
      .map(([id, p]) => ({ ...p, psave: Number(id) })),
  ];
}

/** Ask for a port and send every message with a pause for WLED to store it. */
export async function pushToDevice(messages, onProgress = () => {}) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  const writer = port.writable.getWriter();
  try {
    await sleep(300); // a board that reset on connect needs a moment
    for (const [i, msg] of messages.entries()) {
      onProgress(i, messages.length);
      await writer.write(new TextEncoder().encode(`${JSON.stringify(msg)}\n`));
      await sleep(500);
    }
    onProgress(messages.length, messages.length);
  } finally {
    writer.releaseLock();
    await port.close();
  }
}
