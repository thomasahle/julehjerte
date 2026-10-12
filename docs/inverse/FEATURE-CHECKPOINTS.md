# Preserving small details during template fitting

The puppy photograph exposed two failures after cropping and classification.
Its small white opening between the legs survived both operations, but the
ten-second template fit omitted it. Total mask disagreement was only about
0.5%, so ranking by that number alone hid an important loss of motif structure.
The source-feature check correctly kept this result out of the accepted set.

This change addresses scheduling and checkpoint selection in the main direct
Bézier fitter. It does not change crop coordinates, classified pixels, the 3%
image-error limit or the geometry and paper acceptance rules.

## Root causes and changes

**Initialization arrived too late.** A close ordinary grid omitted the small
opening, and local curve gradients could not discover a remote missing region.
The fitter first spent much of its remaining budget on unsuccessful traced
recovery. An existing image-derived feature initializer could find a useful
five-by-three layout, but usually only got a turn with a longer search budget.

When an otherwise close grid misses a source feature, the fitter now tries one
feature-preserving layout before traced recovery. This is the existing adjacent
count search, using only the classified image. The ordinary finalists remain as
fallbacks. Requested symmetries and the free-border objective keep their existing
routes. A border-only missing feature does not trigger a forced interior layout.

**Fine-grid polishing could erase the initializer's gain.** Moving the frozen
crop down by one original-image pixel still produces a feature-retaining starting
grid. Ordinary fine-grid polishing then prefers a lower whole-image error that
fills the opening. That is a fitting failure, even though a crop perturbation
exposes it.

Feature-derived seeds now retain a feature-preserving checkpoint while following
the ordinary image gradient. Both the grid stage and free-curve refinement accept
an optional checkpoint preference. Within each physical validity class, preferred
checkpoints compete on the existing objective. If no preferred point exists, the
ordinary best fallback remains available. A paper-uncertain point still needs an
independent finer audit; preference never certifies geometry or changes rollback
safety. Straightening proposals also compete with their unsimplified counterparts
when straightening would erase the feature.

The source mask is immutable. The regression starts from the shifted photograph,
checks its classified-pixel hash, demonstrates the lost opening without checkpoint
preference, then fits and independently renders fresh curves with the fix. It also
checks that the recovered opening remains a separate component with reasonable
overlap. No saved template is supplied to the fit.

## Experiments rejected after visual inspection

More numerical passes did not always mean better reconstructions. Stronger
feature weights and a two-layout trial could retain enough white source pixels
to clear the feature gate while enlarging the opening or joining it to the white
background. One two-layout result expanded a roughly 7 mm² opening to 82 mm²;
another expanded it to 54 mm². Those variants are not shipped.

The diagnostic reports distinguish retained source pixels from overlap with the
entire matching output component. The latter penalizes an oversized opening or
an unintended connection to the background. This is a raster diagnostic, not a
new production acceptance rule or a physical certificate. The selected result
still does not reproduce the opening exactly.

`feature-checkpoint-study.mjs` follows fixed source pixels and a fresh image-derived
seed through initialization, fine-grid fitting, clearance and free-curve
checkpoints. It compares ordinary fitting with several weighting strategies at
fixed iteration counts and paper resolution 700. Those experiments have no
production deadline and change the clearance margin relative to the usual coarse
audit; they are not production speed results. Its stronger initialization fallback
is diagnostic only.

The unresolved perturbations need better starting geometry, not just stronger
weights. The one-pixel horizontal shift loses its opening during later fitting;
the half-resolution image has no acceptable feature-preserving seed under the
ordinary initialization settings. Both source masks still contain the opening.
Small border changes can also turn a large background region into an interior
component, changing a component-weighted objective substantially. These are
distinct failure modes that a single whole-image error percentage misses.

## Reproduction

```sh
node --test --test-concurrency=1 scripts/inverse/feature-seeds.test.mjs scripts/inverse/refinement-checkpoints.test.mjs
node scripts/inverse/hard-photo-benchmark.mjs --seconds=10 --target=mask --output=tmp/feature-replay
node scripts/inverse/hard-photo-editor-replay.mjs --run=tmp/feature-replay --output=tmp/feature-editable
node scripts/inverse/feature-checkpoint-study.mjs --run=tmp/feature-replay --ids=flettede-puppy --output=tmp/feature-study
```

The hard-photo benchmark reports crop detection separately. Its `runs[].seconds`
starts after detection and source-thumbnail creation; it includes preparation,
solving, validation, exports, independent replay and artifact writes. The
ten-second solver allowance is not a click-to-ready promise. Browser timings use
the page clock from the Find click until the editable result is ready.
