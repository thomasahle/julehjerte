# Background variation and crop recovery

The [rotation follow-up](oriented-photo-recovery.md) recovered two of six
selected synthetic photographs. This follow-up identifies why the other four
were rejected before template fitting, fixes three color-model failures and
one pose-selection failure, then checks a separate family-balanced sample.
All fitting still uses the existing automatic solver; no neural inference is
added to the application.

## Failure mechanisms

The old palette estimator measured the RGB distance from a median border
color. It treated that distance as equally meaningful in every color direction
and set the foreground threshold to three times the border variation.

- In `channel-715069-v3`, gray background shading raised the threshold to
  0.204 in normalized RGB. Most dark green paper disappeared from the color
  sample. Clustering then tried to split the remaining red paper into two
  populations and rejected the result.
- The green and blue striped backgrounds of `channel-783681-v0` and
  `channel-795789-v2` exceeded the fixed 0.12 background-noise cutoff. Neither
  reached foreground fitting with the adaptive palette.
- In `frame-756438-v0`, the estimated paper colors were 0.178 apart, just
  below the fixed 0.18 separation threshold. Exposure was part of that low
  contrast. This photograph also clips the tip; clipping is retained as a
  review warning, not hidden by the benchmark.

The new fallback estimates correlated RGB variation from the central 80% of
border samples. A regularized covariance distinguishes a brightness change
along the background's observed color direction from a change in hue. A
Cholesky solve supplies the color distance without explicitly inverting a
nearly singular matrix. More than 18% unexplained border samples rejects this
background model. The original plain-background estimator remains the first
attempt, and transparent inputs keep their existing alpha-based treatment.

Paper colors in the fallback must be separated by at least 0.10 and by three
times their median within-color spread. This replaces the fixed 0.18 cutoff
only for this fallback. It does not assume that arbitrary lighting variation
can always be distinguished from a second sheet of paper. The resulting
foreground still has to explain the heart's lower edges, lobes and cap colors.

After that correction, five of the six photographs produced checked template
pairs. The remaining channel had a usable segmentation: supplying its known
upright angle produced a good crop. Automatic search missed it because the
coarse angles on either side gave too few lower-edge inliers, despite fitting
both lobes well.

The search now uses a rejected but otherwise well-supported outline to
estimate its notch-to-tip direction and try one corrected orientation. Each
ordinary hypothesis can seed at most one retry, duplicate angles are skipped,
and the existing two-second additional-search budget is unchanged. This does
not lower the final acceptance thresholds. The retry must independently pass
the original checks.

## Six diagnostic photographs

All six now produce exported pairs passing geometry, nominal paper and image
checks. Their cut counts match the source designs: one per sheet for the three
channels, two per sheet for the three frames. Complete photograph-to-pair
times range from 3.09 to 6.14 seconds in the recorded Node run, including
automatic cropping and preparation. No corners, rough selection or known
template are supplied to the algorithm.

These six examples guided the changes. They establish that the observed
failures were addressed; they do not establish a general success rate.

## Broader coverage

`photo-sample.mjs` selects eight designs from each of the existing channel,
frame and lattice families, then one photograph per design. It sorts by a
fixed hash of the seed and ID, excludes the six diagnostic designs, and
freezes the selection before evaluating the cropper. The 24 photos come from
the existing synthetic corpus; some may have been inspected in earlier neural
experiments. This is additional coverage, not an independent real-photo test.

Against the preceding committed cropper (`8e711da`), automatic proposals
increase from 16/24 to 24/24. The original 16 were all within six pixels of the
known corners. The new set has 22 within six pixels; the other two have maximum
corner errors of 7.82 and 8.34 pixels. The existing proposals remain close to
their earlier coordinates. Total crop time across the sample falls from
34.56 to 27.45 seconds, largely because fewer searches exhaust their budget.
These are observed local runtimes, not hard latency bounds.

The full-pipeline replay uses every proposed crop, including the two larger
corner errors. Synthetic labels enter only the evaluation after the solver
has selected and exported its templates.

All 24 produce pairs passing the existing geometry, nominal paper and image
checks. Exported-weave disagreement with the latent material labels is at
most 1.54% in each selected crop's observed overlap. These scores allow one
global exchange of the two paper labels. Twenty-one complete pipelines finish
within ten seconds; three dense lattices take 10.70–11.39 seconds, including
cropping and preparation. The ten-second configuration limits solver search,
not every stage of the complete interaction.

