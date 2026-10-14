# Refining an alternative junction interpretation

Commit `fedd63e` implements the promising alternative from the
[controlled star study](star-input-factorial.md). It is part of the main
automatic fitter. The crop and classified artwork are unchanged.

The existing 0.3/0.5 mm traces can contain an extra junction without triggering
the visible-chain intersection or short-return diagnostics. After all established
boundary interpretations exhaust their candidate graphs, the fitter considers
one 0.75 mm trace with fewer junctions. It must retain the source features, remain
within 5% provisional trace disagreement (or twice the user's tighter image
limit), and pass the endpoint, outer-margin and self-intersection preflights.
Those are seed-admission checks, not permission to export a 5% mismatch.

The additional MILP attempt receives at most two seconds and half the remaining
recovery allowance. Existing border retries retain their order. A resulting
route still needs the original source-image, feature, geometry and paper checks.
Its common Bézier refinement gets up to 800 steps and four seconds within the
existing overall deadline. Ordinary recovery routes keep their previous
refinement schedule. Final matching-sheet preference and shared-cut cleanup
remain in place.

## Completed checks

Ten focused tests pass, covering the new photo regression, provisional-seed
rejection, unchanged source arrays, border ordering, endpoint preflights and the
existing small-perturbation case. The original star's independent error must
improve over its fixed-input baseline; fewer than 100 unique curves and all 28
reviewed source-photo observations must remain.

All four original/JPEG pixel-and-crop combinations pass fresh fitting. At the
original fixed crop, original pixels improve from 1.3063% to 1.1594% disagreement
and from 9.42 to 7.70 seconds for fitting/validation. JPEG pixels improve from
1.6088% to 1.1669%. The original-pixel/JPEG-crop combination remains on its grid
route, with a small time-dependent score change; the JPEG/JPEG result is unchanged.
The comparison targets remain byte-identical within each pair.

The broader serial replay at `tmp/heart-learning/junction-retry-release-v1/`
has completed these stages:

- All 22 regular Hunodan designs pass below ten seconds; the maximum is 8.07
  seconds, and every error is exactly unchanged from the preceding release.
- All previous 25/31 hard-photo passes remain. Their crops, classified masks
  and fitting probabilities are unchanged. All 25 accepted pairs also pass
  production editable conversion and independent geometry/paper checks.
- Original-star agreement improves. Five previously passing photographs have
  slightly higher errors, by at most 0.068125 percentage points. Jigsaw and
  bauble remain failures and also have higher scores. Pass retention does not
  imply uniform error reduction; these differences remain in the saved reports.
- JPEG quality 75 and half-resolution automatic uploads pass the native
  photo-to-template replay. Actual browser interaction is a later stage.

## Verification still running

The full inverse suite is running, followed serially by application tests, type
checking, lint, build and ten browser flows. This document does not claim those
stages have passed. The preview continues to serve the preceding fully checked
release until the driver finishes the native tests and rebuilds it. No push or
deployment has occurred. Physical assembly remains untested.

The new focused regression can be rerun with:

```sh
node --test --test-concurrency=1 scripts/inverse/junction-routing.test.mjs
```
