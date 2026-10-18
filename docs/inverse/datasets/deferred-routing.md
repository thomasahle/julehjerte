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

Machine-readable measurements, hashes, and outstanding verification are in
[deferred-routing.json](deferred-routing.json). Local diagnostic artifacts are in
`tmp/heart-learning/deferred-routing-2026-10-18/`.
