# Channel letters (`/letters/`)

Text or an SVG logo becomes hollow box letters for LED strips: one box and one diffuser lid per
letter (letters that touch share a box), with a lid rebate and a cable hole through the back. LEDs
are laid out inside each letter, with a power plan, an effect preview and a WLED controller kit.
Rewritten from the idea of [CarteLed Studio](https://github.com/DiegoDiegote/CarteLed-Studio)'s 3D
generator; that repo has no license, so no code is copied.

Tasks and open work live in the board: ticket TDT-53 (PRD) and its children TDT-54, TDT-55, TDT-56.

## Layout

- `model/`: project (defaults, `sanitize`, share link, `geomKey`), fonts, strips, effects, history.
- `geom/`: `glyphs.js` (opentype outlines), `generate.js` (parts, box, lid, hole, LED layout), `worker.js`.
- `led/`: `rows.js`, `perimeter.js`, `chain.js`, `layout.js`, `power.js`, `bom.js`, `effects.js` (preview).
- `wled/`: `presets.js`, `ledmap.js`, `settings.js`, `bundle.js` (zip), `serial.js` (USB push),
  `flash.js` + `bootloader.js` (ESP Web Tools manifest).
- `lib/`: kit (manifold wrapper), STL, i18n, plate layout, IndexedDB store for an uploaded font.
- `ui/`: sidebar, stage, header, Controller dialog (`wled.js`), SVG import (`svg.js`).

Tests: `test/letters-{geom,model,leds,wled}.test.js`. Browser run: `npx vp dev --port 5205`, then
`node tools/ui-smoke-letters.mjs`.

## Facts the code depends on (checked 2026-10-23)

- Fonts: Anton and Archivo Black (OFL, `@fontsource`). opentype.js reads their woff files.
- WLED 16.0.1 (EUPL-1.2). Release binaries on GitHub have no CORS headers, so the flasher loads
  `https://download.wled.me/...` (CORS open) in the user's browser. We never store or serve WLED.
- Boot parts come from `https://install.wled.me/bin/boot/` (CORS open). The 8 MB ESP32 bootloader is the
  reference; 4 and 16 MB are it with the flash-size nibble and the trailing SHA-256 rewritten
  (`wled/bootloader.js`, tested against an independent hash). Offsets: 0x1000, 0x8000, 0x10000.
  4 MB boards use `partitions_c3_4m.bin`, as WLED's own installer does.
- `esp-web-tools` 10.4.0 needs `@material/web` 2.2.0 exactly: 2.5.0 no longer ships
  `dialog/internal/dialog-styles.js` and the build fails. Keep it pinned.
- WLED reads a line of JSON on USB serial as a state change and `"psave"` stores a preset, so presets
  and segments can be sent from this https page. LED length and GPIO are config and are typed by hand.

## NOT verified: needs a real ESP32 (TDT-56 holds the checklist)

Everything below was written from docs and WLED's source, and could not be run in the build session.

1. The Install WLED button on a 4 MB board and an 8 MB or 16 MB board, with WiFi set-up through Improv.
2. USB push: that segments and `psave` presets arrive, and what happens with a board that resets on connect.
3. `presets.json` through Config > Security & Updates > Restore presets.
4. `ledmap1.json` upload and enabling 2D: the steps in the pack README are untried.
5. WLED's current estimate against ours for a real build.
6. Also unproven in print: the 3MF in a slicer, the lid fit on the ledge, strip fit in the cavity.

## Known gaps and ideas

- The effect preview approximates WLED effects by look and runs over the LED index, as WLED does without a 2D map.
- No LDR auto-brightness: WLED needs a usermod that the release builds lack. Timed presets are the fallback.
- Only the classic ESP32 is offered in the flasher. C3, S3 and S2 use the same table in WLED's installer
  (`app.js`, `CHIP_CONFIG`) and could be added.
- No "latest WLED" lookup: the version is pinned in `wled/flash.js`. Bump it after trying a new release.
- Letters larger than the plate are flagged, not split.
- A cfg.json patcher (LED count, GPIO, max current) was left out: restoring a config overwrites the device.
- Share links carry SVG outlines and can get long; an uploaded font is not in the link.
