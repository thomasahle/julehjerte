# Faster guarded paper-core checks

The [October clearance follow-up](datasets/paper-clearance-kernel.json) adds
native paper-mask classification with JavaScript fallback for ambiguous threshold
comparisons. Its current validation status is recorded separately. The timings
and suite counts below describe the initial distance/component-kernel release.

A CPU profile of a fresh `hjcur-04` solve showed that paper-core analysis used
roughly two seconds, beyond the time spent on curve-distance validation and
image gradients. The paper checks run at many refinement checkpoints, so this
work reduces the time available to improve the image under a fixed deadline.

The changes accelerate the existing guarded rolling-disk model. They preserve
its decisions and maps rather than reducing the resolution or weakening a gate.

## Discrete kernels

The existing freestanding WebAssembly module now also implements the squared
Euclidean distance transform and four-neighbour component labelling used by
the paper audit. Both follow the previous traversal order and tie decisions.
The transform retains the `1e12` sentinel for an empty seed set. Component
areas and significance thresholds are still calculated in JavaScript from
the returned integer counts, in the same arithmetic order as before.

The distance transform remains an accelerator for the existing paper model.
Near either clearance threshold, the audit still recomputes distances to the
actual cut polylines. Guard bands, fold intervals, anchoring, minimum feature
area and strict rejection of `uncertain` results are unchanged.

The shared numerical loader serves both the boundary-gradient adapter and the
paper kernels. Scratch-memory allocation is centralized; all returned arrays
own their data and survive later calls or memory growth. JavaScript remains the
fallback before the module loads, when loading fails, or when a paper kernel
is unavailable. The existing boundary-gradient entry point remains compatible.
Compilation uses float64 arithmetic without fast-math or fused contractions.
The Wasm binary grows from 1,776 to 4,148 bytes.

## Runtime selection

WebAssembly was slower in the packaged Firefox 146 used by our browser tests:
forcing it made the median complete audit about three times as slow. A probe
using the same binary without Playwright attached reproduced the slowdown.
The separately installed Firefox 155 instead ran both kernels faster than
JavaScript. Copying returned arrays accounted for little of the difference.
These observations establish a runtime-dependent cost; they do not identify
a specific compiler defect or justify disabling Wasm for all Firefox users.

The production default therefore measures each paper operation independently.
On the first sufficiently large lattice in each size bucket, it warms both
implementations and times two alternating-order comparisons. All outputs must
agree exactly, and Wasm must be more than 10% faster in both comparisons before
it is selected. Ambiguous timings, coarse clocks and mismatches retain JavaScript.
The first calibration returns the JavaScript result. Later calls run only the
selected implementation on the current input; they never reuse an old result.

Each operation retains at most eight small timing records, grouped by the
base-two size of the lattice. Lattices below 16,384 cells use JavaScript without
calibration. Loading failure does not lock in a decision before a kernel is
available. The solver report records these choices separately from the existing
boundary-gradient backend. Calibration adds startup work, so whole-solve
benchmarks include it even when repeated-audit timings exclude warmup.

## Fixed outer geometry

The capsule-shaped outer paper and its pixel-centre positions depend only on
physical width and lattice resolution. Previously every family at every audit
recomputed them, including a `Math.hypot` for every lattice cell.

An internal cache now retains the two most recently used `(width, resolution)`
grids. Changing cuts or clearance settings still recomputes cut distances,
core masks, components and pass/fail results. The cache exposes no mutable
arrays to callers and cannot accumulate a separate grid for every fitted heart.
The shared Wasm scratch memory retains capacity for the largest call so far.

## Exact comparison and timing

The complete-audit benchmark uses ten controlled geometries, 22 regular Hunodan
outputs and 32 free-border outputs from the previous release. These saved
curves are **inputs to validator comparisons only**, never starting templates
for a fresh image fit. Every map pixel, reported island area, fold interval and
decision is compared with `material.js` loaded from Git at `0a30976`.
Its numerical dependencies must match the reference before the benchmark runs.

All **64 cases match exactly** over three rounds with alternating policy order.
Only elapsed time is excluded from output equality. Timers include map creation;
kernel loading, input loading, equality checking and hashing are outside them.
Both policies are warmed on the first controlled case. A new size bucket's
calibration still falls inside its first measured audit; per-case medians use
all three rounds.

| Inputs | Cases | Previous median audit | Current median audit | Median paired saving |
| --- | ---: | ---: | ---: | ---: |
| Controlled shapes | 10 | 17.76 ms | 8.44 ms | 38.3% |
| Hunodan geometries | 22 | 99.35 ms | 72.73 ms | 26.5% |
| Free-border geometries | 32 | 73.06 ms | 45.92 ms | 37.7% |

The final comparison, including runtime selection, measures an overall median
paired saving of **36.3%**, on an Apple M2 Pro using Node 25.6.1. The earlier
combined comparison before calibration measured 36.8%. Separate comparisons
measured 19.5% for the kernels alone and a further 17.8% for outline reuse.
Independent timing runs are not added together as a speed guarantee.

