# Paper identities under uneven lighting

The [current revision](printed-paper-material-correction.json) corrects the
red/white checker: its little hearts and dark outlines are printed ink on white
paper, verified against the publisher pattern. Four conservative cell interiors
now label them as paper B. Previous known pixels, body geometry, RGB images and
source groups are unchanged. Earlier offline models used the initial revision;
no model has trained on this correction. The following record describes the
initial annotations, including the mistaken aperture description.

Two previously annotated Pinterest hearts now have partial paper-material
labels. The red/white example supplies clear lobe and checker-cell interiors on
a saturated blue background. The green/pale star supplies a bright pale lobe
and strongly shadowed regions of the same paper. These labels identify the
visible material within each photograph, rather than a brightness class.

The [annotation file](../../../scripts/inverse/datasets/real-materials-pinterest.json)
is separate from the three earlier material annotations. Together they cover
five existing heart instances in five source groups. No photographs, body
annotations, cut paths or train/test allocations are added. All five source
groups remain outside the current source QA reservations; motif-family review
is still pending.

Only conservative interiors receive a paper identity. Seams, the small
heart-shaped apertures, uncertain attachments and clipped continuations remain
unknown. Existing body uncertainty always takes precedence. A/B identities may
be exchanged for the whole image, never independently for individual regions.

Both native source images, native polygon overlays and the compiled 256- and
768-pixel overlays were visually inspected. That review corrected a pale-border
polygon that initially reached into green paper and moved the green lower-lobe
polygon farther from the attachment. The saved labels pass the existing
compiler's source, grouping, polygon-conflict and pixel-reproduction checks.
Both body masks and RGB inputs are byte-identical to the earlier body-label
exports. The [verification record](pinterest-material-labels.json) pins the
annotations, original inputs and local artifacts.

```sh
python3 scripts/inverse/datasets/real_materials.py \
  --annotations=scripts/inverse/datasets/real-materials-pinterest.json \
  --output=tmp/pinterest-material-labels
```

Use `--resolution=768` with another new output directory for visual inspection,
or `--verify` with an existing output to recheck it. Source images and derived
PNGs remain outside Git. No model has used these additions, and no improvement
in segmentation or complete reconstruction is claimed. Interior labels also
do not establish fine boundary accuracy.
