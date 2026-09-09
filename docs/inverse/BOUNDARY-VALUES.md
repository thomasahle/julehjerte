# Prepare image integrals once per refinement stage

The [page-clock measurements](BROWSER-TIMING.md) place most of the hat's wait
inside the solver worker. The preceding instrumented WebKit hat run spent
**2.47 seconds in 276 scalar boundary-loss evaluations**. Each evaluation
rebuilt row integrals from the same image even though only the cutting curves
had moved.

`createBoundaryEvaluator` now prepares the image's constant term, interpolated
row costs and cumulative integrals once. Refinement owns two evaluators: the
usual 192 rows and the transposed 193-row pass. Each checkpoint still rebuilds
the geometric intersections from its current points, evaluates both directions
and applies the same score, symmetry and validation rules.

The arithmetic and its accumulation order are retained. This changes neither
the boundary gradient nor the image weights, optimizer, deadline, shared-cut
recovery, geometry thresholds or paper checks. Preparing both orientations at
400 image pixels per side uses about **2.48 MB** for their tables; those tables
are eligible for collection when the refinement run ends.

There is no global image cache or lookup by mutable array identity. An evaluator
owns a snapshot of its image and weights. The public one-call `boundaryValue`
API prepares from the current inputs every time. A new refinement run therefore
cannot inherit stale pixels after an image edit.

## Exactness and isolated measurements

Three new tests cover analytic moving-boundary areas at different physical
widths, both phases and orientations, mutable image/weight ownership, shared-cut
cancellation and ignored-pixel colour invariance. Existing weighted-gradient
and scalar-area regressions continue to apply.

The fixed-input comparison loads the previous evaluator from commit `1ea762f`
and verifies that its interpolation, curve and weighted-objective dependencies
are unchanged. Its five geometries include sparse and dense grids, shared
corners and the reproduced hat. At 256 and 400 pixels per side, each weighted
and unweighted case evaluates two orientations, both phases and three distinct
point arrays. The ordinary one-call API is checked too.

Three alternating-order rounds measure batches of 12 evaluations after warmup.
The new total includes preparing both orientation tables; the old total
prepares an image again for every evaluation. Weighted force fields are compiled
once outside both timers, as they already were in production refinement.
The initial comparison had repeated that common work in the previous policy,
overstating the attributable saving. Those initial measurements are retained
and labelled separately; final comparisons use the corrected scope.

All **960 scalar results** across Node, Firefox, Chromium and WebKit exactly
match the previous evaluator (240 per runtime). Corrected median paired batch
savings, including table preparation, are:

| Runtime | Median paired saving |
| --- | ---: |
| Node 25.6.1 | 37.5% |
| Firefox 146 | 40.2% |
| Chromium 145 | 48.9% |
| WebKit 26 | 86.8% |

These percentages are medians of paired batch ratios, not ratios of unrelated
aggregate medians. They measure scalar evaluation, not full image-fitting speed.

Four fixed **120-step refinement replays** also produce identical complete
results, including every control coordinate and checkpoint score. Only the
paper auditor's elapsed-time fields are excluded from comparison. These replays
use 64- and 200-pixel targets, with and without free-border weights, and infinite
deadlines so both versions perform the same steps.

Saved cutting geometry is used only to evaluate a fixed scalar objective. The
separate production workflows start from images and fresh grids.

## Fresh hat profile and complete image solves

The new instrumented WebKit hat pair calls the scalar evaluator **276 times**
in both versions. Its scalar work falls from **2.489 seconds** to **0.443 seconds**,
including **0.026 seconds** for all eight table preparations. Refinement's total
falls from **10.182 to 8.220 seconds**, and page click-to-ready falls from
**15.704 to 14.004 seconds**. The exported cutting-geometry files are byte-for-byte
identical, including all **114 shared spans**; protected-motif disagreement stays
at **0.4447%**.

These are separate profiling runs with wrappers around worker functions. The
fixed-work scalar comparisons isolate the change more directly; uninstrumented
browser workflows are checked separately. This is not a claim that every
image becomes 1.7 seconds faster.

All **22 regular Hunodan designs** pass the unchanged geometry, paper, feature,
image-error and ten-second release limits. Preparation through validation and
export has a **5.83-second median** and **8.88-second maximum**, compared with
5.60 and 9.08 seconds in the previous release run. Twenty-one mask errors are
identical; `hjstr-03` improves by **0.00266 percentage points**. The median does
not demonstrate a broad Node speedup despite the isolated scalar savings.

All **32 weighted-border perturbation cases** pass. Thirty protected-motif
errors are unchanged. The large inverted hat improves by one pixel and the
large circle with free-border noise worsens by one pixel: **0.00354 percentage
points** in each direction, across 28,224 protected pixels. The maximum error
remains **0.409%**. Their median falls from **5.05 to 4.85 seconds**, and maximum
from **8.29 to 8.10 seconds**. These serial Node runs include preparation,
solving, validation and export; photograph decoding and the additional
independent export-render replay are excluded. Different scheduling, JIT and
deadline decisions can influence comparisons between complete runs.

## Production browser release checks

All **24 uninstrumented browser workflows** pass, covering uploads, small and
large free borders, matching and independent hats, the star and a Hunodan
photograph in Firefox, Chromium and WebKit. Every result passes the original
mask-error, geometry, paper and editor crossing/spacing checks and SVG export.
Star cases also export PDF. A further Chromium star replay blocks Wasm loading
and passes with JavaScript.

The matching hat retains **114 shared spans** and the same protected-mask error
in all three browsers. Compared with the preceding page-clock release replay,
click-to-ready changes from **21.88 to 20.14 seconds in Firefox**, **10.08 to
9.89 in Chromium**, and **15.89 to 13.68 in WebKit**. These are individual runs;
result capture and artifact writes are excluded from both versions' clocks.

Twenty-one browser mask errors are unchanged. WebKit's independent hat improves
by 0.000886 percentage points. Firefox's small house increases from **0.1846%
to 0.4532%**, and WebKit's large house from **0.1382% to 0.1869%**, within their
existing limits. The small-house runs select different routes: the earlier run
accepted a four-cut topology seed, while this one selects a two-cut candidate.
Both house exports are byte-for-byte identical to results from the older
identical-paper release, before this optimization. Exact scalar comparisons and fixed-step
replays establish unchanged objective arithmetic; these timed whole-solve
differences remain a limitation of the search and candidate selection.

The subsequent [LP topology probes](TOPOLOGY-RELAXATION.md) investigate the
small-house cutoff and improve its repeated fresh browser results while
retaining this prepared boundary evaluator.

All **718 application tests and 236 engine tests** pass. Lint and the production
build pass; Svelte checking reports zero errors and seven existing warnings.
The Firefox hat preview and drawing, and the Chromium star preview, were
visually inspected. All **49 served engine files** match the tested sources.
[BOUNDARY-VALUES-VALIDATION.json](BOUNDARY-VALUES-VALIDATION.json) records the
comparisons, source and artifact hashes, original and corrected scalar timing
scopes, profiles, per-case release results and retained variations.

```sh
node --test scripts/inverse/boundary-value.test.mjs scripts/inverse/weighted-image.test.mjs
INVERSE_TEST_BROWSERS=node node scripts/inverse/boundary-value-benchmark.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 \
  INVERSE_TEST_BROWSERS=firefox,chromium,webkit \
  node scripts/inverse/boundary-value-benchmark.mjs
```
