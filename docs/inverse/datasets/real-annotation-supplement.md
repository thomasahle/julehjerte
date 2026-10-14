# Two more reviewed visible-body annotations

This supplement adds two photographs from two source groups absent from the
original ten-instance pilot. Both are regular checkerboards: they extend colour
and background coverage, not motif diversity. Neither image belongs to the
reserved QA groups. Family review and global train/test allocation remain pending.

| Photograph | Body annotation | Uncertainty |
| --- | --- | --- |
| Blue/yellow basket on a pale surface | Both papers, including their offset at the tip; excludes shadows and watermark | Four source pixels around the manual outline |
| Red/white basket with pinecone and greenery | Basket body; excludes handle and decorations | Three source pixels around the outline, plus the concealed handle attachment |

Both native sources and exported overlays were visually inspected. No overlap
corners are labeled: the first photo's woven endpoints do not establish a clear
square, and the second photo's notch is concealed. There are no reference cuts.

The [coordinates](../../../scripts/inverse/datasets/real-annotations-supplement.json)
remain separate from the original annotations and temporary training folds.
Together they provide **12 instances in ten source groups**. No model has used
the two additions, and no new reconstruction or segmentation score is claimed.

The [verification record](real-annotation-supplement.json) pins source identity,
grouping, labels, transforms and rendered pixels. It verifies consistency, not
independent human annotation accuracy. The original images and derived PNGs
remain outside Git. Reproduce with a new output directory:

```sh
python3 scripts/inverse/datasets/real_annotations.py \
  --annotations=scripts/inverse/datasets/real-annotations-supplement.json \
  --output=tmp/heart-learning/real-annotation-supplement-replay
```

The [original pilot](real-annotation-pilot.md) describes observation weights and
the distinction between visible-body masks and physical cutting geometry.
