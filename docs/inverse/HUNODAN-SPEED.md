# Ten-second reconstruction study

The target is **each of the 22 regular designs within 10 seconds**, with each
independently rendered image error at or below its release baseline in
`HUNODAN-VALIDATION.json`. Geometry, guarded paper-core and substantial feature
checks still apply. The integrated Node replay meets this target; browser validation and follow-up timing replays are complete.

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
warnings; lint passes. The production build and browser QA also pass, with the timing qualifications below.

## Browser QA and final connector refinement

The full Chromium batch met all error, geometry and paper requirements on
22/22 designs. Twenty finished below 10 seconds. Two timing overruns (10.13 s
and 11.54 s) passed replays at 6.89 s and 9.07 s. These are observed local
timings, not a guarantee for every machine or background workload. The first
batch and replays are both retained in `HUNODAN-SPEED-BROWSER.json`.

Firefox initially exhausted its short anchor MILP budget. Keeping the original
60 visible edges and first trying eight connector neighbors with one variant
reduces that graph from 1,002 to 564 binary variables. The complete graph
remains a fallback. This differs from the rejected experiment that coarsened
the visible contours. The final anchor passes at unchanged error in 2.57 s
(Chromium), 6.06 s (Firefox), and 2.81 s (WebKit). Its Node replay takes 2.63 s.
The other 21 Node cases retain their full-run records; all 22 remain below
9.50 s and at baseline error or better.

Additional flag, nested-heart and star uploads pass the standard geometry,
paper and 3% image gates in Firefox and WebKit. Those smoke tests are not a
claim that the full 22-case speed/error benchmark passes in every engine.

The user's screenshot is retained as a photograph-only fixture. All three
engines reconstruct it below 1% error, explain the identical-template bound,
and retain its original mask and comparison. Preference changes clear old
results, and the symmetric checker exports identical curves that reproduce
every original mask pixel. All downloaded test ZIPs were independently checked.

| Design | Time (s) | Previous error | New error |
| --- | ---: | ---: | ---: |
| hjfig-01 | 6.74 | 0.984% | 0.981% |
| hjfig-02 | 7.59 | 0.721% | 0.720% |
| hjfig-03 | 5.91 | 0.709% | 0.663% |
| hjfig-04 | 5.45 | 0.477% | 0.446% |
| hjfig-05 | 2.63 | 1.776% | 1.776% |
| hjfla-01 | 7.66 | 1.351% | 1.343% |
| hjcur-01 | 7.83 | 0.583% | 0.512% |
| hjcur-02 | 7.23 | 0.575% | 0.537% |
| hjcur-03 | 7.69 | 0.569% | 0.452% |
| hjcur-04 | 9.19 | 0.649% | 0.553% |
| hjcur-05 | 7.41 | 0.982% | 0.943% |
| hjhih-01 | 9.36 | 0.711% | 0.630% |
| hjhih-02 | 7.00 | 0.437% | 0.387% |
| hjhih-04 | 9.14 | 0.968% | 0.829% |
| hjstr-01 | 6.57 | 0.818% | 0.753% |
| hjstr-02 | 9.15 | 0.446% | 0.419% |
| hjstr-03 | 9.36 | 0.744% | 0.559% |
| hjsta-01 | 7.70 | 0.821% | 0.792% |
| hjsta-02 | 6.33 | 0.385% | 0.357% |
| hjsta-03 | 9.19 | 1.268% | 1.235% |
| hjsta-04 | 9.08 | 0.617% | 0.509% |
| hjsta-05 | 9.49 | 1.273% | 1.079% |
