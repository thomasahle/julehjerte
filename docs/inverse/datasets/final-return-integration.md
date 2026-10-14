# Final export and the editor share the complete-cut return rule

**Latest verification:** the subsequent [small-feature polishing correction](small-feature-polishing.md)
resolves the two shifted-eye regressions. Repository QA now passes 849/849 inverse
tests and all 857 application tests, with type checking, lint and build passing.
Fresh full-corpus validation retains 22/22 Hunodan and 25/31 hard-photo passes;
all 47 accepted editable pairs and 16 browser workflows pass. See the
[release measurements](small-feature-release.json), including small photo-error
increases and remaining visual defects. The historical intermediate failures
below remain part of the diagnostic record.

Final engine validation and the editor now use the same normalized return
search. Before export, a bounded repair can move cutting controls to resolve a
return while retaining image fidelity, paper checks, requested symmetries and
already matching sheets. Candidate validation, checked refinement checkpoints
and MILP return exclusions now use the same complete rule. Optimizer steps
between checkpoints still use the ordinary gradient costs.

## Finalization

The repair first considers hidden controls, which can change shared cuts without
changing the visible weave. If an original image is available, it may then try
visible controls. A candidate must pass the complete geometry and paper checks,
preserve fixed controls, symmetries and existing sheet identity, and not worsen
the observed-image objective or lose a previously retained source feature.
Free-border image weights retain their existing meaning. Without an image,
only hidden controls are eligible and the sampled weave must remain identical.

Both attempts share a two-second repair allowance and the caller's remaining
deadline, with at most 64 projection iterations per attempt. `design()` passes
its existing overall deadline to finalization. Numerical validation, image
sampling and export still take time outside individual projection steps; this
is not a hard wall-clock guarantee. Fresh ten-second benchmarks are required.

The final report records the repair attempts and acceptance gates. Failed
geometry is never reported as a successful check. The template files remain
downloadable with their existing review notices, as requested by the owner.
Input metadata and solver provenance survive an accepted repair.

## A second units mismatch

Sharing the search implementation alone was insufficient. The native prototype
limited its return margin by the requested manufacturing width, while the
editor always used 1.5% of the overlap width. A 300 mm template with a 3.6 mm
return therefore passed the native check and failed in the editor. A very small
minimum-strip setting exposed the same discrepancy at 100 mm.

Both callers now use `heartPathReturns`, which normalizes coordinates, the
numerical tolerance and the endpoint exemption together. Returned witnesses
are mapped back to the caller's units for repair. Final clearance between
different cuts also respects the larger of the manufacturing requirement and
the editor margin. The regression covers both discrepancies. The old, weaker
predicate is now available only through an explicit diagnostic option.

The editor retains its existing crossing checks and replaces the old
segment-pair proximity shortcut with the complete-cut search. Its obsolete
local-minimum exemption and unused proximity-endpoint option have been removed.
The shared TypeScript module generates the worker's standalone JavaScript;
the editor does not import the inverse engine or WASM.

## Frozen-output replay

All 51 saved outputs were finalized with the baseline engine at `70b6fc5` and
the integrated engine, using identical saved masks and no new fitting or
rounding. **All 47 previously accepted outputs remain accepted**, and none of
the independently rendered image errors increases. Only the bird and gift are
repaired. The four image failures remain rejected; the two no-output cases
are absent from this replay. This does not increase the 25/31 photo benchmark.

| Repaired output | Independent mask error before → after |
| --- | ---: |
| Hunodan bird | 0.904296% → 0.904296% |
| Collage gift | 2.309375% → 2.306250% |

The [evidence record](final-return-integration.json) contains per-case results,
repair gates, source hashes, the earlier mismatched-width probes and the final
probes. These are saved-output finalization tests, not fresh reconstruction,
browser timing or physical assembly tests.

Six new regressions cover the width/minimum-strip discrepancies, hidden repair
through public export with unchanged independently rendered pixels, preservation
of provenance, expired repair deadlines, continued export availability, and
rejection of visible repairs that worsen the image. The existing projection
tests continue to exercise matching sheets and requested transformations.

## Anchor regression and image recovery

Activating the complete editor check exposed two existing anchor regressions.
The original export contains a second return in the left sheet which the old
closest-pair shortcut missed. A separate dense polygon calculation confirms
the witness: about 1.42 mm between points separated by 3.10 mm of cutting path,
with 197 degrees of turning. The old topology cleanup removes the most obvious
right-sheet spur but leaves other returns, so its intermediate result cannot
be treated as an export certificate.

