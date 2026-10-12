# Current app baseline and controlled photograph diagnosis

## Correction to the initial neural comparison

The original learning preprocessor used `GENERAL_PRESET` with `preprocessMask`.
That is the older cubic trace configuration. The automatic app instead calls
`prepareBoundary`, which fits both straight spans and arcs, uses different
tolerances, and can simplify an overly large boundary graph. Calling the
original comparator the current app baseline was inaccurate.

The frozen RGB images, classified masks, reference labels and CNN checkpoints
are unchanged. A separate replay now runs the automatic app's initializer on
all 308 original evaluation views at the study's 384-pixel resolution. A
regression test compares its curves and preprocessing metadata with the actual
`prepare(..., AUTOMATIC_PRESET)` entry point. All 308 replays succeeded.
This measures an initializer, not a completed template solve.

Three-pixel junction precision / recall / F1:

| Split | Older trace | Current app initializer | Frozen corner-augmented CNN |
| --- | --- | --- | --- |
| Development | 75.13 / 57.36 / 65.05% | 24.73 / 63.69 / 35.63% | 73.14 / 68.51 / 70.75% |
| Channel | 25.55 / 13.67 / 17.81% | 13.24 / 49.61 / 20.91% | 77.24 / 87.50 / 82.05% |
| Frame | 38.40 / 14.55 / 21.10% | 21.24 / 58.40 / 31.15% | 86.50 / 89.45 / 87.95% |

The current initializer recovers more real corners but also has many extra
turns. This metric treats every visible branch or sufficiently sharp knot as
a proposal, although the app may successfully use or discard those extra knots
during routing and refinement. The CNN's higher proposal F1 does not establish
better template recovery, graph feasibility or solver time.

Thin one-to-one boundary F1 at one / three pixels:

| Split | Current app initializer | Frozen corner-augmented CNN |
| --- | --- | --- |
| Development | 91.79 / 95.70% | 89.51 / 97.64% |
| Channel | 86.00 / 92.14% | 81.48 / 90.22% |
| Frame | 91.91 / 97.50% | 87.17 / 96.39% |

The current initializer has better one-pixel boundary localization on all
three groups and better three-pixel F1 on both diagnostic recipe groups.
[Scores and hashes](app-baseline-results.json) preserve the corrected
comparison. Previous reports remain historical records with the older trace;
the CNN counts match the previous frozen replay exactly.

## Rejected corner refinement

A follow-up moves each CNN proposal toward the intersection of local edge
tangents, using image gradients as normals. It uses only the classified mask.
The proposal count remains fixed, including duplicate proposals, and a move
outside the observed region reverts to its original coordinate.

Development F1 chose a nine-pixel window over a five-pixel window or no
refinement: development F1 improved from 70.75% to 78.51%. However, channel
F1 fell from 82.05% to 71.79% and frame F1 from 87.95% to 75.85%. The
five-pixel variant was also worse on both recipe groups. This refinement is
**rejected**, and the production application is unchanged. A mask's rounded
corner is not automatically a better localization target than the learned
proposal.

## Controlled photographic inputs

An initial mask probe on the six previously inspected neural failures compared
Lab clustering, estimated red/white mixture and an oracle mixture using the
simulator's true colors. The five green/red masks already differed from the
latent valid-overlap label by only 0.10–0.63%; neither mixture improved them.
The pale case was worse with oracle mixture (4.88% versus 1.70% with Lab).
These selected cases provide no reason to replace the color classifier.

The [controlled replay tool](synthetic-training.md#controlled-photographic-interventions)
then generated baseline, red/cream recoloring, zero blur, full resolution,
maximum JPEG quality and exact-crop variants of each case. All 36 baseline
image-file hashes match the original six views, and all 258 retained assets
pass verification. Every intervention preserves unrelated random draws,
geometry, camera and parameters; exact cropping appropriately changes the
crop-coordinate labels. These are post-hoc diagnostics of six selected
synthetic failures, not an unbiased corpus or real-photograph evaluation.

## Reproduce

```sh
node scripts/inverse/learning/app-baseline.mjs \
  --output=tmp/heart-learning/app-baseline-new
python3 scripts/inverse/learning/junction-replay.py \
  --app-baseline=tmp/heart-learning/app-baseline-new \
  --output=tmp/heart-learning/junction-replay-new
node scripts/inverse/learning/probe-solve.mjs \
  --probe=tmp/heart-learning/color-interventions-v1 \
  --output=tmp/heart-learning/color-solves-new --seconds=10
python3 scripts/inverse/learning/probe-metrics.py \
  --solves=tmp/heart-learning/color-solves-new \
  --output=tmp/heart-learning/color-metrics-new
```

Model replays use the frozen `balanced-corners-v1` checkpoint by default.
All outputs require new destinations. Per-proposal coordinates, original
references, file hashes and rejected experimental choices are retained for
inspection. No new model is trained in this diagnosis.
