# Avoid full distances for already separated geometry

Profiling the dense floral checker found substantial time in bounding-box
distances used only for rejection. Clearance, intersection, self-intersection
and nearby-curve queries computed a Euclidean distance even when separation
along one axis already exceeded their cutoff.

The geometry helper now returns that sufficient lower bound when an axis
strictly exceeds the cutoff. Otherwise it uses the original `Math.hypot`
calculation, including equality and nonfinite input handling. The public
`boxDistance` still returns the complete distance. Pair order, contact
tolerances, segment-distance calculations and early-stop values are unchanged.

This changes the cost of a check, not the acceptance rules, fitting budget,
crop, classification or candidate scheduling.

## Equivalence and timing

Four regression tests compare exact outputs with the previous full-distance
predicates: near-contact boundaries, folded/random paths, nonfinite inputs and
the floral photograph's actual cutting paths. They compare hit ordering and
early-stop distances as well as Boolean decisions.

The reproducible microbenchmark interleaves both implementations, verifies
identical outputs before timing and records source/fixture hashes. Its
historical geometry module is loaded without modifying either checkout; the
shared Bézier primitives must match that revision exactly.

```sh
node --test --test-concurrency=1 scripts/inverse/box-pruning.test.mjs
node scripts/inverse/box-pruning-benchmark.mjs \
  --baseline=2a147c7 --output=tmp/geometry-pruning.json
```

On the recorded seven-repeat replay, median query times are:

| Query batch | Before | After | Speedup |
| --- | ---: | ---: | ---: |
| Inter-cut clearance | 27.485 ms | 13.376 ms | 2.05× |
| Intersections | 31.690 ms | 11.235 ms | 2.82× |
| Self-intersections | 2.956 ms | 1.360 ms | 2.17× |
| Nearby curves | 0.114 ms | 0.080 ms | 1.44× |

These are batches of geometry queries on one saved cutting pair, not timings
for reconstructing a photograph. Each repeat averages ten batch executions.

## Regression replay

The full photo pipeline remains **24/31 accepted**, with the same passing
cases and unchanged effective crops, source pixels and classified/fitting
mask hashes. Three cases have no crop and four reconstructions fail. The
fifteen clipped and one obscured inventory entries remain excluded.

The three dense checkers improve by 0.059–0.096 percentage point in independent
export disagreement in this timed run. Some other cases increase slightly;
the largest increase is the gingerbread's 0.029 percentage point. Faster
predicates preserve each geometry query, but can change how much work fits
before a deadline. This replay does not claim coordinate-identical final
templates or uniformly lower image error.

All **22 regular Hunodan designs** pass with exactly unchanged errors. The
maximum preparation/solve/validation/export time is **8.306 seconds**, compared
with 8.706 seconds in the preceding run. Image decoding and the independent
external replay are excluded from that interval.

All **755 inverse tests and 855 application tests** pass, with one existing
application skip. Type checking, lint and the production build pass; the seven
existing type warnings and one existing lint warning remain.

## Whole-solve limitation

A Node CPU-profile pair uses the same browser-captured floral mask and the
normal 180-second UI settings, including progress-candidate serialization.
It starts from pixels, not saved templates. Total solve/artifact time remains
26.88 versus 26.91 seconds; this is **not a demonstrated whole-solve speedup**.
Both results pass the existing checks, with engine mask disagreements of
1.894% and 1.874% respectively.

The retained finer-paper alternative still permits up to 25 seconds of routing
comparison. Faster geometry lets the timed search perform more work. Reducing
that comparison needs separate evidence: later simpler layouts can improve
the maple leaf and candle. Their usefulness is not disproved by the dense
checker's unsuccessful extra layouts.

The raw profile pair and subsequent verification are retained under
`tmp/heart-learning/browser-search-v1/`. Neither this optimization nor the
local timing experiment resolves the remaining real-photo crop and fitting
failures.

The subsequent [verified-fit comparison](verified-fit-comparison.md) changes
the continuation policy separately and measures actual browser time savings
while retaining the maple leaf's byte-identical cutting geometry.
