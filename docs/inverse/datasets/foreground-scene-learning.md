# Foreground training with neighbouring hearts and handles

Adding controlled clutter improves selected-body segmentation substantially on
synthetic photographs, but **does not establish a real-photo reconstruction
improvement**. Both matched models produce five numerically checked pairs on
the 31 real inputs. The new bauble result loses much of its photographed frame,
while the eight-point star loses its crop proposal. The model remains offline;
the production benchmark remains 24/31.

The [machine-readable audit](foreground-scene-learning.json) verifies 23,446
referenced artifacts, matching input windows, training budgets and background
draws. Raw photographs, predictions, crops, masks, exported geometry and logs
are preserved under `tmp/heart-learning/foreground-scene-v1/`. The complete
43-case review gallery is `scene-gallery/index.html` in that directory.

## Controlled intervention

The target is the selected basket body: both paper colors, the overlap square
and both lobes. Handles and other hearts are excluded. The generator adds two
nearby hearts, a straight handle, or both, behind the selected body. Neighbours
reuse its procedural geometry with independent placement and may swap colors.
There is no target occlusion or new motif family in this experiment.

A separate random stream preserves the original camera, cutting paths, paper
colors, lighting, blur, compression, crop and random draws. All four target PNGs
remain byte-identical. Original baseline photographs reproduce their hashes.
The generator exports a visible-distractor mask; independent inverse-camera
checks ensure these distractors never replace the selected paper body.

The diagnostic contains 16 non-training channel/frame views with four variants
each. These are repeatedly inspected recipe holdouts, not an unseen topology
benchmark. Mean selected-body intersection-over-union (IoU) is:

| Scene | Matched background-only control | Clutter-trained model |
| --- | ---: | ---: |
| Original photograph | 98.51% | 97.97% |
| Neighbouring hearts | 61.86% | 95.01% |
| Handle | 96.44% | 97.82% |
| Neighbours and handle | 60.39% | 95.00% |

For neighbouring hearts, the fraction of visible distractor pixels incorrectly
included in the selected body falls from 89.39% to 1.87%. The selected body's
false-negative rate increases from 0.98% to 2.64%; clean-scene IoU also declines
slightly. The controlled example `channel-795789-v0.png` visibly suppresses
neighbours while retaining the central body, but the aggregate gain does not
mean every small edge is preserved.

## Matched training

Each of the 408 original training views gets a clutter counterpart for all six
existing background choices, adding **2,448 variants**. The original corpus
still has 192 procedural cutting geometries and 768 views; these variants do
not increase its geometry diversity. Development and recipe-holdout examples
are rejected by the training loader.

Both runs use the same ImageNet-initialized MobileNetV3-based foreground model
(880,449 parameters), source order, reflections, optimizer and 1,020 updates.
At each visit, the original background RNG selects the background; an independent
RNG toggles its clutter counterpart with probability 0.5. All 20 epoch-level
background-draw hashes match. Training therefore compares equal update budgets,
not equal wall time. Both checkpoints are selected at epoch 20 by the original
development loss. No real photographs enter training or checkpoint selection.

Native warm forward-plus-output-transfer medians are approximately 12.8 ms for
the control and 13.1 ms for the new model, excluding preprocessing. Browser/ONNX
inference has not been implemented or measured. There is one seed per condition.

## Full photograph-to-template replay

Both checkpoints receive identical 31 real input windows and 12 synthetic
diagnostics, without supplied corners or templates. The same current cropper,
classification, ten-second fitter, source-feature tests, geometry/paper checks
and independent export renderer evaluate both. Acceptance thresholds are unchanged.

| Model | Real supported crop proposals | Real numerical passes | Synthetic numerical passes |
| --- | ---: | ---: | ---: |
| Background-only control | 6/31 | 5/31 | 11/12 |
| Clutter-trained | 5/31 | 5/31 | 11/12 |

