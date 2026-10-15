# Predeclared body/material learning pilot

The next offline comparison trains the small RGB model to identify the selected
heart body and distinguish its two papers. It starts from the existing
ImageNet-initialized foreground checkpoint, preserves its foreground output,
and adds a neutral material output. Encoder weights and BatchNorm statistics
remain frozen; only the decoder is updated.

The [pinned plan](material-pilot-plan.json) contains nine reviewed photographs
and two conservative motif groups: five checker variants (including printing
and bowing), and four framed motifs (star, small hearts, boar and rabbit).
Inherited source and duplicate links are joined before assigning the two folds.
The experiment refuses a split with fewer than two connected groups. These
are inspected development photographs, not an unseen or topology-disjoint test.
Existing Hunodan and hard-photo QA sources remain excluded from training.

Each arm receives 240 updates, batch size four, the same initialization,
reflection decisions and synthetic draw schedule. A synthetic-only control
uses four procedural images per batch. Each mixed arm uses two procedural
images and two real images from the other complete group. The final update is
fixed in advance: held-out images do not select checkpoints or thresholds.

Synthetic replay uses 32 training geometries with one original and one clutter
counterpart each. Camera/foreground identities are checked by the existing
replay loader. Their undegraded two-paper coverage supplies fractional material
labels; selected-paper material PNGs must match between original and clutter
views. Material supervision omits the outer two foreground pixels to avoid
mixing background into a resized material target. Body supervision is retained.

Evaluation reports foreground errors, consistent global A/B identity errors,
and joint errors that count missing body as a failure. Per-material and balanced
errors expose loss of a minority paper color. Unknown regions are not scored.
These metrics cannot certify crop corners or cutting paths; actual reconstruction
and source-image review remain necessary before browser integration.

The plan is fixed before training. Implementation and input checks are staged
under `tmp/heart-learning/material-pilot-v1/`; they will run after the current
serial solver and browser QA. No material-trained checkpoint exists yet, and
this plan does not add a model to the website.
