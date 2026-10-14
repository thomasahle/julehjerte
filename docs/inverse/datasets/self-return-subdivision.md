# Cutting-curve validity must survive exact subdivision

An offline audit finds a representation-dependent short-return check. Splitting
an unchanged cubic can change whether the engine accepts the same cutting path.
This affects both ordinary bends and close returning sections. No production
validator, fitter, source image or acceptance threshold changed in this study.

The audit covers nine analytic/saved fixtures and 51 exported geometries from
the current release, including its 47 accepted Hunodan/photo pairs. Four exact
subdivision schedules, with and without reflection, give **480 representations**.
Sampled point differences from de Casteljau subdivision are at most
**8.04e-14 mm**. They are the same continuous shapes to floating-point precision.

## Root cause

`shortSelfReturns` skips adjacent cubics and finds one nearest pair for each
remaining pair of cubics. Exact subdivision changes both adjacency and which
nearest pair is considered. The subsequent arc-distance exclusion does not
remove this dependency. The editor also has adjacency and local-bend exclusions;
passing its current checks does not establish subdivision invariance.

A simple 30-degree bend passes in its original representation but fails after
the unequal split. The captured photographic bend has the same problem before
any gradient update. Its fifteen original cubics and exact subdivision knots
are retained in a small fixture; they reconstruct the captured sixty pieces
within 2.85e-14 mm. These are diagnostic fitted curves, not reference artwork.

Among the saved exports, five change their original short-return verdict under
at least one subdivision: Hunodan `hjfig-05`, collage `gift`, the blue outlined
star, Stonehenge and Viking. This does not prove that all five physical hearts
are defective. It establishes that the existing numerical rule depends on how
the same cut is represented.

## Experimental predicate and rejected alternative

The first prototype required a local distance minimum on both branches. It
removed the bend inconsistency, but also missed the saved anchor return in all
eight representations. That proposal is retained as a rejected experiment.

The second prototype also measures total turning along the intervening cut.
It considers a close pair a return when it is a local distance minimum or when
the path turns at least 180 degrees. It searches adjacent and same-cubic spans
as well. Polynomial derivative/curvature roots separate changes in tangent
direction; this is a floating-point method, not an exact clearance proof.

This prototype gives one binary verdict across all eight representations of
each of the sixty cases. It retains the saved gift and anchor rejections and
the analytic narrow curved return, while accepting the ordinary bends. It
flags two previously accepted exports even in their original representation:
`hjfig-05` and `gift`. The other three subdivision-sensitive exports have no
experimental short returns. Issue counts can vary with subdivision; only the
presence or absence of a short return is invariant in this diagnostic.

The prototype remains under `scripts/inverse/diagnostics/` and is never imported
by the app. This limited corpus does not establish general invariance, physical
strength or completeness near numeric thresholds.

## Fresh fitting under the experimental rule

An isolated runtime copy changes only short-return validation. Both engines
start from fresh grids using the same frozen photographs, crops and targets.
Neither receives saved cutting paths, and the search budget remains ten seconds.

| Input | Original error | Experimental error | Original fit/export time | Experimental fit/export time |
| --- | ---: | ---: | ---: | ---: |
| Hunodan `hjfig-05` | 0.9043% | 1.7417% | 3.25 s | 4.49 s |
| Collage gift | 2.3094% | 2.3719% | 9.39 s | 9.37 s |

Both experimental outputs pass the existing template checks and the proposed
short-return check, including after halving every cubic. All four control and
experimental outputs also survive production editable conversion, SVG round
trip, source-feature checks and the existing independent geometry/paper checks.
These are native fit/export timings, excluding preparation and decoding; no
browser interaction was tested. The editor does not yet implement the proposal.

Visual inspection confirms that the experimental Hunodan output has more
distorted grid borders. The gift still contains thin seams and contour
irregularities. The Hunodan error increase is not a matching-sheet tradeoff:
both returned pairs use independent sheets. The stricter candidate therefore
does **not** meet the goal of preserving current image quality and is not
promoted. The next step is to recover quality under consistent geometry checks,
then reconcile the independent editor predicates and broaden verification.

## Reproduction and verification

The [evidence record](self-return-subdivision.json) includes all sixty verdict
sequences, four fresh fits, four editable replays and 85 hashed local artifacts.
The rejected prototype, isolated runtime and complete per-pair diagnostics remain
under `tmp/heart-learning/self-return-subdivision-v1/`.

Seven focused tests pass: the existing five short-return/routing regressions and
two new experimental subdivision checks. The new diagnostic files also pass
lint. Full repository QA is recorded separately when complete; the already
validated app runtime and local preview remain unchanged.

```sh
node --test --test-concurrency=1 \
  scripts/inverse/self-return-subdivision.test.mjs \
  scripts/inverse/self-returns.test.mjs
node scripts/inverse/self-return-subdivision-study.mjs \
  --output=tmp/heart-learning/new-subdivision-study
# Add --corpus=<saved release directory> to include its hunodan/ and photos/ exports.
```
