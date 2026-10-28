# Storage boxes

Latching Gridfinity carry cases with bins inside ("packs"), at `/boxes/`.

The box is a rebuild in code of Pred's **Gridfinity Storage Box (now parametric)**
(<https://www.printables.com/model/543553>). Pred gave permission to print, sell and change
it. Pred's meshes are not in this repo. Every size and interface was measured from Pred's
Parametric V1 files, and the parts are checked against them slice by slice. So our boxes stack
and latch with boxes printed from Pred's files, and Pred's latches and hinges fit ours.

## Parts

| Part         | File              | Notes                                                                      |
| ------------ | ----------------- | -------------------------------------------------------------------------- |
| Base         | `geom/base.js`    | Baseplate floor, channels, tabs, hinge pockets, label shelf, handle bosses |
| Lid          | `geom/lid.js`     | Hollow feet hold the bins down by their stacking lips                      |
| Latch        | `geom/latch.js`   | Its pockets catch on the channel's catches; the side strips spring         |
| Hinge        | `geom/hinge.js`   | `pin`: printed in place. `screw`: M3×30 and a nut                          |
| Label        | `geom/label.js`   | Raised text as a second body (second colour)                               |
| Handle, pins | `geom/handle.js`  | Hangs on 2× M3×14–16 bolts or printed pins                                 |
| Bins         | `geom/bins.js`    | The Gridfinity tool's bin builder, as tall as the box                      |
| Fit coupon   | `geom/fittest.js` | Corners of a 4x3 box, cut from the real base and lid                       |

Size rules live in `geom/dims.js`:

- Footprint is 42·N + 20 mm.
- The base is 7·U + 5.5 mm tall and the lid 11.5 mm.
- Minimum size is 4×3×6U; below that, the label and latches don't fit.

## Checking against the reference

```bash
node tools/measure-ref.mjs "<unzipped Printables model files>" 5x4x6 4x3x6 7x6x15
```

For each size, the script slices our base, lid, latch and hinge at the same planes as Pred's.
It prints the area that differs and where.

As of 2026-10-28, the worst slices differ by:

| Part  | Worst slice | Typical slice area | Cause                                       |
| ----- | ----------- | ------------------ | ------------------------------------------- |
| Base  | ≤ 120 mm²   | 4000–60000 mm²     | Chamfers and the V-groove profile           |
| Lid   | ≤ 180 mm²   | 4000–60000 mm²     | Groove mouths and the front block's chamfer |
| Latch | ≤ 90 mm²    | ~400 mm²           |                                             |
| Hinge | ≤ 10 mm²    |                    |                                             |

Fit is also tested directly in `test/boxes-geom.test.js`, with no solid overlap allowed:

- the lid sitting on the base, and a second box stacked on the lid;
- a latch in each channel;
- a full-height bin under the lid.

## Print estimates

`model/packs.js` `printEstimate` is calibrated on Pred's sliced 5x4x6U sample (PrusaSlicer,
PETG, 2 perimeters, 15 % infill):

| Part                       | Filament | Time      | Layer height |
| -------------------------- | -------- | --------- | ------------ |
| Base                       | 220 g    | 10 h 15 m | 0.3 mm       |
| Lid                        | 117 g    | 5 h 48 m  | 0.3 mm       |
| Handle, latches and hinges | 32 g     | 3 h 27 m  | 0.2 mm       |
