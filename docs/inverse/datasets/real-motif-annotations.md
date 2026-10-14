# Two more real motif-body annotations

These additions label a framed boar and a framed rabbit, extending the two
checkerboards in the earlier supplement. They add visible-body observations,
not cutting-path ground truth or a claim of new independent motif families.

| Photograph | Labeled body | Withheld or excluded |
| --- | --- | --- |
| Red/green boar on a pale shaded surface | Both papers and the visible clipped left lobe | Handle and shadow excluded; attachment and clipped edge uncertain |
| White/green rabbit on coarse fabric | Both papers against textured background | Handle, fabric and strong cast shadow excluded; attachment uncertain |

Coordinates were traced on half-size and quarter-size source views respectively,
then mapped back to source pixel edges. The uncertainty band is three review
pixels: six source pixels for the boar and twelve for the rabbit. Source-outline
views and both exported known/unknown overlays were inspected. Neither example
has an overlap-corner or cutting-path annotation.

The [coordinates](../../../scripts/inverse/datasets/real-annotations-motifs.json)
pin each image hash and its dimensions. Both inherited source groups are outside
the existing source-QA reservation and absent from earlier annotations. Global
allocation and cross-corpus motif-family review remain pending. **No model has
used these additions**, and the original ten-instance pilot and folds remain
unchanged.

Together with the original pilot and earlier supplement, there are now **14
body instances across 12 source groups**, with the original five approximate
corner references. No new segmentation or template-recovery score is claimed.

The [verification record](real-motif-annotations.json) checks original source
identity, inherited groups, transforms, label/RGB pixels and retained artifacts.
All six final image assets are byte-identical to the visually reviewed draft;
only review metadata changed. These checks establish consistency, not an
independent human audit of the manually drawn contours. Images and generated
PNGs remain outside Git.

```sh
python3 scripts/inverse/datasets/real_annotations.py \
  --annotations=scripts/inverse/datasets/real-annotations-motifs.json \
  --output=tmp/heart-learning/real-motif-annotation-replay
```