Twenty-three pairs use the source design's number of cuts in each exported
family. Frame 1821017 uses 3+2 instead of 2+2 despite its low image error.
Recovering a valid image does not establish the simplest possible templates,
so this extra cut remains a complexity issue. Comparisons use the exported
`A_overlap_paths`/`B_overlap_paths` order; the UI's left/right counts use the
opposite order.

A diagnostic replay of frame 1821017 replaces only the automatic corners with
the known source corners. The same fitter then selects matching 2+2 sheets in
5.45 seconds and passes its checks. With the automatic crop it did consider
2+2, but the coarse image score ranked it below 3+2. Thus crop uncertainty
contributes to this extra-cut case; the needed count hypothesis was not
missing. Supplying known corners is an evaluation intervention and is not
counted as an automatic success or a production fix.

## Image error and remaining artifacts

The six diagnostic reconstructions are also compared with the earlier fits
from supplied noisy corners, using the same physical material locations and
common observed coverage as in the preceding study. Four improve that score;
two worsen it:

| Case | Common observed overlap | Earlier noisy-crop fit | New automatic-crop fit |
| --- | ---: | ---: | ---: |
| Channel 715069 | 89.22% | 0.109% | 0.764% |
| Channel 783681 | 93.54% | 0.568% | 0.265% |
| Channel 795789 | 98.82% | 0.819% | 0.171% |
| Frame 764510 | 92.35% | 0.556% | 0.502% |
| Frame 829086 | 96.20% | 0.564% | 0.900% |
| Frame 756438 | 97.64% | 1.645% | 1.467% |

This is not a uniform accuracy improvement over a supplied crop. It establishes
automatic recovery where the previous full-photo pipeline could not start.
Matching-sheet preference can also trade some image accuracy for identical
templates, within the user's one-percentage-point allowance.

Visual inspection found a faint remaining diagonal seam in the pale frame
756438. The lower-right cuts remain separate visible curves in the exported
geometry. Shared-cut recovery proposes joining that span but rejects the edit
because its higher-resolution image error increases. The pair passes existing
aggregate checks; that does not make the seam a convincing reconstruction.
This remains a quality defect and a concrete next case for shared-cut and
image-objective work. No acceptance threshold was weakened to hide it.

## Limits and reproduction

An additional stress fixture applied high-amplitude stripes across the paper
as well as the background. It exposed further color/outline failures. Its
source and failed run are retained locally; the focused regressions instead
separate textured background illumination from the smoother paper shading in
the diagnosed photos. Strong shading within the paper remains an unresolved
case, not a supported robustness claim.

The new tests check correlated versus perpendicular color changes, stable
uniform backgrounds, a small clipped object at the border, three background
colors, pale-paper exposure changes, rejection of texture without a heart,
and the blurred channel at three exposure levels. Existing non-heart,
occlusion, real orange-heart, pale Hunodan, rotation and coordinate tests
remain part of regression QA.

```sh
node scripts/inverse/learning/photo-sample.mjs \
  --dataset=tmp/heart-training-synthetic/batch-v1 \
  --output=tmp/heart-learning/background-coverage-input-new \
  --exclude-probe=tmp/heart-learning/color-interventions-v1
node scripts/inverse/learning/photo-pipeline.mjs \
  --probe=tmp/heart-learning/background-coverage-input-new \
  --output=tmp/heart-learning/background-coverage-pipeline-new
node --test --test-concurrency=1 scripts/inverse/background-crop.test.mjs
```

Image bytes and full logs stay outside Git. Selection metadata, source and
artifact hashes, per-case outcomes and validation are retained in the reports.

The [results record](background-photo-results.json) includes all 30 full
replays, the 24 before/after crop comparisons, common-coordinate errors for
the diagnostic cases and the unresolved issues. The
[validation record](background-validation.json) retains the complete QA run:
855 application tests (one skipped), 670 inverse tests, 33 learning tests and
13 collector tests passed, as did type checking, lint and build. Type checking
has seven existing warnings and no errors.

The rebuilt Paint editor also passed seven Chromium checks: all six diagnostic
JPEG uploads reached checked cutting templates, and selecting the sideways
heart in a two-heart picture produced a usable imported mask. Upload-to-template
times were 4.80–7.65 seconds in that browser run. Its normal 400-pixel masks
produce separate results from the 384-pixel Node replay; screenshots, exported
geometry and worker responses are retained. No page errors occurred. The
preview remains available at `http://127.0.0.1:5232/editor/mal/`.
