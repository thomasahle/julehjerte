# Final export and the editor share the complete-cut return rule

Final engine validation and the editor now use the same normalized return
search. Before export, a bounded repair can move cutting controls to resolve a
return while retaining image fidelity, paper checks, requested symmetries and
already matching sheets. The fitter's cheaper intermediate geometry guidance
remains in place; this does not add the complete search to every optimizer step.

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
the editor margin. The regression covers both discrepancies. Intermediate
search guidance still uses the requested manufacturing settings.

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
requests the complete geometry rule inside refinement; ordinary fitting retains
its existing guidance and cost. The returned candidate must satisfy every
original gate, including a bounded displacement from the incoming controls.

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
