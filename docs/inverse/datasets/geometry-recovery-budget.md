# Recover invalid geometry before reserving time for polishing

The fitter could stop its first curve refinement to reserve 1.7 seconds for
polishing, although every checkpoint still violated cut spacing. Polishing
requires a usable candidate, so that reservation could strand the search with
an invalid pair.

The ordinary cutoff now checks whether any geometric checkpoint exists. If
none does, the same refinement may use up to 1.25 seconds of its polishing
reserve to reach its first geometry-and-paper pass. It retains 450 ms for
polishing and the existing 1.3-second finalization reserve. The caller's search
allowance, five-step deadline checks and all acceptance rules are unchanged.
An existing geometric checkpoint, including uncertain paper awaiting finer
verification, keeps its previous cutoff and coordinates.

## Evidence and remaining failure

The preceding complete inverse suite finished with **1,064 passes and one
Viking failure**. Its ten-second solve returned 4.70625% independent mismatch
and failed geometry. The test did not save those exact cuts; it now captures
source arrays, returned cuts, report and the failing assertion after a failure.

Fresh Viking replays passed at ordinary speed and at 1.25× and 1.5× clock
scaling. A 2× clock exposed the reserve problem: only five curve updates ran
before stopping, with three pairs of cuts still too close together. The final
change uses the reserve in that replay, and independently parsed exports pass
both geometry and paper checks.

| 2× clock replay | 400-pixel mismatch | 800-pixel mismatch | Geometry | Paper |
| --- | ---: | ---: | --- | --- |
| Previous runtime | 6.800625% | 6.896719% | Fail | Not certified |
| Final change | 3.210000% | 3.384844% | Pass | Pass |

**The new result still fails the unchanged 3% image limit.** Visual inspection
also shows distorted borders and extra seams. It is a better legal fallback,
not a completed reconstruction. These are separate timed trajectories; the
controlled unit tests establish the scheduling behavior independently. Clock
scaling is a diagnostic, not an end-to-end speed measurement.

Five deterministic tests cover successful recovery, unchanged valid fits,
unchanged uncertain-paper handoff, expired admission and recovery expiry when
fixed cuts cannot move apart. All **32 focused tests**, **874 application
tests** (one existing skip), type checking, lint and build pass. All 1,046 source
hashes remain unchanged through those checks. The final recorded replay uses
the same runtime hashes.

The complete inverse run also passed: **1,070 tests, zero failures or skips**,
in 1,302.51 seconds. All 1,046 source hashes matched after the run. This includes
the previously failing ten-second Viking regression and all eight near-miss
perturbation checks. It does not erase the separate 2×-clock failure above.

The browser run passed all **22 regular Hunodan designs under ten seconds**
(median 5.60 s, maximum 8.59 s). Native and resized Paint errors were unchanged
from the previous run, with matching inputs, crops, settings and browser version.
This single-run comparison does not isolate a causal speed improvement.

Ten further hard-photo/example workflows passed. The remaining sloth case hit
a stale test assertion: it compared the native 250-pixel solver input with a
400-pixel Paint checksum. The harness now checks each at its own resolution,
retaining both frozen identities and all output-quality assertions. A follow-up
browser run passed **all six sloth variants and the vertical near-miss case**,
including independent editable geometry and paper checks. The original failed
run is retained; no production code changed for this test correction.

The bauble investigation still needs a crop correction: none of eight isolated
lower-edge sampling hypotheses produced a supported outline. Another speed
opportunity remains in the photographed star: its original, half-resolution
and JPEG inputs each spend about 12 seconds on rejected coarse MILP routing
before a successful grid fit. Neither issue is resolved by this change.

[Measurements, input identities and evidence hashes](geometry-recovery-budget.json).
