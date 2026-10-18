# Rotated photographs through the complete fitter

The remaining frame artifact in the [controlled photographic study](app-baseline-correction.md)
was partly an input-geometry problem. A noisy supplied crop removed the
left-edge transitions of `frame-764510-v3--baseline`. The independent fitted
sheets then introduced a small wedge where two distinct cuts needed to reach
that edge. Nominal geometry and aggregate image checks did not identify it as
a visibly wrong design feature.

The automatic cropper also returned no corners for any of the six full
photographs in this selected diagnostic set. It fitted an upright outline;
the two colored frame photographs were substantially rotated. Rotation-aware
outline fitting now finds both frames without supplied corners, a selection
rectangle, a known motif, or a neural prediction. The other four photographs
remain unresolved, and stay in the denominator: **0/6 before, 2/6 after**.

These six synthetic photographs were selected after inspecting earlier
failures. They are diagnostic cases, not an unbiased accuracy benchmark and
not evidence of real-photograph recovery rates.

## Keep color classification fixed while trying poses

Rotating the raw photograph and estimating its colors again was misleading.
Transparent padding could make the entire opaque photograph look like paper;
edge-clamped padding changed the background statistics and sometimes produced
large false corner proposals. Those exploratory outputs remain in the local
diagnosis directory.

The new detector estimates each existing palette once, then rotates its
probabilities, paper mask, color channels and signed distance fields. Silhouette
covariance orders possible orientations, followed by a 22.5-degree grid.
The outline fit remains responsible for estimating the actual corners. Every
returned point is mapped back to the original photograph's coordinates.

A proposed rotated outline must explain both lower edges and both lobes:
each support fraction must be at least 0.65, and each cap color loss at most
0.30. Merely returning a quadrilateral was insufficient: some rejected fits
explained one lobe while the other had virtually no supporting pixels.

The normal upright fits still run first. When they are weak, the additional
orientation search has a two-second budget, checked between synchronous
outline fits. An in-progress fit can extend past that deadline. A previous
editable upright proposal is retained if no fully supported alternative is
found. The reported search records include palettes, attempted angles, support
decisions and whether the deadline was reached, including unsuccessful cases.

## Full-pipeline results

The replay loads the full JPEG, finds corners, classifies the selected crop,
fits both sheets and independently renders the exported cutting geometry.
Exact synthetic labels are read for evaluation only after the output has been
selected. The fitter receives the application's automatic preset, a ten-second
solver budget and no tolerance trials.

| Case | Largest corner error | Total photo-to-checked-pair time | Cuts per sheet | Identical sheets |
| --- | ---: | ---: | --- | --- |
| Frame 764510 | 3.91 px | 3.47 s | 2, 2 | No |
| Frame 829086 | 1.57 px | 5.20 s | 2, 2 | Yes |

Both pairs pass the existing geometry, nominal paper and image checks. The
first frame's lower-left wedge is absent from the exported weave. Its matching
sheet bound still exceeds the allowed one-percentage-point cost, so the
independent pair is retained. The second frame selects matching sheets at an
additional 0.494 percentage points of disagreement with its classified crop,
within the user's allowance.

The three channel photographs and pale frame remain crop failures. Their
adaptive and pale palette models produce no usable orientation hypotheses.
The default palette attempts do not establish a supported outline; three
cases exhaust the additional search budget. This records the observed failure
stage without attributing every failure to angle selection alone.

A separate diagnostic supplies the known upright angle while keeping the same
segmentation fields. Neither that angle nor the earlier unbounded coarse scan
produces a supported proposal for those four photographs. Their adaptive/pale
models report that they cannot separate two paper colors from the background.
Default and anchored models either miss the lower edges, lose one lobe, or
reject the complete outline. One default proposal is within nine pixels of
the known corners but has zero support for one lobe. Accepting such guesses
would also admit the pale frame's 86-pixel corner error. Longer pose search
alone does not resolve these observed failures; segmentation and outline
inference need further work. Oracle angles are diagnostic inputs and are not
counted as automatic detections.

## Compare the same material locations

Changing a crop changes its target pixels. Error percentages computed in the
old and new crop squares are therefore not directly comparable. A separate
tool renders the old and new exported curves at 1,536 pixels and projects
512 × 512 canonical material samples into each crop. It compares both with the
same latent material label, restricting the calculation to the overlap
observed by both reconstructions and reporting that coverage explicitly.

| Case | Common observed overlap | Old noisy-crop pair error | New automatic-crop pair error |
| --- | ---: | ---: | ---: |
| Frame 764510 | 92.35% | 0.556% | 0.502% |
| Frame 829086 | 96.20% | 0.564% | 0.900% |

Thus the second reconstruction is **not more accurate under this material
metric**. Its identical-sheet preference is a deliberate tradeoff, and the
comparison does not hide it. The unobserved regions also prevent a claim of
whole-square accuracy. These latent-material scores differ from the
application's disagreement with the photographed color mask.

Exact outermost edge-transition counts remain noisy even in improved crops.
For example, the first frame changes from `[2,1,3,0]` to `[2,1,3,2]` around its
top/right/bottom/left edges. Successful reconstruction should not require
literal equality of these raw counts.

## Reproduce

The frozen input probe is documented in
[synthetic-intervention-probe.json](synthetic-intervention-probe.json). Every
output directory must be new. Downloaded or generated image bytes remain
outside Git; the reports preserve their hashes and paths.

```sh
node scripts/inverse/learning/photo-pipeline.mjs \
  --probe=tmp/heart-learning/color-interventions-v1 \
  --output=tmp/heart-learning/photo-pipeline-new
node scripts/inverse/learning/photo-alignment.mjs \
  --pipeline=tmp/heart-learning/photo-pipeline-new \
  --baseline=tmp/heart-learning/color-solves-final-v1 \
  --output=tmp/heart-learning/photo-alignment-new
node --test --test-concurrency=1 \
  scripts/inverse/oriented-crop.test.mjs \
  scripts/inverse/datasets/photo-labels.test.mjs
```

The 14 orientation regressions cover ten rotations, source-coordinate and
pixel-center conventions, immutable cached fields, a selected sideways heart
in a multi-heart scene, and rejection of unsupported lobes. Two independent
label fixtures check known camera transforms, background exclusion and crop
winding. Existing crop tests cover blank and non-heart inputs, pale paper,
unequal lobes, rough selections and the real orange-heart photograph.

The complete regression run passed 855 application tests (one skipped), 662
inverse tests, 33 offline learning tests and 13 collector tests, along with
type checking, lint and build. Type checking retains seven existing warnings
and no errors. The [validation record](orientation-validation.json) includes
the command logs and hashes.

A fresh Chromium session tested the built English Paint editor at
`http://127.0.0.1:5232/en/editor/paint/`. Both JPEG uploads went through actual
worker crop detection, mask preparation, import and template generation,
yielding checked 2+2 pairs in 5.74 and 8.34 seconds from upload. The UI uses its
normal 400-pixel mask, so its image errors (0.440% and 0.826%) are separate from
the 384-pixel Node replay. A third browser case selected the sideways heart in
a two-heart scene, obtained corners within 1.41 pixels, and imported the mask.
All three checks passed without page errors. Browser screenshots and exported
geometry remain in the local evidence directory. The first browser harness
attempt used the wrong translated route and then encountered a stopped preview
server; after correcting the route and restarting preview, the complete run
passed. It is preserved as a harness failure, not counted as a failed crop.

[The compact results](oriented-photo-results.json) retain all six outcomes,
the aligned comparison, source hashes, timings and oracle-pose diagnosis.
