# Recovering a pale sheet before template fitting

The blue outlined star (`bibel-star-outline`) previously had no automatic crop.
The new fallback learns a pale-paper tint inside a confidently colored region,
then runs the unchanged outline fitting and support checks. A fresh automatic
photo-to-template regression now passes geometry and paper checks, stays below
2% independent mask disagreement and preserves all 28 source-photo observations.
This does not yet establish a new full-corpus pass rate or perfect contours.

## Diagnosis and rejected alternatives

The old pale-paper foreground contains holes inside the sheet. The lower-edge
scan starts at the row center and stops at these holes, so interior boundaries
become candidate external edges. Its left/right support is approximately
0.398/0.675, below the existing 0.65 requirement. The original red/white model
instead merges the pale sheet with the white background and reports a crowded
frame. Neither failure involves the cut-count search or MILP.

The palette estimator also learns its two colors from pixels with foreground
confidence above 0.95. Here, its second color is a blue fringe, approximately
`[0.762, 0.879, 0.941]`, rather than pale paper. Learning the pale color inside the
colored motif yields approximately `[0.957, 0.949, 0.933]` in the initial probe.

Two isolated alternatives failed: scanning across segmentation holes improved
some lower-edge evidence but still failed the outline checks; replacing the
product of soft foreground gates with their minimum also failed. Neither is
included in the runtime change. The two crowded collage failures, nested
squares and Santa, remain unresolved in these probes.

## Runtime change

Background estimation is now reusable before requiring two paper-color clusters.
The fallback finds one strongly tinted component and uses its convex hull only
to select interior color samples. The hull never becomes the final silhouette.
A robust pale-color estimate supplies normalized RGB chromaticity; comparison
with the background separates that tint from neutral shading. The resulting
foreground and two paper colors feed the existing physical-outline fitter.

The fallback declines insufficient samples, indistinguishable background/paper
tints and unsupported outlines. It runs only when earlier proposals lack full
outline support. Existing geometry, paper, source-feature, symmetry and export
checks remain unchanged. No neural inference, stored template or historical
overlap coordinates enter this detector.

An early prototype still required the original two-color classifier to succeed.
Three clean synthetic examples exposed that dependency even though the real
photograph worked. The final implementation begins with background evidence
and one tinted component, resolving those failures. Existing palette arithmetic
is preserved by the extraction, including the original RGB sampling precision.

## Evidence so far

All 73 targeted crop tests pass, including rotated inputs, independent lobe
shapes, shadowed photographs, the learned-foreground adapter and the new tests.
The new synthetic controls cover blue, red and green paper, independent neutral
shadows, two exposure levels and known physical corners. Rectangle/diamond
controls are rejected, and an invisible white sheet is not inferred from a
neutral shadow alone. Original input pixels remain unchanged.

The first isolated crop prototype also passed fresh fitting and production
editable conversion: 1.0075% independent disagreement, 1.005625% after editable
conversion, and all 28 reviewed photo points preserved at classification and
export. Those numbers describe the prototype crop, not a benchmark of the final
fallback. Visual inspection still finds kinks and small seams in the fitted
bands. Sparse observations and aggregate error do not certify original cutting
paths or physical assembly.

The [probe record](interior-palette-probe.json) pins the diagnostic sources,
prototype fitting, 73 tests and automatic crop comparison across all 31 complete
photographs. Only the blue outlined star changes: the 28 existing crops and
classified masks remain identical, and nested squares/Santa still lack crops.
The new star proposal takes 1.65 seconds in that comparison. This is detection
time alone, not whole-pipeline latency or a controlled speed comparison.

Full reconstruction, perturbation and broader release verification are pending.
The preview continues to serve the preceding checked build until that
verification is complete. Exploratory scripts, failed attempts, source overlays, masks,
geometry and test logs are retained under
`tmp/heart-learning/no-crop-diagnosis-v1/`.

The focused regression is reproducible with:

```sh
node --test --test-concurrency=1 scripts/inverse/interior-palette-crop.test.mjs
```
