# Refinement before speculative routing

Three production Paint uploads of the Bibelselskabet outline star spent about
12 seconds on unsuccessful coarse MILP routing before fitting an ordinary
four-cut grid. The grid already retained every source feature and was within
one percentage point of the image acceptance limit before free curve refinement.

The fitter now tries that refinement first for this class of long-budget request.
It defers coarse routing, feature routing, and speculative weakest-region
initialization together. If the refined candidates do not pass the original
image, feature, geometry, and paper checks, those initializers remain available
within the requested budget. Short-budget searches retain their previous order.
No input pixels or acceptance limits change.

## Controlled diagnosis

Cold Node processes replayed the exact native pixels and settings recorded by the
production browser. Only scheduling changed. Each run independently reloaded the
exported curves, checked geometry and paper, and rendered the weave.

| Input | Previous time | Grid first | Previous error | Grid-first error |
|---|---:|---:|---:|---:|
| Original | 18.34 s | 6.40 s | 0.6875% | 0.6875% |
| Half resolution | 18.48 s | 6.42 s | 0.5376% | 0.5376% |
| JPEG quality 75 | 18.82 s | 6.76 s | 0.7194% | 0.7194% |

All three exported curve files and independent rendered images were byte-for-byte
identical to their baseline. Every geometry, paper and feature check passed.
These are single cold-process timings, not browser latency measurements or a
timing distribution. Error measures disagreement with the estimated photographic
mask, not unavailable original artwork or cutting paths.

An earlier ablation skipped only coarse routing. That allowed a subsequent feature
MILP to return before the grid refinement. It was faster (3.28–5.11 seconds), but
increased disagreement to 1.16–1.58%. It was rejected. This distinguishes the useful
change in search order from simply removing an expensive search.

The diagnostic loader omitted recovery and was never shipped. Production keeps
the fallbacks: a regression advances the clock at the first grid refinement,
then requires an actual coarse-routing attempt and, if needed, feature recovery.
The resulting exported template must still pass independent geometry, paper,
feature and original-image checks. This test and all three native-mask quality
regressions pass.

## Production browser verification

All 33 upload-to-editable-export workflows passed on the production build. Every
regular Hunodan case stayed below ten seconds (median 5.59 s, maximum 8.59 s),
with exactly unchanged engine, native editable, and enlarged Paint errors.

The three photographic stars reached the editable result in 7.65, 7.09 and
7.26 seconds, versus 19.70, 19.13 and 19.61 seconds previously. Their exported
curve JSON and editable SVG files were byte-for-byte identical. The worker
reports confirm that they refined ordinary grids and never needed the deferred
routing fallbacks. These browser comparisons are individual runs, not repeated
timing distributions.

The strict overall comparison **failed** on the Viking, despite passing its
ordinary acceptance and independent geometry/paper checks. Its native editable
error rose from 2.01375% to 2.02625% (20 of 160,000 pixels). The new scheduling
policy was inactive for that case, and every refined-candidate assessment was
identical to the previous run. The first recorded difference is in timed sharing
and polishing: sharing changed the selected geometry, and polishing stopped at
step 84 instead of 119. This locates the divergence after candidate selection;
it does not by itself establish causality or excuse the failed comparison.
The original failure is preserved. Controlled timing diagnosis remains open,
and the stable preview has not been updated to this build.

The frozen fixture records only classified pixels, source/crop provenance and
settings. No saved curves enter the fit. Browser checks separately repeat photo
upload, automatic cropping, worker fitting, and editable SVG/PDF export.

The complete inverse suite passed **1,074/1,074 tests**, with no failures, skips
or cancellations, in 1,322.84 seconds. All 1,061 pinned input/source files were
unchanged throughout the run. The separate application suite passed 874 tests
with one existing skip; type checking, lint and the production build passed.
These checks do not resolve the recorded Viking browser comparison failure.

Six subsequent serial browser replays alternated the committed baseline and
current fitter through the same reference-module proxy. Crops, native pixels,
settings and independent export checks stayed fixed. All six passed geometry,
paper and feature checks. Baseline native error ranged from **2.0100–2.02125%**
(mean 2.0175%); current error ranged from **2.0150–2.06125%** (mean 2.03229%).
All candidate-assessment reports remained identical and the new policy stayed
inactive. Both versions produced more than one exported geometry, confirming
timing variability, but the current mean and worst error were higher in this
small sample. This does **not** establish equivalence or resolve the comparison.
The next experiments concern the allocation between optional sharing and final
polishing; no new postprocessing policy has been adopted.

## Cleanup scheduling follow-up

Two cold Node probes of a larger polishing reservation did not establish an
improvement, and postponing all optional early sharing consistently worsened
the fit. The shared geometry itself helps refinement; prioritizing only one
pass is insufficient.

A subsequent diagnostic let a search that had already exceeded ten seconds
use up to 6.5 seconds of its unused requested budget for both existing passes,
while retaining 1.3 seconds inside the hard request for finalization. Two runs
exported identical curves at **1.916875%** independent disagreement, versus
**1.94375–1.975625%** in the two unchanged-policy Node runs. Both completed
polishing and passed geometry, paper and feature checks. Runtime was
27.25–27.69 seconds, versus 26.15–26.97 seconds for those controls.

This bounded extension is now implemented. Six focused tests passed, including
a 750 ms interruption, a capped 25-second request, and confirmation that all
three fast star fits keep their existing allowance. The earlier 1,074-test
result applies to the grid-first implementation, **not this new cleanup change**.
Eight existing recovery/polishing tests, type checking, lint, 874 application
tests (one existing skip), and the production build also passed. Actual browser
verification is running; a new complete inverse suite remains pending. The stable
preview still serves the earlier validated build.

Machine-readable measurements, hashes, and outstanding verification are in
[deferred-routing.json](deferred-routing.json). Local diagnostic artifacts are in
`tmp/heart-learning/deferred-routing-2026-10-18/`.
