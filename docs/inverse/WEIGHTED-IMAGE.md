# Explicit importance weights for image fitting

Paint's free-border workflow now uses explicit per-pixel weights throughout the
existing fitter: zero for permitted border changes and one for the protected
motif. The original mask stays intact for comparison. The public binary-mask
input also accepts intermediate weights, although Paint does not expose a soft
border control yet. Geometry and paper checks still apply to every cut.

## Complete solver and Paint integration

`{type: 'mask', resolution, mask, weights?}` passes binary artwork directly to
preparation without a colour-classification round trip or coordinate change.
Weights are part of the artwork, not solve settings. Inputs must have positive
observed mass, valid binary colours, and finite weights between zero and one.
The original mask and weights remain available in worker previews/comparisons.

The same normalized image objective now controls the alternating-run
initializer, count/phase ranking, grid optimization, Bézier refinement,
checkpoint selection, matching sheets, shared-cut recovery and final image
validation. Symmetry averages `w` and `w*p` together. The matching-sheet lower
bound uses the less important pixel in each conflicting transposed pair, and
its one-percentage-point allowance uses the same weighted error. Protected
features remain checked; ignored pixels neither join those features together
nor become missing-feature failures of their own.

A deterministic centred checker is one initialization proposal in free pixels,
alongside the existing uniform and image-informed grids. Its colours are never
scored or reserved as a final answer. The advanced checker-size UI was removed.
This matters for wide motifs: scoring a required checker previously favoured
four-cut layouts whose subsequent movement repeatedly failed the paper audit.
Scoring the protected motif lets the search select simpler two-cut layouts
without weakening that audit.

Paint reports the actual editable heart's protected disagreement and permitted
border-change fraction separately. The session and worker reports also retain
the difference across the whole original square. All comparisons use the
original artwork rather than a substituted checker target.

## Fresh full-solve experiment

`weighted-solve-benchmark.mjs` runs eight original silhouettes with fixed
protected-square sizes, using fresh automatic solves and a ten-second budget
for each strategy. The checker baseline uses the old substitution; the weighted
strategy retains the original drawing. No fitted templates initialize either
solve. Exported cubic paths are independently rendered with resvg at 200×200.

| Motif | Protected size | Checker error | Weighted error | Weighted cuts per sheet | Weighted seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Top hat | 64% | 0.360% | 0.360% | 4 | 3.04 |
| Top hat | 84% | 2.214% | 0.028% | 2 | 8.64 |
| Wizard hat | 64% | 0.281% | 0.854% | 2 | 9.00 |
| Wizard hat | 84% | 3.621% | 0.184% | 2 | 9.22 |
| House | 64% | 0.000% | 0.519% | 2 | 9.12 |
| House | 84% | 4.280% | 0.181% | 2 | 9.13 |
| Circle | 64% | 0.305% | 0.031% | 4 | 3.69 |
| Circle | 84% | 3.026% | 0.170% | 2 | 9.24 |

All eight weighted outputs pass the unchanged geometry/paper checks and the
3% protected-error criterion; five checker outputs pass that same criterion.
This is not a uniform improvement: the small house worsens from exact to 0.52%,
and the small wizard hat from 0.28% to 0.85%. Some easy cases take longer.
The large-case improvement comes from changing the earlier search and
selection, not only polishing the previous answer.
A prior complete replay also passed all eight weighted cases, but chose a
better four-cut layout for the small wizard hat. Time-limited topology proposals
and refinement can change which valid candidate wins; both replays are retained
in the validation JSON rather than selecting the best result per case.
These are generic original silhouettes, not reconstructions of unavailable
artwork from the GitHub feature requests. Browser checks use the editor's
400×400 mask and its normal solve budget, so their timings and percentages are
separate measurements.

## Weighted loss primitives and earlier numerical checks

`direct/image-objective.js` normalizes image error by the sum of weights.
Increasing a free border therefore cannot dilute an error in the protected
motif. An entirely unobserved target is rejected, rather than receiving a
misleading zero-error score. Weight and weighted colour are resampled together:
averaging colour separately would let ignored pixels contaminate observed
pixels at a coarser scale.