The current matched control is essential: it uses the crop-edge evidence fix
introduced after the earlier background study. Its synthetic count is 11/12,
whereas that historical study recorded 10/12. That difference is not credited
to clutter training.

Four real cases pass in both runs: curved star, blue outlined star, cross and
puppy. The new model gains a numerical bauble pass (1.489% mask disagreement)
and loses the eight-point star's crop. The Viking no longer receives a supported
crop, although its earlier fit was already rejected at 6.828% disagreement.
Twenty-three of the 24 collage inputs still fail to obtain a supported crop.
These counts are not additions to production's existing successes.

On the same eleven accepted synthetic cases, mean latent-artwork disagreement
worsens from 0.658% to 0.830%; observed true-overlap coverage declines from
98.92% to 98.65%. The same survivor set still does not imply identical sampled
canonical pixels. The clipped-tip photograph remains unresolved in both runs.

## Visual diagnosis

**The bauble is not a convincing recovered design.** Comparing its RGB crop,
classified mask and exported weave shows that much of the pale pink surrounding
frame is already absent in the mask. The fitter reproduces that deficient target
with low disagreement. The proposed crop also cuts through parts of the frame;
it is an outline-supported proposal, not verified physical-corner truth. Better
foreground selection has exposed another failure rather than solved this case.

The eight-point star stops before fitting: the saved detection reports that it
cannot identify both exposed lower paper edges. Comparing the two probability
images shows changes around dark lower paper and the lobes. This isolates the
regression to foreground/localization, but does not prove which changed pixels
caused the detector to reject it.

Together, the results distinguish three remaining tasks: selecting one whole
heart among neighbours, recovering its physical overlap, and preserving faint
motif boundaries during color classification. A low final error against a
derived mask cannot independently validate the preceding two stages. Geometry
checks also do not establish physical assembly or complete visual fidelity.

The next useful data are reviewed real per-heart masks and corners, grouped by
motif/source to keep reposts and related designs out of evaluation. The existing
573 real photo-containing files are source material, not fully annotated training
examples. Synthetic experiments can test particular perturbations, but adding
more examples of the same simple geometry recipes has not closed this gap.

## Reproduction

Generate and verify `scene-training` probes for the same training-only selections
used by the background experiment, and a `scene` diagnostic for its 16 held-out
views, using `synthetic-intervention-probe.mjs`. Train the unchanged control with
the two original `--training-probe` directories. Add the two new directories
with `--scene-probe` for the paired run. The complete arguments and timings are
preserved in `tmp/heart-learning/foreground-scene-v1/checks.json`.

Run `foreground-interventions.py`, `foreground-export.py` and
`foreground-replay.mjs --methods=learned --solve-ids=all` for each checkpoint.
Audit the completed experiment without rerunning training or fitting:

```sh
python3 scripts/inverse/learning/foreground-scene-report.py \
  --study tmp/heart-learning/foreground-scene-v1 \
  --output tmp/heart-learning/foreground-scene-v1/rechecked-evidence.json
```

The audit verifies source/baseline identity, exact target hashes, train-only
augmentation, matched sampling and optimizer budgets, checkpoint identity,
equal replay inputs and pipeline settings, and referenced artifact hashes.

## Validation

The [validation record](foreground-scene-validation.json) preserves passing
serial runs of 744 inverse tests, 855 application tests (one existing skip),
45 offline Python tests, type checks, lint and the production build. Type checking
reports zero errors and seven existing warnings; lint retains one existing warning.

Chromium passes the star, free-border hat and Hunodan `hjcur-02` flows, including
template checks, editable SVG conversion and export checks. Browser replay records
64 workspace source hashes. The 43-case gallery loads all 177 images without page
errors or broken images; all 16 inverted display masks are independently checked
pixel-by-pixel against their frozen originals. Neither masks nor scores are altered
for display. The owned preview was restarted after the build and remains available
at `http://127.0.0.1:5232/editor/mal/`.
