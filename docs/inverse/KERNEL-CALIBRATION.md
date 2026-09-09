# Kernel calibration and exact numeric comparisons

The paper audit can use either JavaScript or WebAssembly. It measures both
implementations on the current input, checks every result for equality, and
requires more than a ten-percent native advantage in both timing orders. Only
bounded timing decisions survive subsequent calls; outputs are recomputed.

## Investigating ambiguous clock measurements

A coarse clock can hide a real gain. In a controlled regression, JavaScript
costs 1.2 ms and WebAssembly 0.8 ms, but integer-millisecond timestamps produce
a tie and an inconsistent second measurement. Longer batches resolve this.
The optional `quickDecision` policy retries zero, tied or inconsistent quick
measurements using an adaptive batch, retaining decisive quick results.
Every result in the longer batch must still match, and the call limit also
applies when the clock does not advance. This option is **not enabled in the
production paper audit**.

Complete-audit experiments at `98903f6` explain that decision. Always targeting 4 ms or
8 ms per batch added startup work without a consistent overall benefit.
Selective 8 ms refinement was cheaper, but its median first-plus-16-audit
cost increased by **3.0% in Firefox** and **4.0% in WebKit** in this run.
Node and Chromium improved by about 1%. These are paired measurements on
five fixed geometries, with four rotating-order rounds in each runtime.
The full initial experiment contains 320 policy observations; all complete
paper maps and audit fields agree.

## Reducing comparison overhead

Calibration compares large numeric fields repeatedly. Calling `Array.every`
with an `Object.is` callback for every scalar contributed unnecessary cost.
Dense typed arrays now use a direct loop with the same `Object.is` comparison.
The ordinary-array fallback retains sparse-array behavior. Regressions cover
subarray offsets, changes at every position, unequal lengths, mixed ordinary
and typed arrays, NaNs, infinities, signed zero, BigInts and detached buffers.
The comparison still checks every value; no tolerance or audit gate changed.

An isolated comparison loads both the selector and equality code from
`98903f6` for the reference, while keeping the paper-audit source identical.
Each policy gets fresh selectors for each geometry and round. First-audit
timers include calibration and equality checks; the next 16 complete audits
are timed separately. Loading, independent oracle checks and result comparisons
are outside the timers. Earlier returned maps are rechecked after later calls.

| Runtime | Median first-audit reduction | Median first + 16 audit reduction |
| --- | ---: | ---: |
| Node | 10.7% | 2.8% |
| Chromium | 13.2% | 2.5% |
| Firefox | -1.7% | -0.8% |
| WebKit | 6.2% | 1.3% |

Negative reductions are regressions. This is a modest, nonuniform improvement
in complete audit cost, not a claim of equivalent end-to-end solver speedup.
All 160 policy observations, comprising 2,720 timed complete audits, retain
identical paper maps and fields apart from elapsed time.

## Reproduce

```sh
node --test scripts/inverse/kernel-choice.test.mjs \
  scripts/inverse/paper-backend.test.mjs

# Use a production preview on the given port. The benchmark uses the committed
# hat fixture plus the Hunodan and circle snapshots from the paper-tile replay.
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_BROWSERS=node,chromium,firefox,webkit \
INVERSE_CALIBRATION_REFERENCE=98903f6 \
INVERSE_CALIBRATION_POLICIES=reference,legacy \
INVERSE_CALIBRATION_OUT=tmp/kernel-equality-calibration \
  node scripts/inverse/paper-calibration-benchmark.mjs
```

`legacy` names the current production single-call policy; `reference` imports
the named commit's implementation. Omitting the two calibration selection
variables compares the four timing policies. Set `PLAYWRIGHT_MODULE` when
Playwright is available outside the repository. Snapshot checksums, source
hashes and exact commands are recorded in
[KERNEL-CALIBRATION-VALIDATION.json](KERNEL-CALIBRATION-VALIDATION.json).

## Fresh fitting and shared-cut regression checks

All **22/22 regular Hunodan photographs** pass the existing ten-second,
image-quality, geometry and paper gates. Their independently rendered error
scores equal the preceding paper-tile release, with a **5.30 s median** and
**9.03 s maximum** in Node. Photograph decoding and independent export replay
are excluded from those times; preparation, fitting, validation and export
are included.

The **32/32 free-border cases** also retain their previous error scores,
with a **4.51 s median** and **7.79 s maximum**. These cover four silhouettes
at two sizes, colour inversion, a one-pixel translation, and noise restricted
to the editable border. Every fit starts from the input mask and fresh grids.
These runs establish retained quality and the speed limit; they are not a
randomized before/after comparison of overall fitting speed.

All **980 tests** pass: 722 application tests and 258 engine tests. Svelte
checking finds zero errors and seven existing warnings; lint and the
production build pass. No runtime code changed after the benchmark and build.

All **18 production browser workflows** pass in Chromium, Firefox and WebKit:
matching, independent and anti-paired hats, the star, Hunodan and circle.
The star's PDF export is checked too. Their image-error scores match the
preceding release. Matching hats preserve **114 exactly shared spans** and
**0.3206%** protected-motif disagreement; anti-paired hats preserve **107 spans**
and **0.3189%** disagreement. Every shared span retains its common controls
through the editor and downloaded SVG. The matching hat and WebKit circle
previews were visually inspected. The browser circle uses the fixed checker
border; the Node circle cases above use a free border.

The Chromium anti-paired hat also passes with the actual WebAssembly request
blocked, exercising the JavaScript fallback. All **50 served engine files**
match the source hashes used in the calibration comparison and fresh Node
fits. Browser timings include the UI workflow and remain different from the
Node benchmark; the ten-second claim above applies to the Node measurements.