The ordered grid's soft prediction uses weighted squared error, including its
pooled residual term. Each pooled cell has the mean importance of its source
pixels; empty cells exert no force. This preserves the existing equal-block
objective even for partial edge blocks. Its gradients are checked with finite
differences for both phases, soft and zero weights, and non-divisible image
dimensions.

For the binary weave used by boundary refinement, the identity

```
w (z - p)^2 = w p^2 + z w (1 - 2p),  z ∈ {0, 1}
```

lets the existing JS/WASM boundary integrator use a weighted signed force field
plus a constant offset. That field can exceed the probability range; it is not
used as an image mask or passed to the soft grid loss. Refinement compiles it
once, then uses weighted disagreement for checkpoint selection and straight
span proposals. Geometry, clearance, bend and paper-core constraints remain
unchanged.

Eleven regressions cover analytic horizontal/vertical forces, JS/WASM agreement,
shared-boundary cancellation, scalar weighted errors, finite-difference grid
gradients, resampling, zero-weight colour perturbations throughout fitting, and
invalid inputs. Unweighted and all-one calls retain exactly the original
numerical path. A uniform soft weight retains the normalized objective too.

A separate comparison loads the pre-weight modules from `e5ef303`. All 18
grid-loss cases, 18 boundary cases, six grid fits and two refinement runs match
their current unweighted counterparts exactly in numerical outputs, including
control coordinates and checkpoint histories. Paper-audit elapsed time is
excluded from equality. At that stage, the complete suite passed **902 tests**;
build, lint and Svelte checking also passed (zero errors, seven existing Svelte
warnings).
The then-unchanged public top-hat and star workflows passed Chromium solve
and export checks. The regular Hunodan regression remains **22/22** at its existing
quality limits and within ten seconds, with a **9.65-second maximum** on the
same Node/Apple M2 Pro benchmark.

## Earlier paired refinement experiment

`scripts/inverse/weighted-border-benchmark.mjs` uses four original silhouettes
and two fixed protected-square sizes. Each starts with a fresh automatic solve
using the previous checker-border target and a ten-second solve budget. Every
refinement starts independently from that same resulting pair, runs 160 steps
without a deadline, and retains all candidates. No saved reference cutting
templates are used to initialize the solve.
The protected shape stays fixed; artwork outside it is permitted to change.

The protected-region disagreement below is measured by independently rendering
the exported cubics with resvg at the 200×200 source resolution. "More checker
refinement" controls for simply giving the existing result more optimization
steps. The JSON also records neutral-gray and soft-weight trials, border
changes, whole-original disagreement and every geometry/paper result.

| Motif | Protected size | Initial | More checker refinement | Free weighted refinement |
| --- | ---: | ---: | ---: | ---: |
| Top hat | 64% | 0.360% | 0.378% | 0.366% |
| Top hat | 84% | 2.225% | 0.663% | 0.432% |
| Wizard hat | 64% | 0.281% | 0.049% | 0.049% |
| Wizard hat | 84% | 3.504% | 3.504% | 3.504% |
| House | 64% | 0.000% | 0.012% | 0.006% |
| House | 84% | 4.266% | 4.266% | 4.266% |
| Circle | 64% | 0.305% | 0.037% | 0.024% |
| Circle | 84% | 2.994% | 2.934% | 2.923% |

All 40 baseline/refinement geometries pass the geometry and guarded paper-core
checks. The four initial 84% cases fail the current full-image quality gate;
they are retained as failures, not described as successful initial solves.
Weighted refinement is not uniformly better: the 64% top hat and house each
worsen by one independently rendered protected pixel relative to the initial
pair. Internal sampling and independent antialias thresholding can disagree at
that scale. This experiment is not an exact silhouette or area certificate.

The 84% top hat here uses a ten-second unconstrained solve at 200×200. It is
not the earlier 400×400 browser hat with a longer solve budget and requested
matching sheets, so their error percentages are not directly comparable.

## Why two wider cases stall

Replaying the 84% wizard hat and house with checkpoint logging exposes a
specific barrier. The image loss does improve after movement, and nominal
geometry still passes, but every moved checkpoint receives an **uncertain**
paper-core audit. The fitter correctly retains its last certified pair. This
is a failure to certify the new paper geometry, not a proof that the artwork
is impossible or that the gradient is zero.

