# Fewer temporary arrays during Bézier refinement

`curvePenalty` evaluates clearance, curvature, joins and short handles at every
refinement step. A sampled Node profile of a fresh 200-pixel free-border hat
attributed about 0.57 seconds to this routine in a 7.27-second fit. This is a
profile of one workload, not an estimate of the routine's share in every solve.

The implementation now accumulates the x and y forces directly instead of
allocating small tuple arrays in the clearance and join loops. Curvature
derivatives also use scalar variables instead of two temporary arrays per
quadrature point and cubic. Inserting a segment into a spatial bucket uses one
map lookup rather than a membership check followed by a lookup.

The arithmetic expressions, x-before-y accumulation order, nearest-segment
selection and map insertion order remain the same. This matters when multiple
controls refer to the same point: regrouping mathematically equivalent forces
can change rounding and send later optimization steps down another path.
No geometry-dependent cache or different fitting objective was introduced.

## Numerical and timing comparison

`scripts/inverse/curve-penalty-benchmark.mjs` imports the actual previous source
from `55701b7`. Its other engine dependencies must match the current checkout;
for browser runs, their served bytes must match too. Both implementations run
in Node, Chromium, Firefox and WebKit.

The matrix has ten geometries: three grid densities, the saved hat, a shared
corner, thin strips, a narrow neck, a reversed shared cut, collapsed handles
and trial curves outside the square. Each uses three clearance configurations
and three consecutive mutations of the same control buffer. Every scalar loss,
minimum radius and gradient coordinate must match using `Object.is`, including
signed zero. Returned gradients must remain independently owned, and neither
implementation may alter the input points or original graph.

All **360 numerical cases** pass. Equality is required between old and new
implementations *within each runtime*, not across different JavaScript engines.
Saved geometry supplies force-evaluation inputs only; fresh image fits do not
receive a previously fitted template.

An initial short-batch replay showed a slower WebKit warm-up on one dense grid
and insufficient clock resolution on tiny cases. The final harness records
256 warm-up calls separately, then calibrates equal-sized batches for the two
implementations. Six alternating-order rounds target at least 20 ms per batch,
bounded to 48–1,024 calls. Assertions and input construction are outside timers.
The earlier short-batch results remain in `tmp/curve-penalty-prototype/`.

On the saved hat, median time per penalty evaluation changes as follows:

| Runtime | Original controls, before → after | Perturbed controls, before → after |
| --- | ---: | ---: |
| Node | 0.404 → 0.350 ms | 0.407 → 0.354 ms |
| Chromium | 0.470 → 0.409 ms | 0.470 → 0.405 ms |
| Firefox | 0.500 → 0.458 ms | 0.500 → 0.469 ms |
| WebKit | 0.531 → 0.438 ms | 0.438 → 0.417 ms |

These are routine-level measurements on an Apple M2 Pro. They do not establish
an equivalent percentage speedup for complete fitting. Across the twenty timed
cases, the candidate is faster in all Node, Chromium and Firefox rows, and in
18 WebKit rows. WebKit's tiny reversed-shared fixture is approximately tied in
one position and about 6% slower in the other. Warm-up and raw round timings
are retained rather than treating every call as uniformly faster.

The tested prototype and committed `refine.js` are byte-identical. The final
batched replay is in `tmp/curve-penalty-batched/results.json`; it can be repeated
against the committed implementation without the prototype override:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
node scripts/inverse/curve-penalty-benchmark.mjs
```

`INVERSE_PENALTY_REFERENCE`, `INVERSE_PENALTY_CANDIDATE`,
`INVERSE_TEST_BROWSERS` and `INVERSE_TEST_OUTPUT` select a different reference,
candidate source file, runtime subset or artifact directory. This benchmark
fails if the numerical results or supposedly unchanged dependencies differ.

## Complete-fit timing check

The fresh free-border run had a slightly higher median than the previous
release run, despite the faster penalty routine. A separate comparison therefore
uses four fixed inputs and three alternating old/new pairs per input. Each fit
runs in a fresh Node process against one of two complete engine snapshots;
their only source difference is `refine.js`. Snapshot checksums and frozen mask
checksums are recorded. No fitted geometry is supplied as input.

All **24 fits** pass the existing image, geometry, paper and ten-second checks,
and every paired `cut_geometry.json` hash is identical. Median times are:

| Free-border input | Previous | Current |
| --- | ---: | ---: |
| Hat, 84% frame | 7.71 s | 6.80 s |
| House, 84% frame | 7.33 s | 7.27 s |
| Circle, 84% frame | 7.44 s | 7.60 s |
| Hat, 64% frame | 2.86 s | 2.91 s |

The candidate is faster in four of the twelve individual pairs. Total timed
work across those pairs is 75.47 seconds before and 74.50 seconds after, but
the mixed rows and run-to-run variation do not establish a uniform whole-solver
speedup. The supported claim remains a faster penalty calculation with retained
fitting quality and release time limits.

`scripts/inverse/curve-penalty-solve-benchmark.mjs` repeats this comparison. It
requires an empty output directory (`INVERSE_TEST_OUTPUT`) so earlier results
are preserved. Imports, process startup, fixture generation and the independent
renderer are outside each timer; preparation, fitting, validation and export
are inside. The original run is in `tmp/curve-penalty-paired/`.

## Fresh release verification

All **22 regular Hunodan photographs** and **32 free-border cases** pass.
Their independently measured errors and complete `cut_geometry.json` files
are unchanged from the previous shared-simplification release. This is byte
equality of the fitted geometry, not just a similar raster score. The free-border
matrix includes color inversion, one-pixel shifts and noise outside the protected
motif. All fits start from their masks or photographs without saved templates.

| Dataset | Median | Maximum |
| --- | ---: | ---: |
| 22 Hunodan photographs | 5.68 s | 8.82 s |
| 32 free-border cases | 4.89 s | 8.31 s |

The earlier medians were 5.88 and 4.69 seconds respectively. These separate
release runs also show why the routine's improvement should not be presented
as a general percentage reduction in total fitting time.

All **18 browser workflows** pass in Chromium, Firefox and WebKit, together
with a Chromium replay that blocks the actual WebAssembly request and verifies
the JavaScript fallback. The workflows check the final editable geometry,
preserved shared spans, conversion fidelity and downloaded SVG; the star also
exports PDF. The matching hat retains its 41 shared spans and 0.3206% protected
motif disagreement in all three engines. Its result was visually inspected.

The Firefox independent hat improves from 0.4420% to 0.2958% disagreement in
this fresh run; the other browser errors are unchanged. Timing-sensitive
selection can still differ between browser runs, so the report records that
change rather than claiming every browser output is byte-identical.

All **985 tests** pass (722 application and 263 engine). Lint and the production
build pass; Svelte checking has zero errors and seven existing warnings. All
52 tracked engine files served by the restarted preview match the verified
source. [CURVE-PENALTY-VALIDATION.json](CURVE-PENALTY-VALIDATION.json) records
source hashes, numerical comparisons, raw timing rounds, paired fits and release
results. The implementation is committed locally; nothing was pushed or deployed.
