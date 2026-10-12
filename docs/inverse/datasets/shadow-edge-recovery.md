# Keeping crop refinement on the paper edge

Frame `1821017-v3` no longer needs an extra cut. Its automatic crop now leads
to two matching cuts per sheet, with all existing geometry, paper and image
checks passing. This follows the known-corner intervention in the
[background study](background-photo-recovery.md): replacing only that crop
had already shown that the fitter could recover two cuts per sheet.

## Cause and correction

The paper segmentation used a covariance model to distinguish background
brightness variation from a change of colour. The lower-edge refiner then
discarded that distinction and selected the strongest nearby RGB step.
A cast shadow could have more RGB contrast than dark paper against a similar
background, pulling the fitted line outward. The tip is the intersection of
two extrapolated lines, so a small slope error can move it several pixels.

For this frame, the initial mask fit put the tip 2.63 pixels from its known
position. RGB refinement increased that error to 7.82 pixels. Lowering the
RGB threshold did not help: all sampled rows already passed it. Weighting
the RGB step by a local foreground-probability difference also failed.

The refiner now measures RGB differences in the same covariance metric used
by the accepted background model. It discounts changes consistent with
background shading while retaining changes of hue. The model is estimated
from the photograph's border, with the existing covariance regularization;
no known crop, motif or template is consulted. The original RGB calculation
remains in use when there is no correlated-background model. The search
radius, straight-line fitting, orientation search and outline checks are
unchanged. Locator diagnostics record which edge metric was used.

The frame's tip error falls to 2.21 pixels, and the maximum error among its
four corners falls from 7.82 to 2.28 pixels. The unchanged direct fitter then
selects 2+2 cuts instead of 2+3 and accepts identical sheets under the user's
existing one-percentage-point allowance. The final full replay takes 4.95
seconds including automatic cropping, preparation, fitting and independent
rendering. Earlier fresh repeats took 5.12–6.01 seconds.

Against the known artwork, measured on the same physical sample points,
the frame's disagreement decreases from **0.762% to 0.430%**. Both crops
cover 99.91% of that comparison grid in common. This comparison allows one
global paper-colour swap and excludes material outside either crop.

## Broader results and tradeoffs

All **30 frozen synthetic photograph replays** produce checked template
pairs. All **24 cases in the balanced coverage sample** now have their
source's cut counts, allowing a swap of the two sheets; previously 23 did.
These are selected diagnostics from three procedural motif families, not
an unseen real-photograph accuracy benchmark.

The independent common-coordinate comparison records seven lower artwork
errors, seventeen unchanged errors and six higher errors. The two material
regressions are both in the previously inspected diagnostic channel group:

| Photo | Earlier artwork disagreement | Revised disagreement | Explanation |
| --- | ---: | ---: | --- |
| Channel 783681 | 0.525% | 0.914% | Small edge changes lead to different crop corners and a different matching fit; the classified-photo score improves while the known-artwork score worsens. |
| Channel 795789 | 0.183% | 1.155% | The changed crop makes an identical pair eligible. Matching adds 0.948 percentage points to its independent fit's classified-photo error, within the existing 1% allowance. The earlier output was independent. |

The other increases are below 0.05 percentage points. Thus this correction
removes a specific false-complexity failure; it does not uniformly improve
photographic or artwork error. No threshold was relaxed to obtain the result.
Three dense-lattice examples still exceed ten seconds overall: 10.62, 11.39
and 10.67 seconds in this run. One channel still has an 8.58-pixel maximum
corner error, although its exported artwork agreement improves slightly.

All **22 real Hunodan photographs** were decoded again and passed through
the old and new automatic cropper. Their four proposed corners are exactly
unchanged. The fitter and its settings are unchanged; this is a crop
regression check, not a new 22-case speed measurement.

## Comparison and regression checks

The comparison tool now reads each prediction's actual saved crop. It had
previously assumed that its baseline came from the original pre-rectified
intervention images and used their noisy proposed corners. That assumption
was correct for its earlier documented use, but not for comparing two
automatic-crop runs. Missing or conflicting saved corners are now rejected;
only the explicitly identified original intervention schema retains its
label-based transform. Both saved quads are recorded in each comparison.

New regressions cover a stronger shadow step versus a paper-colour change,
the frozen frame at three exposure levels, and automatic crop through
independently rendered matching templates. The last test reads known artwork
only after fitting, so a low error against a distorted crop alone cannot pass
it. A separate coordinate regression covers the comparison-tool correction.

The full run passes **681 inverse tests and 855 application tests**, with one
existing application skip. Type checking has no errors and seven existing
warnings; lint and the production build pass. Heavy replays and tests run
serially, with application test workers limited to two.

All eight rebuilt Chromium flows pass: seven photo uploads reach checked
templates, and a sideways-heart selection in a two-heart scene reaches an
importable mask. Browser upload-to-template times are 4.87–7.67 seconds. The
frame takes 6.77 seconds, reports 1.284% disagreement at its 400-pixel mask
resolution, and uses identical two-cut sheets. No page errors occur. The
served locator files were hash-checked against the committed source before
the browser run. The preview is running at
`http://127.0.0.1:5232/editor/mal/`.

Per-case corners, errors, cut counts, symmetry decisions, timings, source
hashes and verification logs are in [the results record](shadow-edge-results.json).
The local visual report is
`tmp/heart-learning/shadow-evidence-v1/report.html`.

```sh
node --test --test-concurrency=1 \
  scripts/inverse/shadow-crop.test.mjs \
  scripts/inverse/datasets/photo-labels.test.mjs
node scripts/inverse/learning/photo-pipeline.mjs \
  --probe=tmp/heart-learning/background-coverage-input-v1 \
  --output=tmp/heart-learning/shadow-replay-new
node scripts/inverse/learning/photo-alignment.mjs \
  --pipeline=tmp/heart-learning/shadow-replay-new \
  --baseline=tmp/heart-learning/seam-coverage-pipeline-v3 \
  --output=tmp/heart-learning/shadow-comparison-new
```

The covariance distance is an empirical model, not a guarantee that every
shadow or texture can be separated from paper. The remaining crop and
symmetry tradeoffs above remain part of the recorded evidence.
