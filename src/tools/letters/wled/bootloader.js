// Re-flag an ESP32 bootloader image for another flash size, as esptool does with --flash_size.
// ESP Web Tools writes parts as they are, so the flash-size nibble in the image header and the
// SHA-256 appended after the image have to be fixed here. Same method as WLED's own web installer
// (github.com/wled/WLED-WebInstaller, Apache-2.0); written from the image format description.
const NIBBLE = { "4MB": 2, "8MB": 3, "16MB": 4 };

/** Returns the patched bytes as an ArrayBuffer. `buffer` is not modified. */
export async function patchFlashSize(buffer, size) {
  const nibble = NIBBLE[size];
  if (nibble === undefined) throw new Error(`unknown flash size: ${size}`);
  const data = new Uint8Array(buffer.slice(0));
  const view = new DataView(data.buffer);
  if (data[0] !== 0xe9) throw new Error("not an ESP image");
  // 8-byte header + 16-byte extended header, then segments (8-byte header + data each),
  // padding to a 16-byte boundary with the checksum byte last, then the optional 32-byte digest.
  const appendDigest = data[23];
  let pos = 24;
  for (let i = 0; i < data[1]; i++) pos += 8 + view.getUint32(pos + 4, true);
  const hashStart = pos + ((16 - ((pos + 1) % 16)) % 16) + 1;
  data[3] = (data[3] & 0x0f) | (nibble << 4);
  if (appendDigest) {
    const digest = await crypto.subtle.digest("SHA-256", data.slice(0, hashStart));
    data.set(new Uint8Array(digest), hashStart);
  }
  return data.buffer;
}
