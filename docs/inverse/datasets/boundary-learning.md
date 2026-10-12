# Boundary and junction learning experiment

This experiment asks whether a small CNN improves visible boundaries and useful
junctions over the current photographic preprocessing. It is an offline
component comparison. The model does not yet propose complete hidden routes,
run the MILP, validate templates or run in the browser.

## First measured result

Both 20-epoch runs completed. The pretrained encoder clearly helps this small
network at the tested training budget, but **does not yet justify replacing
the existing trace or using learned junctions as a hard graph filter**.

Pooled junction F1 at a three-pixel matching tolerance:

| Split | Views | Production trace | Random encoder | ImageNet encoder |
| --- | ---: | ---: | ---: | ---: |
| Development, lattice | 52 | 65.05% | 27.29% | 55.97% |
| Recipe validation, channel | 128 | 17.81% | 3.20% | 43.58% |
| Recipe test, frame | 128 | 21.10% | 8.88% | 41.82% |

The pretrained model improves corner recovery on the two held-out recipes,
but their junction recall remains only **35.16% and 31.45%**. It also loses to
the trace on development junction F1. These results require broader synthetic
motifs and checked real-photo labels before evaluating graph proposals.

Boundary tolerance F1 and predicted-pixel count relative to the thin trace:

| Split | Trace F1 | Random F1 / pixel ratio | ImageNet F1 / pixel ratio |
| --- | ---: | ---: | ---: |
| Development | 96.87% | 96.61% / 3.02× | 98.91% / 4.51× |
| Channel | 94.82% | 93.25% / 3.76× | 96.02% / 5.15× |
| Frame | 98.64% | 98.35% / 3.52× | 98.46% / 4.58× |

**These boundary scores do not establish better localization.** The learned
outputs are thick ribbons, while the production curves rasterize to thin lines.
A seven-pixel ribbon centered on a one-pixel target can score perfectly with
this three-pixel tolerance. Visual review confirms the thickness difference.
A shared thinning or one-to-one localization metric is needed before claiming
more accurate boundaries. Existing boundary recall gains are coverage gains.

Development loss selected epoch 19 for ImageNet and epoch 20 for random
initialization. Training plus per-epoch development checks took 93.5 and 81.4
seconds, respectively, excluding data preparation and final evaluation.
Warm native batch-one median inference was 11.1 and 15.2 ms in separate runs;
this small timing sample is not evidence that pretrained weights inherently
run faster. Both models have 880,466 parameters and 3,630,203-byte PyTorch
checkpoints. This is one seed and one training budget, not a convergence study.

[Committed measurements and hashes](boundary-learning-results.json) include
pooled precision/recall, macro scores, thresholds, training history and source
identity. Full per-image reports and unselected six-view comparisons are at
`tmp/heart-learning/imagenet-final/` and `tmp/heart-learning/random-final/`.
Nothing from this experiment is loaded by the website.

## Data and supervision

The inputs are the 512 synthetic views from the validated 128-design batch.
The production JavaScript classifier and trace preparation are run on the
same 384px crops and saved before training. No reference graph or palette is
supplied to classification. The model receives RGB and the production binary
mask; exact cut geometry is used only to create supervision and measurements.

Targets are a soft visible-boundary map and a heatmap for visible corners and
branches. Smooth degree-two Bézier subdivisions are omitted. Shared invisible
edges are omitted before selecting observable junctions, so a witness's latent
anchor is not automatically treated as a uniquely detectable image feature.
Degree-one border endpoints are excluded from this first task: uncertain crop
geometry requires separate endpoint hypotheses.

Canonical cubics are evaluated before applying the saved projective transform.
Their projected control polygons are not treated as polynomial cubics. Pixel
coordinates use centers at half-integers. Known overlap-validity masks, eroded
by two pixels, define the supervised and scored region. These masks are not
network inputs. This measurement does not test crop detection or identification
of that valid region in a real photograph.

All views of a cutting geometry remain together. Every fifth geometry in the
hash-sorted lattice training group is reserved for development; channel and
frame recipe groups retain their diagnostic holdouts. These are not verified
topology-disjoint splits: simplified routings can recur across recipes. No
real photograph, gallery template or Hunodan QA design enters training.
The resulting split is 51 training designs (204 views), 13 development designs
(52 views), 32 channel designs (128 views), and 32 frame designs (128 views).

## Architecture and initialization

