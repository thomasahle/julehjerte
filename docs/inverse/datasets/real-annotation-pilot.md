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
scaling. The photograph receives the same continuous transform. The label PNG is
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
  --output=tmp/heart-learning/real-annotation-v1/labels
python3 scripts/inverse/datasets/real_annotations.py \
  --output=tmp/heart-learning/real-annotation-v1/labels --verify
python3 scripts/inverse/learning/real_foreground.test.py
```

The local `labels/index.html` shows the source beside an overlay: green is known
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

The next step is to score the existing frozen models against these unchanged
observations, then expand/check real labels before designing a grouped training
comparison. The production cropper, fitter and its 24/31 photo benchmark are
unchanged by this annotation work.
