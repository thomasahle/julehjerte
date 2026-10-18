# Testing rotated outline-support tolerances

The locator uses the rotated working-image width when choosing a fit with
supported lobes, but the original working-image width for final palette-fit
acceptance. These tolerances can differ even though rotation preserves distances.
That could select a candidate that subsequently fails while overlooking another
candidate. The six supplemental photographs provide a controlled check of this
hypothesis before changing the public cropper.

The offline replay injects the same frozen scene-model foreground fields into
two copies of the current locator. One copy uses the existing policy; the other
uses the final original-width tolerance consistently for selection and
intermediate checks. RGB pixels, probabilities, colour estimation, optimizer
starts, fitted candidates and final acceptance thresholds stay fixed. Neither
variant receives annotation polygons, corners or a region of interest.

Across **120 paired orientation hypotheses on six photographs**, all optimizer
candidates are identical, and **neither candidate selection nor crop acceptance
changes**. Both variants find supported proposals for the blue/yellow and
decorated checkers; neither finds one for the boar, rabbit, gold angel or
hand-held checker. The tolerance discrepancy therefore is not an observed cause
of these four missed crops. No production patch is justified by this experiment.

This does not prove the two policies equivalent on every image. The diagnostic
also evaluates every shared orientation hypothesis without the app's two-second
cutoff; its proposal count is not a new automatic-crop speed or accuracy result.
No model is trained and no template fitting is rerun here.

The [evidence record](locator-support-consistency.json) verifies implementation
and input-manifest hashes, equality of candidate fits, all paired outcomes and
the archived artifacts. The executable probe and complete candidate/support
logs are in `tmp/heart-learning/locator-support-consistency-v1/`. Production
cropping and the verified preview remain unchanged.
