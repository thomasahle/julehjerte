# Material pilot: independent audit and complete reconstruction comparison

The [fixed learning pilot](material-pilot-plan.md) is followed by a separate
checkpoint/prediction audit and an offline full-photo reconstruction comparison.
These checks were prepared before observing the material-training results.

The audit independently reads all saved weights, confirms frozen encoder tensors,
reconstructs the sample schedule and group separation, reruns checkpoint inference,
and computes observed body/material confusion directly from archived probabilities.
It does not call the training metric implementation to obtain its comparison
scores. Global A/B identity is chosen once per image from all observed material
pixels; missed body remains a joint error. A gallery shows probability fields,
partial labels, and combined predictions for every photograph.

The reconstruction comparison uses all nine pilot photographs and four arms:

1. Current automatic cropping and RGB classification.
2. Mixed-model body evidence for cropping, followed by RGB classification.
3. Synthetic-control body/material evidence for cropping and classification.
4. Mixed-model out-of-fold body/material evidence for cropping and classification.

Every arm receives the same complete source RGB pixels, no ROI or supplied
corners, the current automatic fitter, and a ten-second fitting allowance.
The arm order rotates by input index; this is not a latency benchmark. The
learned material probability replaces RGB clustering in the experimental crop
adapter. The geometric model, outline support checks and fitting constraints
remain unchanged. Joint arms rectify the material probability through the chosen
crop, threshold at 0.5 and retain that binary target without cleanup changes.
A/B phase is not aligned using annotations before detection or fitting.

Input preparation exports raw, untransformed source RGB as an unprofiled PNG so
Node and the model use identical numerical pixels. Source profiles and photographs
remain unchanged. This follows the existing model's raw RGB convention; it is not
a calibrated photographic color model. A pixel checksum checks the actual Node
decode before any arm runs.

The replay module does not open annotation files. Exported cuts are rendered
independently and checked against each arm's derived mask. Unresolved crops,
failed geometry and missing exports remain failures. A fit to a changed mask is
not proof that the photographed artwork was recovered: all source/crop/mask/weave
images must be inspected, and partial material observations are separate diagnostic
evidence. No broad real-photo success rate or deployment decision follows from
these nine previously inspected development images alone.

The staged audit is in `tmp/heart-learning/material-pilot-review-v1/`; the
experimental adapter, coordinate tests, probe exporter and replay are in
`tmp/heart-learning/material-pipeline-v1/`. Neither changes the website. The
material pilot remains queued behind the serial solver and browser checks at
the time this protocol is committed.
