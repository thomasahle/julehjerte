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

The [completed probe record](polishing-alternative-probe.json) pins 152 artifacts
from the controlled experiments and browser comparison.

The [completed release record](polishing-alternative.json) verifies 106 source
hashes and 1,078 retained artifacts. All eight fixed crop perturbations pass
within ten seconds and survive editable conversion. All 22 regular Hunodan
designs pass within ten seconds (maximum 8.91 seconds). Four errors improve and
the other eighteen are unchanged.

The full automatic-photo benchmark retains 24/31 eligible successes. Its 47
inventory entries have the same source identities, proposed corners, classified
masks and fitting masks as the previous release; sixteen incomplete or obscured
entries remain excluded. Seven measured errors improve, including one case that
still fails, and two increase slightly. These are mask-based quality gates, not
a claim that all photographed details or intended cutting paths are recovered.

All 774 inverse tests and 855 application tests pass, with one application test
skipped. Type checking, lint and the production build pass. All eleven rebuilt
Chromium flows pass the template, source-feature, editable geometry and paper
checks; nine also verify PDF download signatures. The blue-star flow reproduces
0.545% editable disagreement in 8.65 seconds from click to ready. The shifted
sloth retains two cuts per sheet, 1.48125% disagreement and an 8.78-second
click-to-ready time. These browser timings are separate from the native benchmark.
All eleven result screenshots were inspected; the star's notches remain visible.

### Investigating the two small error increases

The broad run changes gingerbread from 1.4425% to 1.476875% disagreement and
maple leaf from 1.34125% to 1.346875%. Both already use the 700-pixel paper grid,
so they skip the new final-polish alternative branch. Gingerbread's fit differs
before final polishing, including its number of added curves and refinement
steps. Maple leaf also differs before final cleanup.

Eight fresh-process replays compare the two engine snapshots using the same
frozen crop coordinates, source bytes and masks, the same ten-second search
allowance, and no saved cutting seeds. Only `direct/fit.js` differs between the
snapshots. Old/new execution order alternates between repeats.

| Fixed crop | Repeat | Prior error | New error |
| --- | ---: | ---: | ---: |
| Gingerbread | 1 | 1.663125% | 1.598750% |
| Gingerbread | 2 | 1.617500% | 1.668125% |
| Maple leaf | 1 | 1.389375% | 1.389375% |
| Maple leaf | 2 | 1.389375% | 1.363750% |

All eight pairs pass the unchanged checks. The gingerbread ordering reverses;
maple leaf is equal or better with the new version. All eight still skip the new
branch. This supports variation in the time-limited search rather than a
systematic quality regression from checkpoint selection. Two repeats are not
a statistical guarantee. These fresh-process results also differ from the
long-running corpus process, so they are preserved as diagnostics rather than
substituted into the benchmark.

The first baseline browser attempt failed before fitting because an existing
preview process still referenced bundles removed by the preceding build. Its
failure record is retained. Restarting only the owned preview resolved it; the
successful paired runs have no page errors. The release driver also restarts
the preview after its new build and verifies the served source hashes.

Stage captures and rejected regularization experiments are preserved separately
under `tmp/heart-learning/outline-regularization-v1/`. The implementation and
regression coverage are committed as `3f89655` and `98de0d5`; nothing is pushed
or deployed. The neural models remain offline.