Five complete audits were also compared in each browser, using four rotating
policy orders: the previous implementation, outline reuse with JavaScript,
outline reuse with forced Wasm, and the production automatic choice. All 15
rows match the previous reports and maps exactly. Each policy is warmed per
input, outside its timers. The median paired audit savings are **37.0% in
Chromium 145**, **15.1% in WebKit 26**, and **5.5% in packaged Firefox 146**.
The first two select Wasm for both kernels; Firefox selects JavaScript. The
earlier forced-Wasm Firefox regression is retained in the validation record.

## Fresh image fits

All **22 regular Hunodan photographs** pass the established release quality
limits and complete preparation, fitting, validation and export within ten
seconds. The final replay has a **6.45-second median** and **9.30-second maximum**,
compared with 7.61 and 9.53 seconds in the previous release's recorded replay.
Photograph decoding and the independent exported-geometry replay are excluded
from both sets of solver times. These are separate serial batches on the same
machine, not alternating paired full solves.

Compared with that previous replay, 17 mask errors are identical, two improve,
and three increase by **0.00066–0.00205 percentage points**. All remain below
their established quality ceilings. The fitter uses a time budget: identical
paper decisions do not imply identical amounts of curve refinement or exactly
identical final image error.

All **32 free-border fits** also pass the unchanged image, geometry, paper and
export checks within ten seconds: **5.12-second median**, **9.35-second maximum**.
They cover two motif sizes and the original, inverted, shifted and noisy-border
variants. Maximum protected-motif disagreement remains **0.409%**, the same as
the previous release.

## Regression coverage

Tests compare small distance fields with exhaustive brute-force distances and
larger fields with the original JavaScript transform, including empty, dense,
tall and wide grids up to 700 by 2,100 cells. Independent stack traversal checks
component membership, diagonal contacts and values adjacent to anchoring
thresholds. Returned arrays are checked after later calls grow and reuse memory.

Complete historical map hashes cover passing, failing and uncertain paper
geometries. Further hashes captured from `0a30976` check changing widths,
resolutions and cuts in both directions, forcing cache replacements. Existing
boundary-gradient regressions continue to check both colour phases, shared
cuts and backward handles. Fake-clock selection tests cover consistent gains,
coarse clocks, inconsistent gains, unequal results, changing inputs and the
bounded timing records.

The complete suite passes **718 application tests and 217 engine tests**.
Svelte checking reports zero errors and seven existing warnings; lint is clear
and the production build succeeds. At that revision, the freestanding kernel
rebuild is byte-identical with Homebrew LLVM 22.1.6 and has no imports.

The later ordered-grid loss kernel adds one `math.tanh` import, supplied by
JavaScript `Math.tanh`, to preserve the reference arithmetic. It accelerates
the pixel surrogate when paired measurements show a gain and identical losses,
predictions and gradients; other workloads retain JavaScript. Current numerical
comparisons and the still-failing Linux photo regressions are recorded under
`gridLossAcceleration` in [LINUX-CI-RECOVERY.json](LINUX-CI-RECOVERY.json).
The historical browser results below do not validate this later change.

All **24 production browser workflows** pass in Chromium 145, Firefox 146 and
WebKit 26. They import masks or photographs, solve through the real worker,
open the editable heart and export SVG; the star also exports PDF. Shared
engine spans must keep exactly the same controls on both editable sheets,
and the editor's crossing/spacing checks must pass. The top hat is exercised
with matching and independent sheets. Its solve-and-conversion times range
from **7.54 to 28.46 seconds** across these browser tests; the ten-second
Hunodan criterion above is a separate Node measurement.

A further Chromium star replay blocks the real Wasm request. It passes the
same workflow using JavaScript, including SVG/PDF export. The Firefox hat
preview and editable drawing, and the Chromium star preview, were also
visually inspected.

[PAPER-KERNELS-VALIDATION.json](PAPER-KERNELS-VALIDATION.json) records the timings,
output hashes, backend choices, retained earlier runs and Firefox diagnosis.
All **47 engine files** served by the final preview match the source hashes
from the final audit comparisons and fresh-fit benchmarks.

```sh
WASM_CLANG=/opt/homebrew/opt/llvm/bin/clang bash scripts/inverse/build-boundary-kernel.sh
node --test scripts/inverse/material-kernel.test.mjs scripts/inverse/paper-backend.test.mjs \
  scripts/inverse/native-boundary.test.mjs
node scripts/inverse/material-kernel-benchmark.mjs --reference=0a30976 \
  --hunodan=tmp/image-reuse-hunodan-replay --weighted=tmp/image-reuse-weighted \
  --output=tmp/material-calibrated-benchmark
INVERSE_TEST_URL=http://127.0.0.1:5232 node scripts/inverse/material-browser-benchmark.mjs
```

These improvements preserve the guarded discrete paper model, which does not
establish physical tear strength or assembly feasibility. The full fitter also
remains deadline-dependent: identical validation results do not force identical
final curves when more refinement can run within the available time.
