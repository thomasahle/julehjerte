# Measure redundant curvature on the curve itself

Template cleanup now measures a cubic's actual deviation from its endpoint chord,
and scores the additional simplifications using the adaptive geometry sampler.
It remains part of the common fitter's final selection. Cut counts, optimization
trajectories, source masks, accepted crops and acceptance limits are unchanged.

## Two distinct causes of imperfect checker cuts

The unequal-lobe checker from the [crop study](LOBE-SHAPES.md) still has small
wedges and curved deviations. Inspection of its saved templates found large
endpoint displacements compressed into narrow border strips: one cut starts at
19.91 mm before returning to approximately 26 mm, and another ends at 96.73 mm
from an interior position near 75 mm. The fitter is explaining the classified
crop's border artifacts, even though the known artwork has straight cuts.

Replacing each entire cut with its endpoint chord increases independently
rendered mask disagreement from **0.319% to 27.78%**. A least-squares line fit
through its sampled geometry gives **4.62%**; the known uniform grid gives
**3.92%**. Neither qualifies as a faithful replacement under the existing image
checks. Those diagnostic proposals are rejected. Their reference is the captured
classified mask, not the original photograph or the unavailable physical cuts.
This change does not claim to fix those misplaced endpoints or the remaining
crop distortion.

Separately, much smaller bends can survive because of two implementation choices:

1. Straightening eligibility used handle-to-chord distance. Opposing handles can
   lie far from a line while the actual cubic stays close to it. In the regression,
   handles deviate by 0.4 mm, but the curve's maximum deviation is only
   `0.4 / (2 sqrt(3)) = 0.11547 mm`, below half a pixel at 400 pixels per 100 mm.
   The previous one-pixel handle bound excluded this redundant curvature.
2. Edit-group selection used 32 uniform samples per cubic, while the final
   source-image check used adaptive flattening. Disagreement on a few pixels
   could admit a bad combination locally and then reject the complete candidate,
   losing useful simplifications along with it.

## Selection and invariants

The existing final cleanup runs first. An additional pass considers actual
curve-to-chord deviation, computed at the roots of the signed-distance cubic's
quadratic derivative. Endpoints stay fixed. Longitudinal handle overshoot and
collapsed chords are excluded conservatively; collinearity alone must not erase
a return or turn a loop into a point.

Both passes share the existing 500 ms cleanup allowance and export reserve.
The broader pass uses the same 0.01 mm adaptive flattening tolerance as the final
geometry sampler when scoring each edit group's changed pixels. Every accepted
group updates the working mask before the next group is evaluated. The complete
proposal is still rendered and checked again; no additional original-mask error
is allowed by that sampler. Boundary objective, image features, requested
symmetry, existing matching sheets, geometry and paper checks still apply.
Native SVG source curves remain untouched.

Running the broader proposal after the original cleanup matters. New eligible
controls can connect previously separate edit groups. Replacing the original
proposal outright can therefore lose simplifications it already accepted. The
two-pass ordering preserves them without changing the continuous fit.

Reports retain `finalPrimitiveSelection` and add `finalCurvePrimitiveSelection`,
with proposed/accepted group counts, curve counts, image errors, rejection reason
and time. These counts describe cubic spans, not the number of full cutting paths.
Antialiased independent SVG rendering remains a separate measurement: matching
the adaptive sampler does not prove identical antialiased coverage or exact
continuous equality.

## Verification

The regression suite covers the analytic opposing-handle fixture, a genuine small
bend in the same template, overshoot, a collapsed chord, transposition, unchanged
source pixels and independent SVG rendering. Boundary-delta tests exercise both
uniform and adaptive sampling with both colour phases, several resolutions,
weights, coincident spans and exact pixel-centre ties.

## Saved-output and fresh-photograph results

The fixed-output replay applies only final cleanup to the preceding 20 browser
outputs with their captured source masks, weights, symmetry and paper settings.
It does not use saved templates to seed any fresh fitting benchmark. **20/20
pass**, and **14/20** lose redundant curved spans. None increases error under
the adaptive source-image sampler. For the preferred matching hat, curved spans
drop from **78 to 40** in both browsers; the protected-mask error stays
**0.394168%**. Genuine curved details, sheet matching and the paper checks survive.

The independent antialiased SVG renderer gives eight very small increases and
twelve unchanged errors in this replay. The largest increase is **0.003125
percentage point** on the synthetic checker. The preferred hat changes from
**0.399483% to 0.400368%** in the protected region. These values are preserved
rather than describing the two samplers as identical.

All **22 regular Hunodan designs** pass the existing independent release-error
limits and ten-second speed checks. Runtime is **5.03 s median, 8.33 s maximum**
for preparation, fitting, validation and export; decoding and independent replay
are separate. These frozen-corner runs isolate the fitter. Against the preceding
matching-seed run, independent errors improve in four cases, stay identical in
nine and increase in nine, by at most **0.015598 percentage point**. All remain
within the original case-specific quality limits, including the existing
one-percentage-point matching-template allowance. This is not a claim that every
pixel metric improves or that the new pass is a speed optimization.

## Production browser and broader pipeline QA

**24/24 Chromium and WebKit cases pass**, including preferred, independent and
constrained hat templates, the star, checker, green-tree photograph, noisy masks,
curved circle and square-cornered house. The actual worker, editable SVG, PDF
export, geometry rules and matching preferences are exercised. The largest
measured editor-conversion drift is **0.07875%**, below the existing 0.1% limit;
this is a bounded drift check, not a claim of exact equivalence. Visual inspection
of the circle and house confirms the main curved outline and square joins remain.

All **845 application tests** and **534 inverse-engine tests** pass, with one
existing application skip. Type checking reports zero errors and seven existing
warnings. Lint and the production build pass. Served preview bytes match the
tested source. [The validation ledger](CURVE-DEGREES-VALIDATION.json) retains
source hashes, per-case measurements and artifact hashes.

The complete **44-case web-photo corpus** was also replayed from source images,
automatic corners and fresh fitting: **9 candidates pass, 20 need review, and 15
have no usable crop**. All 29 generated pairs pass nominal geometry and paper
checks; the remaining failures concern source-image fidelity and protected
features. [The dataset report](WEB-PHOTOS.md) separates the observed crop,
classification and model-selection issues. This is a current-state measurement,
not a claim that the curve cleanup caused every result or recovered nine
published templates.

## Reproduction

```sh
node --test --test-concurrency=1 scripts/inverse/primitive-selection.test.mjs scripts/inverse/straight-artwork.test.mjs scripts/inverse/mixed-primitives.test.mjs
node scripts/inverse/primitive-selection-replay.mjs --input=tmp/lobe-refinement-browser --reference=967f2bf --output=tmp/adaptive-primitives-replay
INVERSE_SPEED_OUT=tmp/adaptive-primitives-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/adaptive-primitives-web-all
```

Saved-output replay isolates final geometry cleanup; the Hunodan run starts fresh
from photographs and frozen overlap coordinates. Browser uploads exercise the
automatic corner proposal and actual worker separately. Run CPU workloads serially.
