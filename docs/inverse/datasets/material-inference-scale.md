# Frozen-model inference resolution

Doubling inference resolution from 256 to 512 pixels does **not** improve the
current body/material model. On the same nineteen development photographs,
foreground overlap worsens on eighteen, and supported crop proposals fall from
three to one. No model or crop change is added to the website.

| Paired measure | 256 pixels | 512 pixels |
| --- | ---: | ---: |
| Mean body IoU on known labels | 80.68% | 64.24% |
| Known background classified as paper | 8.50% | 27.28% |
| Observed material disagreement | 17.62% | 20.33% |
| Material disagreement including missing body | 18.91% | 21.21% |
| Supported crop proposals | 3/19 | 1/19 |
| Median single-image CPU inference | 30.7 ms | 95.6 ms |

The [plan](material-inference-scale-plan.json) was written before inference.
The [results](material-inference-scale-results.json) retain paired per-photo
scores, crop outcomes, source/checkpoint hashes and visual-review notes.

## Controlled comparison

Both sizes use the existing MobileNetV3-Small model's original, source/motif-held-out
checkpoint for each photograph. Weights, thresholds and photograph windows are
fixed. No training, new annotations, ROI selection or per-photo best-arm selection
occurs. These are nineteen previously inspected development photographs from two
broad groups, not an unseen generalization test.

The continuous letterbox transform scales with the input size, preserving the
same source coordinates, including fractional padding. The 256-pixel RGB inputs
and all nineteen replayed probability fields reproduce the saved originals
**exactly**. Higher-resolution probabilities are sampled at the original label
centres for scoring; annotation regions and denominators do not change. One
global paper-label exchange is allowed per image, and missing body still counts
as an error. Partial labels leave many uncertain boundaries unscored.

Fresh crop attempts use each size's complete body/material fields with the
current geometric support checks. The image pixels are verified independently
through the Node decoder. Arm order alternates by photograph; the existing
two-second orientation retry budget remains. These are crop proposals, not
ground-truth corner measurements. This experiment stops before template fitting
because no new crop is recovered and the visual mask defects remain.

## Failure pattern

All nineteen field comparisons and the four proposed crop masks were inspected.
At 512 pixels, the boar, rabbit, white/red decorative checker, printed-paper
heart, bird and several outdoor photographs gain false foreground outside the
heart. Handles, surrounding texture and detached patches become paper. The
hand-held example also claims more hand/background. Eighteen body IoUs worsen;
the bicycle is the only improvement, but its material detail remains broken and
it still lacks a supported crop.

Material identity improves on eight images and worsens on ten, with one unchanged.
The rabbit and outdoor red/white checker illustrate why a better interior score
is insufficient: both lose their previously supported crop. The blue/yellow
checker is the only proposal retained at 512 pixels. Its classified cells have
sharper portions, but irregular contacts, gaps and edge artifacts remain. Neither
size recovers a faithful checker solely by increasing spatial resolution.

The regression occurs before the template solver. It is not a MILP timeout or
a changed raster-mask fitting target silently compared with its predecessor.
This establishes sensitivity of the **frozen checkpoint** to inference scale;
it does not establish that higher-resolution training would fail. Changing size
also changes the scale of texture and objects seen by its features. Multiscale
training or keeping whole-heart context separate from local boundary refinement
are reasonable next hypotheses, not demonstrated fixes.

## Reuse and resource limits

The paired inference, field sampling and crop replay now live in
`scripts/inverse/learning/`. The archived experimental material-field adapter is
promoted into a reusable offline module, while the website keeps its existing
pipeline. Tests check source-coordinate preservation, probability interpolation,
paper-label phase, transparency, existing foreground behavior and rejection of
invalid fields.

Inference uses one low-priority CPU thread and no new training run. The two
checkpoints, nineteen photographs and baseline fields are reused in place.
New raw fields occupy 38 MiB; figures and reports bring the batch to under 43 MiB.
No large solver visualizations or duplicate image collection are generated.
Reported inference times exclude startup, decoding, cropping and template search.

```sh
nice -n 15 python3 scripts/inverse/learning/probe-material-scale.py \
  --plan=docs/inverse/datasets/material-inference-scale-plan.json --output=FRESH_RUN
nice -n 15 node scripts/inverse/learning/material-scale-crops.mjs \
  --run=FRESH_RUN --output=FRESH_RUN/crops
nice -n 15 python3 scripts/inverse/learning/material-scale-gallery.py --run=FRESH_RUN
```

The reports pin local research inputs that are not shipped in Git. Reproduction
requires those existing photographs, labels and checkpoints; it downloads none.

Validation passes 15 focused Python tests and 16 focused Node tests. Type checking
reports zero errors and six existing warnings; lint reports zero errors and four
existing warnings; the static build passes. All recorded experiment artifacts,
input hashes and runtime-source hashes were checked again afterward. The full
inverse benchmark was not repeated: this batch changes offline evaluation and
archive metadata, not the production solver.

## Follow-up: keep the encoder at its trained scale

The [context/detail follow-up](material-context-detail-results.json) keeps the
encoder and its whole-heart feature maps at 256 pixels, while feeding 512-pixel
RGB to the shallow detail branch and final head. It uses the same nineteen
historical development photos, original held-out checkpoints and unchanged
crop checks. All nineteen control predictions reproduce exactly. Three focused
tests check equal-resolution equivalence, branch input sizes and invalid inputs.

This avoids the large foreground regression: body IoU is **80.77%**, compared
with **80.68%** for the control. Observed material error changes only from
**17.62% to 17.54%**. Nevertheless, supported crops again fall from **3/19 to
1/19**. The rabbit and outdoor checker lose their proposals; only the blue/yellow
checker remains. Its imperfect cell boundaries remain visible. All nineteen
field comparisons and four resulting crop masks were inspected; fine lines,
printed papers and background leakage remain unresolved.

The experiment isolates a useful cause of the native-512 regression: retaining
whole-image feature scale preserves foreground predictions. It also shows why
mean pixel scores are insufficient for accepting a cropper change. Small changes
near the lower paper edges and colored lobes can flip the geometric support
checks. Those checks were not relaxed. This inference variant remains offline
and is rejected for deployment; the subsequent encoder-tail study uses a new
sixteen-photo training-eligible subset and must be assessed separately.
