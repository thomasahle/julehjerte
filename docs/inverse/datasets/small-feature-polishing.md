# Preserve small valid steps when polishing a recovered opening

The shifted bird now passes both previously failing eye regressions, with
unchanged source pixels and stricter shape-overlap assertions. This is a local
fitting correction, not a new cropper or neural model. Fresh corpus, editable-SVG
and browser verification now pass; the measured limits are recorded below.

## What failed

The old forty-step checkpoint interval missed useful early movements. The
eye improved during refinement, but later steps produced a tight return on
the same cutting path. Complete geometry validation correctly rejected those
steps, and rollback discarded the unrecorded intermediate improvements.
Some whole-template intermediate candidates were also rejected by the paper
check. Those trials did not isolate where that uncertainty arose.

Changing only the image weights or resolution did not resolve the failure.
Neither did a longer MILP search on the same captured boundary: it lowered
the cut-complexity objective from 2148.27 to 1645.43, reducing the finite-graph
gap from 26.42% to 0.64%, but left the eye measurements unchanged. That gap is
not an artwork-error bound.

An interpolation experiment verified that a 1/32 partial displacement could
retain 91.0% of the eye at 800 pixels while passing geometry and paper checks.
However, repeated backtracking audits did not reliably reach that fraction
inside the short allowance. General backtracking is not included in this change.

## Correction in the existing fitter

After a rejected fitted boundary has been successfully reassigned to valid
cutting paths, the ordinary polisher can scope its next pass to small interior
features. It freezes distant controls and uses the same Bézier refiner, shared
curve parameters, geometry checks and paper checks. No cut is independently
copied between sheets, and the photograph remains the final image reference.

This short pass has at most sixteen steps, with checkpoints every four steps,
inside the existing polishing deadline. The general refiner retains its
forty-step default. Temporary fixed-control flags are removed afterward, so
later repair and editing retain their usual freedoms. Requested symmetry,
identical-sheet polishing and weighted/free-border inputs retain their existing
paths.

The feature and a surrounding band of the opposite colour receive equal loss
weight. A first trial without that band retained more eye pixels but overfilled
the opening at 400-pixel rendering. It was rejected as the final approach. The
band uses the existing small-detail objective, now shared between subdivision
and local polishing.

## Fresh shifted-photo results

The crop is shifted one source pixel horizontally, and its mask SHA-256 remains
`bc122e4659773ece5abab69eae4934c528c8eba8feda8c0aa92d5e6ba86afe91`.
Only the photograph, crop and settings enter the fresh solves. Saved curves
were used for the preceding controlled diagnostics, not as fresh-solve inputs.

| Independent measurement | Previous ten-second fit | Scoped polish with colour band |
| --- | ---: | ---: |
| Whole-mask disagreement, 400 px | 2.5306% | 2.5238% |
| Whole-mask disagreement, 800 px | 2.6328% | 2.6245% |
| Eye retention, 400 px | 92.45% | 98.11% |
| Eye retention, 800 px | 87.26% | 94.34% |
| Eye intersection-over-union, 400 px | 81.67% | 98.11% |
| Eye intersection-over-union, 800 px | 85.65% | 91.32% |
| Solver seconds | 9.00 | 9.01 |

Both outputs pass complete geometry and nominal paper checks. A separate fresh
run with a 180-second allowance finishes in 13.87 seconds and also retains
94.34% of the eye at 800 pixels. These are individual native observations,
not browser timing guarantees or evidence that the full corpus is unchanged.

Visual inspection still finds a conspicuous step in the head outline and tiny
false seams. The eye is better, but the whole motif is not yet a faithful
reconstruction. Low aggregate mask disagreement does not certify visual quality.

## Verification

All seven focused tests pass, including both fresh photographic searches.
The eye tests retain their 90% retention and 2.7% whole-mask limits, and now
require more than 85% component IoU at both rendering scales, up from 45%.
A new regression runs the ordinary refiner through the scoped graph, checking
fixed controls at every checkpoint, shared-cut identity, intermediate/final
checkpoint coverage and unchanged input geometry and pixels. Type checking,
lint, all 857 application tests (one existing skip) and the production build
also pass at `99399ff`. The complete inverse suite passes **849/849 tests** in
846.96 seconds. All 840 recorded source-file hashes remain unchanged through
the serial verification run.

The [measurements and artifact hashes](small-feature-polishing.json) preserve
the negative trials, captured boundary, runtime variants, fresh exports and
focused test log. The [complete release record](small-feature-release.json)
adds the fresh corpus, editable SVG and browser results. No changes have been
pushed or deployed.

## Complete pipeline verification

The fresh native run passes all 22 regular Hunodan designs within ten seconds;
the maximum is **7.915 seconds**. Relative to the preceding turning-limit release,
21 independent mask errors are exactly unchanged. The bird improves from
0.9043% to 0.8444%. These timings include preparation, fitting, validation and
export, but exclude image decoding and the independent measurement renderer.

Automatic cropping and fitting retain **25/31 complete hard-photo passes**.
Source images, selected corners and all fitting-input hashes match the preceding
run. Five passing errors increase slightly: floral checker +0.0125 percentage
points, gingerbread +0.01125, fine checker +0.0575, orb +0.005 and maple leaf
+0.010. Four improve and sixteen are unchanged. Pass retention does not imply
uniform error reduction. The same six failures remain in the denominator.

All **47 accepted pairs** pass conversion to editable curves, SVG serialization
and parsing, editor geometry rules, source-feature checks and nominal paper
checks. All **16 Chromium workflows** pass, including three bird masks with
one-pixel crop shifts. Actual downloaded bird SVGs are separately measured at
400 and 800 pixels. The horizontal-shift SVG retains 93.40% of the eye at 800
pixels, with 90.83% component IoU and 2.6063% whole-mask disagreement. This is
an independent browser observation, not an exact reproduction of the native
prototype coordinates.

Browser click-to-ready timings are recorded separately, with a 180-second
solver allowance. The Viking takes 29.12 seconds; these checks do not establish
a ten-second browser bound. Fresh Draw and Paint contexts fetch no solver or
WASM before a solver action. All 158 recorded preview assets and all 840 source
hashes were verified. The tested preview is on port 5232.

Visual inspection confirms the built-in star's straight bands and the hat's
shared central seam. The photographed star still has uneven contours, and the
bird's head and surrounding border retain artifacts. The stronger geometry
checks and improved eye do not make the full motif an exact reconstruction.

## Short shared-span follow-up

An offline experiment proposes close, independent spans shorter than 3 mm
when both ends already meet. Exact signed cubic ribbon area ranks the proposals;
existing image, symmetry, feature, geometry, cut-quality and paper gates decide
whether to accept them. Signed area is not an error bound for crossing ribbons.

The experiment improves two saved shifted-bird outputs at both tested fitting
resolutions and leaves a third unchanged. For the newer ten-second output,
400-pixel error changes from 2.52375% to 2.52125%, with unchanged eye retention;
800-pixel error also decreases. These are small seam corrections, not a solution
to the head-outline defect. Trials with a one-second proposal deadline take up
to 1.20 seconds including completion of the final audit.

None of the 47 standard release outputs has an eligible short-span proposal.
The proposal therefore remains outside the application: it has not established
a broader reconstruction or fresh-solve benefit. The
[six trials and 47-case inventory](short-shared-span-study.json) retain this
negative result alongside the local improvements.

```sh
node --test --test-concurrency=1 scripts/inverse/feature-details.test.mjs \
  scripts/inverse/fitted-rerouting.test.mjs
```
