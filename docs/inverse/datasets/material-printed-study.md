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

The next checks compare real body/material scores with the unchanged second-pilot
control, inspect all nine real predictions and run the same four reconstruction
arms through editable SVG validation. Better pixel scores alone do not establish
better templates or justify a website integration.
