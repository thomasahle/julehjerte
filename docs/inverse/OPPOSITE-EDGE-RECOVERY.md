# Recover template topology when a photographed edge hides endpoints

The actual cropped upload of `danish-tree-group-right` exposed a failure beyond
corner detection. Its classified mask is recognizable, but the ordinary inward
profiles infer three transitions on the top, right and bottom edges, and only
one on the left. The tracing solver requires equal endpoint counts on opposite
edges, so both existing routing attempts fail before integer search. The browser
then spends 75–81 seconds fitting grids and returns a 1+1 pair with 5.250625%
engine disagreement. This is a different input from the full-photo benchmark,
whose automatic crop already permits a good 3+3 reconstruction.

The lossless captured input is committed in
[`browser-group-tree.json`](../../scripts/inverse/fixtures/browser-group-tree.json).
Its mask SHA-256 is
`5a60916399cc8036f9a416c3229b971efc28790636f620e765cc10f803d80d5f`.
The new recovery keeps this mask fixed. It does not move the crop, change the
classification, supply a known template, or ignore the original border pixels.

## A bounded set of starting geometries

After the established routing attempts fail, `oppositeBorderSeeds` checks whether
exactly one opposing edge pair has inconsistent counts. It tries extending
interior profiles on either edge of that pair, one edge at a time. The other
three edges retain the ordinary 3 mm border interpretation. New inset depths
increase by 1% of the square width, up to 8%; profile samples reach at most 16%
inside. Only proposals whose opposing counts agree remain candidates.

These masks are **initialization proposals**, not replacement image targets.
Tracing uses the existing 0.3 and 0.5 mm smoothing settings; seeds that already
differ from more than 5% of the original mask (or twice the requested final error
limit, if smaller) are rejected before MILP search. A routed pair still needs
ordinary geometry and paper checks before it can seed the common Bézier fitter.
The fitter, feature audit and final acceptance use every original mask pixel.
All final thresholds are unchanged.

The new profile proposals use the sparse connector graph. In a diagnostic trial,
densifying an earlier, less useful interpretation consumed the available budget
before reaching the successful one. Proved infeasibility advances to another
seed; a timeout does not establish infeasibility and does not trigger further
seed switching. The fallback shares the existing recovery budget and adds no
user-facing option.

The successful captured-input seed extends the left edge at 7% of the square
width and uses 0.5 mm tracing smoothing. Merely balancing the counts is not
enough: shallower 5% and 6% interpretations still yield infeasible sparse routing
graphs. The recovered geometry is refined against the unmodified input before
being returned. Thus this addresses both endpoint inference and template fitting;
it is not a claim that a larger border radius alone solves the problem.

## Verification

Unit regressions cover all four edge orientations, swapping the paper colours,
unchanged interior/source pixels, bounded edits, and no extra proposals when
opposite counts already agree. The captured browser-input regression runs fresh
initialization through exported cutting geometry and independent resvg rendering.
It requires a 3+3 pair below 2.5% disagreement, no missing protected features,
and passing geometry and paper checks.

The recovery deliberately remains limited: it does not repair two inconsistent
opposing pairs at once, and it cannot guarantee that a balanced endpoint model
has a valid routing. Passing image and material checks is not proof of recovering
unavailable ground-truth cutting paths or of physical assembly.


## Actual browser replay

Both Chromium 145 and WebKit 26 complete the previously failing upload, retain
all protected features, and pass conversion to editable templates and SVG export.
The source masks and automatic crop coordinates are byte-for-byte unchanged from
the preceding browser replay. Both browsers select 3+3 cuts.

| Browser | Previous Find-to-ready | New Find-to-ready | Previous engine error | New engine error | New editable SVG error |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium | 75.040 s | 6.119 s | 5.250625% | 2.376250% | 2.385000% |
| WebKit | 80.948 s | 6.711 s | 5.250625% | 2.376250% | 2.385000% |

