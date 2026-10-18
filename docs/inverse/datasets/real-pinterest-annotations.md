# Two Pinterest body annotations

The red/white heart with small heart-shaped details adds a saturated blue
background and a complete visible outline. The green/pale star adds rotation,
low paper/background contrast, shadows and clipping at two image edges. These
are two body observations, not established independent motif families or
cutting-template ground truth.

The body labels include both papers and exclude handles and cast shadows.
Handle attachments, manually traced boundaries and clipped edges have explicit
uncertainty. The star's lower outline was corrected after source-size grid
review and RGB edge checks. Its unobserved tip and lobe continuation are not
inferred. The complete red/white heart has four approximate overlap references
with a six-source-pixel uncertainty radius; the clipped star has none.

Both source-size outlines and both exported label overlays were inspected.
The [coordinates](../../../scripts/inverse/datasets/real-annotations-pinterest.json)
are stored separately from the original ten-instance training pilot. Both
source groups are outside existing QA reservations and earlier annotations;
allocation remains unassigned, with cross-corpus family review pending. No
neural model has used these additions.

Together the annotation files now contain **18 body instances across 16 source
groups**: 17 instances in 15 groups outside source QA and the previously reserved
gold-angel instance. There are six approximate overlap references. Source-image
counts and the three existing partial material annotations are unchanged.

The [verification record](real-pinterest-annotations.json) checks source identity,
group inheritance, RGB transforms and every known/unknown label pixel. This
establishes artifact consistency, not an independent human audit of the manual
outlines. Source photographs and derived PNGs remain outside Git.

```sh
python3 scripts/inverse/datasets/real_annotations.py \
  --annotations=scripts/inverse/datasets/real-annotations-pinterest.json \
  --output=tmp/heart-learning/new-pinterest-annotation-replay
```
