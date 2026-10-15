# Controlled printed-paper training

This offline follow-up targets a specific failure from the
[second material pilot](material-pilot-v2-results.md): printed ink is mistaken for
the identity of another sheet. It does not change cropping or template acceptance.
The [declared plan](material-printed-plan.json) retains the model, seed, 240-update
budget, learning rate, initial checkpoint and grouped real-photo folds.

The renderer now supports independent stripes, dots and five-petal flowers on
each sheet. Prints are evaluated in canonical sheet coordinates before the camera
homography, illumination, blur and JPEG. A repeated motif does not restart at each
cut or visible strip. The second sheet uses the transposed coordinate frame.
Ink changes appearance only: body, material coverage and graph labels are intact.
This is a planar procedural simulation, not calibrated physical printing.

The exact existing 32 training replay geometries produce 96 printed photographs
and 32 original controls. All 192 original image hashes are reproduced; all 928
saved assets and the unchanged target maps are verified. No new geometry or real
photo enters this experiment. Six representative four-column image rows were
visually reviewed, including subtle blue-on-blue ink and dense two-paper prints.

A separate seeded schedule gives half of sampled original synthetic photographs
one of the three prints. Existing clutter counterparts and real photographs are
unchanged. The original image and reflection schedule remains identical. The
loader rejects changed coverage, geometry, source identity or non-training views.
Unknown real regions remain unknown; printed ink is never relabelled as paper.

Four focused Python tests cover label preservation, source exclusion and paired
sampling. Five renderer tests cover periodic sheet coordinates, one-sheet ink,
scene distractors, deterministic images and unchanged camera/targets. The older
renderer's byte-identity regressions also pass. All 98 offline learning tests in
17 modules pass before training.

Training and independent audit use:

```sh
python3 scripts/inverse/learning/train-material-pilot.py \
  --plan=docs/inverse/datasets/material-printed-plan.json --output=FRESH_RUN
python3 scripts/inverse/learning/audit-material-pilot.py \
  --plan=docs/inverse/datasets/material-printed-plan.json \
  --study=FRESH_RUN --output=FRESH_REVIEW
```

## Completed experiment

Training, independent audit and all four full-pipeline arms completed. All nine
real prediction comparisons, seven reconstruction rows and six synthetic
diagnostic rows were visually reviewed. The [results record](material-printed-results.json)
pins the reports and figures. Initial weights, real inputs, base synthetic replay,
folds and original draw/reflection schedule match the second pilot exactly.
Independent model inference reproduces all archived predictions exactly.

| Mixed grouped development score | Before prints | With prints |
| --- | ---: | ---: |
| Body IoU | 81.24% | 82.38% |
| Observed material disagreement | 17.84% | 15.41% |
| Material disagreement including missing body | 19.51% | 16.75% |
| Checked joint-pipeline editable pairs | 1/9 | 2/9 |

The average hides major changes in both directions. Floral/striped paper improves
from 44.37% to 13.09% material disagreement, and blue printed/gold from 45.36% to
0.06%. But stacked hearts regress from 8.41% to 29.64%, the dark star from 25.45%
to 48.39%, and the hand-held checker from 20.64% to 46.67%. This is one seed on
nine previously inspected, partially annotated development photos, not evidence
of general performance or full-artwork agreement.

Training-replay diagnostics confirm that decorative ink can confuse the network
even with fixed geometry and camera. On the two dense printed styles, the old
synthetic model has 22.69% and 19.42% material error; printed training reduces these
to 17.52% and 13.50%. Baseline unprinted error stays similar (4.23% to 4.15%). These
are training diagnostics, including printed examples the new model sampled; they
do not measure unseen synthetic generalization.

| Complete reconstruction arm | Crops | Checked editable pairs |
| --- | ---: | ---: |
| Production | 3/9 | 2/9 |
| Learned body with RGB classification | 1/9 | 1/9 |
| Synthetic-only joint fields | 1/9 | 0/9 |
| Mixed joint fields | 2/9 | 2/9 |

The mixed joint model recovers blue/yellow checker alongside the boar. Production
recovers blue/yellow and bowed red/pink instead. Across all arms there are still
only three distinct successful photographs, the same union as before. All seven
available candidates convert to editable curves; five pass complete checks across
the arms, including repeats. The neural checker mask rounds corners and introduces
narrow gaps; passing its derived-mask checks is not proof of original-design
fidelity. No model has been integrated into the website.

The crop failures identify limits beyond observed material accuracy:

- Rabbit's improved material prediction still has insufficient lobe/edge support.
- Floral/striped paper still has inconsistent lobe colors and weak outline support.
- Bowed red/pink and blue/gold have almost zero observed material error, but the
  locator cannot find both lower edges; clutter or occlusion remains visible.
- The hand-held checker has both material and outline failures.
- Stacked hearts and the dark star lose material separation; the stacked-heart
  synthetic-only fit is also rejected downstream.

Production crop coordinates and target masks remain identical to the preceding
run; only recorded locator time differs. A small production fit-error change is
therefore not attributed to printed training. Fixed wall-clock fitting budgets
can still yield different final refinement progress.

Repository type checking, lint, 857 application tests (one existing skip) and
production build pass. All **866 inverse tests** now pass, and all 866 pinned
source files remain unchanged throughout repository QA. The initial
explicit renderer lint run caught a sparse-array test fixture; its equivalent
construction now passes lint and the focused tests. The failed record is retained.
