# Repair visible backtracks at shared-cut junctions

The blue-star notches exposed a gap in short-return recovery: the visible
outline can change sheets where an exactly shared cut ends. Its two visible
edges can double back even though neither paper's cutting path does. The
previous proposal generator only inspected consecutive edges within a sheet,
so it never inspected those visible joins.

The [completed probe record](visible-shared-returns-probe.json) pins the fixed
source mask, saved-geometry diagnosis, fresh solve and actual browser comparison.
The implementation and regression coverage are committed as `86901fd`.

## What changed

The existing short-return proposer now also inspects vertices with an incident
shared edge and exactly two visible edges. It uses graph identity, not nearby
coordinates: independent coincident branches and ambiguous continuations remain
excluded. Contracting a return moves every incident shared branch together.

The two observed outline returns also exceed the old single-sheet proposal
limits slightly. The visible-join proposal permits a chord up to 1.5 nominal
strip widths and a shorter edge up to two widths. It still requires a turn of
at least 135 degrees, a combined length greater than twice its chord and at
most six widths. These are proposal limits, not relaxed acceptance checks.
Adding visible joins with the original limits produces no proposal for this
case; both parts of the change are needed.

The ordinary constrained refiner evaluates the contracted graph. Final selection
still requires no increase in original-mask error, preserved source features,
compatible symmetry and matching-sheet constraints, and passing geometry and
paper checks. A new regression uses the same geometry as the desired drawing
and verifies that its notches cannot be erased at the expense of those pixels.
The cleanup uses its existing one-second phase allowance and overall completion
deadline; no search budget is added.

## Controlled results

| Actual Chromium replay | Editable mask disagreement | Click to ready |
| --- | ---: | ---: |
| Prior engine, `ad6d06f` | 0.545000% | 8.45 s |
| New engine, `86901fd` | 0.446250% | 9.23 s |

Both browser runs upload identical classified mask bytes and receive explicit
engine snapshots over HTTP. The changed module was requested three times in
each replay. Both pass independent editable geometry, source-feature and paper
checks; both SVG exports and PDF download signatures are checked. The new run
contracts two visible returns, removes two curve segments and keeps the finer
700-pixel paper audit.

A fresh native solve receives only the original photograph and frozen crop,
then prepares the binary mask afresh. No saved cutting paths enter this solve.
It returns a checked pair at 0.445625% independently rendered disagreement in
8.70 seconds, including preparation and independent replay but excluding image
decoding, process startup and artifact I/O.

The saved-geometry experiment separately shows that a full 160-step continuation
can reduce independent error from 0.540625% to 0.405000% in 2.09 seconds. That is
a diagnostic continuation, not the time allowance used in the main fitter or
a replacement for the fresh-solve measurement. A one-second phase continuation
can finish a valid checkpoint after its local cutoff; the existing overall
deadline decides whether that checkpoint may still be accepted.

Both browser screenshots and the native previews were inspected. The large
upper and left inner spikes shrink substantially. Small bumps and other corner
cusps remain, and the unchanged crop still excludes one photographed border
detail. The error scores concern the fixed classified mask; they do not certify
the original cutting paths, physical corners or paper assembly.

## Validation status

All seventeen short-return tests pass, including three new regressions. The
updated fresh blue-star regression also passes. Type checking and lint pass
with the existing unrelated warnings. All eight fixed crop variants in the
new broader replay pass below ten seconds and survive editable conversion.

The full Hunodan/photo benchmarks, application and inverse suites, build and
eleven rebuilt browser flows are running serially under
`tmp/heart-learning/visible-return-v1/`. Their results must be inspected before
claiming release-wide validation. The controlled proxy browser results above
do not mean the ordinary preview has already been rebuilt with this change.
Nothing is pushed or deployed; the neural models remain offline.
