# Removing hairline seams from the final templates

A fresh top-hat drawing with a free diamond border reproduced the reported
hairlines: the hat was recognisable, but near-coincident cuts left thin coloured
slivers through the background and across the hat. They were already present
in the solver's exported geometry, before conversion to the editor.

Two parts of the fitting pipeline let this happen:

- Pixel disagreement measures area. A long, narrow seam can spoil an invisible
  cut while contributing very little to that score. Identical sheets alone do
  not make all overlapping sections of different cuts coincide.
- Shared-cut recovery ran before polishing and the matching-sheet preference,
  and was skipped entirely for identical sheets and requested symmetries. The
  final selected geometry therefore did not consistently receive that repair.

The direct fitter and automatic vector route now share a final-selection
function that runs bounded shared-cut recovery after polishing and matching.
It can keep independent sheets or preserve exact
transposition. An edit to two different cuts also edits their transposed
partners; a cut meeting its own transpose uses compatible subdivisions for
both forward and backward shared sections. Their common Bézier controls are
then represented once in the graph. The later
[anti-paired recovery](ANTI-SHARING.md) also supports the between-lobes Anti
setting, including its reversed partners and parameter intervals. Combined
square and within-curve symmetries retain their exclusion until complete
coordinated edits are implemented.

Proposals can average the near-coincident sections or follow either existing
section. All options face the same image, geometry, bend and paper-core checks.
The final result must also retain every requested symmetry and cannot increase
disagreement with the original observed mask. This runs inside the requested
time budget, with a two-second cap and time reserved for export. It adds no
visitor setting and leaves the mask intact.

Recovery now excludes sections that are already shared from its minimum
three-millimetre candidate length. This avoids repeatedly subdividing the same
invisible cut and growing the exported curve count without repairing anything.

The independently fitted regression exposed two numerical problems in that
pass as well. Nearly equal subdivision fractions could create microscopic
cubics and fail the bend check; they are now merged while retaining the chosen
source's real corner positions. At a segment boundary, the incoming span now
uses the incoming derivative and the outgoing span uses the outgoing derivative.
Using the next segment's tangent for both had added a bend to a copied right
angle. A separate regression checks the complete copied polyline geometrically.

## Regression evidence

`scripts/inverse/fixtures/free-border-hat.json` records the reproduced failing
geometry and its original mask as runs. It is input to the cleanup regression,
never a saved answer used to initialise a fresh fit.

On that fixed fixture, shared length increases from **0 to 215.2 mm** on a
100 mm woven square. Mask disagreement drops from **3.1925% to 2.9475%**, using
the same original mask and geometric sampler. The two sheets remain identical,
and the geometry and paper-core checks pass. A second pass leaves the result
unchanged. Further regressions cover independently fitted sheets and an input
that deliberately contains narrow lines.

An independent resvg replay also checks fractional pixel coverage at four times
the source resolution. This matters because thresholding the rendered picture
back to two colours can erase faint seams from the test itself. The coverage
error improves from **3.0885% to 3.0621%**; this is a different metric from binary
mask disagreement, not a replacement number for it.

The production browser replay imports a new top-hat silhouette, selects **Free**
and an **84%** diamond, solves, opens Draw and exports SVG. It repeats the hat
with the between-lobes symmetry switched off, to exercise independent sheets.
The browser tests verify that every shared engine span retains the same common
controls on both editable sheets, as well as the editor's own crossing and
spacing rules.
The Chromium result reports **0.1% disagreement inside the protected motif**
and **2.8% across the whole square**; the remaining error is mostly in the fixed
checker target used for the free border in that benchmark.

All **12 browser cases pass** in Chromium 145, Firefox 146 and WebKit 26: the
hat with and without matching sheets, the star, and a Hunodan photo. The star's
PDF export is checked too. Browser differences in timing and subdivisions are
expected; exact shared geometry is required in every output. The hat's solve
and editor conversion take **18.3–28.1 seconds** in these browser replays; the
10-second Hunodan benchmark below is a separate Node measurement.

The final production replay passes **22/22 regular Hunodan photographs** at
the existing release quality limits, including the requested one-percentage-
point allowance for identical templates. Preparation, solving, validation and
export take **2.95–9.60 seconds**, with a **7.49-second median**, serially on
an Apple M2 Pro using Node 25.6.1. Photograph decoding and the independent
export replay are recorded separately and excluded from that timing.

All **717 application tests and 174 engine tests** pass, along with lint and
the production build. Svelte checking reports zero errors and seven existing
warnings. [SHARED-CUTS-VALIDATION.json](SHARED-CUTS-VALIDATION.json) records the
per-case measurements, criteria and source hashes, including verification that
the tested browser build contains the same engine source as the benchmark.

```sh
node --test scripts/inverse/sharing.test.mjs
INVERSE_TEST_CASES=top-hat,top-hat-independent,star,hunodan npm run test:inverse:paint:browser
```

These measurements used the earlier checker-border UI. The subsequent
[weighted-image integration](WEIGHTED-IMAGE.md) lets the optimizer choose the
free border and retains this final shared-cut recovery and its regression checks.
