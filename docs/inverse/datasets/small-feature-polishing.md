# Preserve small valid steps when polishing a recovered opening

The shifted bird now passes both previously failing eye regressions, with
unchanged source pixels and stricter shape-overlap assertions. This is a local
fitting correction, not a new cropper or neural model. The complete release
benchmark and browser QA still need to run.

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
focused test log. Fresh corpus, editable SVG and browser validation are now in
progress. No changes have been pushed or deployed.

```sh
node --test --test-concurrency=1 scripts/inverse/feature-details.test.mjs \
  scripts/inverse/fitted-rerouting.test.mjs
```
