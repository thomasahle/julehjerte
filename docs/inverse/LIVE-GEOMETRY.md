# Candidate cuts during fitting

Paint now draws the current candidate's cuts over the mask while fitting. Direct
Bézier checkpoints and validated MILP incumbents send the same `heartcurves-2`
geometry format used by exports. The final templates still pass the existing
geometry, paper, symmetry and image-fidelity checks before becoming a result.

The streaming implementation is in `65f7356`; browser and benchmark extensions
are in `eebbffe`, and the refinement-budget correction is in `670deb9`.
They are committed on `codex/solver-initialization`, which includes the
redesigned Paint interface through `456e628`. Nothing was pushed or deployed.

## Engine behavior

`progressGeometry` is a validated boolean setting, false by default. The Paint
bridge explicitly enables it. An older engine can ignore the unknown setting
and continue reporting numbers alone.

`progressReporter` owns one 250 ms interval for the entire solve. Nested direct,
topology and MILP searches reuse that reporter; changing routes does not reset
the limit. Serialization happens only after the rate check, using the solution
already constructed for checkpoint validation. No second rendering or material
audit is needed to produce a snapshot.

The geometry is a serialized string so it owns its coordinates. Later changes
to a candidate, rounding, or a progress listener cannot alter an earlier
snapshot. The reporter replaces `geometry` in a copy of the progress event;
the refiner's saved history retains its boolean validity flag. With the setting
off, reporting reads no clock and serializes no candidate.

Snapshots accompany `directRefining` checkpoints, including refinement of
image-derived topology. They are not emitted for coarse grids, clearance,
polishing or bare stage announcements. MILP snapshots require a validated
incumbent, including the configured paper-core gate. An immediate event after
validation covers searches that finish on their first valid incumbent.

A direct candidate may still be invalid or fit poorly: it is a view of the
search in progress. Its cuts are drawn in the editor's cyan and orange, with a
black halo. The existing receiver throttle coalesces messages that arrive
together after the main thread has been busy. The preview is cleared on
completion, cancellation or failure. Graceful stop with a best-so-far result
remains a separate, unimplemented hook; Cancel still terminates the worker.

## Verification

The new regressions check setting validation, zero serialization when disabled,
one rate limit across nested routes, owned snapshots, shared cuts and phases,
and matching snapshot/error pairs. A fixed-step refinement produces exactly
the same controls and history with and without streaming. Separate MILP tests
check publication immediately after validation and rejection by the paper gate.

The desktop and phone browser replay imports a fresh hat, drags the protected
frame, checks radio selection, cancels a search and starts again. It observes
real worker messages and canvas stroke calls, so receipt of geometry without
actually drawing both sheets cannot pass. Each viewport displayed 16 snapshots
over approximately five seconds, about 270 kB in total. Neither run recorded a
main-thread task over 50 ms between the first and last snapshot arrivals. Longer
tasks outside that interval are retained in the report; this is not a claim
that the entire workflow is free of long tasks.

The full release replay and per-case source hashes are recorded in
[LIVE-GEOMETRY-VALIDATION.json](LIVE-GEOMETRY-VALIDATION.json). Raw controls,
photograph, perturbation and export artifacts use `tmp/live-geometry-` prefixes.

All **1,049 tests** pass, with one optional fixture-recording test skipped.
Type checking has zero errors and seven existing warnings; lint and build pass.
All 18 browser export workflows, the JavaScript-fallback replay and both control
replays pass. The 18 browser exports match the previous release byte for byte.

The final dataset runs enable streaming and retain the ten-second limits and
independent exported-image checks:

| Dataset | Passed | Median | Maximum |
| --- | ---: | ---: | ---: |
| Regular Hunodan photographs | 22/22 | 5.91 s | 8.54 s |
| Free-border perturbation cases | 32/32 | 4.90 s | 9.82 s |

All 22 Hunodan exports and 31 free-border exports match the previous release
byte for byte. The inverted top hat at 84% differs by three protected source
pixels: six mismatches previously, nine now (0.0213% to 0.0319%). It passes the
existing quality checks, but is not an unchanged result. Complete runs use
wall-clock budgets and can select different checkpoints; the fixed-step
regression establishes unchanged refinement arithmetic, not identical
coordinates or uniformly faster performance for every timed solve.

## Budget issue exposed by Firefox QA

The first full browser replay passed the existing release gates but gave the
independent Firefox hat a worse result: 0.4562% disagreement instead of 0.2958%.
Its initial curve refinement lasted 1.744 seconds, compared with 3.569 seconds
in the earlier run. The counts, fine grids and clearance steps were unchanged.

The existing budget check replenished the first candidate only when fewer than
3.5 seconds remained in its fast allocation. That allocation also included up
to 0.8 seconds for clearance and 1.7 seconds reserved for polishing. Just above
the threshold, less than two seconds could therefore reach the curve optimizer;
a slightly slower initialization could cross the threshold and receive more
refinement time instead.

The check now subtracts those reserves before deciding whether to extend the
allocation. The extension remains bounded by the user's total time allowance.
Requests of ten seconds or less retain their original budget path.

A regression advances the initialization clock and models slower refinement
without sleeping. Before the correction, its first candidate stopped at step
154 after 2.055 simulated seconds despite a 30-second request. Afterward, it
receives at least 3.5 seconds or completes all 750 steps. The first browser
replay, the old-engine Firefox replay and the final corrected replay are kept
separately; the first replay is not presented as unchanged-quality evidence.
The corrected Firefox hat returns to 0.2958% disagreement and 30 shared spans,
with the live preview enabled.

```sh
node --test scripts/inverse/progress.test.mjs

PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
node scripts/paint/search-progress-browser-test.mjs

INVERSE_SPEED_SETTINGS='{"progressGeometry":true}' \
node scripts/inverse/hunodan-speed-benchmark.mjs

node scripts/inverse/weighted-solve-benchmark.mjs \
  --strategies=weighted --variants=original,inverted,shifted,free-noise \
  --progress-geometry=true
```
