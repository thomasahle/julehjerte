# Explicit importance weights for image fitting

The grid and free Bézier optimizers now accept per-pixel weights: zero for
ignored colour, one for protected artwork, and intermediate values for softer
preferences. This is implemented in the existing fitting functions, not a
separate fitter. The complete public solver does **not** accept weighted
artwork yet; Paint continues to use its existing checker-border target.

## Objective and numerical checks

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
excluded from equality. The complete suite passes **902 tests**; build, lint
and Svelte checking also pass (zero errors, seven existing Svelte warnings).
The unchanged public top-hat and star workflows pass Chromium solve and export
checks. The regular Hunodan regression remains **22/22** at its existing
quality limits and within ten seconds, with a **9.65-second maximum** on the
same Node/Apple M2 Pro benchmark.

## Paired refinement experiment

`scripts/inverse/weighted-border-benchmark.mjs` uses four original silhouettes
and two fixed protected-square sizes. Each starts with a fresh automatic solve
using the current checker-border target and a ten-second solve budget. Every
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

Both current initial solves select four cuts per sheet. Rescoring their same
count seeds inside the protected region changes the strongest hypothesis to
two cuts per sheet. For the house, the four-cut seed's protected disagreement
is 7.33%, versus 4.10% for the two-cut seed. For the wizard hat the corresponding
values are 7.23% and 5.33%. These are **initial seed scores**, not validated final
templates. They show that ignoring the checker only at the final polishing
stage is too late to influence a consequential earlier choice. They do not
prove that the two-cut layout will fit or pass paper checks.

## Remaining integration

Before replacing Paint's checker substitution, weights must have consistent
meaning across the full solve:

- Carry the weight field with its coordinate system through image preparation
  and source-resolution changes, retaining the original mask for comparison.
- Use checker patterns only as initialization proposals. Rank counts, phases,
  candidates and stopping decisions by protected/weighted image error.
- Average weight and weighted colour together under requested symmetries.
  Derive the matching-sheet lower bound and one-point allowance from the same
  observed objective.
- Apply the objective to final matching, shared-cut recovery and higher
  resolution checks, without weakening geometry or paper constraints.
- Make feature retention aware of the protected region, and keep permitted
  border changes distinct from missing protected details.
- Report protected error, permitted border changes and whole-original
  difference separately through the worker, comparison view and export.

The current experiment implements weighted optimization and demonstrates why
these remaining stages matter; it does not silently enable a partly weighted
public pipeline. [WEIGHTED-IMAGE-VALIDATION.json](WEIGHTED-IMAGE-VALIDATION.json)
retains the measurements and verification details.

```sh
node --test scripts/inverse/weighted-image.test.mjs
node scripts/inverse/weighted-border-benchmark.mjs --output=tmp/weighted-border
```
