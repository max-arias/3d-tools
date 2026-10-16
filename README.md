# 3D Tools

Small tools for 3D printing, in one lightweight web app. Vanilla JS on [Vite+](https://viteplus.dev), three.js for viewing, manifold-3d (WASM, in a worker) for geometry. No backend.

## Tools

- **Gridfinity drawer** (`/gridfinity/`): enter a drawer and a printer, get a split Gridfinity baseplate and bins as 3MF (packed on plates) or STL zip. A rewrite of Fitforge Drawer; its share links (`#p=`) open here.
- **Frames** (`/frames/`): picture frames in any photo size, 17 original moulding profiles, six outlines, mat (multi-photo, stamp edges), clip-in or slide-in back, stand, keyhole or magnets, textures and lithophane. Frames larger than the bed are cut into pieces with bowtie connectors. Mini frames for stamps and cards are one click ("Mini setup"). Exports STL (zip) or a multi-plate 3MF, and a connector fit test strip.

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
- `tools/ui-smoke-frames.mjs`: Playwright run of Frames (needs `npx vp dev --port 5201`).
- `tools/ui-smoke.mjs`: Playwright run of the main flows at desktop and phone width.
- `tools/parity.mjs`: downloads the STL zip from the original site and from the local app for one project and compares volumes and bounding boxes.

Tasks live in the Obsidian vault project `3d-tools` (ticket IDs `TDT-n`), see `CLAUDE.md`.
