# Reusing spline initialization work

The direct fitter now reuses its spline projection calculations across starting
grids. It still initializes every count hypothesis, both colour phases and the
same uniform, border-informed and separable proposals. No count pruning or new
visitor setting is involved.

The projection matrix depends only on the sample resolution and spline size,
not on the photograph, sheet, slit count or current row positions. Its
construction is now shared by the reference and cached implementations. The
cached path records Gaussian-elimination operations, including pivot order,
and applies those same operations to each new right-hand side. This preserves
floating-point arithmetic order; it does not substitute an approximate inverse.
The cache is bounded to 16 matrices.

The initializer also stops at an exactly repeated state with the same sheet
update order. Since that update order alternates, equality with the preceding
round alone is insufficient. The same-parity check proves a deterministic
cycle whose remaining rounds cannot improve the retained seed.

`sharedWork: false` retains the reference implementation for measurement. The
historical `all`, `border-consensus` and `race` benchmark policies explicitly
request it, so changing the public default does not silently change those
comparators.

## Initialization replay

On all **91 frozen targets**, the new default preserves every seed's control
coordinates and score exactly. Both phases, every count and all selected
finalists are retained. This includes the 22 regular Hunodan photographs, six
one-pixel crop shifts, harder web and collage crops, individual photographs,
user examples and three synthetic silhouettes.

The fresh paired replay measured median initialization times of **0.953 s** for
the reference and **0.817 s** for shared work. The median paired reduction is
**15.4%**. Each input/policy ran once, serially, with alternating policy order,
on an Apple M2 Pro using Node 25.6.1. The earlier independent experiment also
found exact seed equality in 182 paired runs and a 15.1% initialization saving;
see [COUNT-STRATEGIES.md](COUNT-STRATEGIES.md).

These are fixed preparation outputs from the earlier corpus. Crops and colour
estimates are held identical between policies; they are not ground truth, and
this experiment does not re-evaluate the crop detector or newer preprocessing.
An initialization saving is not the same as a complete-solve saving: later
refinement and matching may use the extra time within their deadline.

## Complete-solve comparison

The same 49 predeclared cases from the earlier experiment were replayed with
both policies. This comparison is frozen at `1045595`, before the subsequent
shared-cut repair. After the hat issue arrived, complete case/policy blocks
were resumed on an isolated checkout of that exact numerical commit; changed
fitter code was not mixed into the experiment.

Both policies pass **38/49**, with no gained or lost successes. Median elapsed
times are 8.574 s and 8.261 s; the median *paired* saving is only **0.9%**, and
the total elapsed saving is **2.8%**. Reusing initialization work reduces setup
cost, but the later deadline-based search consumes much of the time saved.

Final results need not be identical even with identical seeds, because the
remaining wall-clock budget determines how far refinement and matching run.
The largest image-error increase, **0.757 percentage points** on `hjfig-02`,
comes with a newly found identical pair and stays within the requested one-point
allowance. Other small error differences are retained in the per-case data;
this is not a claim of identical final curves or uniformly lower final error.

[SHARED-INITIALIZATION.json](SHARED-INITIALIZATION.json) records the source
hashes, settings, resume metadata and per-case outcomes, including whether the
selected sheets are identical. The later hat repair is described separately in
[SHARED-CUTS.md](SHARED-CUTS.md).

## Reproduction

Use the frozen corpus described in [COUNT-STRATEGIES.md](COUNT-STRATEGIES.md):

```sh
node scripts/inverse/count-strategy-benchmark.mjs --stage=initialize \
  --strategies=all,shared-work --corpus=tmp/count-strategies/corpus \
  --output=tmp/shared-initialization/initialize
node scripts/inverse/count-strategy-benchmark.mjs --stage=solve \
  --strategies=all,shared-work --corpus=tmp/count-strategies/corpus \
  --output=tmp/shared-initialization/solve
node scripts/inverse/count-strategy-report.mjs \
  --screen=tmp/shared-initialization/initialize \
  --solve=tmp/shared-initialization/solve \
  --output=tmp/shared-initialization/summary.json
```

Run timed comparisons without simultaneous builds, tests or browser solves.
The solver still runs its geometry, paper-core and feature checks. The complete
comparison separately renders the exported cuts to measure image disagreement.
Unit regressions check exact equivalence for unequal counts, both phases,
noisy and soft pixels, varying spline sizes and resolutions, warmed caches and
the complete default count search.

The later [fixed-image reuse comparison](INITIALIZATION-IMAGE-REUSE.md) also
shares resampled probabilities, validated weights and scoring data across
starting grids. It preserves 2,332 selected seeds exactly across 129 inputs,
including free-border perturbations and production browser masks.