A final projection can make that intermediate geometry valid, but increases
its source disagreement from 1,371 to 1,450 of 160,000 pixels. The image gate
correctly rejects that candidate. When this happens, final repair now uses the
main Bézier fitter to recover image error, alternating its ordinary image steps
with bounded return projection at invalid checkpoints. Only this final repair
requested the complete geometry rule inside refinement; ordinary fitting
initially retained its existing guidance and cost. The returned candidate must satisfy every
original gate, including a bounded displacement from the incoming controls.
The initial finalization-only implementation described here was subsequently
extended to ordinary candidate checkpoints, as described below.

The anchor regression now exercises public final export before conversion to
Draw, requiring valid geometry and no increase over the intermediate fit's
image error. Both previously failing application tests pass. The two-second
repair allowance includes image recovery, and the original solve deadline can
shorten it; lack of time never permits an invalid export to claim a passed check.

Type checking, lint, production build and all 857 application tests pass (one
existing skip), along with 14 focused inverse regressions. The subsequent full
inverse run passes **837 of 844 tests** and fails seven photographic regression
cases: four clock crop/clock-pressure variants, a half-resolution puppy, and
two shifted-bird searches. All seven fail the final template-check assertion.
The final-export integration is therefore **not release-ready**. Fresh full-corpus
solving, actual editable SVG replay and browser QA are still pending. Earlier
complete QA for the standalone shared module is recorded
[separately](shared-return-geometry-validation.json).

Fresh captures reproduce three representative failures with the original
classified-mask hashes. Giving final repair five seconds does not recover them:
the clock and puppy can be projected into valid geometry but their image error
increases, while widening the bird returns exceeds the unchanged maximum-turn
constraint. These are not simply exhausted-time failures. Intermediate fitting
and routing still use weaker geometry rules than final export; applying the
complete rule throughout those stages is under isolated evaluation. Saved-output
replay is insufficient evidence for fresh fitting.


## Consistent checks during fitting

The next correction makes complete geometry the default for candidate
validation and refinement checkpoints. MILP excludes complete return chains
using the same search. This prevents a candidate from being labeled valid
under one rule and rejected under a different rule at export. An explicit
legacy option remains for historical diagnostic comparisons.

Invalid return-only checkpoints try moving hidden controls before visible
controls. Both attempts share at most 400 ms and the caller's remaining
deadline, with 64 iterations per attempt; all fixed controls, matching and
symmetry constraints still apply. A new regression independently renders a
captured hidden-return fixture before and after ordinary refinement, requires
identical pixels, and checks that the incoming controls were not mutated.
Another regression ensures ordinary checkpoint reports cannot certify cuts
that violate the editor clearance at a nondefault overlap width.

Recovered boundary routings can use up to 320 polishing steps instead of 160,
within their existing deadline. This gives projected geometry time to regain
image quality. The fresh native Hunodan bird changes from 0.904296% error in
the last validated release to **0.841779%**, with complete geometry and paper
checks passing in **5.681 seconds** including preparation and export.

This is not a completed release. The simpler isolated version with consistent
checks passed 23/25 focused photographic tests and 22/22 native Hunodan checks;
21 Hunodan image errors were identical to the previous release, but the bird's
error increased. Two focused tests then found that the separate collage bird, with its crop
shifted one pixel, lost too much of the eye at 800-pixel export resolution
despite passing geometry. This is a different photograph from the Hunodan
speed fixture; their errors and cut counts are not a paired crop comparison. The
hidden-repair and longer-polishing correction improves the ordinary bird; it
has not yet resolved the shifted-eye regression. Full QA for commit `6c5bbc1` passes **834/846 inverse tests** and finds
**12 failures**; this is not release-ready. The eight focused
finalization/checkpoint regressions pass.
The first application replay passes 856 tests and exposes one obsolete
assertion: the anchor is now repaired during fitting, so final export correctly
reports no further repair. The test now requires complete validation, unchanged
or improved image error and successful Draw conversion, without prescribing
the repair stage. Its focused replay and the full application rerun pass: 857 passed, one
existing skip. Type checking, lint and production build also pass. The full
inverse suite is complete with the twelve failures described above.

Beyond the shifted eye, the full run exposes four clearance-routing failures,
two bounded-repair failures, two scheduling failures, one trace-selection
assertion and one synthetic-admission fixture. The clearance proposals now
contain six warning records on two or three cuts; an old four-record eligibility
limit prevents repair from starting. Counting affected cuts and allowing more
bounded local refinement are under isolated evaluation. The synthetic fixture
has four actual sub-1.5 mm returns under the shared rule and must be rejected;
its admission regression now expects rejection under the unchanged validator.

Exploring invalid trajectories without rollback, ranking rejected boundaries
by weighted error, and fitting the small-detail stage at original image
resolution were tested separately and are not included. The latter two search
variants that changed the trajectory fell back to a slower grid search rather
than recovering the expected routing. Short post-routing refinement improved
some eye measurements but did not recover the unchanged 90% high-resolution
retention requirement within its one-second allowance. These rejected trials
remain available for diagnosis; they are not claimed as improvements.

