import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Module from "manifold-3d";
import opentype from "opentype.js";
import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, expect, test } from "vite-plus/test";
import { generateLetters } from "../src/tools/letters/geom/generate.js";
import { createKit } from "../src/tools/letters/lib/kit.js";
import { EFFECTS } from "../src/tools/letters/model/effects.js";
import { defaultProject, merge, sanitize } from "../src/tools/letters/model/project.js";
import { patchFlashSize } from "../src/tools/letters/wled/bootloader.js";
import { buildWledPack, ledPoints } from "../src/tools/letters/wled/bundle.js";
import { manifestFor } from "../src/tools/letters/wled/flash.js";
import { buildLedmap } from "../src/tools/letters/wled/ledmap.js";
import { buildPresets } from "../src/tools/letters/wled/presets.js";
import { messagesFor } from "../src/tools/letters/wled/serial.js";

let result;
let project;
beforeAll(async () => {
  const wasm = await Module();
  wasm.setup();
  const b = readFileSync("node_modules/@fontsource/anton/files/anton-latin-400-normal.woff");
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  project = sanitize(merge(defaultProject(), { source: { text: "LED" } }));
  const kit = createKit(wasm);
  result = generateLetters(kit, project, font);
  kit.free();
});

test("the ledmap places every LED exactly once and stays small", () => {
  const points = ledPoints(result.parts);
  const { map, width, height } = buildLedmap(points, 10);
  expect(map).toHaveLength(width * height);
  expect(width * height).toBeLessThanOrEqual(4096);
  const used = map.filter((i) => i >= 0).sort((a, b) => a - b);
  expect(used).toEqual(points.map((_, i) => i));
});

test("two LEDs in one cell still both get a cell", () => {
  const { map } = buildLedmap(
    [
      [0, 0],
      [0.1, 0.1],
      [40, 0],
    ],
    20,
  );
  expect(map.filter((i) => i >= 0).sort()).toEqual([0, 1, 2]);
});

test("presets: segments cover every LED once, in order, and ids start at 1", () => {
  const { presets, names } = buildPresets(result.parts, project.wled);
  expect(presets[0]).toEqual({});
  expect(Object.keys(presets).slice(1).map(Number)).toEqual(names.map((_, i) => i + 1));
  for (const id of Object.keys(presets).slice(1)) {
    const seg = presets[id].seg;
    expect(seg[0].start).toBe(0);
    seg.forEach((s, i) => {
      expect(s.stop).toBeGreaterThan(s.start);
      if (i) expect(s.start).toBe(seg[i - 1].stop);
    });
    expect(seg.at(-1).stop).toBe(result.ledTotal);
  }
});

test("effect ids match WLED's FX.h", () => {
  const ids = Object.fromEntries(EFFECTS.map((e) => [e.key, e.fx]));
  expect(ids).toMatchObject({
    solid: 0,
    breathe: 2,
    wipe: 3,
    colorloop: 8,
    rainbow: 9,
    running: 15,
    theater: 13,
    fire: 66,
    waves: 67,
    meteor: 76,
  });
});

test("USB messages: segments first, then each preset saved under its id", () => {
  const { presets } = buildPresets(result.parts, project.wled);
  const msgs = messagesFor([{ id: 0, start: 0, stop: 5 }], presets);
  expect(msgs[0].seg).toHaveLength(1);
  expect(msgs.slice(1).map((m) => m.psave)).toEqual(Object.keys(presets).slice(1).map(Number));
});

test("the pack holds the three files and the LED count in the README", () => {
  const files = unzipSync(buildWledPack(result, project));
  expect(Object.keys(files).sort()).toEqual(["README.txt", "ledmap1.json", "presets.json"]);
  expect(strFromU8(files["README.txt"])).toContain(`Length ........... ${result.ledTotal}`);
});

/** A tiny ESP image: header, one segment, checksum, sha256 over everything before it. */
function fakeBootloader() {
  const seg = new Uint8Array(20).fill(7);
  const body = new Uint8Array(24 + 8 + seg.length);
  body[0] = 0xe9;
  body[1] = 1;
  body[3] = 0x30; // 8 MB
  body[23] = 1; // append digest
  new DataView(body.buffer).setUint32(24 + 4, seg.length, true);
  body.set(seg, 32);
  const pos = 32 + seg.length;
  const hashStart = pos + ((16 - ((pos + 1) % 16)) % 16) + 1;
  const img = new Uint8Array(hashStart + 32);
  img.set(body);
  img.set(createHash("sha256").update(img.slice(0, hashStart)).digest(), hashStart);
  return { img, hashStart };
}

test("the bootloader patch sets the size and re-signs the image", async () => {
  const { img, hashStart } = fakeBootloader();
  expect(new Uint8Array(await patchFlashSize(img.buffer, "8MB"))).toEqual(img); // no change for 8 MB
  const out = new Uint8Array(await patchFlashSize(img.buffer, "4MB"));
  expect(out[3] >> 4).toBe(2);
  const want = createHash("sha256").update(out.slice(0, hashStart)).digest();
  expect(Buffer.from(out.slice(hashStart, hashStart + 32))).toEqual(want);
  expect(out.slice(0, 3)).toEqual(img.slice(0, 3));
  await expect(patchFlashSize(img.buffer, "2MB")).rejects.toThrow();
});

test("the manifest writes bootloader, partitions and firmware at the ESP32 offsets", () => {
  const m = manifestFor("4MB", "blob:x");
  const parts = m.builds[0].parts;
  expect(parts.map((p) => p.offset)).toEqual([4096, 32768, 65536]);
  expect(parts[1].path).toContain("partitions_c3_4m.bin");
  expect(parts[2].path).toMatch(/download\.wled\.me\/.*WLED_[\d.]+_ESP32\.bin$/);
});
