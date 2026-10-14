# Reflective paper and hand-occlusion annotations

Two additional photographs now have reviewed visible-body labels. One shows a
white/gold angel heart on wood, with strong changes in brightness across the
reflective paper. The other shows a pink/blue checker heart held between two
hands, with parts of its outer edge hidden.

Both paper colors belong to the foreground. The gold handle, cast shadows,
hands and background do not. The handle attachment and both hand-contact regions
are withheld from supervision; hidden outer contours are not inferred. A
three-source-pixel band around each manually traced contour is also uncertain.
Coordinates use the unscaled source images, 533 × 800 and 735 × 465 pixels.

The source-resolution outlines and both exported known/unknown overlays were
visually inspected. The [coordinates](../../../scripts/inverse/datasets/real-annotations-scenes.json)
contain no overlap-corner or cutting-path labels. The [verification record](real-scene-annotations.json)
checks source hashes, dimensions, inherited groups, transforms, label/RGB pixels
and retained artifacts. All six final PNG assets match the reviewed draft bytes.
This establishes consistency, not an independent human annotation audit.

There are now **16 body instances across 14 source groups**. The new groups are
outside reserved QA and disjoint from earlier annotation groups. Motif-family
review and global allocation remain pending; source-group separation does not
prove motif-family independence. None of the six supplemental instances has
entered training. The original ten-instance adaptation pilot, folds and five
approximate corner references remain unchanged. No new model score is claimed.

Source images and generated labels remain local under
`tmp/heart-learning/real-scene-annotation-v1/` and `tmp/heart-training-real/`.

```sh
python3 scripts/inverse/datasets/real_annotations.py \
  --annotations=scripts/inverse/datasets/real-annotations-scenes.json \
  --output=tmp/heart-learning/real-scene-annotation-replay
```
