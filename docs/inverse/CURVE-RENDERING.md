# Faster mask checks for fitted curves

Shared-cut recovery needs to render many candidate pairs, including geometry
with long, exactly coincident sections. The combined renderer previously built
row bins, then ignored them and scanned every sampled segment for every image
row. It also scanned both copies of invisible, shared cuts.

The renderer now queries the row's bin and includes each unique cubic only if
its occurrence count is odd. This is exact cancellation in the binary weave,
not snapping approximately matching curves or concealing a gap. The
[shared-cut repair](SHARED-CUTS.md) still has to establish identical geometry
before cancellation is possible.

Every path's square closure remains present, including for reversed paths and
trial endpoints outside the square. Disconnected trial cubics fall back to the
complete sampled-path index because their polygon bridges the discontinuity.
Segment direction normalization, crossing arithmetic, half-open vertical
intervals and the strict pixel-centre comparison retain their old conventions.
Only sample bases and topology are cached; moving a control or endpoint always
recomputes its positions and raster.

## Keep individual paths in the gradient

Boundary forces query the other paths while excluding the path receiving a
force. Removing a shared pair from that index would erase information needed
by the gradient. The public `polygonIndex` therefore retains its complete
segments, bins and exclusion queries. The boundary objective and gradient
implementations are unchanged; only combined binary rendering cancels pairs.

## Reproduce the comparison

`curve-rendering.test.mjs` compares against complete closed polygons with a
full segment scan, including empty graphs, odd and even multiplicities,
reversed shared spans, nonmonotone cubics, right angles, pixel-centre ties,
nondefault widths, disconnected paths and moved controls/endpoints. It also
checks individual membership with path exclusions.

`curve-rendering-benchmark.mjs` loads the previous renderer from `105990e` and
requires its dependencies to match the current tree. Each fixed geometry is
rendered at 128, 256 and 400 pixels, with 24 and 48 samples per cubic. Both
colour phases and original/perturbed control arrays are checked. The browser
comparison verifies the served renderer's source hash before loading it.

Three policies isolate the changes: previous full scanning, row bins alone,
and row bins with shared-curve cancellation. After warmup, three rounds rotate
their order. Each policy repeats the four inputs for at least 16 milliseconds
per measurement, then normalizes its time to four renders. This avoids coarse
browser clocks rounding small renders to zero. Actual batch durations and
repetition counts remain in the report. Index construction and allocation are
included; every exact mask comparison and fixture loading are outside the
timer. Public path-index segments and bins must also be byte-identical, with
unchanged membership for every path exclusion.

The corpus contains fresh grids and committed regression geometry. If present,
the prior matching, independent and anti-paired browser hats are also included
from `tmp/anti-sharing-release-browser/chromium-*/cut_geometry.json`. The
report identifies every included case and hashes its geometry. These saved
fits are used only for rendering comparisons, never to seed a fresh solve.

```sh
node --test scripts/inverse/curve-rendering.test.mjs
INVERSE_RENDER_OUT=tmp/render-bins-node \
  node scripts/inverse/curve-rendering-benchmark.mjs

# Against a production preview of the current build:
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_BROWSERS=chromium,firefox,webkit \
INVERSE_RENDER_OUT=tmp/render-bins-browser-benchmark \
  node scripts/inverse/curve-rendering-benchmark.mjs
```

This comparison measures renderer cost. Fresh solver runs remain necessary:
fitting has other costs, and a time-limited optimizer may choose a different
checkpoint when an image check becomes faster.

## Verification

All **192** geometry/resolution/sampling/runtime combinations produced exactly
the previous masks and individual path indexes. Each runtime covered the same
eight geometries and six resolution/sampling combinations, with both phases
and original/perturbed controls. Median rendering speedups across those 48
combinations per runtime were:

| Runtime | Median renderer speedup |
| --- | ---: |
| Node 25.6.1 | 4.95× |
| Chromium 145 | 4.39× |
| Firefox 146 | 6.98× |
| WebKit 26 | 4.85× |

The initial four-input timing groups were too short for WebKit's clock: some
rounded to zero. Those timings were superseded by the repeated-batch results
above. The initial mask comparisons still passed. Each final timed batch lasts
at least 16 ms, and every generated output is compared outside the timer.

Fresh production solves on the Apple M2 Pro pass **22/22 regular Hunodan**
cases at their existing quality and ten-second gates: median **5.35 s**, maximum
**8.83 s**. All 22 independent image scores match the preceding anti-sharing
release. The **32/32 free-border** cases also pass: median **4.52 s**, maximum
**7.78 s**, with all independent protected-motif scores unchanged from the
preceding full 32-case run. These cover four shapes, two frame sizes, inverted
colours, a one-pixel shift and noise confined to zero-weight border pixels.
Geometry and paper checks remain enabled. Fresh timing comparisons are not a
randomized end-to-end A/B experiment, and the renderer ratios above do not
represent total solver speedup.

All **15 production browser workflows** pass across Chromium, Firefox and
WebKit: matching, independent and anti-paired hats, the star, and a Hunodan
photograph. The matching hat retains **114 exactly shared engine spans** in
each downloaded editable SVG, with **0.3206%** protected-motif disagreement.
The anti-paired hat retains **107**, with **0.3189%** disagreement. The harness
checks each shared span on both exported sheets, requested symmetry, source
image fidelity, editor crossing/spacing rules and the star's PDF download.
The JavaScript fallback also passes with the actual WebAssembly request
blocked. The matching hat's preview and editable drawing were visually
inspected: the interior hairline seams are absent. Matching-hat click-to-ready
times range from **10.00 to 16.95 s** in these browsers, separate from the Node
measurements above.

All **722 application tests and 253 engine tests** pass, with zero type errors,
seven existing warnings, successful lint and a production build. Lint was
rerun after improving the timing harness; runtime sources remained unchanged
through that rerun. All **50 served engine files** match the source hashes used
by the fresh Node benchmarks.
[CURVE-RENDERING-VALIDATION.json](CURVE-RENDERING-VALIDATION.json) records the
source, artifact and export hashes, timing methods and per-case results.
