# Feature recovery across browser runtimes

The live Hunodan anchor upload passed the previous Firefox replay, but took
31.388 seconds from clicking Find to Open in Draw becoming ready. Its first
two feature-recovery MILPs timed out, followed by three lengthy fresh-grid
refinements. Chromium and WebKit finished the same upload in about four seconds.

## Isolating the cause

The three browser uploads have identical input PNG bytes and identical 400 ×
400 prepared masks, with no weights. Rebuilding the first recovery graph in
each browser gives the same canonical MILP: 708 binary variables, 672 continuous
variables and 3,196 constraints. The SHA-256 of the serialized canonical model
is `11f440d5ed855a5cff6c93c1aece0a3978d28826eaa126c3ca4788fad7c94e37`.

Running that frozen model twice in each browser separates native solver work
from graph construction, loading and model creation:

| Browser | First native solve | Warm native solve |
| --- | ---: | ---: |
| Chromium | 0.529 s | 0.433 s |
| Firefox | 3.987 s | 3.967 s |
| WebKit | 0.551 s | 0.425 s |

All six runs stop at the first incumbent, with zero processed branch nodes,
2,443 simplex iterations and objective 2173.880716. Runtime loading takes
21–78 ms and model creation 2–10 ms. These measurements use the existing locally
hosted HiGHS 1.15.1 WebAssembly binary. For this input, the discrepancy is
runtime throughput rather than a different crop, mask or canonical model.
This does not establish the same cause for other images or machines.

The old recovery policy abandoned the first sparse graph after at most two
seconds and spent the remaining phase allowance on a much larger graph.
Commit `c60823a` gives the first graph 80% of the remaining recovery allowance;
the next graph receives whatever remains. A quick infeasibility result still
leaves its unused time available. The total recovery allowance, solver
objective, geometry checks and paper checks stay the same.

Two alternatives were measured but not adopted. The LP relaxation is faster,
but its integrality residual is 0.5, so it cannot be exported as cutting paths.
Removing bend penalties also finds feasible routings faster, but changes the
chosen paths. Those experiments do not establish equivalent image quality.

## A repeat exposed a separate acceptance bug

The first fresh Firefox upload with the revised allocation finished in 8.696
seconds and exported at 0.873125% source disagreement, versus the earlier
1.424375%. Two of three subsequent repeats also passed in under ten seconds.
The other repeat found a valid short-return repair, but discarded it at
1.002 seconds against the cleanup's one-second phase cutoff. Source error had
improved from 0.928125% to 0.8775%; returning the older curves caused the editor
to reject their small return. The failed replay is retained, not counted as a
successful solve.

Commit `7aacdf4` separates the refinement cutoff from the completion deadline.
The refiner still stops within its local allowance. A checked checkpoint may
finish source, symmetry and image-feature inspection before the overall solve's
export reserve begins. No additional optimization runs after that phase cutoff.
Both deadlines default to the same value for standalone callers.

The regression replays the saved anchor with a virtual clock jumping just past
the phase cutoff during a checkpoint. It requires further refinement to stop,
the improved repair to survive when the overall budget permits it, and the same
proposal to be rejected when the overall deadline has expired. The existing
editor-conversion regression and original-invalid-geometry rejection remain.

Raw diagnostics are in `tmp/firefox-routing-{models,native,lp,objectives}*`.
The initial live replays, including the failed acceptance, are retained in
`tmp/recovery-budget-firefox*`. The browser harness now records hashes of both
the recovery policy and MILP implementation alongside its other provenance.

## Final browser replay

All 33 workflows pass on the rebuilt `7aacdf4` source in Chromium, Firefox and
WebKit, including the star, matching/independent/Anti top hats, smaller free-border
motifs, the live anchor upload and editable exports. Three additional fresh
Firefox anchor uploads also pass, in 9.030–9.218 seconds at 0.8825% exported
source disagreement. The ordinary three-browser anchor replay takes 4.382,
8.898 and 4.321 seconds respectively; Chromium and WebKit retain 0.861875% error.
The forced-JavaScript Chromium anchor replay passes at 0.870625%.

The top-hat workflows retain their previous source errors and exact shared
spans. One separate small-hat Firefox result varies: 0.352478% source error
versus 0.335693% in the prior run, with four cuts per sheet instead of two.
Both have identical uploaded pixels, prepared masks and settings. The old
topology initializer timed out; the new replay finishes its integral LP seed
and returns that valid route, reducing click-to-ready from 10.627 to 4.969
seconds. Neither run invokes the feature-recovery or short-return branches
changed here. This existing dependence on runtime budgets is retained in the
measurements; browser outputs are not claimed to be universally identical.

## Frozen dataset verification

All 22 regular Hunodan crops pass the existing quality, geometry, paper and
ten-second criteria. Their exported template pairs are byte-identical to
`tmp/short-return-hunodan`, and their independently rendered errors are unchanged.
The serial run's median prepare/solve/validate/export time is 5.299 seconds and
its maximum is 8.115 seconds. As in the previous benchmark, image decoding and
independent export replay are outside that timer; it is separate from the
browser click-to-ready measurements above.

All 32 free-border cases also pass: four motifs at two sizes, each tested as
original, colour-inverted, shifted and with noise in the free region. Their
exported pairs and independent protected-source errors are unchanged from
`tmp/short-return-weighted`. The median is 4.612 seconds and the maximum is
7.816 seconds. All 54 frozen cases therefore retain their prior geometry and
image fidelity while satisfying the existing ten-second criterion.

The full release checks pass: 842 application tests and 496 engine tests
(1,338 total; one optional application test skipped), lint and production build.
Svelte checking reports zero errors and seven existing warnings. All 63 served
engine and worker files match the committed source byte for byte.

[RECOVERY-BUDGET-VALIDATION.json](RECOVERY-BUDGET-VALIDATION.json) records the
measurements, source provenance, rejected experiments and artifact hashes.
The checked preview is at <http://127.0.0.1:5232/en/editor/paint/>. All changes
are local commits on `codex/solver-initialization`; nothing was pushed or deployed.
