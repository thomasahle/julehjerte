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

## Fresh full-pipeline verification

The [paired validation record](FEATURE-CLEANUP-VALIDATION.json) compares commit
`58b50ba` with the preceding `c79d9d6` release. It includes the shared endpoint
preflight changes as well as cleanup. All photo sources, automatic crop
coordinates and preparation metadata match the earlier run.

- **22/22 regular Hunodan designs pass** within ten seconds. Independent errors
  are exactly unchanged for every case. Maximum prepare/fit/validate/export time
  is 8.5466 s; median is 5.1062 s. This track uses frozen photograph crops.
- **44 photographs:** 11 pass, 18 need review, 15 have no crop, unchanged from
  the prior release. All 29 generated pairs pass geometry and paper checks.
  Every passing case retains its exact independent error. Among approximate
  results, five errors improve, five worsen and eight stay unchanged. Including
  passing cases, 19 of 29 generated errors are unchanged.
- **14/14 browser runs pass:** seven uploads/drawings in Chromium and WebKit,
  through actual workers, editable SVG and PDF export. These use the production
  180-second solve budget. The paired and independent hats retain 43 and 28
  exactly shared exported spans respectively, with no editor intersection issues.
  The physical group-tree crop upload completes in 6.1045/6.588 s and retains
  nine shared spans. All browser source masks and crop coordinates are unchanged.
- **QA:** 845 application tests pass with one existing skip; all 551 inverse
  tests pass; type checking has zero errors and seven existing warnings; lint
  and the production build pass. Port 5232 serves the rebuilt engine, verified
  against hashes of all seven changed modules.

The fresh star run reproduces the isolated replay's **3.26375% → 3.165%**
independent disagreement with 3+3 cuts and two missing regions. The scattered
blue checker improves from 7.458125% to 7.21625%, but printed lines remain false
mask boundaries and the output still needs review. Neither is a new passing case.

The record also retains regressions. Red/gold worsens from 13.795625% to
13.9425%; its selected clearance run stops after 90 steps rather than 100 and
final cleanup is rejected. Arranged `r4c1` worsens from 6.64875% to 6.775%; its
incoming fitted checkpoint already has higher error before cleanup, which then
improves that checkpoint. Timed search trajectories remain a source of variation.
The other three increases are 1, 14 and 17 pixels out of 160,000 in the independent
binary export renderer, despite lower engine-sampled error after cleanup. The
acceptance guard uses the engine's adaptive renderer; it does not guarantee
non-increase under every antialiasing/threshold convention. These small independent
regressions are retained rather than rounded away or counted as improvements.

Raw runs are in `tmp/feature-cleanup-{hunodan,web-all,browser}/`; the photo report
contains original selections, rectified inputs, masks, exported weaves and
difference panels. The committed record keeps outcomes, source hashes, boundary
rejection reasons, cleanup decisions and before/after measurements.
