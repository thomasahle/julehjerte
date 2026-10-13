# Grouped real-photo decoder adaptation

This experiment tests whether the ten annotated real photographs can improve
the small foreground network. The protocol is fixed before training, in
`scripts/inverse/learning/real-pilot-folds.json`. It is an offline development
comparison, not an unseen benchmark or a model deployment.

## Grouping and training

Three connected groups keep related inputs together. The bicycle, sloth and
dragonfly share one publisher/source group. Six straight checker photographs
share a conservative motif group despite different counts, printing and paper
textures. The curved checker is the third group. Source and near-duplicate links
are joined transitively with those motif groups, so a future duplicate cannot
silently cross a fold. The three held-out group sizes are 3, 6 and 1.

Each mixed run uses only the other groups for real supervision. All ten photos
are evaluated once by a model that did not train on their group. The grouping
review is limited to this pilot; it does not complete cross-corpus motif review
or establish disjoint cutting topologies. Synthetic training already contains
checker routing. Global source allocations remain unassigned; this sidecar
declares only the temporary experiment roles.

All runs begin from the same synthetic clutter-trained checkpoint. The encoder
weights **and batch-normalization statistics** stay frozen. Only 9,889 parameters
in the lateral/detail/head decoder are adapted. Each run receives 120 AdamW
updates at learning rate 0.0001, weight decay 0.0001 and batch size four. There is
no early stopping or held-out checkpoint selection; the final update is evaluated.

Replay uses 32 identity-selected training geometries, each with its original
photograph and one verified neighbour/handle counterpart, for 64 inputs. No
synthetic development or recipe-holdout image enters replay. Both arms use the
same first two replay inputs and reflection draws per update. The mixed arm
replaces the other two replay images with training-group real photographs.
The synthetic-only adaptation is a matched-update control, not an equal-real-data
comparison. The unchanged frozen checkpoint is scored separately.

The existing uncertain-label loss gives no gradient to occluded/uncertain pixels
or letterbox padding. Unknown pixels also cannot change evaluation denominators.
All masks and source photographs remain fixed. The decoder can still make
geometrically wrong predictions; this experiment cannot certify a crop or template.

## Reproduction

```sh
python3 scripts/inverse/learning/real-foreground-finetune.py \
  --labels=tmp/heart-learning/real-annotation-v1/labels-filtered \
  --initial-run=tmp/heart-learning/foreground-scene-v1/scene-trained \
  --output=tmp/heart-learning/real-adaptation-v1
```

Output directories must be new. The runner saves the fixed draw schedule, every
sampled identity, training loss, checkpoint, float32 prediction, group assignment
and source hash. It checks frozen encoder bytes after every completed run.
The next assessment must compare missed paper and included background per case,
and inspect the prediction/error images, before interpreting mean IoU.
