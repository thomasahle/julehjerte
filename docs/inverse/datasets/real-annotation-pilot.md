# Real photographs with uncertain visible-body labels

The first annotation pilot contains **ten basket instances from eight inherited
source groups**, selected outside the existing QA reservation. It includes
patterned paper, trees, a reflective background, a bowed basket, hands obscuring
edges, a clipped lobe and a motif protruding beyond the usual heart silhouette.
These are assistant-reviewed observations, not original artwork or cutting paths.

The coordinates are stored in
`scripts/inverse/datasets/real-annotations.json`. Each annotation pins its source
image hash and dimensions. Polygons follow the selected visible basket body,
including both paper colors and printed textures. Handles, cast shadows,
chocolates and other objects are excluded. Where occlusion or a handle attachment
makes the outline uncertain, the annotation explicitly withholds supervision.
A three-review-pixel uncertainty band also surrounds manually traced boundaries.

Five approximately visible overlap squares have corner references with explicit
uncertainty radii. The other five have no corner label. None has reference cut
geometry. The protruding dragonfly and clipped/open basket must not be forced
into a standard heart just to make an annotation convenient.

## Rasterization and use

The exporter samples polygons at pixel centers after aspect-preserving letterbox
scaling. The photograph receives the same continuous transform, with antialiased
prefiltering before reduction. The label PNG is
**0 = background, 1 = selected paper, 255 = unknown**; letterbox padding is unknown.
The photograph is not color-classified to obtain its labels. Photo bytes, source
groups, duplicate groups and recorded rights facts remain linked to the inventory.

The offline consumer supplies a separate binary observation weight. Its masked
BCE and Dice loss both exclude unknown pixels; unknown predictions also cannot
change the reported known-region IoU or error. Known-region metrics do not measure
precise outline localization, particularly because that outline is uncertain.
The existing synthetic objective and saved checkpoints remain unchanged.

The verifier rechecks every source hash, grouping field, output transform and
label/RGB pixel. It rejects source QA contamination and tampered masks even when
their file hashes have been recomputed. These checks establish provenance and
consistency, not an independent human review of the annotation's accuracy.

```sh
python3 scripts/inverse/datasets/real_annotations.py \
  --output=tmp/heart-learning/real-annotation-v1/labels-filtered
python3 scripts/inverse/datasets/real_annotations.py \
  --output=tmp/heart-learning/real-annotation-v1/labels-filtered --verify
python3 scripts/inverse/learning/real_foreground.test.py
```

The local `labels-filtered/index.html` shows the source beside an overlay: green is known
paper, gold is uncertain/unobserved, and magenta is an approximate overlap
reference. All ten overlays were inspected. The raw source downloads and derived
PNG files remain outside Git; only coordinates, code and reports are committed.

## Current scope

This is a small, deliberately varied **annotation development set**. The source
inventory's existing QA exclusions remain intact, but cross-corpus motif-family
review is pending. All ten allocations therefore remain unassigned. They have
not entered training and are not claimed as an unseen benchmark. The loader
rejects an attempt to turn the current pilot into an assigned training/test set
without updating its explicit allocation policy.

The production cropper, fitter and its 24/31 photo benchmark are unchanged by
this annotation work.

## Frozen-model diagnosis

Both checkpoints from the paired background/clutter experiment receive the same
ten photographs, 256-square letterbox transform, labels and observation weights.
No model is trained or selected in this replay. This full-photo, aspect-preserving
input protocol differs from the existing crop-to-fit replay's stretched input
windows, so these segmentation scores cannot be pooled with its 5/31 outcomes.

| Mean across ten instances | Background-only control | Clutter-trained |
| --- | ---: | ---: |
| Known-region IoU | 57.56% | 76.95% |
| Known-paper false negatives | 0.47% | 6.14% |
| Known-background false positives | 41.15% | 6.70% |

Clutter training clearly suppresses more background on these observations, but
also erases more actual paper. The bicycle's known-paper loss rises from 1.0% to
7.0%, the patterned heart's from 1.1% to 9.1%, and the clipped blue/gold basket's
from 1.3% to 19.3%. This is visible along borders and tips in the error overlays.
The approximate-corner annotations never enter the network or metric.

The hand-held black heart remains particularly poor: the newer model's
known-region IoU is only 15.6%, with hands and wood claimed as paper. The pink
basket among chocolates is 53.3%, with a substantial part of the pale wooden
background retained. The dragonfly's irregular protrusions are also imperfect.
These observations distinguish excessive background inclusion from missing
paper; an average IoU improvement does not establish accurate physical corners.

All twenty source/probability/error comparisons were visually inspected. The
[evidence record](real-annotation-results.json) pins the checkpoints, inputs,
labels, implementation and 53 exported artifacts. Scores were recomputed from
the archived float32 predictions with the same known/unknown denominators.
Annotation coordinates were fixed before model replay and did not change after
prediction inspection.

Review found an aliasing bug in the pilot's original RGB loader: PIL's affine
bilinear transform samples only four pixels even when reducing a large image.
The corrected loader first filters the image footprint with `resize`, then
applies the same continuous placement transform. A periodic-stripe regression
shows the original sampler returning black where integrated coverage is 1/8
white. All ten label PNGs, uncertainty masks and transforms remain byte-identical.
The preceding unfiltered diagnostic remains in Git at `ad47f32` and locally in
`frozen-models-final`; it is not the current result above. Filtering raises the
clutter model's average IoU from 75.04% to 76.95%, but also exposes larger paper
loss on some examples. This fixes the new annotation loader, not the existing
application or earlier crop-to-fit replay, which already used filtered resizing.

```sh
python3 scripts/inverse/learning/real-foreground-evaluate.py \
  --labels=tmp/heart-learning/real-annotation-v1/labels-filtered \
  --run=tmp/heart-learning/foreground-scene-v1/control-trained \
  --run=tmp/heart-learning/foreground-scene-v1/scene-trained \
  --output=tmp/heart-learning/real-annotation-v1/filtered-models
```

The next step is to expand/check real labels, resolve source/motif grouping and
design a grouped real-photo training comparison. Particular targets are hands,
pale textured backgrounds, varied heart sizes, and complete pale borders. The
present observations do not isolate how much each issue comes from image framing,
texture, training coverage or the learned shape prior. No network is enabled in
the website on the strength of this small diagnostic.

## Validation

All **52 offline Python tests**, **758 inverse tests** and **855 application
tests** pass, with one existing application skip. Type checking, lint and the
production build pass. Seven targeted tests cover pixel-center alignment,
antialiasing, QA exclusions, source grouping, semantic mask tampering,
zero-gradient unknown pixels and known-region scoring.

Owned Chromium checks load all **70 images** across the two final galleries
without page errors or broken assets. The annotation gallery screenshot and
all twenty model comparisons were inspected. The preview was restarted after
the build at `http://127.0.0.1:5232/editor/mal/`; its served geometry, count-search
and fitter files match the worktree bytes. Commands, hashes and checks are in
the evidence record. Everything is committed locally; nothing was pushed.