The network has **880,466 parameters**. It uses MobileNetV3-Small's RGB feature
stages through stride 32, with stride 2/4/8/16/32 lateral features combined into
a small decoder. A shallow RGB-plus-mask branch retains full-resolution detail.
Two output channels propose boundaries and junctions. The original classifier
and final feature expansion are unused.

Compare exactly the same architecture, decoder initialization, seed, data
order, learning rate and epoch budget with a random encoder and an ImageNet
encoder. Batch normalization and all retained encoder weights are trainable.
Joint reflections augment training images, masks and targets together.

This runnable baseline uses the already installed TorchVision implementation
and its [MobileNet_V3_Small_Weights.IMAGENET1K_V1 checkpoint](https://docs.pytorch.org/vision/0.23/models/generated/torchvision.models.mobilenet_v3_small.html).
It is **a different checkpoint** from the previously researched timm LAMB
weights: timm and safetensors are not installed in this environment. No new
dependencies are installed. The training report records the actual downloaded
TorchVision URL, byte count, SHA-256 and package versions. Its inputs use
ImageNet RGB normalization while preserving the entire square; no classification
center crop is applied.

## Measurement

Checkpoint selection uses only development loss. Boundary and junction
thresholds are then chosen from a fixed list using development F1. Recipe
validation/test predictions are evaluated afterward; their scores do not
select epochs or thresholds.

Boundary precision/recall use a three-pixel distance tolerance inside the valid
region. This is a localization score, not exact mask agreement or cutting
legality. Junctions use nonmaximum suppression and one-to-one matching within
three pixels; duplicate predictions cannot inflate recall. Reports include both
pooled and per-image scores, all case outcomes, selected thresholds and the
fixed production trace baseline. The first six images of each split are saved
for visual comparison without selecting the most favorable examples.

Timing is warm native PyTorch batch-one inference including output transfer to
CPU. It excludes image decoding, classification and MILP search. In particular,
the production mask supplied to this model still costs time to compute. No
browser, ONNX or end-to-end speed improvement follows from this timing alone.

## Reproduce

The experiment needs Python with NumPy, SciPy, Pillow, PyTorch and TorchVision,
and the installed project Node dependencies. The checked environment has
PyTorch 2.8.0 and TorchVision 0.23.0. Outputs must use new directories.

```sh
node scripts/inverse/learning/prepare.mjs \
  --dataset=tmp/heart-training-synthetic/batch-v1 \
  --resolution=384 --output=tmp/heart-learning/prepared-v1
python3 scripts/inverse/learning/data.test.py
python3 scripts/inverse/learning/model.test.py
python3 scripts/inverse/learning/train.py --initialization=imagenet \
  --epochs=20 --batch-size=8 --device=mps \
  --output=tmp/heart-learning/imagenet-run
python3 scripts/inverse/learning/train.py --initialization=random \
  --epochs=20 --batch-size=8 --device=mps \
  --output=tmp/heart-learning/random-run
```

CPU is also supported explicitly with `--device=cpu`. Runs retain failed status
and error details as well as successful metrics. Fixed seeds are recorded;
bit-exact MPS training repeatability is not claimed. The first attempted run
found an MPS backward failure caused by NumPy's HWC-like memory layout when
stacking transposed images. Contiguous NCHW batches fix it, and a regression
test now exercises an actual forward/backward pass on MPS when available.

Evaluation initially exposed SciPy's lack of support for float16 maximum
filters. Predictions are promoted to float32 for that operation. A separate
review found that tied local maxima could count a single junction several
times: even an exact Gaussian centered between four pixels produced four
proposals. Deterministic spatial suppression now retains one. Regression
tests cover integer-centered and half-pixel-centered targets in both precisions.
The final reports re-evaluate the same selected checkpoints with these fixes;
no extra training or holdout-driven checkpoint selection was performed.

To evaluate a saved run without retraining, retain its report and checkpoint
and supply a new output directory:

```sh
python3 scripts/inverse/learning/train.py --initialization=imagenet \
  --epochs=20 --batch-size=8 --device=mps \
  --evaluate-run=tmp/heart-learning/imagenet-run \
  --output=tmp/heart-learning/imagenet-evaluation
```

Recovery verifies the model source, manifests, splits and training arguments.
The new report records both the old report hash and checkpoint hash, plus old
and current source hashes. Original failed reports remain intact.

Even a successful synthetic comparison needs held-out real-photo annotations,
new motif families, graph coverage measurements and full solver validation
before it could justify a production change.
