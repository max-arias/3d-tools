# Clocks (`/clocks/`)

A preset shape, an SVG outline or a picture becomes a printable clock for a standard quartz movement:
a dial with multi-colour inlays (or raised colours, relief steps, ribs), numerals and ticks, printed
hands, a movement housing or rim on the back, and a way to mount it (keyholes, magnets, a desk cradle
or foot, or a wall bracket for a two-sided clock). Optional LED halo and glow-tip hands. Inspired by
the Pressprint "Clock Factory" reel; no code or artwork is copied. The gallery designs are drawn in
`model/gallery.js`.

Tasks and open work live in the board: ticket TDT-62 (PRD) and its children TDT-63 to TDT-71.

## Layout

- `model/`: project (defaults, `sanitize`, share link, `geomKey`, `slotFor`), movements, gallery, history.
- `dial/` (pure 2D, no manifold): `outline.js` (presets, SVG and drawing-edge outlines, ray and edge
  distances), `markers.js`, `hands.js`, `cutouts.js`, `checks.js`.
- `geom/`: `generate.js` (dial bodies per colour slot, back, mounts, LEDs), `parts.js` (hands, cradle,
  bracket, fit coupon), `text.js`, `worker.js`.
- `lib/`: client, STL, i18n (copies), `plates.js` (print orientation and packing).
- `ui/`: sidebar, stage (live hands, hub drag), hand-stack section (`stack.js`), header, export.

Reused from other tools: the manifold kit and glyph layout (Letters), SVG outline import (Letters), the
colour SVG/raster art import, tracer and `buildArt` (Tapas), the multi-body 3MF writer (Tapas, now with
a per-body extruder) and the LED strip list (Letters).

Tests: `test/clocks-{dial,geom}.test.js`. Browser run: `npx vp dev --port 5207`, then
`node tools/ui-smoke-clocks.mjs` (set `CHROME` to a Chromium if Playwright's own is not installed).

## Conventions

- The dial is modelled with its front at z = thickness, its back at z = 0 and the movement side below;
  the shaft is the origin. Every colour slot is one body, extruder = slot + 1 in the 3MF.
- The dial prints face-down (smooth face, colours in the first layers) unless something on it is
  raised; then it prints face-up and any back housing or rim becomes its own part to glue on.
- The face is thinned over the movement so the dial at the hub is never thicker than the movement's
  thread takes (`maxDial`).

## NOT verified: needs a real movement and a test print (TDT-71 holds the checklist)

1. Movement sizes in `model/movements.js` are starting points from retail listings
   ([clockshop.com.au](https://www.clockshop.com.au/high-torque-euroshaft-sweep-quartz-clock-movement),
   [timesavers.com](https://timesavers.com/i-17764204-takane-hi-torque-continuous-sweep-c-cell-quartz-movement-23mm-h-s.html)),
   not datasheets. Sellers differ (hour hole 5.0 to 5.6 mm, minute 3.15 to 3.9 mm). Hand heights
   (`hourAt` and so on) are estimates.
2. The torque limits (`TORQUE_LIMIT`) are rough guesses; sellers rate movements by hand length.
3. Press fit of printed hands on the bushes, keyhole hold, magnet pocket fit, cradle slot play.
4. The two-sided clock's bracket and M3 screw bosses have not been printed.
5. LED halo: strip on the rim's outside edge, 9 mm behind the face edge; not tried with a real strip.
