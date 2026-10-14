# Local color separation does not establish two paper materials

Two additional color hypotheses remain offline. A locally separated color
histogram can still describe shading or background contamination, and a
two-paper RGB mixture cannot by itself identify material under additive glare.
Neither hypothesis establishes an improvement in automatic reconstruction.
The production classifier, cropper and fitter are unchanged.

The reusable change is a diagnostic comparison helper. It renders both masks
with the same palette and asserts that the highlighted disagreement equals the
recorded numerical error. Four focused tests pass, and it verifies all nine
native fits and four editable results in this study. See
[`mask-comparison.mjs`](../../../scripts/inverse/mask-comparison.mjs).

## Fixed-input classification experiment

The same 24 synthetic views from the earlier [glare study](glare-classification.md)
provide four appearance conditions each. This is a repeatedly inspected
development set, not new independent designs or held-out evaluation. Source
photographs, crop coordinates and latent material labels remain unchanged.
Predictions are emitted before material labels enter scoring.

The first candidate projects colors onto the ordinary classifier's Lab color
axis. In a sliding window, a 32-bin histogram proposes two populations. Both
must contain at least 10% of the window, their means must differ by at least
0.15 on the normalized axis, and their separation must explain at least 80%
of the local variance. Only faded-color configurations move the threshold
from 0.5 to the local means' midpoint. Gaussian smoothing estimates the
populations; the threshold applies to original, unsmoothed pixels.

The second candidate uses high-confidence Lab samples only to estimate the
two RGB paper colors. It then solves the existing nonnegative two-ray mixture
for each pixel, allowing a common brightness scale. The method falls back to
the original classifier when samples are insufficient or the two chromaticities
are too similar. It does not receive the synthetic renderer's true palettes.
The local population rule and the earlier local min/max rule are also tested
on this mixture field.

Mean material disagreement, percent, on all 24 images per condition:

| Method | Original | Mild glare | Strong glare | Offset glare |
| --- | ---: | ---: | ---: | ---: |
| Existing automatic classifier | 0.513 | 5.103 | 18.778 | 17.015 |
| Local Lab populations, 10% window | 0.765 | 4.101 | 15.872 | 14.432 |
| General RGB paper mixture | 0.680 | 4.380 | 18.818 | 16.910 |
| RGB mixture + local populations | 0.951 | 3.889 | 16.707 | 14.662 |
| RGB mixture + local min/max | 0.981 | 4.928 | 16.495 | 13.633 |

The local Lab rule worsens 14 of 24 original images by more than 0.1 percentage
point; the RGB mixture alone worsens eight, and its local min/max variant
worsens seventeen. The Lab experiment also retains its 5% and 16% windows;
neither removes the clean-image regressions. Lower average glare error is
insufficient grounds to enable these methods globally.

## Fixed photographic crops through the whole fitter

Three windows are held fixed: the automatic bauble crop, the earlier experimental
restored bauble crop, and the automatic dense-checker crop. The restored crop is
an existing model proposal, not verified physical-corner truth. All nine runs
start from newly classified masks and fresh grids with the ordinary ten-second
allowance. No source observations or cutting templates enter classification or
fitting. Each export is independently rasterized from its saved cut geometry.

| Crop | Color interpretation | Photo samples after classification → export | Own-mask disagreement | Native checks |
| --- | --- | ---: | ---: | --- |
| Bauble, automatic | Existing automatic | 21/26 → 19/26 | 9.191% | Fail |
| Bauble, automatic | RGB mixture | 19/26 → 17/26 | 3.260% | Fail |
| Bauble, automatic | RGB mixture + local min/max | 25/26 → 25/26 | 6.967% | Fail |
| Bauble, restored | Existing automatic | 21/26 → 21/26 | 3.306% | Fail |
| Bauble, restored | RGB mixture | 18/26 → 18/26 | 4.648% | Fail |
| Bauble, restored | RGB mixture + local min/max | 26/26 → 25/26 | 1.913% | Pass |
| Dense checker, automatic | Existing automatic | 24/24 → 24/24 | 0.699% | Pass |
| Dense checker, automatic | RGB mixture | 24/24 → 24/24 | 0.731% | Pass |
| Dense checker, automatic | RGB mixture + local min/max | 24/24 → 24/24 | 0.806% | Pass |

The local-population variant retains only 18/26 restored-bauble observations
and 19/26 automatic-bauble observations before fitting, so it is not among
these nine fits. Source samples are sparse development observations, not a
dense accuracy measure. One global phase is inferred from the baseline mask
and retained for the alternatives and exports.

All four native passes survive production editable conversion, SVG round trip,
editor intersection rules and nominal geometry/paper checks. Editable errors
are 1.913% for the restored bauble and 0.677%, 0.723%, 0.799% for the checker.
These scores compare different targets and are not evidence that one classifier
recovers the unknown artwork more accurately. They do not change the existing
automatic 25/31 result, and they are not physical assembly tests.

## What this isolates

The bauble's automatic crop still includes background and a corner outside the
photograph. A color correction that recovers more frame samples does not repair
that geometry; its fitted result remains poor. With the restored crop, the
local min/max mask contains all sampled frame points, but fitting loses source
pixel `(632, 1053)`, mapped to approximately `(390.14, 182.88)` on the 400-pixel
square. The remaining defect therefore arises after classification in this run.
The source-feature checks still pass: they do not guarantee every border pixel.

It would also be incorrect to demand that every connected component of the
old automatic mask survive a color repair unchanged. In this example, adding
the faint frame connects a region that the old mask treated as an island. The
old-mask feature audit reports lost enclosure even though every pixel of that
region remains its original color. Those diagnostics are retained separately.

The RGB illumination model has a specific ambiguity. If glare has the white
paper's color, then `I = t * (p * A + (1-p) * B) + g * B` is also an ordinary
two-paper mixture with inferred fraction `t*p/(t+g)`. The pixel alone cannot
identify whether the additional white comes from glare or material. This is
an analytic ambiguity, not a claim that it explains every real frame pixel.
Spatial boundaries, selected-body evidence and shape context are needed to
evaluate that ambiguity; a better fit to the same pixel-color model is not
sufficient.

## Diagnostic corrections and verification

The source ledger distinguishes historical `quad` from the actual
`effectiveQuad`. Before source-sample scoring, the two automatic inputs were
reconciled with `effectiveQuad`; re-rectifying the original photo reproduced
their saved RGB bytes exactly, and current classification reproduced both
release masks exactly. The preliminary metadata and correction record remain
preserved. No prediction pixels changed in that correction.

An initial Python difference panel also misread the independent renderer's
black pixels using a red-preview color test. Its displayed overlay was wrong;
the binary numerical errors and sample measurements were unaffected. Those
panels are retained under `rejected-reviews/`. The corrected panels use the
renderer binary mask and the committed comparison helper. All thirteen displayed
native/editable disagreement counts match their recorded scores exactly.

The [measurement record](local-color-evidence.json) pins the source and results.
Raw proposals, rejected variants, plots, templates and logs are under
`tmp/heart-learning/local-color-evidence-v1/`. Focused tests and lint pass.
Full serial application/inverse QA is running separately in that directory;
its completion must be recorded before claiming a new full-suite pass.
No neural weights or data allocations changed, and nothing was pushed or deployed.
