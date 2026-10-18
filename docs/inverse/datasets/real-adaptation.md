# Grouped real-photo decoder adaptation

This records the model comparison and initial offline repair diagnostic.
The later [production routing follow-up](rejected-routing-repair.md) tests
fresh solves with bounded repair; it does not deploy a neural model or replace
the historical measurements below.

This experiment tests whether the ten annotated real photographs can improve
the small foreground network. The protocol is fixed before training, in
`scripts/inverse/learning/real-pilot-folds.json`. It is an offline development
comparison, not an unseen benchmark or a model deployment.

## Grouping and training

Three connected groups keep related inputs together. The bicycle, sloth and
dragonfly share one publisher/source group. Six straight checker photographs
share a conservative motif group despite different counts, printing and paper
textures. The curved checker is the third group. Source and near-duplicate links
are joined transitively with those motif groups, so a future duplicate cannot
silently cross a fold. The three held-out group sizes are 3, 6 and 1.

Each mixed run uses only the other groups for real supervision. All ten photos
are evaluated once by a model that did not train on their group. The grouping
review is limited to this pilot; it does not complete cross-corpus motif review
or establish disjoint cutting topologies. Synthetic training already contains
checker routing. Global source allocations remain unassigned; this sidecar
declares only the temporary experiment roles.

All runs begin from the same synthetic clutter-trained checkpoint. The encoder
weights **and batch-normalization statistics** stay frozen. Only 9,889 parameters
in the lateral/detail/head decoder are adapted. Each run receives 120 AdamW
updates at learning rate 0.0001, weight decay 0.0001 and batch size four. There is
no early stopping or held-out checkpoint selection; the final update is evaluated.

Replay uses 32 identity-selected training geometries, each with its original
photograph and one verified neighbour/handle counterpart, for 64 inputs. No
synthetic development or recipe-holdout image enters replay. Both arms use the
same first two replay inputs and reflection draws per update. The mixed arm
replaces the other two replay images with training-group real photographs.
The synthetic-only adaptation is a matched-update control, not an equal-real-data
comparison. The unchanged frozen checkpoint is scored separately.

The existing uncertain-label loss gives no gradient to occluded/uncertain pixels
or letterbox padding. Unknown pixels also cannot change evaluation denominators.
All masks and source photographs remain fixed. The decoder can still make
geometrically wrong predictions; this experiment cannot certify a crop or template.

## Reproduction

```sh
python3 scripts/inverse/learning/real-foreground-finetune.py \
  --labels=tmp/heart-learning/real-annotation-v1/labels-filtered \
  --initial-run=tmp/heart-learning/foreground-scene-v1/scene-trained \
  --output=tmp/heart-learning/real-adaptation-v1
```

Output directories must be new. The runner saves the fixed draw schedule, every
sampled identity, training loss, checkpoint, float32 prediction, group assignment
and source hash. It checks frozen encoder bytes after every completed run.
The completed assessment compares missed paper and included background per case,
then replays cropping, classification, fitting and independent export rendering.

## Segmentation results

All four training runs completed. An independent audit reads the saved
checkpoints, confirms identical encoder weights and statistics, checks source
hashes and sampled training identities, and recomputes metrics from archived
float32 predictions. All thirty probability/error comparisons were inspected.

| Mean across ten instances | Frozen initial model | Synthetic-only adaptation | Mixed real/synthetic, out of fold |
| --- | ---: | ---: | ---: |
| Known-region IoU | 76.95% | 77.10% | 78.63% |
| Known-region pixel error | 8.02% | 7.92% | 7.05% |
| Known-paper false negatives | 6.14% | 7.36% | 5.94% |
| Known-background false positives | 6.70% | 6.05% | 5.51% |

The modest average gain does not resolve missing pale borders and tips or the
hands/wood and pale-pink background failures. The bicycle and sloth lose more
known paper after adaptation. A post-hoc band diagnostic counts known paper
within five 256-canvas pixels of unknown/background: missed fractions are 21.62%,
25.02% and 21.44%, respectively. This includes occlusion boundaries and is not
an exact physical-outline localization metric.

## Complete reconstruction replay

The replay uses each complete original photograph, without an ROI or supplied
corners. All methods receive the same decoded RGB pixels. Neural fields use the
inverse of the exact training letterbox transform; annotation polygons and
approximate corner references never enter crop selection or fitting. The
`--target=mask` option freezes the classified image as Mal does. The original
`photo` objective remains the harness default for earlier experiments, whose
counts must not be pooled with this study.

The audited model outputs can be exported and replayed as follows (use new
output directories; the two remaining probes need only `--methods=learned`):

```sh
python3 scripts/inverse/learning/real-adaptation-report.py \
  --study=tmp/heart-learning/real-adaptation-v1 \
  --labels=tmp/heart-learning/real-annotation-v1/labels-filtered \
  --initial-run=tmp/heart-learning/foreground-scene-v1/scene-trained \
  --output=tmp/heart-learning/real-adaptation-review
node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/real-adaptation-review/probe-frozen \
  --output=tmp/heart-learning/real-adaptation-frozen-replay \
  --methods=production,learned --target=mask --solve-ids=all --seconds=10
```