The previous failed case stopped at the quality assertion before exporting, so
there is no previous editable-SVG error to compare. Engine scores are paired
with engine scores above. Timings are single serial runs, not latency percentiles.
All 14 selected browser cases pass, including the existing red/green trees,
Hunodan photo, both shared-cut hats and a photographed checker. The frame is
visibly restored; small protrusions remain near its upper corner.

The captured-mask perturbation probes also retain valid 3+3 pairs:

| Probe | Independent exported error | Preparation through export |
| --- | ---: | ---: |
| Flip six pixels on each outer edge | 2.398125% | 5.698 s |
| Swap both paper colours | 2.394375% | 5.095 s |
| Rotate the entire mask by 90 degrees | 2.511250% | 3.974 s |

The noise flips edge positions 20, 85, 165, 215, 285 and 370 on the 400-pixel
mask. Rotation maps output `(x,y)` to input `(y,399-x)`. These probes retain the
perturbed mask as their reference and check it is unchanged by fitting. They are
not claims of exact rotation-invariance or exhaustive robustness. External resvg
replay is excluded from the timing column.


## Corpus results and limits

All **22 regular Hunodan designs** pass with exactly unchanged independent
export errors. Preparation-through-export timing has a **5.156 s median** and
**8.446 s maximum**, excluding decoding and external rendering.

The full-photo corpus remains **11 candidate passes, 18 needing review and 15
without a crop**, across 44 instances from 20 source photos. All 29 generated
pairs pass geometry and guarded paper checks. Every source hash, automatic crop
and preparation record is unchanged. All 11 previously passing cases retain
exactly the same independent error; 26 of the 29 generated outputs have unchanged
errors overall.

Three needs-review cases vary under the existing timed search, without selecting
a new border-derived template:

| Case | Previous exported error | New exported error |
| --- | ---: | ---: |
| `vissevasse-arranged-r2c2` | 5.739375% | 5.741250% |
| `vissevasse-arranged-r3c4` | 5.843750% | 5.837500% |
| `vissevasse-arranged-r4c1` | 6.788125% | 6.648750% |

These still use grid seeds; their clearance or refinement step counts differ.
The last case still loses 24 protected regions. These variations are retained
rather than attributed to better routing or presented as solved motifs.

Three additional full-photo cases (`vissevasse-arranged-r1c2`, `r1c3`, `r4c2`)
reach new MILP graphs after balancing edge counts, but all those graphs prove
infeasible. Their final errors are unchanged. This separates two failure modes:
missing/inconsistent border endpoints, and an interior boundary graph that
cannot be routed by the available connectors. Neither is a proof that the
physical design is impossible. Two other cases consider deeper profiles but do
not reach an additional MILP attempt.

**845 application tests and 543 inverse tests pass**, with one existing
application skip. Type checking reports zero errors and seven existing warnings;
lint and production build pass. The 14 browser runs cover seven inputs in two
engines, including source-mask replay, editable conversion, retained shared spans
and downloaded SVG checks.

[Complete measurements, source hashes and paired outcomes](OPPOSITE-EDGE-VALIDATION.json)
include every case, failures and perturbations. Local visual artifacts are in
`tmp/opposite-edge-browser/` and `tmp/opposite-edge-web-all/report.html`.

Reproduce the committed fixed-mask regression and full photo tracks:

```sh
node --test --test-concurrency=1 scripts/inverse/border.test.mjs scripts/inverse/feature-refinement.test.mjs
INVERSE_SPEED_OUT=tmp/opposite-edge-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/opposite-edge-web-all
```

For browser QA, use a freshly built preview and your installed Playwright module:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_BROWSERS=chromium,webkit \
INVERSE_TEST_CASES=web-danish-tree-group-right,web-danish-tree-red,web-danish-tree-green,hunodan-hjfig-05,top-hat-preferred,top-hat-independent,web-bibel-checker-3 \
INVERSE_TEST_OUTPUT=tmp/opposite-edge-browser \
node scripts/inverse/paint-browser-test.mjs
```
