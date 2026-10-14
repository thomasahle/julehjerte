# Repairing final shared cuts without changing the bird motif

The current-runtime bird can satisfy the stronger experimental return rule
without changing its independently rendered weave. Its hidden, exactly shared
controls need **1.553 mm** of displacement along one axis; the earlier repair
stopped at a 1.5 mm per-coordinate cap even though the next geometry audit passed. Allowing
only those hidden coordinates to move within one nominal strip width (2.505 mm)
completes the repair. Visible controls and fixed endpoints remain unchanged.
This changes a search bound, not the required clearance, turn or paper limits.

The reusable offline projector now accepts explicit finite iteration/time
allowances. Defaults remain eight iterations and 180 ms for checkpoint repair.
The final-output experiment uses up to 64 iterations and one second, still
bounded by the caller's overall deadline. It runs outside the application.

| Current saved output | Selected repair | Independent error before → after | Repair time |
| --- | --- | ---: | ---: |
| Hunodan bird | Hidden shared controls only | **0.904296% → 0.904296%** | 235 ms |
| Collage gift | Free controls, original movement cap | **2.309375% → 2.306250%** | 162 ms |

These timings cover the repair, not decoding, the original solve, paper testing
or editable conversion. They are not a new under-ten-second pipeline benchmark.
Both source targets and initial curves are frozen current-runtime outputs.
The bird's entire independently rendered mask is identical. The gift retains
source features and slightly improves mask agreement. Both pass the nominal
paper check and the stronger geometry check in eight exact representations.

The alternative free-control bird repair passes geometry but increases error to
0.922787%; it is not the selected repair. Keeping the old 1.5 mm movement cap
for hidden controls rejects the otherwise valid 1.553 mm correction. Extending
iterations alone did not remove that cap. The gift has no movable hidden
controls for its offending span, so that restricted attempt fails.

## Actual SVGs and remaining limitations

Both selected repairs pass production editable conversion, SVG round trip,
source-feature checks and current geometry/paper checks. The bird's editable
error remains exactly **0.900774%**; the gift improves from **2.337500% to
2.333125%**. The stronger experimental geometry audit accepts all sixteen SVG
representations (original, halves, thirds, unequal; each reflected/unreflected).
The existing editor accepts every bird representation, but still warns about
the gift after subdivision into thirds.

A proposed editor exemption was rejected. It removed ordinary-bend warnings by
checking the total turn between the nearest points, but also hid three saved
counterexamples: other close points on those curves still satisfy the return
rule. That prototype and its results are preserved outside the application.
The new ordinary-bend fixtures complement the existing positive return fixtures;
a replacement policy must distinguish both sets, rather than fix one by
silencing the other. Whole-cut search and final SVG acceptance remain necessary
before this approach can become the application's validator.

Visual inspection confirms that the bird's grid is still uneven and the gift
still has an unwanted hooked stroke, thin gaps and rough border junctions.
This repair addresses clearance, not those reconstruction errors. The cases
have no requested cutting symmetry; preserving requested/identical-sheet
constraints and the full native/browser budgets are still integration gates.

## Verification

All **twelve focused return/projection tests** pass. The new saved-bird
regression requires fixed and visible controls to remain unchanged, a
pixel-identical independent export render, nominal paper support and geometry
validity after exact subdivision/reflection. A separate regression requires
all three captured ordinary SVG bends to remain accepted by the complete
experimental return search; the existing captured returns remain rejected.

The [evidence record](final-return-repair.json) preserves failures, selected and
rejected repairs, target/geometry hashes, SVG audits, the rejected editor source
and visual observations. The preceding complete cache QA (830 inverse and 855
application tests) is recorded separately; it does not cover these new tests.
No application code was changed, pushed or deployed by this experiment.

The subsequent [complete verification](final-return-repair-validation.json) passes
832 inverse tests and 855 application tests (one existing skip), type checking,
lint and the production build. All 827 recorded source-file hashes remain
unchanged through the run. Rebuilding the isolated runtime from the committed
patch reproduces both selected repaired geometries byte for byte. This verifies
the recorded unconstrained experiment; symmetry-aware integration remains open.
