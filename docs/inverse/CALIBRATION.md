# Bound gradient calibration by elapsed time

This records the release at `6dea1a8`. The subsequent
[identical-sheet paper-audit change](IDENTICAL-PAPER.md) removes repeated work
inside a complete audit while retaining these calibration rules.

The gradient selector introduced in [GRADIENT-BACKENDS.md](GRADIENT-BACKENDS.md)
avoids a slower Wasm implementation in Firefox, but its fixed batches repeated
expensive calls unnecessarily. On the dense grid fixture, the old selector
spent roughly one second on its first call in Firefox before doing useful
optimization. This time counts against the image-fitting budget.

Gradient timing batches now stop after measuring at least four milliseconds,
or after 16 calls, whichever comes first. An individual call can exceed four
milliseconds; this is a measurement target, not a timeout. Two alternating
comparisons still have to show a greater-than-10% Wasm gain. Short calls can
still use 16 repetitions to resolve coarse clocks, and ambiguous measurements
keep JavaScript. Paper-kernel calibration retains its existing fixed batches.

The JavaScript and Wasm batches can have different lengths. Their costs are
normalized per call, and every sampled result must equal the same reference
array exactly before Wasm is selected. Equality checks remain outside timers.
Reports retain both repetition counts for each adaptive comparison. Tests cover
unequal lengths, a wrong intermediate result, report isolation, and a frozen
clock that must stop after the maximum number of calls.

No fitting objective, curve operation, geometry gate or export rule changes.
Shared cuts still use common controls after final selection; a small pixel-area
error alone does not establish that an invisible cut is aligned.

## Isolated browser measurements

The updated benchmark loads both the gradient dispatcher and its selector
from reference commit `a420139`. Each case imports a fresh dispatcher and
selector to reset backend choices. Module imports are outside the timers;
dependencies and the browser's JIT can remain warm between cases. These are
first-call calibration measurements, not cold-browser startup measurements.
The reference JavaScript result is computed before timing. The current and
previous first calls alternate order across cases. These timers include the
dispatcher's polygon index and its internal calibration equality checks; only
the benchmark's additional output comparisons are outside the timers.

Five fixed geometries, two image resolutions and both phases give 20 cases per
browser. All **60 cases produce exactly equal arrays and select the same
backend as the previous selector**.

| Browser | Previous median first call | Adaptive median first call | Median steady-state current/previous ratio |
| --- | ---: | ---: | ---: |
| Firefox 146 | 201.5 ms | 23.0 ms | 1.005 |
| Chromium 145 | 57.35 ms | 20.15 ms | 1.000 |
| WebKit 26 | 66.0 ms | 20.0 ms | 1.005 |

The steady-state column takes the median of each case's four timings, then the
median paired ratio. The corresponding ratios of summed case medians are
1.025, 1.003 and 1.017. This change reduces calibration cost; it does not speed
up a gradient once its implementation has been selected.

Small shared-corner fixtures still need all 16 repetitions and show no saving:
their first calls take roughly 3–7 ms, with some adaptive measurements slower
than before. The dense 400-pixel Firefox grid falls from 1002 to 92 ms in one
phase and 1022 to 92 ms in the other. Every case is retained in the validation
record; the medians do not imply that all inputs benefit.

## Complete image replays

These are serial Node 25.6.1 measurements on an Apple M2 Pro. Timers cover
preparation, fitting, validation and export; image decoding and the additional
independent export replay are outside them. Browser workflow timings below use
the actual worker and editor conversion instead.

The 22 regular Hunodan photographs pass their existing quality limits and the
ten-second limit: median **6.15 seconds**, maximum **9.13 seconds**. Twenty mask
errors match the previous release; `hjhih-04` improves by 0.0175 percentage
points and `hjstr-03` increases by 0.0040 points, remaining within its release
limit. These are deadline-sensitive fits, not exact whole-solve replays.

All 32 weighted-border perturbation cases retain exactly their previous
protected-motif errors and pass geometry, paper and export checks. Maximum
protected disagreement remains **0.409%**. Of those cases, **31 pass ten seconds**;
the small top hat with noise in the free border takes 10.17 seconds. Its recorded
CPU time is 4.58 seconds, initialization rises from 1.37 to 5.89 seconds, and it
makes no new gradient-calibration decision. This indicates a pause or scheduling
delay contributed to the result; it does not explain every timing difference.
A separate fresh-process replay takes **2.94 seconds** with the same motif error
and passes all gates. The original timing failure remains in the record.

These separate full batches do **not** establish faster complete solves. The
Hunodan median previously measured 5.98 seconds; the perturbation median rises
from 5.20 to 6.73 seconds. One whole-solve workload also chooses Wasm where the
previous run chose JavaScript. Its measurements are retained: a decision on a
brief initial sample cannot guarantee the fastest implementation after JIT
optimization or for every later geometry in that workload bucket. The controlled
comparison above supports reduced first-call overhead on the recorded fixtures.

## Release checks

All **718 application tests and 226 engine tests** pass. Lint and the production
build pass; Svelte checking reports zero errors and seven existing warnings.

All **24 production browser workflows** pass across Firefox, Chromium and
WebKit. They exercise uploads, the actual worker, free-border weights, Draw,
the editor's crossing/spacing rules and SVG export. Star cases also export
PDF. A further Chromium star run blocks the Wasm download and passes using
JavaScript. The Firefox hat preview and drawing, and the Chromium star preview,
were visually inspected.

The matching hat retains **114 shared spans** and exactly the same protected
export error in every browser. Its solve-and-conversion times increase in this
run: Firefox 25.70→27.16 seconds, Chromium 14.45→15.99 seconds and WebKit
23.40→24.38 seconds. These are further reasons not to claim a whole-solver
speedup from the isolated calibration measurements.

Twenty browser mask errors are unchanged. WebKit's free-border house improves
by 0.0691 percentage points. Three errors increase while remaining inside their
existing gates: Chromium's free-border house by 0.0505 points, WebKit's small
house by 0.0122 points, and WebKit's small hat by 0.0015 points. The contour
deviations visible at the matching hat's corners remain; exact hidden cuts do
not imply perfect recovery of the original silhouette.

[CALIBRATION-VALIDATION.json](CALIBRATION-VALIDATION.json) retains per-case
measurements, the timing failure and replay, backend choices, log hashes and
source hashes. Repeated whole-solve backend records are stored once and
referenced by zero-based indexes. All **49 served engine files** match the
sources used by the Node and browser kernel benchmarks.

## Reproduction

```sh
node --test scripts/inverse/kernel-choice.test.mjs scripts/inverse/native-boundary.test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_GRADIENT_REFERENCE=a420139 \
  node scripts/inverse/boundary-kernel-benchmark.mjs
```

The fixture geometries are only used for comparing gradient computations.
Complete image workflows start fresh and receive no saved fitted templates.
