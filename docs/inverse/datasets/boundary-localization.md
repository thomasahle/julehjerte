# Boundary localization and junction follow-up

The original neural experiment's boundary metric allowed several predicted
pixels to match the same reference pixel. Thick neural ribbons could therefore
earn a high score without locating the cutting boundary accurately. This
follow-up uses the same saved models, inputs, checkpoints and thresholds with
a stricter evaluation. It does not change production inference.

## Frozen-checkpoint boundary comparison

Both candidate and reference boundaries undergo the same Guo–Hall thinning
inside the known valid region. The scorer then finds a maximum-cardinality
one-to-one pixel matching at fixed Euclidean tolerances of 1, 2 and 3 pixels.
Parallel duplicate predictions compete for the same reference pixels, so they
cannot all count as correct. No component filtering, gap repair or
reference-dependent cleanup is applied.

At the original three-pixel tolerance, pooled F1 is:

| Split | Existing trace | Random encoder | ImageNet encoder |
| --- | ---: | ---: | ---: |
| Development, lattice | 96.82% | 95.34% | 98.36% |
| Recipe validation, channel | 94.36% | 88.69% | 91.61% |
| Recipe test, frame | 97.83% | 96.02% | 96.44% |

The existing trace wins on both held-out recipes at this tolerance. At one
pixel the ImageNet model does better on those recipes (83.12% versus 80.45%
for channel; 87.43% versus 84.44% for frame). Together these scores show why
one generous tolerance is insufficient to characterize the result. They do
not support replacing the geometric preprocessing with this neural model.

[Full metric summaries and hashes](boundary-localization-results.json) retain
all three tolerances, precision/recall and macro scores. Per-view records and
the first six comparisons from each split are in
`tmp/heart-learning/localization-v3/`. Old reports remain intact. The recipe
groups are still not verified disjoint topologies, and no real photograph was
used in this experiment. Pixel counts are not arc length and the score does
not establish graph connectivity or cutting legality.

## Evaluation performance

The first replay exposed a pathological slowdown in the installed SciPy
1.13.1 bipartite-matching implementation on nearly coincident boundaries.
CPU sampling placed the work inside its matching search. Offering nearest
neighbors first still stalled on `shared-lattice-754420-v1`.

