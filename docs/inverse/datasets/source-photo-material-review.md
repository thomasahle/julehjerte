# Check the photograph separately from the fitted mask

The benchmark now reports sparse material observations on the original
photograph, separately from classification error and template validation.
This exposes bauble results that pass numerical checks while omitting visible
parts of the photographed frame. No production classifier, model, fitting
constraint or acceptance threshold changes in this work.

The subsequent [routing follow-up](early-feature-routing.md) fits the same
recovered-frame mask within ten seconds at 1.721% disagreement. This document
retains the preceding preprocessing study and its historical fitting results.

A later diagnostic does find a better bauble candidate: **1.733% disagreement
with its candidate mask, all 26 reviewed photo samples retained, and geometry
and paper checks passing**, after 29.40 seconds of fresh fitting. Its crop and
classification are experimental, its borders still have small artifacts, and
the ten-second run fails. It is not a new production success or verified
ground-truth template.

The [evidence record](source-photo-material-review.json) contains measurements,
source hashes and the local artifact inventory. Complete comparisons are under
`tmp/heart-learning/color-boundary-v1/`; `material-study/index.html` compares
the original photographs, classified masks and exported weaves.

## Observations that survive a change of crop or classifier

The committed [sample catalog](../../../scripts/inverse/fixtures/photo-material-samples.json)
contains **50 assistant-reviewed observations on two hearts in one photograph**:
26 on the bauble and 24 on the dense checkerboard. The groups distinguish the
bauble body, upper/lower frame, corner blocks and white gaps. The checkerboard
provides a control with clearly visible red and white cell interiors.

These are development observations selected after inspecting failures. They
are neither a dense artwork mask nor an independent held-out benchmark. They
remain reserved for QA and never enter neural training, crop detection,
classification, initialization or fitting. The existing 573 photo-containing
source files are still not a fully annotated training set.

Coordinates refer to integer source pixel indices. Review adds 0.5 to each
coordinate before mapping into the crop's pixel-edge coordinate system.
One global color phase is inferred for the classified mask and then retained
when checking the exported weave. A separate phase cannot conceal an inverted
export. Cropped-out and unavailable observations remain in the all-sample
denominator; per-group counts make a missing frame visible even when most
body pixels are correct.

The regular `hard-photo-benchmark.mjs` JSON and HTML now display those counts
for matching source hashes and dimensions. Modified JPEG/resolution variants
do not silently inherit unreviewed source-coordinate annotations. Numerical
acceptance and source observations remain separate: matching a few points
cannot certify all boundaries, valid cuts or physical assembly.

## What the controlled comparison finds

The source photograph and each proposal's crop remain fixed across three
color methods: the automatic classifier, the existing red/white mixture model,
and the experimental spatial color fields. Each mask is fitted from fresh
initialization with a ten-second allowance, independently rendered after export,
and checked with the existing source-feature, geometry and paper gates.

| Bauble interpretation | Samples after classification | Samples after export | Excluded by crop | Own-mask disagreement | Numerical checks |
| --- | ---: | ---: | ---: | ---: | --- |
| Production crop, automatic colors | 21/26 | 19/26 | 0 | 9.296% | Fail |
| Historical crop, mixture colors | 18/26 | 18/26 | 3 | 1.323% | Pass |
| Neural crop, automatic colors | 20/26 | 20/26 | 4 | 1.489% | Pass |
| Neural crop, spatial colors | 21/26 | 21/26 | 4 | 1.289% | Pass |

The neural crop excludes all four sampled lower-frame points. Its automatic
classifier also loses two upper-frame samples that are inside the crop.
The historical manual crop excludes three upper-frame points. These are
distinct upstream losses; fitting the deficient mask more closely does not
restore either one.

All six checkerboard classification/export comparisons retain 24/24 samples.
One historical/spatial checkerboard result nevertheless fails template checks.
This is a counterexample to using sparse sample agreement as a replacement
for the existing validators. The neural checkerboard has no supported crop;
its observations stay in the denominator rather than disappearing from the
comparison.

## Locate the foreground regression

The matched background-only and clutter-trained models receive the same pixels
and window. At the four lower-frame points, the former predicts foreground
probabilities of **0.990, 0.967, 0.975 and 0.926**. The clutter-trained model
predicts **0.162, 0.071, 0.373 and 0.163**. Its lower corner block also falls
from 0.972 to 0.047.

This identifies a concrete real-image undersegmentation despite the previously
reported synthetic neighbour-rejection improvement. These probabilities are
model outputs, not calibrated certainty or a proof that each pixel alone
causes the cropper's decision. The older model also includes neighbours and
does not itself return a supported bauble crop.

## Bounded restoration experiment

The prototype preserves every primary score above 0.5. For weaker pixels
within a fixed Euclidean band of the primary's largest foreground component,
it permits the older model to raise the score. It keeps the primary unchanged
when another component exceeds 35% of the largest, or the largest has at most
100 pixels. No review point enters this operation.

