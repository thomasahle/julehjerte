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

## Completed release verification

The serial release replay completed on runtime commit `fedd63e`. All 791 inverse
tests and 855 application tests pass, with one application test skipped. Type
checking reports zero errors and seven existing warnings; lint reports zero
errors and one warning. The build and all ten Chromium flows pass. All accepted
browser outputs pass editable conversion and independent geometry/paper checks;
five PDF downloads have valid PDF signatures.

The original star takes 8.65 seconds from clicking Find to a ready browser
result, with 1.153125% disagreement in the editable export. JPEG quality 75 takes
4.42 seconds at 1.764375%; half resolution takes 9.33 seconds at 1.3525%. Original
and JPEG exports retain all 28 reviewed source-photo observations. These browser
runs use the recorded 180-second search setting; they do not establish a general
ten-second browser bound. The puppy and Viking still take 17.95 and 28.14 seconds.

Actual screenshot inspection confirms cleaner bands on the original star, but
its upper crossing tip remains overly rounded. The half-resolution result still
has small notches and complicated hidden routing around two inner bends. The
Viking's bottom routing remains complex. Passing the checks does not establish
the original cutting paths, a simple pattern, or physical assembly suitability.

The [release record](junction-retry-release.json) preserves all scores, timings,
visual observations, 464 source hashes and 990 artifact hashes. An independent
replay verified those hashes, and all 153 built assets were compared with their
HTTP-served bytes. The preview at `http://127.0.0.1:5232/editor/mal/` now serves
this checked build. No push or deployment has occurred.

The new focused regression can be rerun with:

```sh
node --test --test-concurrency=1 scripts/inverse/junction-routing.test.mjs
```
