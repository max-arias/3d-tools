# 3D Tools

Small tools for 3D printing, in one lightweight web app. Vanilla JS on [Vite+](https://viteplus.dev), three.js for viewing, manifold-3d (WASM, in a worker) for geometry. No backend.

## Tools

- **Gridfinity drawer** (`/gridfinity/`): enter a drawer and a printer, get a split Gridfinity baseplate and bins as 3MF (packed on plates) or STL zip. A rewrite of Fitforge Drawer; its share links (`#p=`) open here.
- **Frames** (`/frames/`): picture frames in any photo size, 18 original moulding profiles, six outlines, mat (multi-photo, stamp edges), clip-in or slide-in back, stand, keyhole or magnets, textures and lithophane. Frames larger than the bed are cut into pieces with bowtie connectors. A Presets section at the top gives one-click looks, photo size included (stamp minis, card, Instax, gallery wall, ornate gold, oval, lithophane). Exports STL (zip) or a multi-plate 3MF, and a connector fit test strip. A Room view shows the frame on a nightstand.
- **Lamps** (`/lamps/`): lampshades for 3D printing. Drag the profile (2 to 12 points, in a 2D half-section or on the 3D shade), add ribs (sine, sharp scallop, triangle; count, depth, twist), set the wall, and fuse an E27 or E14 socket holder (top or bottom, straight, tapered or curved spokes). Random designs from a seed with lockable sections, 36 library designs plus your own saved ones, undo/redo, build-volume warnings, share links. Views: shaded, wire, x-ray, section, lit and a Room (table lamp on the nightstand, or a pendant on a cord). Exports STL, SCAD, PNG and JSON (several download as a zip). English and Spanish. An original rewrite inspired by Shade Studio; no code is copied from it. The socket hole sizes in `model/sockets.js` are unverified starting points: measure your holder.
- **Channel letters** (`/letters/`): text (Anton, Archivo Black or your own TTF/OTF) or an SVG logo becomes hollow box letters for LED strips, one box and one diffuser lid per letter, with a rebate for the lid and a cable hole through the back. Letters that touch share one box. Lays out LEDs (back rows or a perimeter run), plans the power supply, previews effects, and has a Controller dialog for WLED (flash from the page, presets, a 2D map, USB push). Exports a 3MF with every part laid out on plates, an STL zip, PNG and JSON. English and Spanish. See `src/tools/letters/README.md` for what is still untested on hardware. A rewrite of the idea behind CarteLed Studio's 3D generator; no code is copied from it.
- **Storage boxes** (`/boxes/`): latching Gridfinity carry cases ("cajas de trabajo") compatible with Pred's [Gridfinity Storage Box](https://www.printables.com/model/543553) (used with his permission). Pick the grid and height, 2/4/6 latches, pin or screw hinges, a handle and a front label, then lay out the Gridfinity bins inside by dragging on a top view. Ready-made packs (M3 hardware, electronics, bits...), a "suggest a box for these bins" helper, a fit-test coupon, a pack sheet to copy, and a 3MF with one plate per print group or an STL zip. English and Spanish.
- **Clocks** (`/clocks/`): a preset shape (circle to cloud, bear, leaf, cheese, arch), an SVG outline or a picture becomes a clock for a standard quartz movement. Colour inlays from an SVG or a traced photo, numerals and ticks (12/24 h, backwards, following the outline), printed hands with counterweight and glow tips, cutout patterns, relief and ribs. Wall (keyholes plus a 1:1 drilling template), desk (cradle or foot), magnet, or two-sided on a wall bracket, with an optional LED halo. The face is thinned over the movement so the thread reaches; notes flag hands that hit raised decor or are too heavy. Live hands, a hand-stack section view, ten original starter designs, a fit coupon, multi-colour 3MF. English and Spanish. See `src/tools/clocks/README.md` for what is unverified.

## Develop

```
npm install
npx vp dev        # dev server
npx vp test run   # tests (layout rules, geometry validity, exports)
npx vp check      # format + lint
npx vp build      # production build in dist/
npm run smoke     # browser smoke test (needs `npx vp dev --port 5199` running)
npm run font      # rebuild label glyphs from Inter Bold (OFL)
```

## Layout

- `src/shell/`: shared DOM helper, store, theme, widgets.
- `src/tools/gridfinity/model/`: project defaults, sanitizer, undo history, persistence and share links.
- `src/tools/gridfinity/layout/`: pure rules (grid, bed splitting, joints, bin editing, labels, plate packing).
- `src/tools/gridfinity/geom/`: manifold geometry and the worker.
- `src/tools/gridfinity/export/`: STL, 3MF, zip, part grouping.
- `src/tools/gridfinity/ui/`: header, sidebar (settings sections), stage (plan / 3D / split / plates), guide, shortcuts.
- `src/tools/frames/`: `model/` (project, presets, gallery), `geom/` (profiles, path, parts, split, texture, litho, worker), `lib/` (kit with `sweepLoop`, 3MF/STL, print placement), `ui/`. Profiles are drawn in code; nothing is copied from third-party frame generators.
- `src/tools/lamps/`: `model/` (project, sockets, history, random, library), `geom/` (profile curve, shade mesh built directly, holder with manifold, SCAD, worker), `lib/` (kit, STL, i18n), `ui/`. The shade is plain math; manifold only fuses the holder plate.
- `src/tools/letters/`: `model/` (project, fonts, history), `geom/` (glyph outlines with opentype.js, box and lid with manifold, worker), `lib/` (kit, STL, i18n, plate layout, custom font store), `ui/` (SVG import adapted from Tapas).
- `src/tools/boxes/`: `model/` (project, packs, history), `geom/` (box dimensions, base, lid, latch, hinge, label, handle, bins, fit test, worker), `lib/` (kit, STL, i18n, print grouping), `ui/`.
- `public/models/room/`: props for the Frames Room view (1k glTF, loaded only when that view opens), all CC0 from [Poly Haven](https://polyhaven.com): `ClassicNightstand_01`, `vintage_oil_lamp`, `potted_plant_04`, `alarm_clock_01`.
- `public/models/hall/`: furniture for the Tapas "On the wall" hallway (CC0 Poly Haven glTF, 1k, loaded when that view opens): `ClassicConsole_01`, `modern_ceiling_lamp_01`, `hanging_picture_frame_02`; the plant is `room/potted_plant_04`. The switch hardware stays procedural (no switch models exist there).
- `src/tools/clocks/`: `model/` (project, movements, gallery), `dial/` (pure 2D outline, markers, hands, cutouts, checks), `geom/` (dial bodies per colour, mounts, parts, worker), `lib/`, `ui/` (stage with live hands, hand-stack view).
- `tools/ui-smoke-clocks.mjs`: Playwright run of Clocks (needs `npx vp dev --port 5207`).
- `tools/ui-smoke-lamps.mjs`: Playwright run of Lamps (needs `npx vp dev --port 5203`).
- `tools/ui-smoke-letters.mjs`: Playwright run of Channel letters (needs `npx vp dev --port 5205`).
- `tools/ui-smoke-boxes.mjs`: Playwright run of Storage boxes (needs `npx vp dev --port 5206`).
- `tools/ui-smoke-frames.mjs`: Playwright run of Frames (needs `npx vp dev --port 5201`).
- `tools/ui-smoke.mjs`: Playwright run of the main flows at desktop and phone width.
- `tools/parity.mjs`: downloads the STL zip from the original site and from the local app for one project and compares volumes and bounding boxes.

Tasks live in the Obsidian vault project `3d-tools` (ticket IDs `TDT-n`), see `CLAUDE.md`.
