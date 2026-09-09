# Reuse an audit when both sheets have the same paper inputs

A fresh WebKit hat profile spent **7.55 seconds in 63 paper audits**. The
auditor evaluated both unfolded sheets separately, including when they supplied
the same geometry to the guarded disk-centre calculation.

Each audit now prepares both sheets' unfolded polylines and fold endpoints
first. If every coordinate and endpoint is exactly equal, it computes the
paper core once and copies the result for the second family. Otherwise both
families receive the original calculation. Width, material settings and lattice
resolution are common to the two families within the call.

Equality is checked on the actual audit inputs, after flattening at the existing
geometry tolerance. It does not use a matching-sheet label, rounded key, mask
similarity or tolerance-based comparison. The guarded geometry model, distance
thresholds, connectivity rules and strict treatment of uncertainty are unchanged.

There is no retained audit-result cache. Every call derives its inputs from
the current solution, and both results own their map, dimension and fold-interval
arrays. Later edits to either sheet cannot inherit an earlier decision.

## Regression evidence

Four new tests cover separately owned result arrays, editing one sheet after
an earlier audit, equal fold endpoints with different interior curves, and two
straight cuts on opposite sides of a clearance threshold. In the last synthetic fixture,
the sheets differ by **0.000000002 mm** and must produce distinct core maps.
An approximate sheet-equality test would erase that distinction.

The expanded Node benchmark compares complete results with `6dea1a8`, including
every map pixel, fold interval, detached area and status. It covers **67 cases**:
12 controlled audits, the matching-hat fixture, 22 saved Hunodan pairs and 32
weighted-border pairs. All results match exactly, excluding elapsed time.
Controlled matching-sheet cases include both failure and uncertainty.

The matching-hat audit falls from **70.59 to 41.57 ms**, with a **41.1% median
paired saving**. Across all 67 cases the median paired saving is **5.7%**. Most
saved pairs in the corpus have different paper inputs and still require both
calculations. These are three alternating-order repetitions of fixed audits,
including maps, after warmup; they do not measure fresh image-fitting speed.

Saved cutting geometry is only an auditor input in this comparison. Complete
image workflows continue to initialize from their masks and receive no saved
templates.

An instrumented fresh WebKit hat replay makes the same **63 audit calls** before
and after the change. Their combined time falls from **7.55 to 3.47 seconds**;
the full browser workflow falls from **22.10 to 16.52 seconds**, retaining the
same exported-mask error and **114 shared spans**. The isolated context wraps
selected engine functions to record inclusive and exclusive time. These are
separate profiling runs; uninstrumented release workflows are checked separately.
The surrounding workflow timer includes result capture and artifact writes
before checking Draw readiness, so it is not a pure application-latency measure.

## Complete image benchmarks

All **22 regular Hunodan designs pass** their existing image, geometry, paper
and ten-second release limits. Preparation through validation and export takes
**5.60 seconds at the median**, down from the previous run's 6.15 seconds, with
a **9.08-second maximum**. Twenty-one errors are identical; `hjstr-03` improves
by 0.000664 percentage points. These serial Node 25.6.1 runs on an Apple M2 Pro
exclude photograph decoding and the additional independent export replay.

All **32 weighted-border perturbation cases** also pass the unchanged image,
geometry, paper and ten-second gates. Their median is **5.05 seconds** and
maximum **8.29 seconds**. Every protected-motif error is unchanged, with a
**0.409%** maximum. The previous complete batch had a 6.73-second median and
one 10.17-second timing failure, followed by a successful individual replay;
both earlier measurements remain in [CALIBRATION.md](CALIBRATION.md).

Whole-solve comparisons use separate runs, so scheduling, JIT and deadline
effects can also influence the differences. The alternating fixed-audit
comparisons isolate the cost of checking the same geometry more directly.

## Browser audit comparisons

All **24 complete browser audits** match the reference, including the controlled
failure and uncertainty cases. Four rotating policy orders compare the previous
auditor, current forced JavaScript, current forced Wasm and current automatic
selection. Each input and policy is warmed before measurement; loading and
external result comparisons are outside the timers.

For the matching-hat fixture, automatic selection gives:

| Browser | Previous median | Current median | Median paired saving |
| --- | ---: | ---: | ---: |
| Firefox 146 | 74.50 ms | 36.50 ms | 51.3% |
| Chromium 145 | 58.40 ms | 25.95 ms | 55.6% |
| WebKit 26 | 114.50 ms | 59.00 ms | 48.9% |

All **718 application tests and 230 engine tests** pass. Lint and the production
build pass; Svelte checking reports zero errors and seven existing warnings.

All **24 production browser workflows** pass, including uploads, real worker
solves, free-border weights, editable conversion, the editor's crossing/spacing
rules and SVG export. Star workflows also export PDF. A further Chromium star
replay blocks the Wasm download and passes with JavaScript. The Firefox hat
preview and drawing, and the Chromium star preview, were visually inspected.

The matching hat keeps **114 exact shared spans** through export and identical
protected-mask error in all three browsers. Its reported fitting time changes
from **25.20 to 20.25 seconds in Firefox**, **12.90 to 11.85 in Chromium**, and
**21.66 to 20.26 in WebKit**. These fitter times exclude later export and editor
conversion work. Twenty browser mask errors are unchanged. WebKit's small hat
improves by 0.0061 percentage points; its independent top hat, large hat and
house increase by 0.0478, 0.0877 and 0.0044 points respectively. Every case
remains within its unchanged quality gate.

The broader harness timings are also retained. Chromium's independent hat is
an example of their limitations: its reported fit changes from 7.07 to 6.99
seconds, while the surrounding timer rises from 8.97 to 15.20 seconds. That
increase is outside the reported fitting interval. The timer includes worker
result capture and three artifact writes before checking Draw readiness;
further timing instrumentation is needed to attribute the remaining difference.

[IDENTICAL-PAPER-VALIDATION.json](IDENTICAL-PAPER-VALIDATION.json) records every
comparison, backend timing record, profile, gate, source hash and artifact hash.
Repeated configurations and backend records use zero-based references into
their respective tables. All
**49 served engine files** match the sources used by the Node and browser audit
comparisons and the complete image benchmarks.

```sh
node --test scripts/inverse/identical-paper.test.mjs scripts/inverse/material-kernel.test.mjs
node scripts/inverse/material-kernel-benchmark.mjs --reference=6dea1a8 \
  --hunodan=tmp/adaptive-hunodan --weighted=tmp/adaptive-weighted
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_PAPER_REFERENCE=6dea1a8 \
  node scripts/inverse/material-browser-benchmark.mjs
```
