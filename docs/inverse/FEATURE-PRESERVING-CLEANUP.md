# Allow useful cleanup of imperfect template candidates

Final shared-cut recovery, degree reduction and short-return cleanup used to
require that the entire proposed weave pass the source-feature audit. A small
source region missing from the incoming fit therefore vetoed even an unrelated,
otherwise beneficial cleanup. This left avoidable false seams and unnecessary
curvature in approximate candidates shown to the user.

The cleanup guard now compares the proposal with its incoming checkpoint using
the same source regions and weights. Each region must retain at least the lesser
of its previous retention and the existing 60% feature threshold. A retained
feature must still pass; a missing feature cannot deteriorate. Gains elsewhere
cannot compensate for violating that per-region guard. All existing image-error,
symmetry, geometry and paper checks still apply.

The final `finish` audit is unchanged. A cleaned candidate with any missing
feature still fails the template checks and retains the interior-artwork warning.
This change does not certify approximate results or relax the image-error limit.
The cleanup report includes missing-region counts before and after, and any
regressed regions with their required and observed retention.

Regression coverage includes both colours and weighted masks, the precise
retention threshold, an unrelated missing island during line simplification,
and the recorded free-border hat. With an unrelated missing island, the hat's
long cuts become exactly shared while the result remains flagged. A second hat
case is rejected because sharing would reduce an already-missing region's
retention from 10% to zero, despite improving overall image error. Exported SVGs
are also checked with the independent renderer.

## Isolated photographic-star replay

The fixed classified source for `vissevasse-arranged-r1c3` has SHA-256
`55fb6626496c9149413ffeca95f74b423d29c38020fcbc0a8f28eb91c4b5a5d8`.
Replaying final cleanup on the previously exported 3+3 candidate reduced
independently rendered disagreement from **3.26375% to 3.165%** in 1.14 s.
Three shared-span proposals were accepted. Further degree reduction was rejected
by the paper audit, demonstrating that removing the feature veto does not bypass
other constraints. Geometry and paper pass, but two small white regions remain
missing and final template checks still fail.

A separate diagnostic added a 3+4 hypothesis to the original count shortlist.
That fit's independent error was 2.843125%, with the same two missing regions.
Replaying cleanup reduced it to 2.815%. This is a manually expanded search,
not the production count policy or evidence that the star is solved. The existing
count inference did not propose this unequal pair; that is a separate limitation
from boundary-spacing infeasibility and the cleanup veto.

These replays start from saved fitted geometry to isolate cleanup. They do not
measure fresh end-to-end speed or automatic crop quality. Raw local records:
`tmp/star-cleanup-replay/results.json` and `tmp/star-count-fitting/results.json`.
