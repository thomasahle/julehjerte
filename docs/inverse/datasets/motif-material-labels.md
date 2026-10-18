# Paper identities for two silhouette motifs

The existing boar and rabbit photographs now have partial two-paper labels.
The boar supplies red/green paper with a clipped lobe and dark contour shadows.
The rabbit supplies pale/green paper on coarse fabric, a strong cast shadow
and narrow paper regions around its ears. Both lobes and selected motif/frame
interiors are labelled, so the observations identify paper rather than merely
foreground brightness.

The [annotations](../../../scripts/inverse/datasets/real-materials-motifs.json)
reference the existing body-label file by hash. They add **two labelled material
instances**, bringing the total to **seven in seven source groups**. They add no
photographs, cutting paths, train/test assignments or trained models. The body
inventory remains eighteen instances. Cross-corpus motif-family review is still
pending; these are not established independent design families.

Only conservative visible interiors receive a material identity. Uncertain
body boundaries, handles, cast shadows, seam rims, the rabbit's central crease
and unannotated details remain unknown. A/B identities may be exchanged across
an entire image, never independently at each patch.

Source photographs, polygon outlines and compiled overlays were inspected.
This revealed a red-frame polygon extending into the boar's green lower corner;
it was shortened before final compilation. The first draft remains preserved.
Both final label sets pass the compiler's source, grouping, polygon conflict
and pixel-reproduction checks at 256 and 768 pixels. The 256-pixel RGB inputs
and body labels are byte-identical to the prior body exports. Together the new
annotations supply **22,869 known material pixels at 256 pixels**.

The [verification record](motif-material-labels.json) pins inputs, labels,
reviews and the correction. These checks establish artifact consistency;
they are not an independent human review or a measured neural improvement.

```sh
python3 scripts/inverse/datasets/real_materials.py \
  --annotations=scripts/inverse/datasets/real-materials-motifs.json \
  --output=tmp/motif-material-labels
```

Use `--resolution=768` with another new output directory for inspection, or
`--verify` to recheck an existing export. Photographs and derived PNGs remain
outside Git.
