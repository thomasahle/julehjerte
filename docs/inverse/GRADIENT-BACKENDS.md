# Select the gradient backend by measured cost

The previous release always used the WebAssembly boundary gradient when the
module loaded. A browser probe found this kernel slower than JavaScript in
the packaged Firefox 146 used by QA. Chromium and WebKit benefited from Wasm.
This follows the runtime-dependent paper-kernel costs recorded in
[PAPER-KERNELS.md](PAPER-KERNELS.md), but gradient calls are short enough that
single-call measurements can disappear into a coarse browser clock.

## Selection and numerical behavior

The direct fitter now measures gradient implementations in batches of 16 calls.
For each workload bucket it first runs both implementations once, then times
two batches in alternating order. Every returned coordinate array must match
the reference JavaScript result exactly, including every intermediate array
in each batch. Equality checks run outside the timers. Wasm is selected only
when it is more than 10% faster in both timed comparisons. Otherwise the worker
keeps JavaScript. There is no browser-name rule or new visitor option.

The first calibration returns the JavaScript result. Later calls compute the
gradient anew using the selected implementation. The two existing gradient
formulas, polygon containment, quadrature and probability sampling are unchanged.
Shared boundaries still cancel before integration, and horizontal boundaries
retain their normal forces. Geometry, paper, matching-sheet and export checks
remain independent of backend selection.

Buckets group the number of visible quadrature points and the image area by
their base-two magnitudes. Up to eight timing records are retained. Each
`CurveGraph` also retains its last workload descriptor through a weak map,
because its topology stays fixed as the optimizer moves control points. Neither
cache retains a gradient, image, control array or fitted result. A graph changing
image resolution or quadrature receives a new descriptor.

The existing paper selector and the gradient selector share `measuredKernel`.
Paper operations keep their previous one-call timing batches and report fields.
An unavailable module falls back to JavaScript without locking in a premature
gradient choice. The internal forced-JavaScript and forced-Wasm options remain
available to tests. `numericalBackend` still reports module loading; the new
`boundaryKernels` report records actual gradient choices, separately from
`paperKernels`.

Calibration is additional work and belongs to the solve budget. A decision made
on one geometry also cannot guarantee optimal speed for every later geometry
in the same bucket. The measurements below distinguish steady-state kernel
cost from complete image solves, which include calibration.

## Regression coverage

Fake-clock tests demonstrate that batching resolves sub-clock work. They cover
coarse/tied clocks, inconsistent gains, a wrong result in the middle of a batch,
separate workload keys, changed input values and bounded retained records.

Gradient tests require exact equality across both phases, several image
resolutions and quadratures, shared segments and backward handles. They move
control points, invert the probability image and change phase after selection
to check that the current input is used. Explicit forced-Wasm tests continue
to exercise that implementation even when automatic selection chooses JavaScript.
Existing weighted-loss tests cover ignored borders and analytic normal forces.

The standalone browser benchmark compares the previous dispatcher from Git at
`4550269`, forced JavaScript, forced Wasm and automatic selection. It uses five
fixed geometries, two image sizes and both phases in each of three browser
engines. Every timed array is compared exactly, over four rotating policy
orders. Timers include polygon indexing and dispatch, but exclude loading,
warmup, calibration and result comparisons. Saved hat geometry is a derivative
fixture here, never a seed supplied to a fresh image fit.

All **60 browser cases match exactly**. For each case, taking the median of
its four timings and then the median current/previous ratio across the 20
cases gives **0.520 in Firefox 146**: about **48% less gradient-call time**.
Chromium 145 and WebKit 26 both have a median ratio of **1.000**. Their ratios
of summed case medians are 1.003 and 0.993 respectively, consistent with little
change to the steady-state cost. Firefox's corresponding ratio is 0.542.
These timings exclude calibration and are not whole-solver speed claims.

## Whole-solve timing qualification

The first full Hunodan replay passes all 22 existing release quality limits and
the ten-second limit, with a 5.98-second median and 9.45-second maximum. Twenty-one
mask errors are unchanged from the previous release; `hjhih-04` increases by
0.0175 percentage points while remaining below its release ceiling.

That case had already selected its gradient workloads in earlier cases, so it
did not pay for a new calibration. Its recorded grid initialization and fitting
stages rose from 0.95 and 0.79 seconds to 1.35 and 1.47 seconds. This is evidence
of variation outside the changed gradient stage, not an established explanation
for all the timing or image-error differences. The complete original batch is
retained. Kernel timing gains alone are not presented as proof that every
whole-image solve becomes faster.

A fresh-process replay of `hjhih-04`, including calibration, takes 9.42 seconds
and reports 0.7679% disagreement. It passes the same release gate and is closer
to the previous replay's 0.7653%; both new measurements are retained. This
remains a deadline-sensitive fitting result, not a claim of exact whole-solve
reproducibility.

All 32 free-border perturbation cases also pass the unchanged image, geometry,
paper and export checks: median 5.20 seconds, maximum 8.40 seconds, and maximum
protected-motif disagreement 0.409%. The previous recorded median was 4.76
seconds; these separate Node batches do not establish a whole-solver speed gain.

The complete suite passes **718 application tests and 223 engine tests**.
Lint is clear and the production build succeeds. Svelte checking reports zero
errors and seven existing warnings.

All **24 production browser workflows** pass across Chromium, Firefox and
WebKit. A further Chromium star replay blocks the Wasm download and passes
using JavaScript. The workflows exercise the real worker, editable conversion,
exact shared spans, the editor's crossing/spacing rules, SVG export and the
star's PDF export. The Firefox hat preview and editable drawing, plus the
Chromium star preview, were visually inspected.

The Firefox top-hat workflow takes **25.70 seconds**, down from 26.70 seconds
in the previous recorded run, with exactly the same exported-mask error and
114 shared spans. Several other workflows run slower. Three browser mask errors
improve and two increase: the WebKit independent hat by 0.0142 percentage points
and its free-border house by 0.1072 points. All remain within their unchanged
quality gates. Every comparison is retained; the result is not presented as
uniformly faster or as exact whole-solver reproducibility.

The next performance issue is calibration overhead on short refinement runs.
Fixed batches resolve the coarse-clock problem but can spend more time than
needed on an already expensive individual gradient call. Future changes should
measure that startup cost separately and preserve the exact-equality requirement.

[GRADIENT-BACKENDS-VALIDATION.json](GRADIENT-BACKENDS-VALIDATION.json) records
per-case results, backend choices, before/after timings, source hashes and the
retained initial benchmark. All **49 served engine files** match the sources
used by the final benchmarks.

```sh
node --test scripts/inverse/kernel-choice.test.mjs scripts/inverse/native-boundary.test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 node scripts/inverse/boundary-kernel-benchmark.mjs
```
