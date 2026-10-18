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

The frozen fixture records only classified pixels, source/crop provenance and
settings. No saved curves enter the fit. Browser checks separately repeat photo
upload, automatic cropping, worker fitting, and editable SVG/PDF export.

Machine-readable measurements, hashes, and outstanding verification are in
[deferred-routing.json](deferred-routing.json). Local diagnostic artifacts are in
`tmp/heart-learning/deferred-routing-2026-10-18/`.
