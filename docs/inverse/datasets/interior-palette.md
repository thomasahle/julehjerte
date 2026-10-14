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

All 73 targeted crop tests passed for `40f7d7c`, including rotated inputs, independent lobe
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

The first full reconstruction run at `3810a25` improved the original-photo
benchmark from 24/31 to 25/31, with no lost passes. All 25 accepted pairs also
passed editable SVG conversion and independent geometry/paper checks. The newly
detected star had 1.0075% independent disagreement, 1.0125% editable disagreement
and 28/28 reviewed points retained. Fitting/validation took 9.327 seconds and
crop detection a separate 1.651 seconds. Other scores still vary slightly with
time-dependent fitting; this is pass retention, not uniform error reduction.

### JPEG perturbation and registration holes

The first release run stopped at its perturbation assertion: half resolution
passed at 2.1440% disagreement, but JPEG quality 75 produced no crop. Hunodan,
the full inverse/application suites, type checking, lint, build and browser
stages did not run in that attempt. Its terminal failure and earlier successful
stages remain under `tmp/heart-learning/interior-palette-release-v1/`.

The JPEG pixels in the focused replay match that failed benchmark exactly.
Its pale-color estimate remains plausible, and both lobes retain strong
support, but small enclosed foreground omissions interrupt the center scanline.
Left lower-edge support falls from 0.870 to 0.565. A diagnostic that fills the
registration mask's enclosed holes restores support without changing color
probabilities or distance fields.

The follow-up fills only enclosed components of at most 0.05% of the working
image area (with a four-pixel floor). Every filled pixel must be observed with
alpha above 200. Eight-neighbor background connectivity preserves even diagonal
openings to the image exterior. This changes only the mask used to locate the
physical outline; original RGB, color probabilities, outline distance fields
and the artwork classification remain unchanged. It does not fill gaps in the
desired motif or relax the outline-support gates.

All eight focused tests now pass, including fresh original-photo and JPEG
photo-to-template fitting, 28/28 source observations after export, and controls
for large holes, unknown pixels and diagonal openings. Full verification for
this follow-up is pending. The preview continues to serve the preceding checked
build until verification is complete. Exploratory scripts, failed attempts, source overlays, masks,
geometry and test logs are retained under
`tmp/heart-learning/no-crop-diagnosis-v1/`.

The focused regression is reproducible with:

```sh
node --test --test-concurrency=1 scripts/inverse/interior-palette-crop.test.mjs
```
