# Measure result readiness before QA bookkeeping

The previous Paint replay started a Node timer before Playwright's click and
stopped it after receiving a large result, writing three artifacts and checking
for the result button. Its `solveAndConversionSeconds` therefore included
driver scheduling, serialization and file writes. The discrepancy recorded in
[IDENTICAL-PAPER.md](IDENTICAL-PAPER.md) showed why that timer could not reliably
locate a slow stage in the application.

Timing version **2** uses the page's monotonic clock. A capture listener records
the actual **Find the cuts** click before the application handles it. A Worker
subclass forwards requests unchanged and records matching request/reply pairs.
After the solve reply, a mutation observer records the first visible, enabled
**Open in Draw** button. The driver waits for that milestone before collecting
the result or writing artifacts.

The new report replaces `solveAndConversionSeconds` with `timings`:

| Field | Measured interval |
| --- | --- |
| `clickToPrepareRequestSeconds` | Click to posting the mask preparation request |
| `prepareRoundTripSeconds` | Preparation request to its reply |
| `preparedToSolveRequestSeconds` | Preparation reply to posting the solve request |
| `solveRoundTripSeconds` | Solve request to its result reply |
| `resultToReadySeconds` | Result reply to the visible, enabled result button |
| `clickToReadySeconds` | Click to that result-button milestone |

All five stages must be finite, nonnegative and sum to the total. Raw page
timestamps are retained in `pageMarks`. The worker's own fitting duration is
recorded separately as `reportedFitSeconds`; it does not include all work in
the worker round trip. `captureSeconds` and `artifactWriteSeconds` use the Node
clock and measure subsequent QA work. Clock origins are never mixed.

Readiness is a **DOM milestone**, not a browser paint timestamp. The last stage
includes editable conversion, its mask comparison, DOM updates and observer
delivery. Worker round trips include transport and scheduling. The observer
itself also has a small cost; this does not claim zero-overhead instrumentation.
Image import, manual corner selection, later opening Draw and SVG/PDF downloads
remain part of functional QA, outside the result-readiness interval.

The observer retains prepared typed arrays without copying their pixels during
the interval. It converts them to ordinary arrays during collection afterward.
Requests are correlated by worker instance and request id, and a fresh click
resets pending observations. Import replies, stale workers and duplicate results
cannot end the current run. The hooks observe the normal application inputs;
they supply no counts, templates or solver answers.

## Regression coverage

Three deterministic tests use a page clock and controlled worker events. They
check that a delayed collection cannot extend readiness, a disabled or hidden
button does not finish a run, pixel serialization happens afterward, requests
and transfer options are forwarded unchanged, stale replies stay isolated, and
errors never become successful readiness. The same observer is injected into
the production browser replays.

The initial Chromium replay reached readiness in **2.17 seconds for the star**
and **10.58 seconds for the matching hat**. Subsequent capture took **0.60** and
**1.01 seconds** respectively; artifact writes took less than five milliseconds.
This demonstrates material bookkeeping time in those runs, not a solver
speedup. Historical version-1 totals cannot be converted into these phases
because their event timestamps were not recorded.

## Production hat measurements

The final matching-hat runs keep **114 shared spans** through editable SVG
export in every browser, with **0.4447% protected-motif disagreement**. Their
page-clock intervals are:

| Browser | Click to ready | Solve round trip | Result to ready | Later capture |
| --- | ---: | ---: | ---: | ---: |
| Firefox 146 | 21.882 s | 21.557 s | 0.104 s | 1.000 s |
| Chromium 145 | 10.077 s | 9.731 s | 0.076 s | 1.339 s |
| WebKit 26 | 15.893 s | 15.459 s | 0.119 s | 1.070 s |

The worker accounts for **96.6–98.5%** of the matching-hat readiness interval.
The result-to-ready stage is at most 119 ms in these three runs. This places
the remaining bottleneck inside the worker round trip; it does not identify
which fitting, validation or export operation within the worker is responsible.
The three durations are individual runs, not browser speed guarantees.

## Complete release checks

All **24 production browser workflows pass**: eight cases each in Firefox,
Chromium and WebKit. They exercise uploads, small and large free borders,
matching and independent hats, the star and a Hunodan photograph. Every output
passes the engine's geometry and paper checks, the editor's crossing/spacing
checks, the existing mask-error gates and SVG export. Star cases also export
PDF. A further Chromium star run blocks the Wasm download and passes with the
JavaScript fallback. All page-clock phases are ordered and sum to readiness.

Across the eight cases, median readiness is **13.80 seconds in Firefox**,
**5.56 in Chromium** and **8.39 in WebKit**. The largest result-to-ready
interval in the complete suite is **131 ms**. Median later result capture is
**0.94–1.01 seconds**. Those capture durations now sit outside the application
readiness interval.

Compared with the previous release replay, 18 exported-mask errors are
identical, five decrease and WebKit's small hat increases by **0.0061 percentage
points**. All remain within the existing gates. These are fresh runs of the
same engine; deadline and scheduling differences can affect selected geometry.
They are not evidence of an algorithm change in this timing-only commit.
The Firefox hat preview and drawing, and Chromium star preview, were visually
inspected; the repaired shared hat sections remain invisible in the weave.

All **718 application tests and 233 engine tests** pass, including the three
new observer regressions. Lint and the production build pass. Svelte checking
reports zero errors and seven existing warnings.

All **49 served engine files** match the previous release and the workspace.
The 22/22 Hunodan and 32/32 weighted-border Node benchmark results are therefore
retained from [IDENTICAL-PAPER.md](IDENTICAL-PAPER.md), explicitly as previous
measurements; these benchmarks were not rerun for the QA-only change.
[BROWSER-TIMING-VALIDATION.json](BROWSER-TIMING-VALIDATION.json) records every
new browser timing and quality result, the comparison, source and artifact
hashes, smoke runs and reused Node evidence.

The subsequent [boundary-value preparation change](BOUNDARY-VALUES.md)
addresses repeated image integration inside the worker, with fixed-input
comparisons and new complete image and browser replays.

```sh
node --test scripts/inverse/paint-observer.test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 \
  INVERSE_TEST_CASES=star,top-hat,top-hat-independent \
  node scripts/inverse/paint-browser-test.mjs
```
