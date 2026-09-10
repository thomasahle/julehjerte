# Short returns at shared cutting junctions

Follow-up: [recovery budgeting](RECOVERY-BUDGET.md) diagnoses the Firefox
latency recorded below and separates the local refinement cutoff from the
overall completion deadline. It also preserves the failed allocation-only
replay that exposed the acceptance bug.

The live Hunodan anchor upload added during control-identity QA exposed a small
out-and-back spur in `R-cut-2`. Chromium and WebKit returned an engine-validated
fit which the editor correctly rejected, including without simplification.
The recorded Chromium cut approaches itself within 0.512 mm after a 3.119 mm
detour. The engine's local-neighbourhood exclusion is about 20 mm in this
preset, so neither its clearance penalty nor its validator objected.

## Why more gradient steps did not repair it

The traced routing adds a redundant corner. The refiner preserves intentional
corners, and moving the short curves does not remove that representation.
Replays of the saved failure with 160 and 400 extra steps retained the editor
conflict. Adding a penalty for turns beyond 150 degrees improved some mask
scores but did not remove the conflict at any tested penalty strength.
Those experiments remain in `tmp/local-return-experiment.json` and the
isolated `tmp/local-return-engine/`; that penalty was not added to production.

Simply shortening the engine's local-neighbourhood exemption also rejects
several existing star cuts and many other successful designs. The audit is
saved in `tmp/local-return-audit.log`. No clearance threshold was weakened or
indiscriminately tightened as part of this change.

## Contracting the short edge

`direct/short-returns.js` adds a topology simplification proposal to the main
fitter, after template selection and before final shared-cut repair. A candidate
join must turn at least 135 degrees, take more than twice the direct distance
between its outer endpoints, and have a combined length at most four nominal
paper widths. The shorter edge must fit within one nominal width. Whole loops,
fixed endpoints, conflicting contractions, and independent paths that merely
coincide at the junction are excluded.

The shorter edge is contracted to its other endpoint. Every incident curve at
the actual shared junction moves with it, including its adjoining handle.
An edge used by both sheets is removed from both paths together. Rebuilding
the graph retains complete shared cubics as one control polygon. Matching and
requested symmetries are checked before and after refinement.

This matters in the actual anchor: the incoming part of the spur is shared
with the other sheet. An initial shortcut experiment replaced the two segments
of just one cut; it passed the editor but stopped preserving that shared span.
The committed implementation instead contracts the unshared short edge and
moves the connected branch coherently. A regression requires the same two
slits to continue sharing geometry after repair.

The ordinary constrained refiner gets up to 160 polishing steps to recover
any initial image loss, inside a bounded cleanup allowance and the existing
solve deadline. A proposal is accepted only if its original weighted mask
error does not increase, the image-feature audit passes, and geometry, paper,
matching and requested symmetry checks pass. Exact imported vector artwork is
excluded. Later sharing, primitive selection and shared-run simplification
still operate on the selected result.

## Regression coverage

The tests cover both orientations of a shared return, matching sheets,
a partial shared run at the real branch, an independent coincident branch,
right angles, long and closed detours, and the zero-extra-error requirement
for a deliberately drawn feature. The actual captured upload mask and failing
curves are replayed through cleanup and the production editor converter. That
replay must improve image error, preserve the shared slit relationship, leave
the original geometry untouched, and produce a valid editable heart.

The earlier converter-rejection fixture is retained. The original invalid
curves must continue to be blocked; repairing a new candidate is not a reason
to make the editor accept those old curves.

## Cleanup budget and the browser replay

The first browser run repaired the Chromium upload, but WebKit discarded the
same improved checkpoint at the cleanup's 700 ms cutoff. It completed all 160
steps and measured 0.856875% source error, then returned the old invalid pair
with a `deadline` rejection at 747 ms. That failure is retained in
`tmp/short-return-browser/webkit-hunodan-hjfig-05/`.

The cleanup now receives at most one second within the unchanged overall solve
deadline and export reserve. Refinement leaves 200 ms for final source scoring
and feature/symmetry checks. The fitted checkpoint's geometry and paper audits
are reused: these later inspections do not change any coordinates, so rerunning
the identical audits consumed time without checking a new candidate.

This change does not unify the editor and engine self-clearance predicates,
or guarantee that every possible return is repaired. Conflicting contractions
and proposals that cannot preserve image quality or geometry are left alone;
the editor's final validation remains in force. The saved invalid fixture must
still be rejected even after a fresh fit of its source can be repaired.

The fallback replay exposed a separate diagnostic omission: feature-recovery
results did not retain `numericalBackend`, although every other direct-fitter
return did. The recovered route now includes the loader's existing backend
record. The browser harness still requires a real blocked WebAssembly request
and a reported JavaScript fallback; that assertion was not relaxed.

## Browser and dataset results

All 33 browser workflows have passing replays: 30 synthetic workflows on the
initial contraction commit, followed by all three anchor uploads after the
cleanup-reserve correction. The synthetic cases never invoked short-return
repair or feature recovery, so the later budget and backend-report changes do
not change their execution. The final forced-JavaScript anchor replay also
passes, including actual SVG export and the editor's geometry checks.

The repaired anchor's exported source disagreement is 0.861875% in Chromium
and WebKit. Firefox retains its already successful 1.424375% result. With the
WebAssembly request deliberately blocked, Chromium exports at 0.870625%.
These use fresh uploads and automatic crops, not the frozen benchmark crop.

All 22 regular Hunodan benchmark crops retain byte-identical exported template
pairs and identical independently rendered errors. The serial run's median
prepare/solve/validate/export time is 5.545 seconds, with an 8.357-second maximum.
No short-return proposal is needed for these fixed crops. Image decoding and
independent export replay are outside that timer, as in the previous benchmark.

The Firefox live anchor is still slow: click-to-ready takes 31.388 seconds
(previously 31.558). Its feature-recovery MILPs use about 6.4 seconds without
finding a validated routing, then three fresh-grid refinements consume about
19.6 seconds. This latency predates the contraction change, but remains a
performance issue; the ten-second fixed-crop Node results must not be presented
as a browser-wide timing guarantee.

All 32 free-border perturbation cases also retain byte-identical templates and
identical independently measured protected-source errors. Their serial median
is 4.619 seconds and maximum 7.515 seconds. Together with the 22 photo crops,
all 54 cases retain their previous exported geometry and pass the existing
quality, image-feature, paper and ten-second criteria.

[SHORT-RETURNS-VALIDATION.json](SHORT-RETURNS-VALIDATION.json) records the individual
measurements, browser source provenance, rejected experiments, checks and
artifact hashes. The isolated preview remains on port 5232; changes are
committed locally for integration by the other agents.

Final verification passes **842 application tests and 494 engine tests**
(1,336 total; one optional application test skipped), lint and production build.
Svelte checking has zero errors and seven existing warnings. All **63 served
engine and worker files** match the committed source byte for byte. The tested
preview remains at <http://127.0.0.1:5232/en/editor/paint/>.
