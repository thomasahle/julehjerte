# Keep a better polishing checkpoint after finer paper verification

Final polishing could discard a better, geometry-valid checkpoint even when a
finer paper audit would accept it. The refiner returns its coarse-paper-safe
incumbent and retains a separate uncertain alternative. The main grid-fitting
stage could inspect that alternative; final polishing did not.

The committed fix considers that alternative when it improves the polishing
objective, the candidate has not already been audited at the maximum resolution,
and enough of the existing time allowance remains. The unchanged source-image,
feature and geometry checks still apply. The same coordinates must then pass
the 700-pixel guarded paper audit and improve the original-source disagreement
of both the incoming fit and any accepted ordinary polish. Export retains that
verified paper resolution and rechecks the geometry. No physical tolerance or
acceptance threshold is relaxed.

## Controlled result

The blue-star fixture freezes the scene model's proposed crop and classified
400-pixel mask. It is not asserted to have correct physical corners: the crop
still omits one reviewed border detail, as documented in the
[neural fallback study](neural-fallback-current.md). The fresh solve receives only
the photograph and fixed crop, never fitted cutting paths or source QA labels.

| Actual browser replay | Editable mask disagreement | Click to ready | Paper audit resolution |
| --- | ---: | ---: | ---: |
| Prior engine, `8a385c2` | 0.59625% | 7.62 s | 360 |
| New engine, `98de0d5` | 0.54500% | 8.36 s | 700 |

Both runs upload identical mask bytes and use explicit engine snapshots served
over HTTP to real Chromium workers. Both pass independent editable geometry,
source-feature, paper and SVG checks, with PDF download signatures verified.
This modest improvement costs about 0.74 seconds in this controlled browser
pair. It does not resolve the visible notches or the crop's missing detail.

A fresh native ten-second replay improves independent mask disagreement from
0.59625% to 0.539375%, taking 7.34 seconds for fitting. Original-photo sample
agreement stays at 27/28. Six focused checkpoint and paper-verification tests
pass, including a fresh-grid regression for this case that requires less than
0.56% independently rendered disagreement and unchanged physical tolerances.

## What the stage inspection ruled out

The background model's star already has much larger gaps before the outline
detail pass. Capturing its actual validated checkpoints shows independent error
falling from 1.953125% before polishing to 1.2625% at the last captured checkpoint.
Removing detail refinement would discard useful reconstruction work.

A separate exact-subdivision fixture exposes representation-dependent smoothing:
the same smooth curves receive about half the curvature penalty after each
subdivision. This is a real property of the current per-edge normalization,
but it does not by itself establish the cause of the remaining visual defects.

Fixed-start, fixed-160-step experiments changed the curvature denominator, the
join denominator, or both to normalize per slit instead. All used the same
source mask and starting curves, preserving border locks and paper resolution.
For the background crop, independent errors were 1.243125% unchanged, 1.256875%
with curvature normalization, 1.333750% with join normalization and 1.366875%
with both. Some bends became less tight, but the visible seams remained. Those
penalty changes are not adopted.

The scene-crop inspection instead found later geometry-valid checkpoints with
uncertain coarse paper audits. The best retained one had 0.538125% independent
mask disagreement and passed the unchanged finer paper audit. That isolated the
checkpoint-selection omission addressed by this change.

## Validation status

The [completed probe record](polishing-alternative-probe.json) pins 140 artifacts
from the controlled experiments and browser comparison.

The browser comparison and focused tests above are complete. All eight fixed
crop perturbations pass within ten seconds and survive editable conversion.
All 22 regular Hunodan designs pass with no increase in measured image error.
The full hard-photo benchmark, application/inverse tests, production build and
eleven rebuilt browser flows are still running serially under
`tmp/heart-learning/polishing-alternative-v1/`. Their results must be inspected
before claiming release-wide validation.

The first baseline browser attempt failed before fitting because an existing
preview process still referenced bundles removed by the preceding build. Its
failure record is retained. Restarting only the owned preview resolved it; the
successful paired runs have no page errors. The release driver also restarts
the preview after its new build and verifies the served source hashes.

Stage captures and rejected regularization experiments are preserved separately
under `tmp/heart-learning/outline-regularization-v1/`. The implementation and
regression coverage are committed as `3f89655` and `98de0d5`; nothing is pushed
or deployed. The neural models remain offline.