| Method | Checked pair | No crop | Rejected reconstruction |
| --- | ---: | ---: | ---: |
| Current production cropper | 4/10 | 5 | 1 |
| Frozen neural foreground | 2/10 | 7 | 1 |
| Synthetic-only adaptation | 3/10 | 6 | 1 |
| Mixed real/synthetic, out of fold | 3/10 | 6 | 1 |

These are forty complete replays, with unchanged image, feature, geometry and
paper checks. Every available classified mask is preserved pixel-for-pixel in
the fit target. Checked pairs are measured against that derived mask, not
unavailable original artwork or cutting paths. The existing 24/31 production
benchmark has not improved from this offline experiment.

All sixteen reconstructed pairs were inspected beside their source, crop and
mask. The sloth and bicycle rejections lose major motif features. Accepted
checker reconstructions still show curved edges, border fringes and some small
protrusions. The bowed pink basket is not a flat photographed square. The neural
cropper recovers the yellow/cyan checker that production misses, but loses the
pink basket and does not repair several patterned/occluded inputs. No model is
selected for deployment on the strength of these results.

## Routing sensitivity beyond cropping

The production and mixed-model sloth corners differ by at most about 0.83 source
pixels, on a 250-square photograph. Both lie within the uncertainty of the
manual references. Nevertheless the final result changes from a checked 2+2-cut
pair at 1.3728% disagreement to a rejected 3+3-cut pair at 5.4304%.

On the production crop, the initial radius-0.3 trace contains a visible
self-intersection. A geometric preflight rejects it immediately; a radius-0.5
trace then finds valid routing. On the mixed-model crop, the radius-0.3 graph
gets an integer solution with an invalid short return, then times out. Recovery
spends its remaining allowance on a denser version of the same trace and never
tries radius 0.5. That second graph has 3,636 binary variables and 48,576
constraints, compared with 1,470 and 7,809 for the sparse graph.

This is evidence of sensitivity in traced routing and recovery scheduling,
not proof that either crop is physically exact. A controlled diagnostic holds
the failing mask and its 4.273-second recovery allowance fixed while substituting
the initial smoothing radius. Both radius 0.3 and 0.5 time out. Smoothing alone
does not fix the failure, and the production scheduling policy is unchanged.

## A rejected route can still be useful to continuous refinement

Inspecting the first integer incumbents narrows the cause further. The
radius-0.5 route has one short-return clearance of **1.4963 mm**, just below the
unchanged **1.5 mm** requirement. The MILP correctly rejects it, but then spends
the remaining time searching different discrete edge assignments. Its current
curves cannot move to repair that tiny deficit.

The common Bézier refiner can repair this particular saved route. At its usual
160 steps and rate 0.008, it produces a valid 2+2-cut pair with **1.0336%**
independently rendered mask disagreement. Actual production editable conversion,
SVG serialization and parsing preserve a passing pair at **1.0416%** error, with
no editor intersections and passing feature, geometry and paper-core checks.
Refinement alone takes about half a second in the standalone replay; this is
not the latency of a fresh full solve.

The radius-0.3 control is important: its initial short return is 1.2660 mm and
refinement reaches **0.8272%** image disagreement but still has a crossing, sharp
turns and insufficient self-clearance. It remains rejected. Lower pixel error
does not authorize a geometrically illegal template, and the repair experiment
does not loosen any validator.

The captured mask and both first rejected proposals are in
`scripts/inverse/fixtures/sloth-rejected-routing.json`. They are diagnostic
initial conditions, explicitly not ground-truth cuts or initialization available
to a fresh solve. The standalone replay records both outcomes and only exports
an editable template for a fully passing result:

```sh
node scripts/inverse/learning/rejected-routing-replay.mjs \
  --fixture=scripts/inverse/fixtures/sloth-rejected-routing.json \
  --output=tmp/heart-learning/rejected-routing-replay
```

The next algorithm experiment should reserve a bounded opportunity for
continuous repair of a nearly valid routing, then recheck the original mask
and all geometry constraints. It must show fresh-solve gains within the same
budget and retain failures such as the radius-0.3 control. This study establishes
the opportunity, not that production fallback policy.

## Evidence and QA

The [evidence record](real-adaptation-results.json) pins the protocol, models,
source hashes, per-case segmentation and reconstruction measurements, both
smoothing failures, and the positive/negative continuous-refinement controls.
It verifies all 144 saved pipeline assets and records earlier diagnostic-harness
errors separately from application failures. The successful refined silhouette
still has some uneven edges and small protrusions; passing a geometric test is
not a physical assembly test or proof of the original cutting design.

All **56 offline Python tests**, **855 application tests** (one existing skip),
type checking, lint and the production build pass. The full inverse run passes
**757 of 758 tests**: the photographed-tree test expected the coarse-topology
initializer, but that field was absent. Two fresh isolated runs pass unchanged,
including exported mask and central-branch checks. The failed run did not save
its geometry, so those later passes do not establish the first result's quality.
This remains a timing-sensitive QA issue; the full suite is not reported green.
No test assertion or production solver code was changed in response.

Owned Chromium checks load **162 images across three galleries** without page
errors or broken assets. All thirty neural comparisons and sixteen reconstructed
pairs were inspected, as were the repaired sloth and its browser report. The
editable SVG replay checks production conversion and parsing, not a browser
upload interaction. The rebuilt preview is running at
`http://127.0.0.1:5232/editor/mal/`; served geometry, count-search and fitter files
match the worktree. Models and routing repair remain offline. Nothing was pushed
or deployed.
