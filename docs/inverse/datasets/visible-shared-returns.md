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

The first broader replay under `tmp/heart-learning/visible-return-v1/` stopped
after Hunodan. All 22 cases passed their frozen quality gates below ten seconds
(maximum 8.171 seconds), but two had slightly higher independent errors than
the immediately preceding release: one pixel for `hjhih-01`, and roughly eleven
pixels for `hjstr-03`. The stricter comparison correctly stopped the driver;
its later photo, application, inverse, build and browser stages did not run.
`hjstr-03` used no short-return repair; its candidate already differed before
cleanup. Fresh paired runs are needed to distinguish timing variation from a
change-induced regression. These measurements remain in the original run.

### Source support guard

The one-pixel `hjhih-01` regression did involve the new proposal: its internal
pixel-centre score improved while the independent exported raster worsened.
The contracted joins lie only 1.20–1.33 source pixels from a mask boundary,
compared with over ten pixels for the unwanted star tips. Merely having a
geometric return is therefore insufficient evidence to simplify a visible join.

The follow-up requires an observed, single-colour neighbourhood around both
the junction and the shorter curve's midpoint. The radius is a quarter of the
minimum strip width, with a floor of 1.5 source pixels; intersecting pixel cells
are checked, not only their centres. Unknown or zero-weight pixels cannot
justify a contraction. Existing single-sheet proposals and all final acceptance
checks are unchanged. A tip-only version failed even on an exact desired
notch because of raster phase; the midpoint check fixes that regression.

All nineteen short-return tests now pass, including one-pixel source shifts
and unknown-image regions. The fresh blue-star solve regression also passes.
The final guard is committed as `14e6dbf`; its [diagnostic record](visible-shared-returns-guard-probe.json)
pins the source, tests and subsequent fresh replays. Both `hjhih-01` and
`hjsta-01` retain exactly their previous-release independent scores. This also
rejects the unguarded cleanup's tiny `hjsta-01` improvement: boundary support
is ambiguous there, so that gain is not retained at the expense of the guard.

Three fresh old/new pairs for `hjstr-03`, in AB/BA/AB order, return exactly
0.5612977% disagreement in all six runs, taking 8.78–8.94 seconds. All numerical
refinement checkpoints are identical, and all six finish 750 refinement steps.
Neither engine proposes a short-return repair. The preceding historical score
of 0.5539909% remains recorded. These paired results establish no regression
from the changed cleanup in this case; they do not reproduce the historical
lower score or prove its precise cutoff. Time-dependent checkpoint selection
remains the likely explanation, not an established exact cause.

The new broader driver keeps the frozen quality and ten-second gates. Its
additional previous-release comparison permits only this investigated case
to reach the identical fresh old/new score, and records that exception explicitly.
All other cases still require no increase over the previous release. Broader
validation is running serially under `visible-return-guard-v1/`; the stopped
unguarded run and failed tip-only test are preserved. The controlled browser
numbers above describe `86901fd`, not this follow-up or the ordinary preview.
Nothing is pushed or deployed; the neural models remain offline.