The three declared band widths are 2, 4 and 8 pixels on the 256-pixel model
grid. Fields are generated for the same 43 real/synthetic input windows;
crop/fitting diagnosis is restricted to six named difficult real cases.
The reports retain all three widths, including failures.

- Two pixels retains the bauble's deficient crop and its 20/26 sample score.
- Four pixels produces no supported bauble crop.
- Eight pixels covers all bauble samples and restores a checked eight-point
  star result at 0.598% disagreement. It loses the blue outlined star crop.
- The outlined collage star, dense checkerboard and jigsaw still have no
  supported crop at any of the three widths.

The wider bauble crop still loses five photo samples during automatic color
classification. Its 3.304% fit is rejected. Mixture colors obtain a numerical
pass at 1.931% but retain only 18/26 samples; spatial fields retain 23/26 before
fitting and 22/26 afterward, with 5.603% error. This rules out treating a larger
foreground alone as a complete fix.

## Recover the faint frame, then test fitting separately

A red/white prototype estimates NNLS red coverage, smooths it at sigma 1 only
to estimate local extrema, and uses a 41-pixel min/max window. It lowers the
threshold to the local midpoint only when the range exceeds 0.15, the local
minimum is below 0.15 and the maximum is below 0.7. Otherwise it retains 0.5.
The final threshold applies to the original, unsmoothed coverage field.

On the eight-pixel restored crop, this retains all 26 observations. The
[derived mask and provenance](../../../scripts/inverse/fixtures/faded-frame-mask.json)
are committed as an unresolved development fixture, explicitly not ground
truth or training data. A seed-based watershed trial also remains in the raw
experiment; it lost an isolated frame segment with no confident red seed.

Local contrast is not enabled globally. On 96 paired synthetic glare diagnostics,
a symmetric version operating on the production Lab color projection improves
the strong-glare mean from 18.778% to 15.365% at the 10%-width window, but worsens
the original-image mean from 0.513% to 0.729%, with ten clean cases regressing
by more than 0.1 percentage point. The 5% and 16% windows also regress clean
cases. The Lab and NNLS versions are distinct variants; their results must not
be conflated. These are repeatedly inspected diagnostics from 24 views, not
unseen real-image evaluation.

Fresh fitting on the unchanged recovered-frame mask yields:

| Allowance | Measured fit/export | Cuts | Mask disagreement | Photo samples retained | Result |
| --- | ---: | --- | ---: | ---: | --- |
| 10 s | 9.172 s | 5 + 5 | 6.021% | 23/26 | Image mismatch; geometry/paper checks pass |
| 30 s | 29.404 s | 5 + 4 | 1.733% | 26/26 | All numerical checks pass |

The longer run selects a feature-weighted grid rather than the shorter run's
ordinary grid. Both start from the mask without saved templates or known cuts.
This gives the next search experiment a concrete target: find the useful route
earlier while retaining the existing quality and speed checks. It does not yet
establish that changing candidate scheduling alone will reproduce the longer
result in ten seconds.

The selected candidate and both template SVGs are preserved under
`tmp/heart-learning/color-boundary-v1/fusion-colors/local-fit-30/`. Visual review
shows the restored frame, but also small seams, corner protrusions and uneven
outer boundaries. Passing the 26 samples does not make these defects disappear.

## Verification and reproduction

Six focused tests cover pixel-center coordinates, reflection/perspective,
global phase, missing crops, invalid annotations and the actual bauble's
four excluded/two misclassified frame samples. An independent Python audit
uses a forward homography plus matrix inversion to recompute the annotated
scores from the saved mask and exported-render PNGs.

The full suite passes **750 inverse tests and 855 application tests**, with one
existing application skip. Type checks, lint and the production build pass;
seven existing type warnings and one existing lint warning remain. The updated
ordinary benchmark runs both annotated cases successfully as a harness: the
checker passes and the bauble remains rejected. This is not a new full 31-case
or Hunodan speed replay; production source is unchanged.

Chromium checks all 16 comparison cards/61 images and the two ordinary benchmark
cards/eight images without broken images or page errors. It verifies the visible
source-review counts, and 52 served production modules match the previously
tested source hashes. The owned preview was restarted after the build and is
running at `http://127.0.0.1:5232/editor/mal/`.

```sh
node --test --test-concurrency=1 scripts/inverse/photo-material-samples.test.mjs
node scripts/inverse/photo-material-study.mjs \
  --output=tmp/material-review-replay \
  --neural-replay=tmp/heart-learning/foreground-scene-v1/scene-replay/report.json
node scripts/inverse/photo-material-report.mjs tmp/material-review-replay/report.json
node scripts/inverse/hard-photo-benchmark.mjs \
  --ids=bauble,dense-checker --crop=automatic --target=mask --seconds=10 \
  --output=tmp/material-benchmark-replay
```

The optional neural input is a completed frozen replay; its manifest, source
photograph hashes and dimensions are checked. Omitting it compares fresh
production and historical crops. Experimental restoration, color and longer-fit
scripts are retained with their hashes in the local evidence inventory.
