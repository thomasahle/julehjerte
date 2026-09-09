# Sweep ordered grid cuts once per row

The preceding free-border work made the small-house topology search more
reliable, but the larger hat still spent substantial time in initialization.
An isolated Firefox worker profile measured about **5.3 seconds** in count
initialization, before the free-curve optimizer. The corresponding WebKit
profile measured **2.1 seconds**. These instrumented measurements identify
where time is spent; the release workflows are measured separately.

Both initialization and grid rendering were testing every cut against every
pixel. Positive-gap B-spline grids already keep those cuts ordered at each
sampled row. The new `gridParity` helper walks the pixel centres in order and
advances through the cuts once. It retains the exact strict comparison
`pixelCentre > cut`, including equality at a pixel centre; it does not round
cut coordinates to pixel indices.

The grid renderer combines the two sheets' parity arrays. Each alternating
initialization step also prepares the other sheet's transposed parity once
and reads it while building its row objective. That changes the number of
cut comparisons from proportional to pixels times cuts to proportional to
pixels plus sampled cuts. The dynamic program, spline projection, candidate
counts, colour phases, initial layouts, scores and stopping rules are unchanged.
The `sharedWork: false` initialization route retains the exhaustive comparisons
for regression checks.

This applies only to the ordered grid initializer. Free Bézier curves can run
backwards and still use their existing polygon renderer and boundary-gradient
algorithm. The sweep arrays belong to the current call; moved cuts are always
resampled. No image or fitted geometry is cached by this change.

## Verification method

Three new regressions compare the sweep with exhaustive classification. They
include exact pixel-centre ties, coincident cuts, cuts outside the sampled
square, an empty family, unequal and dense grids, extreme positive-gap controls,
both phases and both orientations, and mutation between calls. Existing
initializer tests compare weighted and partially ignored images against the
exhaustive route, including full controls and scores.

The full initialization replay uses the old grid renderer, initializer and
count-search modules from commit `950dd23`. Other numerical dependencies must
still match that commit. Both versions receive the same fixed source image
and all original count/phase/layout hypotheses. Seed controls, scores, order,
round counts and termination reasons must match exactly. Saved cutting paths
are never supplied as initialization.

All **129 corpus cases** match: 22 Hunodan photographs, 6 perturbations,
29 web photographs, 22 collage crops, 7 individual photos, 2 hard user cases,
3 synthetic masks, 32 weighted variants and 6 browser-uploaded masks. All
**2,332 selected count/phase seeds** retain identical controls, scores, order,
round counts and termination reasons. Total Node initialization time changes
from **124.005 to 108.165 seconds**, with a **12.7% median paired reduction**.
The replay alternates policy order across cases and measures one call per
policy per case, without any fitted cutting paths as input.

The browser comparison loads both source snapshots in each browser, warms
both implementations, and measures three alternating-order rounds. Each seed's
rendered mask is also compared pixel for pixel against the old exhaustive
renderer. HTTP worker instrumentation is used only for the separate profile;
the reference modules are served as actual bytes and their delivery is checked.

All **18 browser comparisons** pass, including **46,080,000 seed-mask pixels**
that match the exhaustive renderer exactly. Six masks are measured in each
browser, with both implementations warmed and three alternating-order rounds.

| Browser | Median previous initialization | Median sweep initialization | Median paired reduction |
| --- | ---: | ---: | ---: |
| Firefox | 5.192 s | 1.939 s | 62.7% |
| Chromium | 1.552 s | 1.346 s | 13.0% |
| WebKit | 1.387 s | 1.089 s | 21.2% |

The reduction column is the median of per-image paired reductions; it need
not equal the ratio of the two timing columns. Initialization time excludes
imports, input reconstruction, comparisons and hashing. These savings are for
count initialization, not a claim that the complete solve speeds up by the
same percentage. Grid rendering uses one additional temporary byte array
(160 kB at 400 × 400); initialization prepares its own small parity array per
sheet update, and neither retains previous geometry.

## Complete solve validation

All **22 regular Hunodan photographs** pass the existing release quality,
feature, geometry and strict paper-core checks, including the established
one-percentage-point allowance for identical sheets. Preparation, solving,
validation and export take **5.449 seconds median**, at most **8.888 seconds**,
serially in Node 25.6.1 on an Apple M2 Pro. The preceding release replay took
5.899 seconds median and at most 9.072 seconds. Twenty-one errors are identical;
`hjstr-03` improves by **0.001993 percentage points**.

All **32 weighted variants** also pass in at most **8.416 seconds**, with a
**4.984-second median** (previously 8.666 maximum and 5.064 median). Thirty-one
errors are unchanged; the original large circle increases by two sampled
pixels, **0.007086 percentage points**, within the unchanged quality gate.
Exact initialization does not force timed downstream refinement to stop at
the same checkpoint. Photograph decoding and the additional independent SVG
replay are recorded separately and excluded from these Node solve limits.

All **24 production browser workflows** pass in Firefox, Chromium and WebKit,
including import, solve, editor crossing/spacing checks and SVG export. The
star cases also export PDF. An additional Chromium replay blocks the numerical
Wasm kernel and passes with JavaScript. The matching hat retains **114 exact
shared spans** through editor conversion and SVG export, and its protected-mask
error remains **0.4447%** in all three browsers.

| Hat workflow | Previous release | New release |
| --- | ---: | ---: |
| Firefox | 22.376 s | 16.874 s |
| Chromium | 10.956 s | 10.195 s |
| WebKit | 15.073 s | 14.586 s |

These are individual complete workflows measured from the Find click to the
first visible, enabled result button. Capture and artifact writes are excluded;
DOM readiness is not a paint timestamp. The separate instrumented reference
and current hat runs also export byte-for-byte identical cutting geometry,
although their refinement step counts and wall times can differ.

Seventeen browser mask errors are unchanged. Two basic-hat cases improve and
five other cases increase within their existing gates. The largest change is
WebKit's large house, from **0.1329% to 0.4810%**. Its prepared source masks and
all coarse/fine grid attempts match exactly; later polishing checkpoints differ
(159 versus 124), and its final shared-cut proposal is rejected for adding one
source-mask pixel. The old final proposal passed. This is a downstream
variation to investigate, not evidence of a crop or grid-initialization change.
The report retains every changed error rather than claiming uniform end-result
improvement from an exactly equivalent initializer.

All **718 application tests and 242 engine tests** pass, together with lint and
the production build. Svelte checking reports zero errors and seven existing
warnings. The hat preview and drawing, and the star preview, were visually
inspected. All **49 served engine files** match the benchmark sources.
[GRID-PARITY-VALIDATION.json](GRID-PARITY-VALIDATION.json) records per-case
timings, comparisons, source and artifact hashes, profiles, and the downstream
variation. Full seed records remain in the hashed local benchmark artifact;
the committed report stores per-case digests and selected-seed details.

```sh
node --test scripts/inverse/grid-parity.test.mjs scripts/inverse/initialization-image.test.mjs
node scripts/inverse/initialization-image-benchmark.mjs \
  --reference=950dd23 --browser=tmp/lp-topology-browser \
  --weighted=tmp/lp-topology-weighted --output=tmp/grid-parity-corpus
INVERSE_TEST_URL=http://127.0.0.1:5232 \
  node scripts/inverse/grid-parity-browser-benchmark.mjs
```
