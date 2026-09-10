# Moving endpoints in within-curve symmetry

The previous joint chord projection correctly enforced the geometry, but its
backward pass froze the reflection frame. This removed legitimate search
motions: midpoint reflection (`anti`) cancelled a cut's translation, while
reflection across the chord bisector (`sym`) cancelled its tilt. Recomputing
the frame after an update could not help when the gradient had already removed
the update.

A controlled reproduction starts with one vertical cut at x=20 mm and one
horizontal cut at y=70 mm. The Anti target translates the vertical cut to
x=25 mm; the Sym target tilts it from (15,0) to (25,100). Both targets satisfy
their requested symmetry. After 201 steps the previous source (`d325714`)
remained at 5% and 2.5% mask disagreement respectively. The corrected tangent
projection reaches 0% and 0.02%, with valid paper and geometry. These measure
the 200-pixel binary input, with supplied cut counts, rather than a full
photographic reconstruction.

## Derivative and update

`direct/chord-tangent.js` differentiates the actual relation between each
paired control point and the two chord endpoints. For midpoint reflection,
`v_a + v_b = v_start + v_end`. For bisector reflection, the Jacobian also
includes rotation of the bisector as the endpoints move. Square symmetries
and fixed boundary coordinates join the same sparse linear system.

The gradient is projected with `g - Aᵀ (A Aᵀ)⁺ A g`. Matrix-free conjugate
gradients avoid constructing the dense normal matrix. Cached sparse row
structures are updated for the current endpoints. Recomputed residuals guard
convergence, and a failed projection leaves the input vector unchanged.

Coordinate projection still uses the existing joint isometry solver. Adam's
separate scaling of each coordinate can occasionally turn a valid tangent
into an incompatible displacement when controls are shared. If the usual
coordinate projection fails, refinement retries the displacement projected
into the current tangent space. Failed retries retain the existing rollback
and learning-rate reduction. Every accepted checkpoint still independently
checks symmetry, intersections, spacing and paper cores.

Projecting every Adam displacement unconditionally was tested and rejected:
it slowed convergence on several otherwise simple Sym cases. The retry is
limited to failed coordinate projections.

## Independent checks and remaining limitation

The unit tests compare the new projection with a dense finite-difference
Jacobian of the moving-endpoint equations. They cover all 32 combinations
of square generators for both chord modes, curved and shared geometry,
fixed coordinates, projection idempotency and self-adjointness. Additional
regressions exercise actual refinement, including a shared-control retry.

`scripts/inverse/moving-chord-benchmark.mjs` runs 24 fresh straight-grid
refinements with supplied counts: 1–3 cuts in the first sheet, equal or one
more in the second, both chord modes, and straight or curved targets. It
records both disagreement with the 200-pixel prepared input and disagreement
with the underlying ideal curves at 400 pixels. The latter includes input
quantization and must not be described as the prepared-mask error.

Four deliberately minimal 2×2 seeds expose a separate representation issue:
`CurveGraph` globally merges control points whose coordinates coincide.
The two sheets' one-cubic straight grids happen to have four coincident
handles. Those become shared variables even though no complete cut is shared,
restricting the motions available to the optimizer. Allocating those handles
independently, then restoring the exact same starting coordinates, isolates
this issue. `INVERSE_TANGENT_INDEPENDENT=1` enables that diagnostic only; it
does not change the production constructor or initializer. Production also
constructs graphs from fitted multi-segment grids, so these four controlled
failures are not evidence that every real 2×2 input has the same problem.

Deliberate shared cuts must remain coupled. A general change to point
allocation needs a separate study of which joins and spans must retain their
identity; silently removing all sharing would reintroduce the hat seams.

```sh
node --test scripts/inverse/chord-tangent.test.mjs
INVERSE_TANGENT_OUT=tmp/moving-chord-study node scripts/inverse/moving-chord-benchmark.mjs
INVERSE_TANGENT_INDEPENDENT=1 INVERSE_TANGENT_OUT=tmp/moving-chord-independent node scripts/inverse/moving-chord-benchmark.mjs
```

## Controlled study results

With the production graph representation, 20 of the 24 cases improve from
2.99–18.73% disagreement with the ideal curves to at most 0.813%. Their
prepared-mask disagreement is at most 0.520%. Median refinement time is
0.406 seconds before and 0.408 seconds after; both maxima are below 0.5 seconds.
These times cover 301 refinement steps and checkpoints, with supplied counts.

The four remaining cases are retained explicitly:

| Seed / target | Previous ideal error | New ideal error | Independent-handle diagnostic ideal error | Diagnostic prepared error |
| --- | ---: | ---: | ---: | ---: |
| Sym 2×2 / straight | 5.915% | 5.915% | 0.068% | 0.060% |
| Sym 2×2 / curved | 5.897% | 5.897% | 0.040% | 0.010% |
| Anti 2×2 / straight | 10.910% | 10.953% | 0.995% | 0.000% |
| Anti 2×2 / curved | 10.865% | 10.839% | 0.441% | 0.525% |

The small Anti straight regression is not hidden by the aggregate improvement.
The four cases demonstrate why this tangent correction does not resolve an
incorrectly constrained starting representation. The large difference between
the last two error columns for the translated straight grid comes from binary
input quantization: the ideal cut falls between the 200-pixel sample centres.

The reference and candidate studies run serially against identical targets,
with independent geometric rendering and unchanged geometry/material checks.
Raw reports are in `tmp/moving-chord-final-{before,after,independent}/`.
The independent-handle column is an experiment, not released behavior.
