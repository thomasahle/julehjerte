# Indexed tile lookup in the paper-core check

An instrumented Chromium replay of the matching free-border hat put 1.72 s
inside 64 paper audits, within a 9.36 s fit. This is diagnostic instrumentation,
not a clean end-to-end timing comparison. The same profile put 1.17 s in native
boundary gradients and 0.97 s in the curve penalty. Final shared-cut recovery
was already below a second in the preceding production browser replay.

The paper audit repeatedly locates nearby chords while classifying disk
centres. Its original index and neighborhood cache used `"column,row"` string
keys. Both now use array indexes in a padded grid around the unfolded capsule.
The pixel columns and rows are converted to tile offsets once per audit.
Candidate chord lists are still built lazily and discarded with that audit.

## Why the bounded index is sufficient

Pixel centres have `0 < x < width` and
`-width/2 < y < 5*width/2`. Every lookup queries its tile and the eight immediate
neighbors. The index reserves those ranges plus padding, with separate rows
and columns; neighbor offsets cannot wrap into another row. Segment bounding
boxes populate only the portion of the index that can be queried.

Each indexed chord retains its full original endpoints. Seeding, threshold
guards, near-threshold distance calculations, chord iteration order, component
labeling and fold measurements are unchanged. The existing early exit once a
point is outside both cores is unchanged as well. No clearance, paper mask or
audit decision is retained across calls. Changing cuts, width, resolution or
required clearance builds a new index.

The regression includes warped internal trial curves and cuts well outside
both sides of the paper. Their complete audit hashes were captured from
`d623294` before the change. The tests check both JavaScript and WebAssembly,
several widths/resolutions and reversed case order. Failing and uncertain
outputs remain failing and uncertain. These cases supplement the existing
pass/fail fixtures and the subnanometre guard-threshold regression.

## Reproduce the comparisons

```sh
node --test scripts/inverse/material-kernel.test.mjs \
  scripts/inverse/identical-paper.test.mjs scripts/inverse/chord-distance.test.mjs

node scripts/inverse/material-kernel-benchmark.mjs \
  --reference=d623294 \
  --hunodan=tmp/render-bins-hunodan --weighted=tmp/render-bins-weighted \
  --output=tmp/paper-tiles-final-comparison

# Against a production preview of the current source:
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_PAPER_REFERENCE=d623294 \
INVERSE_PAPER_HUNODAN=tmp/render-bins-hunodan \
INVERSE_PAPER_WEIGHTED=tmp/render-bins-weighted \
INVERSE_TEST_OUTPUT=tmp/paper-tiles-browser-comparison \
  node scripts/inverse/material-browser-benchmark.mjs
```

The fixed-geometry comparisons use saved templates only as audit inputs. Fresh
fitting still starts from the images and new grids. Every map pixel and report
field except elapsed time must match the previous audit. The browser harness
also checks the served source hash and includes a circle alongside the hats
and Hunodan examples; improvements on complex cuts alone would be incomplete
performance evidence.

## Verification and measured limits

All **67 fixed-geometry Node comparisons** and **27 browser comparisons**
preserve every audit field and map pixel, apart from elapsed time. The Node
corpus includes 22 Hunodan outputs, 32 free-border outputs, the reproduced hat
and 12 controlled cases. Browser checks use nine geometries in each engine,
including pass, fail and uncertain results, and compare the automatic,
JavaScript and WebAssembly paths.

Node's median paired audit-time reduction is **6.4%**. Among the seven
360-cell browser cases, median reductions are **16.6% in Chromium** and
**4.4% in Firefox**. WebKit is **1.1% slower** at the median in this run; its
straight and neck fixtures are about 15–16% slower. The full timing rows retain
these regressions and the two smaller 80-cell controls. The improvement is
modest and not uniform. These are complete-audit measurements, not total
fitting speedups.

The exploratory comparison also tried numeric maps and a dense neighborhood
cache backed by a map. The selected implementation uses arrays for both
indexes. Those experiments hold the backend at WebAssembly; the production
comparison uses the normal measured choice. WebKit's production report records
ambiguous component-kernel timings, including a 2 ms/2 ms comparison, and keeps
JavaScript for that operation. More reliable backend calibration is a remaining
performance opportunity; its contribution to the old/new timing difference
was not isolated here.

Fresh production fits pass **22/22 regular Hunodan designs**, with a **5.13 s
median** and **8.47 s maximum** in Node. All 22 independent error scores match
the preceding renderer release. The **32/32 free-border cases** also preserve
their previous scores, with a **4.60 s median** and **7.71 s maximum**. Existing
quality, geometry, paper and ten-second gates remain in effect. These fresh
timings are not a randomized end-to-end A/B experiment.

All **18 production browser workflows** pass across Chromium, Firefox and
WebKit: matching, independent and anti-paired hats, the star, Hunodan and circle.
The matching hats retain **114 shared spans** and **0.3206%** protected-motif
error; anti-paired hats retain **107 spans** and **0.3189%** error. Each shared
span survives in both sheets of the downloaded SVG. The JavaScript fallback
passes with the actual WebAssembly request blocked. The hat and circle previews
were visually inspected.

Fresh time-limited browser results need not be identical: Firefox's independent
hat changes from **0.4420% to 0.4562%** protected-motif disagreement while
passing all existing checks. The independent renderer and exported-geometry
measurements are retained rather than substituting the fixed-audit equality
claim for a claim about every newly fitted template.

All **722 application tests and 254 engine tests** pass. Type checking reports
zero errors and seven existing warnings; lint and the production build pass.
All **50 served engine files** match the source hashes in the Node benchmarks.
[PAPER-TILES-VALIDATION.json](PAPER-TILES-VALIDATION.json) records the comparisons,
fresh results, profiles, source hashes and exported-artifact hashes.

The subsequent [kernel-calibration investigation](KERNEL-CALIBRATION.md)
measures the ambiguous-clock opportunity directly. Longer paper calibration
remains optional after mixed results; exact numeric comparisons became cheaper
without changing the audit criteria or the production timing policy.
