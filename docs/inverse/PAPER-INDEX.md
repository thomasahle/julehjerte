# Paper-support distance indexing

The paper audit now indexes cuts by the clearance thresholds they can affect.
This changes the work required to audit a candidate, without changing either
guarded core, its connectivity rules, or the final export checks. Implementation:
`421b3bd`; comparison baseline: `1501486`.

## Why this work

A profiled fresh solve of the inverted top hat at an 84% protected frame took
8.79 seconds. Refinement checked 63 proposals, with **zero exact repeats** of
their coordinate arrays. Caching checkpoint decisions would not help this case.
The 58 geometrically valid proposals spent 1.90 seconds in paper audits.
These are instrumented diagnostic timings, not a speed comparison.

The old audit collected cuts from the queried tile and its eight neighbours,
deduplicated those lists, then measured distances. Much of that geometry was too
far away to change either core. A trial bounding-box test inside the distance
loop preserved results but gave no useful overall audit improvement, so it was
not retained.

## What changed

Let `R` be half the nominal cutting width and `guard` the existing lattice and
flattening allowance. A paper centre belongs to the certain core when its
clearance exceeds `R + guard`, and the possible core when it exceeds
`R - guard`. Distances above both thresholds need not be distinguished.

Each chord is inserted into every tile intersecting its bounding box expanded
by `R + guard + geometryTolerance`. A query reads just its own tile's list.
The extra tolerance is conservative padding for the index; the exact chord
calculation and both acceptance thresholds remain unchanged. Every chord close
enough to change a core membership is included, with no duplicate entries.

The seed raster, distance transform, unfolded geometry, capsule outline,
component labelling, fold intervals and validity decisions are unchanged.
Index contents are rebuilt for every audited sheet. No previous candidate's
distances or approval are reused.

## Verification

`material-index.test.mjs` compares every centre's core membership with a
brute-force reference that measures distance to **every** unfolded chord. It
covers corners, thin strips, necks, oblique and outlying cuts, curved geometry,
different paper and lattice scales, and cuts within a billionth of a millimetre
of either guard. Existing tests retain complete historical audit maps, including
outlying trial geometry, exact sheet reuse and independent mutable outputs.

The complete-audit benchmark compares every field, fold interval and map pixel
against the preceding implementation; only elapsed time is excluded. Both
versions use the same dependencies. `--native=wasm` and `--native=javascript`
can pin the numerical backend, while the default `auto` measures normal use.

All 1,052 tests pass (778 application and 274 engine tests; one optional fixture
recording test skipped). Type checking reports zero errors and the seven
existing warnings. Lint and the production build pass.

The complete Node audit replay covers 67 geometries, including controlled
pass/fail/uncertain cases and all 54 prior benchmark outputs. Five alternating
rounds per geometry preserve every audit value and map pixel, both in automatic
mode and when both implementations are forced to use Wasm. Median paired audit
savings in automatic mode are 16.2% for Hunodan, 6.4% for the weighted fixtures,
and 17.2% for the saved matching hat. With Wasm fixed for both implementations,
those savings are 17.5%, 8.0% and 17.7%, respectively.

Fresh solves with live geometry reporting enabled retain the existing geometry,
paper and image gates and ten-second budgets:

| Dataset | Passed | Median | Maximum | Geometry versus preceding release |
| --- | ---: | ---: | ---: | --- |
| Regular Hunodan | 22/22 | 5.40 s | 8.80 s | All 22 byte-identical |
| Weighted free-border variants | 32/32 | 4.54 s | 8.04 s | 31 byte-identical; inverted hat improves |

The changed case is the 84% inverted top hat: six mismatched protected pixels
instead of nine (0.02126% versus 0.03189%). It reproduces the better result seen
before the preceding release's timed checkpoint variation. This is an observed
replay result, not proof that all future runs select the same checkpoint.
Hunodan's maximum was 8.54 seconds in the preceding release, so these dataset
replays do not establish a uniform end-to-end speedup.

An alternating fresh-process comparison covers the hat, inverted hat and circle
at an 84% frame, three pairs each. Both snapshots differ only in `material.js`;
every solve starts from the same fresh mask with live geometry reporting.
All 18 solves pass the existing gates and every pair exports identical geometry.
Eight of nine pairs are faster, with a **3.87% median paired saving**. One
inverted-hat pair is slower. These timers include preparation, fitting, final
validation and export, but exclude process startup, imports and the independent
export replay. This supports a modest overall improvement, not a promise that
every solve is faster.

All 27 complete paper-audit comparisons in Firefox, Chromium and WebKit match
exactly, including JavaScript and forced-Wasm implementations. All 18 Paint
export workflows also pass and retain the preceding release's cutting geometry,
source-mask error and exact shared spans. The additional Chromium anti-hat
replay with the numerical kernel blocked passes using the JavaScript fallback.
The ten-second dataset results above are Node measurements; Firefox's matching
hat still takes 16.15 seconds from clicking Find to the editable result.

[PAPER-INDEX-VALIDATION.json](PAPER-INDEX-VALIDATION.json) records the summaries,
served-source hashes, changed synthetic case, browser measurements and hashes
of the raw artifacts. The paired diagnostic harness is derived from
`scripts/inverse/curve-penalty-solve-benchmark.mjs` and retained at
`tmp/checkpoint-profile/paired.mjs`; it substitutes `material.js`, the three
stated inputs and enabled geometry reporting. Its hash is recorded alongside
the result hashes. The production preview is left running on port 5232.

## Reproduction

```sh
node --test scripts/inverse/material-index.test.mjs scripts/inverse/material-kernel.test.mjs scripts/inverse/identical-paper.test.mjs
node scripts/inverse/material-kernel-benchmark.mjs --reference=1501486 --rounds=5 --hunodan=tmp/live-geometry-hunodan-final --weighted=tmp/live-geometry-weighted-final --output=tmp/paper-index-audit
INVERSE_SPEED_OUT=tmp/paper-index-hunodan INVERSE_SPEED_SETTINGS='{"progressGeometry":true}' node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/weighted-solve-benchmark.mjs --strategies=weighted --variants=original,inverted,shifted,free-noise --progress-geometry=true --output=tmp/paper-index-weighted
```

Saved templates are inputs only to the audit microbenchmark. The Hunodan and
weighted fitting benchmarks start from images/masks and fresh initializations.
This remains the same guarded numerical paper model, with its existing physical
and geometric limitations; a faster audit adds no physical certification.