Both initial checker-target solves selected four cuts per sheet. Rescoring their same
count seeds inside the protected region changes the strongest hypothesis to
two cuts per sheet. For the house, the four-cut seed's protected disagreement
is 7.33%, versus 4.10% for the two-cut seed. For the wizard hat the corresponding
values are 7.23% and 5.33%. These are **initial seed scores**, not validated final
templates. They show that ignoring the checker only at the final polishing
stage is too late to influence a consequential earlier choice. The fresh full-solve experiment above subsequently confirms that these
two-cut layouts can fit and pass paper checks.

## Browser timing failure and correction

The first integrated browser replay passed 17 of 18 cases. Firefox's independent
hat failed the stricter 1% hat criterion at **1.67%** protected disagreement,
although its geometry and shared exported spans passed. Visual inspection showed
a warped silhouette, so this was retained as a failed result.

The seed bank took 5.85 seconds and a speculative topology solve another 7.08
seconds. The first grid candidate then inherited an expired 8.7-second fast
allocation, despite the user's 180-second allowance. Its only curve checkpoint
was the untouched step -1 candidate. That candidate passed the general 3%
image gate, so the search stopped without meaningful refinement or polishing.

The first candidate now receives the same bounded refinement opportunity as
later candidates when the requested budget permits it. Short requests keep
their existing deadline; every extension stays within the user's total budget.
A regression advances the initialization clock without sleeping and fits a new
hat from fresh grids. It fails on `735f086` and passes with the correction,
checking actual refinement checkpoints, polishing and final error.

## Verification and remaining limits

The integrated code passes **718 application tests and 196 engine tests**.
Build, lint and Svelte checking pass, with zero errors and seven existing
Svelte warnings.

All **18 production-browser workflows** pass in Chromium 145, Firefox 146 and
WebKit 26: matching and independent top hats, the wider wizard hat and house,
the star, and a Hunodan photo. Each imports a fresh image and uses the real
worker. Every shared engine span survives on both editable SVG sheets; the
editor's crossing/spacing checks pass, and star PDF exports are verified.

After the budget correction, protected error on the editable top hats is
**0.26–0.35%** across the three browsers. The wider wizard hat is **0.35–0.38%**
and the house **0.34%**. Those browser solves use the editor's 400×400 mask and
180-second allowance; top-hat solve/conversion takes **13.8–35.3 seconds**.
These are separate from the ten-second Node benchmarks above.

The final serial Node replay passes **22/22 regular Hunodan photographs** at
its existing per-case quality limits, including the one-percentage-point
allowance for an identical pair. Preparation, solving, validation and export
take **3.01–9.82 seconds**, with a **7.63-second median** on the
Apple M2 Pro / Node 25.6.1 benchmark. Photograph decoding and the independent
export replay are recorded separately. All 43 engine files served by the
browser build match the final motif and Hunodan benchmark source hashes.

Ten pipeline regressions exercise binary preparation, original-mask retention,
weighted reporting, the matching lower bound against exhaustive small images,
weighted symmetry, invariance to ignored colours in initialization, count
ranking, feature retention and an independently rendered full solve. The
application bridge tests check that the same original mask and weight field
reach public preparation, and that fixed masks remain unweighted.

This does not find the best border globally or guarantee an exact silhouette.
The protected shape remains a user choice. A soft-border UI, automatic crop
uncertainty weights, and broader photo testing remain separate work. A weighted
mask is already rectified; arbitrary photograph-coordinate weights are not
silently mapped through crop or colour conversion.

[WEIGHTED-IMAGE-VALIDATION.json](WEIGHTED-IMAGE-VALIDATION.json) preserves the
earlier primitive/refinement results. The full-solve integration results and
release checks are recorded in
[WEIGHTED-SOLVE-VALIDATION.json](WEIGHTED-SOLVE-VALIDATION.json).

```sh
node --test scripts/inverse/weighted-image.test.mjs scripts/inverse/weighted-pipeline.test.mjs
node scripts/inverse/weighted-border-benchmark.mjs --output=tmp/weighted-border
node scripts/inverse/weighted-solve-benchmark.mjs --output=tmp/weighted-solve
```