The diagnostic runtime builder now copies the production implementation. Its
obsolete predicate replacement and default-changing patch were removed; the
same isolated symmetry and projection tests exercise the actual shared rule.
See the [follow-up measurements](consistent-geometry-fitting.json).


Reproduce the focused contract checks and the native photograph benchmark:

```sh
node --test --test-concurrency=1 scripts/inverse/final-return-repair.test.mjs
npx vitest run --maxWorkers=2 src/lib/inverse/shortReturns.test.ts
INVERSE_SPEED_OUT=tmp/consistent-hunodan-replay INVERSE_SPEED_SECONDS=10 \
  node scripts/inverse/hunodan-speed-benchmark.mjs
```

Use a fresh benchmark directory. Its historical acceptance baseline includes
the owner's matching-sheet allowance; compare the recorded per-case errors
against the most recent validated run as well as checking its pass count.

## Repair eligibility and time reserved for validation

The follow-up restores the sloth routing regressions without changing source
pixels or final geometry, feature, image-error and paper limits. Three causes
were separate from crop quality:

- A four-warning eligibility cap rejected six diagnostic records on only two
  or three cutting paths. Repair scope now counts affected cuts, at most four.
- The return checker reports bounded lists of witnesses, not the narrowest
  gap on a cut. Exact subdivision changes which witness appears first, so a
  15% reported-deficit cutoff could reject identical geometry. That cutoff is
  removed from repair eligibility; the observed deficit remains diagnostic.
  The separate visible-chain trace-order heuristic retains its own threshold.
- Complete checkpoint checks need more time than the former 700 ms local
  repair allowance. Repair can now use 1.5 seconds within the existing caller
  deadline, reserving 250 ms for final audits. When less than a second remains,
  the fitter avoids repeating a failed initial projection after just one
  gradient step. With more time, or after a successful initial projection, it
  retains the ordinary retry. All checkpoints still validate geometry, and
  ordinary rollback remains active at the first step.

The intermediate 100 ms validation reserve let a late synthetic-control
proposal pass every check and then miss its recovery deadline. The larger
reserve keeps this work inside its existing phase instead of increasing the
overall solve budget. Checkpoint and audit operations are indivisible, so
these allowances are not a hard wall-clock guarantee on arbitrary hardware.

All **16 focused routing tests pass**. Fresh frozen and synthetic-control crops,
both one-pixel clearance shifts, the positive vertical shift, the mixed-model
crop and the Paint resampling case all recover checked templates. Their test
durations, including independent rendering where applicable, range from
7.51 to 9.49 seconds. The subdivision regression covers both clearance
fixtures in four representations and two reflections, **16 cases**: every
input remains correctly invalid, and every representation remains eligible
for a bounded repair attempt. Eligibility is never an acceptance certificate.

The gold-heart fixture now repairs its first sparse routing instead of needing
the earlier smoothing fallback. A captured fresh solve passes at 0.818125%
independent mask disagreement in 7.18 seconds; the final focused replay retains
the stricter-than-1.2% image assertion and passes in 7.21 seconds. Its regression
now checks sparse recovery and output quality without requiring the obsolete
route through the third trace.

Both saved sloth proposals, including the formerly rejected radius-0.3 route,
pass actual editable conversion, SVG serialization/reimport, editor geometry,
independent paper checks and feature checks. Independent mask disagreements
are 0.8608% and 0.8512%; the editable versions measure 0.8576% and 0.8432%.
A real crossing replaces the obsolete negative fixture and remains rejected.
The replay tool supports `--bounded=true` to exercise production repair rather
than only the standalone optimizer. These are saved-route measurements, not
fresh total-solve timings or physical assembly tests.

The [evidence record](bounded-routing-followup.json) pins sources, focused
results and the editable replay. Both complete native benchmarks and fresh
browser verification remain pending. The two shifted-bird eye-retention
regressions remain unresolved by the evidence in this follow-up.

The first full application run for `1059bad` passed 856 tests but caught an
anchor regression: unconditionally skipping the first-step projection lost a
useful image-preserving repair in a longer refinement. The retry suppression
is now limited to a failed initial projection with less than one second left.
The unchanged anchor regression passes again, including its strict image
improvement and actual Draw conversion. Full QA for the corrected policy at
`b18b263` passes **846/848 inverse tests**, all 857 application tests (one
existing skip), checking, lint and build. All 16 focused routing tests pass
again, and both repaired sloth pairs pass the actual editable-SVG replay.
All 840 captured source files retain their recorded hashes. Only the shifted
bird fails, at the unchanged 90% eye-retention assertion, with both ten- and
180-second allowances. The earlier failed application run remains recorded.
