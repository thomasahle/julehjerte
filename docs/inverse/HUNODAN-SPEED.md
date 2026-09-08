# Ten-second reconstruction study

The target is **each of the 22 regular designs within 10 seconds**, with each
independently rendered image error at or below its release baseline in
`HUNODAN-VALIDATION.json`. Geometry, guarded paper-core and substantial feature
checks still apply. The integrated Node replay meets this target; browser verification is in progress.

The reproducible driver decodes the committed source photographs, crops out
the printed references, checks pixel hashes, and uses the frozen quadrilaterals
from `fixtures/hunodan/speed-crops.json`. Only the photograph pixels and crop
coordinates reach the fitter. Baseline errors are loaded by the scoring driver,
never passed to fitting.

```sh
node scripts/inverse/hunodan-speed-benchmark.mjs
```

Preparation, solving, validation and export count toward the 10 seconds. Image
decode and the external SVG renderer are recorded separately. `trials: 0`
matches the release benchmark; synthetic manufacturing perturbation trials are
outside this nominal reconstruction comparison.

## Initial findings

Simply reducing the old solver's budget to 10 seconds failed the target on all
three initial cases. The anchor preserved its release error but took 10.55 s;
the nested hearts and star became less accurate. Relaxing early acceptance also
raised many errors and is therefore disabled by default.

The first seed-focused full trial passed the combined target on **13/22**.
Sixteen retained the release error or improved it. Failures included a wrong
slit count, slightly worse contour fits, and time spent on validation or shared
cut recovery after the nominal search budget. Those are recorded failures, not
removed cases. Its artifacts are in `tmp/inverse-speed/seed-first-all`.

Numerical changes reuse dynamic-programming storage, skip already saturated
hyperbolic tangents, and reuse neighborhood candidates in the paper analysis.
The paper checks preserve complete output maps byte for byte on straight,
narrow-strip and neck fixtures, plus three photograph replays. Microbenchmarks
reduced their time from 196 to 107 ms, 148 to 100 ms, and 227 to 151 ms. These
figures isolate the paper check, not the full solver.

## Small MILP followed by Bézier refinement

We already use locally hosted **HiGHS 1.15.1 WebAssembly**, with a JavaScript
model builder. The experiment uses a coarser trace, eight connector neighbors
and one connector variant, then refines the selected curves against the original
photo probabilities. Source: `scripts/inverse/experiments/coarse-milp.mjs`.

```sh
INVERSE_HUNODAN_IDS=hjfig-05,hjhih-01,hjsta-02 \
INVERSE_SPEED_MODULE=scripts/inverse/experiments/coarse-milp.mjs \
node scripts/inverse/hunodan-speed-benchmark.mjs
```

The nested-heart problem had 774 binary variables and solved in 0.26 seconds.
Refinement improved internal original-mask error from 2.36% to 1.21%; independent
export error was 1.23%. End-to-end time was 3.88 s, but the release error is
0.71%, so this did not pass. The anchor and star graphs were infeasible and
rejected in 0.061 and 0.016 seconds. These were finite candidate-graph failures,
not HiGHS timeouts or proofs that the patterns cannot be woven. Coarsening must
preserve necessary routing choices before this approach can be reliable.

Complete experiment records are in `HUNODAN-COARSE-MILP.json`. The module is an
experiment and is not selected by the website. Further seed ranking,
original-resolution refinement and timing work is ongoing.

## Integrated Node replay

All 22 cases pass in `tmp/inverse-speed/native-integrated`: 3.47–9.49 seconds,
median 7.67 seconds. Every case retains or improves its release error; the
maximum is unchanged at 1.776%, and median error is 0.647%. All 22 keep their
release slit counts and pass geometry, guarded paper and feature checks.
`HUNODAN-SPEED-VALIDATION.json` records every result and its provenance.

The final policy completes every count/phase seed, gives the best three a short
grid refinement, then concentrates free-curve fitting on the strongest one.
Other candidates remain available if validation fails. A final original-mask
pass recovers detail lost at the smaller fitting scale. Shared-cut proposals
and matching templates must not increase original-mask error. The normal fast
attempt is capped at ten seconds even with a larger user budget; difficult
failed candidates can use the remaining budget for alternative initializations.

A 1,776-byte repository-owned WebAssembly kernel accelerates the unchanged
continuous boundary gradient. It uses double precision without fast-math, and
regressions compare both phases, backward handles and exactly shared curves
against JavaScript. The isolated calculation fell from 1.68 to 0.89 ms. A
JavaScript fallback remains available, and the result records its backend.
The geometry checks and external exported-curve renderer do not use the kernel.
Build source, command and checksums are in
`static/inverse/core/direct/native/PROVENANCE.json`.

Feature recovery returns the first fully validated HiGHS incumbent: optimizing
further changes hidden-cut complexity, while the traced visible mask stays
fixed. This reduced the anchor replay to 3.47 seconds at unchanged error. Its
reported MILP gap remains explicit; first feasibility is not claimed optimal.

All 258 tests pass. Type checking has zero errors and eight pre-existing
warnings; lint passes. Browser and production-build QA follow this checkpoint.