The scorer now uses the equivalent unit-capacity source/prediction/reference/
sink network with [SciPy's Dinic maximum-flow implementation](https://docs.scipy.org/doc/scipy-1.13.1/reference/generated/scipy.sparse.csgraph.maximum_flow.html).
This changes the search implementation while preserving every feasible match
and the maximum-cardinality objective. The troublesome case completed in
about 4.4 ms at three pixels. An independent dense assignment verified all
three counts: 2,762 / 3,023 / 3,034 matches from 3,035 predictions and 3,044
reference pixels. A committed fixture prevents losing that case.

The thinning deletion conditions follow the Guo–Hall formulation also
documented in [OpenCV's implementation](https://github.com/opencv/opencv_contrib/blob/4.x/modules/ximgproc/src/thinning.cpp).
No OpenCV or additional Python dependency was installed. Regression tests
cover duplicate parallel lines, displaced lines, empty images, tiny components,
holes, connected branches, invalid regions, and agreement with independent
dense matching on randomized small masks.

## Corner-loss ablation protocol

The first network missed many training-set junctions as well as held-out ones.
Its original weighted MSE scales each head's foreground contribution with the
number of labeled pixels. A new optional `balanced-mse` criterion normalizes
foreground and background errors separately for each image and output head.
This tests whether scarce corner supervision is being underweighted. It is a
hypothesis, not an established explanation for every missed junction.

The ablation retains the ImageNet initialization, 20-epoch budget, batch size,
optimizer, seed, augmentations and architecture. Development loss selects the
checkpoint; development F1 selects thresholds, as before. The comparison also
adds a fixed-scale [Harris corner response](https://docs.opencv.org/4.x/dc/d0d/tutorial_py_features_harris.html)
computed from the production color mask. Only the development split chooses
its threshold from a predefined list. An additional variant refines each
Harris peak by intersecting local image-gradient normals, with singular and
excessive-displacement fallbacks. Neither variant uses reference coordinates.
These provide additional classical baselines alongside the trace's existing
Bézier anchors.

Reports count views with every reference junction recovered, including a
separate count excluding empty-reference images, and record maximum proposal
counts. Complete junction coverage alone does not prove that the proposed
connections admit a valid cutting template.

Junction F1 at three pixels, before adding any new training geometry:

| Split | Trace | Harris | Refined Harris | Original ImageNet | Balanced loss |
| --- | ---: | ---: | ---: | ---: | ---: |
| Development | 65.05% | 48.12% | 64.61% | 55.97% | 71.04% |
| Channel | 17.81% | 9.42% | 26.19% | 43.58% | 61.92% |
| Frame | 21.10% | 18.79% | 34.82% | 41.82% | 57.40% |

Balancing the loss improves junction F1, but it does not solve complete graph
coverage. Every reference junction is recovered in 24/52 development views,
45/128 channel views and only 1/128 frame views. The corresponding original
ImageNet counts are 3/52, 22/128 and 1/128. Refined Harris recovers all junctions
in 13/52, 7/128 and 0/128 views. False proposals remain counted separately.

Boundary localization also gets worse with the balanced loss: its three-pixel
thin F1 is 97.82%, 87.95% and 95.40% on those splits, respectively. This is a
tradeoff between the two jointly trained heads, not a universal improvement.
The [committed summaries and hashes](junction-loss-results.json) retain the
full comparison; per-view records are at `tmp/heart-learning/localization-v5/`.

## Training coverage gap

An audit of the original visible canonical graph found **no acute or right-angle
degree-two corners in the actual training split**. Its 51 designs contain
429 branches and 1,380 obtuse corners. Development has the same omission;
the channel and frame groups contain 64 and 256 right-angle corners and no
other junction type. These are counts per canonical design, not multiplied
by the four photographic views.

The audit follows the label definition: it ignores hidden shared edges,
degree-one endpoints and smooth subdivisions. It measures directions one
percent along each incident cubic; turns below 20 degrees are omitted and
angles within five degrees of 90 are called right angles. The result identifies
a training coverage gap, without proving it explains all held-out failures.

The optional `corner-lattice` generator varies the visible degree-two angles
within the lattice family. Its geometry, paper-clearance and independent
export-render admission checks remain mandatory. The existing four recipes
and their seeded outputs remain unchanged. Supplementary preparation keeps its
own development rows out of training, rejects geometry overlap with every
original split and leaves all original evaluation views fixed. A fixed
`--views-per-epoch=204` keeps a 20-epoch, batch-eight run at 520 optimizer
updates even when more training views are available.

These recipe splits have now been inspected repeatedly to guide development.
They are diagnostic comparisons, **not pristine test sets or verified
topology-disjoint samples**. New real-photo labels and genuinely unseen motif
families are still needed to assess generalization.

```sh
python3 scripts/inverse/learning/metrics.test.py
python3 scripts/inverse/learning/losses.test.py
python3 scripts/inverse/learning/classical.test.py
python3 scripts/inverse/learning/train.py --initialization=imagenet \
  --loss=balanced-mse --epochs=20 --batch-size=8 --device=mps \
  --output=tmp/heart-learning/balanced-run
python3 scripts/inverse/learning/localization.py \
  --run=tmp/heart-learning/imagenet-final \
  --run=tmp/heart-learning/random-final \
  --run=tmp/heart-learning/balanced-run \
  --output=tmp/heart-learning/localization-new
```

The original objective remains the default `weighted-mse`. The experimental
criterion and classical detector are offline tools; neither is exposed as a
new user-facing mode.
