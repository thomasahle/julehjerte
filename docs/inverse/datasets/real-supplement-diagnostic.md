# Frozen models on six additional real photographs

The six reviewed supplemental body annotations now have a frozen-model and
complete reconstruction diagnostic. No model was trained, no threshold was
tuned, and none of these labels entered the website. The original ten-instance
pilot and its grouped adaptation experiment remain unchanged.

The new cases are blue/yellow and decorated red/white checkers, boar and rabbit
motifs, a reflective gold angel, and a pink/blue checker held between hands.
Their six inherited source/duplicate groups are disjoint from the original
pilot. Motif families overlap; these inspected development examples are not an
unseen test set or a substitute for the fixed 31-photo reconstruction benchmark.

## Segmentation and reconstruction

Both existing checkpoints receive identical photographs, 256-square letterbox
transforms, reviewed labels and unknown-pixel exclusions. Their decision
threshold stays at 0.5. Mean known-region foreground IoU is **50.28%** for the
background-only control and **87.20%** for the model trained with neighbours
and handles. Mean falsely included background falls from **54.89% to 4.69%**,
while missed known paper rises from **0.37% to 3.65%**.

Every input then goes through full-photo crop detection, classification, the
main fitter with a ten-second search allowance, and an independent exported
renderer. No annotation polygon, corner or ROI enters reconstruction. Cached
probabilities are mapped back through their exact letterbox transform; their
inference time is not included in the crop/solve timings.

| Method | Checked pair | No crop | Rejected reconstruction |
| --- | ---: | ---: | ---: |
| Current production cropper | 1/6 | 4 | 1 |
| Frozen background-only model | 0/6 | 6 | 0 |
| Frozen scene-trained model | 2/6 | 4 | 0 |

The scene-trained model recovers the decorated checker that production misses.
Its 3+3-slit result has 0.94% mask disagreement and retains the visible checker
pattern. Both methods reconstruct the blue/yellow checker; the learned crop
excludes more of the outside background and yields a visibly cleaner border.
Their 1.46% and 0.785% errors are against **different crop-derived masks**, so
they do not establish that much improvement against original artwork.

Both blue/yellow reconstructions use **4+3 slits**, despite the photograph's
apparent four-by-four checker. All sixteen main cells are recognizable, but
small border features and rounded corners remain. Original cutting paths are
unavailable; passing image and paper checks does not establish the intended
cut count. Matching-sheet selection is skipped because the respective masks'
diagonal disagreement bounds exceed the unchanged one-percentage-point
allowance. No symmetry or acceptance rule was relaxed for this study.

All three accepted pairs pass production editable conversion, SVG
serialization/parsing, editor intersection rules, independent geometry and
paper-core checks. Their editable errors are 1.45375%, 0.749375% and 0.93875%,
respectively. These are offline conversion checks, not browser upload flows.

## What the additional cases expose

- The boar's foreground IoU is 95.9%, yet the cropper cannot establish adequate
  lobe-outline support. Accurate body area alone is insufficient for its geometry
  fit; the left lobe is also clipped in the source photograph.
- The rabbit field includes carpet/shadow above the lobes and loses pale paper
  near the bottom. Its proposed geometry fails both outline and cap-colour checks.
- The gold model includes part of the bright wood/reflection beside the lobe.
  Production instead proposes a visibly misplaced quadrilateral through the
  angel; classification loses bright gold paper, and fitting remains rejected
  at 6.15% disagreement. This involves cropping, colour conversion and fitting.
- The hand-held example still includes fingers and misses pale edges. The
  geometric detector cannot identify both lower paper edges. Contact regions
  explicitly labelled unknown remain excluded from segmentation scores.

These diagnostics locate observed failures without proving a single cause for
each. The next useful distinction is whether better body-outline evidence lets
the unchanged geometric detector recover those cases, or whether its shape and
colour assumptions remain limiting. More training should be evaluated by
source-faithful crops and valid exported templates, alongside segmentation scores.

## Reproduction and evidence

Commit `1da02e6` lets the frozen evaluator accept an explicit annotation catalog
and export verified full-photo fields for the existing reconstruction harness:

```sh
python3 scripts/inverse/learning/real-foreground-evaluate.py \
  --labels=tmp/heart-learning/real-supplement-diagnostic-v1/labels \
  --annotations=tmp/heart-learning/real-supplement-diagnostic-v1/annotations.json \
  --run=tmp/heart-learning/foreground-scene-v1/control-trained \
  --run=tmp/heart-learning/foreground-scene-v1/scene-trained \
  --export-probes --output=tmp/heart-learning/real-supplement-models-new
node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/real-supplement-models-new/probe-scene-trained \
  --output=tmp/heart-learning/real-supplement-replay-new \
  --methods=production,learned --target=mask --solve-ids=all --seconds=10
```

The [evidence record](real-supplement-diagnostic.json) pins the merged annotation
parents, checkpoints, inputs, predictions, implementation and generated assets.
It independently recomputes segmentation scores from archived float32 fields,
checks probe pixels/transforms, and verifies all 18 reconstruction records and
three editable outputs. Source, probability/error overlays, all four fitted
results and three editable renderings were visually inspected.

Eight focused Python tests pass, including preservation of full-photo pixels,
probabilities and letterbox coordinates, exclusion of annotation hints, semantic
label verification, QA exclusions, and zero-gradient unknown pixels. Owned
Chromium checks load all 42 images in the label/model galleries without page
errors. The initial gallery command lacked a module path and failed before
launch; using the existing owned Playwright shim fixed that harness error.

No production algorithm, neural deployment or source photograph changed in this
diagnostic. The verified fitter preview remains at port 5232. Nothing was pushed
or deployed, and no physical cutting/assembly test was performed.
