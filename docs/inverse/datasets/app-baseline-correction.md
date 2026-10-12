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
**rejected**, and no neural refinement is used in the application. A mask's rounded
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

## Controlled results

The frozen CNN was scored without retraining or threshold changes. There are
30 reference junctions across the six views in each variant. Baseline counts
match the previous frozen replay exactly.

| Single intervention | Matched / proposed / reference junctions | CNN junction F1 | Mean classified-mask error | Mean exported-weave error, before seam fix |
| --- | --- | ---: | ---: | ---: |
| Original photographic perturbations | 8 / 28 / 30 | 27.59% | 0.572% | 0.744% |
| Red/cream palette | 29 / 33 / 30 | 92.06% | 0.284% | 0.476% |
| Remove blur | 25 / 31 / 30 | 81.97% | 0.423% | 0.477% |
| Remove downsampling | 20 / 29 / 30 | 67.80% | 0.520% | 0.656% |
| Maximum JPEG quality | 26 / 29 / 30 | 88.14% | 0.442% | 0.634% |
| Exact crop | 17 / 27 / 30 | 59.65% | 0.690% | 0.445% |

Mask and weave errors compare against the synthetic latent paper labels
inside the valid overlap, allowing a global color-phase flip. These are means
of six per-view errors, not pooled pixels. Exact cropping also changes the
sampling grid and observed region, so its error is not measured on identical
pixels. The model consumes RGB and the app's classified mask; the color and
compression interventions affect both, and do not isolate either input branch.

The strong response to color, blur and JPEG quality, with only partial recovery
from exact cropping, shows that these corner failures are **not solely crop
failures**. Low total mask error can coexist with displaced corners. The six
cases were selected because they failed, and share simple synthetic channel
and frame recipes; these improvements are diagnostic, not general performance
estimates. They do not establish an additive contribution from each effect or
identify JPEG chroma subsampling as the specific cause.

Cropping nevertheless changes the inferred topology in one clear example.
The known source of `channel-715069-v3` has one slit per sheet. Its baseline
and four non-crop interventions all produce a 1×2 pair; the exact crop restores
1×1. Three frame baselines also exceed the matching-sheet image-error bound,
while all six exact-crop variants accept identical sheets. Conversely, removing
downsampling from the pale `frame-756438-v0` raises its inferred count from
the reference 2×2 to 3×2. Better nominal image quality is not uniformly easier
for this pipeline. The image-error gates alone do not certify recovery of the
original slit count.

## Full fitting exposed a separate seam defect

All 36 initial automatic solves passed the app's nominal geometry, paper-core
and image-fidelity gates. The longest startup-excluded prepare/solve/export
replay took 9.283 seconds with a 10-second solver budget. However, visual review
found a false diagonal seam in `channel-795789-v2--baseline` and a small lower
border defect in `frame-764510-v3--baseline`. Passing these gates does not mean
all outputs are visually clean.

The channel's independent fit initially shared the diagonal correctly.
Matching-sheet averaging then replaced it with two nearly coincident cuts.
Final shared-cut cleanup did run, but its nearest-point span ended inside a
cubic. Moving that partial endpoint to the common diagonal introduced a
0.366 mm bend radius, below the 0.45 mm cleanup guard, so the repair was rejected.
The selected independent-export mask differed from the latent valid-overlap
label by only 0.974%, despite the visible seam.

The production repair adds a proposal spanning complete existing curve joins
when a matching cut lies close to its own transposed image. It retains the
original image, feature, symmetry, paper and geometry acceptance checks.
On the frozen failed output, it joins over 58 mm of invisible cutting path,
removes the diagonal seam in an independent antialiased render, and improves
the whole-source mask disagreement from 1.793% to 1.640%. The minimum bend
radius improves from 0.652 to 0.655 mm. A regression also confirms that a
diagonal line requested by the source is preserved.

A separate straight-line regression exposed another cleanup bug: the metrics
represent an entirely straight pair's minimum radius as `null`, but the
acceptance comparison coerced that value to zero and rejected it as a tight
bend. Cleanup now treats that sentinel as infinite radius. The regression
retains identical sheets and exactly reproduces the requested channel mask.

The border defect and rounded corner/crop-edge distortions remain separate
quality issues. This repair is not a neural inference change, and these
selected synthetic replays do not establish real-photograph reconstruction
accuracy or physical assembly performance.

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
