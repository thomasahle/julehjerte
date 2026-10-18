# Preserve the weave when converting cuts to editable curves

The free-border hat exposed two places where nominally invisible cuts could
separate. [Final shared-cut recovery](SHARED-CUTS.md) fixes the fitted geometry
after polishing and matching. This change addresses a second problem in the
conversion to editable curves: independently simplifying the sheets could
open seams even when the final editor crossing and spacing checks passed.

The large-house regression recorded in [GRID-PARITY.md](GRID-PARITY.md) made
this particularly visible. On the same saved geometry and source mask, the
previous converter increased binary motif disagreement from **0.0824% to
0.4810%**. The new converter retains **0.0824%**. An independent, antialiased
SVG render also measures the improvement, so this is not merely a change in
which side of a pixel centre a thin seam falls on.

The previous and current raw house fits both had about 0.08% source error.
Their differently positioned near-coincident cuts were affected differently
by simplification. The grid-parity release's worse editable result was mainly
a conversion regression, not evidence that its initializer or crop got worse.

## Acceptance checks

`convertValidatedCutGeometry` retains the strict editor crossing and spacing
checks and exact shared-span preservation. It now also compares each candidate
against the unsimplified, normalized editable design with the same honoured
symmetry:

- Rasterize the complete woven square at the original mask resolution and
  twice that resolution. Neither image may differ from the unsimplified weave
  by more than **0.1 percentage point**. Without an original mask, use 400 and
  800 pixels per side.
- When the source mask is available, simplification must not increase its
  disagreement at all. Free-border masks use only the protected motif's
  weights. The comparison uses the original drawing, not a fitted preview.
- Try progressively smaller simplification tolerances: 0.25, 0.1, 0.025, then
  zero. Try finer curves before dropping a symmetry that the original geometry
  can retain. A geometrically valid uncorrected fallback remains available.

The Paint page passes its frozen original mask and frame weights to this
check. This adds no quality cutoff to downloading an imperfect reconstruction;
it prevents simplification from making that reconstruction worse. All checks
still apply to the actual converted result, not just the engine's earlier
validation. Low-level conversion remains available for inspecting old or
deliberately invalid inputs.

The raster checks are sampled fidelity bounds, not a continuous proof that
every possible subpixel gap is absent. Exactly shared Bézier controls remain
the mechanism for exactly cancelling shared cuts. Independent 4× antialiased
SVG rendering in QA provides a separate check for thin seams. The baseline
already includes normalization and any accepted symmetry correction, so this
guard specifically measures simplification drift, not those earlier changes.

## Fixed-geometry replay

The replay includes **78 saved solutions**: 24 browser workflows, 22 regular
Hunodan photographs, and 32 weighted motif variants. It loads the actual old
converter from commit `a67f008` and verifies its dependencies are unchanged.
Both converters receive identical geometry, masks, weights, and unforced
symmetry settings. This isolates conversion from the fitter's timed search.
Saved cutting paths are never supplied to an optimizer as initialization.

All 78 pass the new fidelity and editor geometry checks. **73 improve and five
are unchanged**, measured both by binary source error and by independent 4×
antialiased SVG coverage. None increases binary error over the unsimplified
design. Coverage and binary scores are recorded separately.

| Saved result | Previous conversion | New conversion | Unsimplified |
| --- | ---: | ---: | ---: |
| WebKit large house | 0.4810% | 0.0824% | 0.0824% |
| Firefox matching hat | 0.4447% | 0.3224% | 0.3224% |
| Chromium star | 0.1719% | 0.1600% | 0.1600% |

These percentages are binary disagreement against the original mask, restricted
to the protected motif for the free-border cases. For the house, independent
antialiased coverage error changes from **0.4957% to 0.1144%**.

Median conversion time in this Node replay changes from **0.023 to 0.184 s**;
the maximum new conversion time is **0.897 s**. Policy order alternates across
cases, with one timed conversion per policy and case. Input loading, scoring,
and independent SVG rendering are excluded. The converter keeps more curve
segments where needed; it does not change the fitter or its time budget.

The engine source hashes still match all 54 previously validated fresh Node
solves (22 Hunodan and 32 weighted variants). Those solve measurements are
retained as prior evidence, not claimed as reruns. The 78-case replay measures
conversion on their saved results and the previous browser results.

## Fresh browser and export checks

All **24 production workflows** pass across Chromium, Firefox, and WebKit,
including fresh fitting from masks, small and large free borders, the Hunodan
upload, the star example, and hats with matching and independent sheets. The
JavaScript numerical fallback also passes a fresh matching-hat workflow after
the browser test blocks the actual WebAssembly kernel request.

The browser harness now records requested and honoured symmetry, then checks
the actual downloaded editable SVG against the same fitted geometry converted
without simplification. It verifies both fidelity resolutions, original-mask
error, editor geometry rules, and common Bézier controls. The existing star
workflow also checks PDF export. No stored solution is injected into a worker.

The matching hat retains **114 shared spans** and **0.3224%** source-mask
disagreement in all three browsers. The independently fitted hat retains
**40 shared spans** and **0.2958%** disagreement. All 24 fresh editable errors
are lower than the preceding browser replay's errors, and the prepared inputs
are byte-identical. These end-to-end comparisons include timed optimization;
the 78 fixed-geometry comparisons above isolate the converter's contribution.
The hat preview and drawing, the house preview, and the independent comparison
sheet were visually inspected.

All **722 application tests and 242 engine tests** pass, together with lint,
type checking, and the production build. Type checking reports zero errors and
seven existing warnings. All **49 served engine files** match the unchanged
benchmark sources. [CONVERSION-FIDELITY-VALIDATION.json](CONVERSION-FIDELITY-VALIDATION.json)
records each comparison, browser export check, source and artifact hash, timing,
and the explicit distinction between reused solve measurements and fresh QA.

## Reproduction

```sh
npx vitest run src/lib/inverse/conversionFidelity.test.ts src/lib/inverse/editorConversion.test.ts
node scripts/inverse/conversion-fidelity-benchmark.mjs \
  --reference=a67f008 --browser=tmp/grid-parity-release-browser \
  --hunodan=tmp/grid-parity-hunodan --weighted=tmp/grid-parity-weighted \
  --output=tmp/conversion-fidelity
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_CASES=house-free-small,hat-free-small,star,hat-free,house-free,hunodan,top-hat,top-hat-independent \
INVERSE_TEST_OUTPUT=tmp/conversion-fidelity-browser \
  node scripts/inverse/paint-browser-test.mjs
```

The saved-geometry replay needs the named local result directories. The small
committed house regression fixture is self-contained for Vitest. It includes
the original mask and fitted curves only to test conversion, with no effect
on future solves.
