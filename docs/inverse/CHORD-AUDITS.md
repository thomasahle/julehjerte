# Faster exact chord queries in paper audits

After the [paper-kernel work](PAPER-KERNELS.md), a production top-hat replay
still spent much of its time in refinement. Instrumenting the real WebKit
worker showed **63 paper audits consuming 12.9 seconds**, compared with
1.7 seconds for boundary gradients and 1.0 second for curve penalties.
The worker was still using the existing Wasm paper kernels.

The remaining audit cost includes exact chord queries near the two guarded
clearance thresholds. A lattice point can inspect many nearby chords. The
previous implementation constructed temporary vectors and recomputed the
same direction and squared length for every point/chord pair.

## Changes

Each audit now prepares the fixed terms once per chord. Its point queries use
scalar arithmetic in the same order as `segmentDistance`, including the
zero-length denominator and `Math.hypot`. The prepared records belong to that
audit; changing the cuts creates new records. There is no geometry-result cache.

The query also stops once its current distance is at or below `R - guard`.
At that point both the certain and possible core masks reject the centre.
Further chords can only decrease the minimum, so neither mask can change.
The actual minimum distance is not an output of this audit. This shortcut does
not approximate a positive clearance or accept a point before checking it.

EDT seeding, selection of points requiring exact refinement, nearby tiles,
guard widths, strict comparisons, connectivity and fold checks are unchanged.
Every nearby chord still receives an exact query unless a previous chord has
already proved that both masks reject this centre.

## Measurements and rejected variant

The first version stored the prepared terms in arrays and destructured them
inside the query. It preserved all outputs but made the complete Node audit
benchmark **26.3% slower**. That version was rejected. A small scalar probe
was insufficient to predict the full-audit cost.

Named fields gave a **15.9% median paired reduction** in complete audit time.
Adding the early rejection raised the measured reduction to **22.0%**.
These are separate experiments; their timing percentages are not added together.
The final comparison uses `material.js` from Git at `6b672af` as its reference,
with the same numerical dependencies and fixed input geometries. All **64
complete reports and maps match exactly** over three alternating-order rounds.
Only elapsed time is excluded from equality.

| Fixed audit inputs | Cases | Previous median | Current median | Median paired reduction |
| --- | ---: | ---: | ---: | ---: |
| Controlled shapes | 10 | 10.88 ms | 10.98 ms | −1.6% |
| Hunodan geometries | 22 | 71.23 ms | 52.42 ms | 30.4% |
| Free-border geometries | 32 | 45.80 ms | 38.49 ms | 16.8% |

The ten small controlled cases do not show a speed gain. The saved Hunodan and
free-border curves are validator inputs only, never initializers for fresh fits.
Timers include map creation, but exclude loading and explicit warmups. Initial
calibration of a new lattice-size bucket may fall inside its first timed audit.

Fifteen additional comparisons use five fixed geometries in each browser, with
four rotating policy orders after per-input warmup. Complete audit reports and
maps also match exactly there. Median paired reductions are **20.9% in Firefox
146**, **28.0% in Chromium 145**, and **15.1% in WebKit 26**.

In a second instrumented WebKit top-hat solve, the same 63 paper audits take
**6.6 seconds**. Total reported solver time falls from 23.7 to 17.3 seconds.
Mask disagreement and the 114 shared exported spans are unchanged. These are
separate profiled runs, not a paired timing guarantee; the deadline-dependent
fitter can perform different numbers of refinement steps.

## Remaining browser difference

A separate gradient probe found that packaged Firefox 146 runs the current
boundary kernel more slowly than its JavaScript equivalent: roughly 1.3 versus
0.64 ms on a three-cut grid and 11.5 versus 6.8 ms on a complex saved geometry.
Chromium and WebKit benefit from the existing Wasm gradient. The four probe
geometries produced identical gradient coordinates in all three browsers.
This patch leaves that backend choice unchanged; it targets the paper-audit
cost demonstrated by the full WebKit profile.

The attempted Firefox worker instrumentation did not return profiling counters,
so its whole-solve timing is not treated as a function-level profile. The
gradient comparison ran in an isolated browser page, and remains a diagnostic
for further work rather than proof of whole-solver savings.

## Fresh fits and regression coverage

All **22 regular Hunodan photographs** pass the existing release quality limits
and finish preparation, solving, validation and export within ten seconds in
Node 25.6.1 on an Apple M2 Pro. Median time falls from **6.45 to 5.53 seconds**, and the maximum
from **9.30 to 8.96 seconds**, compared with the previous release's recorded
batch. Twenty independently rendered mask errors are exactly unchanged and
two improve; none increase. Photograph decoding and the separate exported-curve
replay are excluded from the solver timer in both batches.

All **32 free-border perturbation cases** pass the unchanged image, geometry,
paper and export gates, with a **4.76-second median** and **8.20-second maximum**.
Maximum protected-motif disagreement stays at **0.409%**. The cases cover two
motif sizes, colour inversion, translation and noise in the editable border.

New regressions compare prepared chord queries with the previous implementation
at projections and endpoints, on degenerate chords, and across 10,000 varied
queries. They require identical floating-point results and check that re-preparing
a chord observes edited endpoints. Existing full-map regressions continue to
cover passing, failing and uncertain cores, changing widths and resolutions,
shared cuts and independent fitted sheets.

The complete suite passes **718 application tests and 219 engine tests**.
Lint is clear, Svelte checking reports zero errors and seven existing warnings,
and the production build succeeds.

All **24 production browser workflows** pass across Chromium, Firefox and
WebKit, along with a further Chromium star replay that blocks the Wasm download.
These exercise the real worker, conversion into editable curves, exact shared
spans, the editor's crossing/spacing rules and SVG export; the star exports PDF
too. The Firefox hat preview and WebKit editable hat were visually inspected.

The normal WebKit matching-hat workflow drops from **25.68 to 19.52 seconds**
including editor conversion, with unchanged error and 114 shared spans.
Its independent-sheet version drops from 11.68 to 10.75 seconds and improves
mask agreement. Browser solve times still exceed the separate Node benchmark
on some motifs. Per-case timings are retained, including cases that run slower.

[CHORD-AUDITS-VALIDATION.json](CHORD-AUDITS-VALIDATION.json) records the checks,
measurements, complete-report hashes, rejected variant and profiling evidence.
All **48 served engine files** match the source used by the final benchmarks.

```sh
node --test scripts/inverse/chord-distance.test.mjs scripts/inverse/material-kernel.test.mjs
node scripts/inverse/material-kernel-benchmark.mjs --reference=6b672af \
  --output=tmp/chord-exit-benchmark
INVERSE_PAPER_REFERENCE=6b672af node scripts/inverse/material-browser-benchmark.mjs
```
