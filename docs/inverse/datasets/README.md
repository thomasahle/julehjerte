# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. Offline studies cover synthetic
proposal learning and a small real-photo adaptation pilot. No learned model
has been added to the website.

The 2026-10-14 snapshot contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 1,034 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 573 | Includes multi-heart scenes and mixed photo/template pages; 461 reviewed near-duplicate groups. |
| Public Pinterest imports | 470 of 487 selected pins | 198 image files contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries | 192 | Original 128 plus 64 mixed-angle lattices; color phase is excluded from geometry identity; still only three recipe groups. |
| Synthetic photographic views | 768 | Original 512 plus 256 supplementary views; all 5,952 referenced assets verified. |
| Pretrained encoder checkpoints | 2 | MobileNetV3-Small: researched timm LAMB weights and the TorchVision weights used by the experiment. |
| Trained proposal models | 4 | Same 880,466-parameter network: random/ImageNet, balanced loss, and broader corner data; synthetic-only, offline. |
| Trained foreground models | 5 | RGB-only, 880,449 parameters; random/ImageNet, background augmentation, and paired clutter/control runs, all offline. |
| Decoder-adaptation checkpoints | 4 | One synthetic control and three grouped real/synthetic folds; no all-data or deployed model. |
| Training background variants | 2,040 | Five changes to each of 408 original training views; geometry labels and split groups unchanged. |
| Training scene variants | 2,448 | Neighbours and handles paired with all six backgrounds for the same 408 training views; no new geometry families. |
| Source-photo material QA samples | 78 | Three hearts in two reserved photographs; sparse assistant-reviewed development observations, not dense labels or training data. |
| Real visible-body annotations | 16 | Fourteen source groups outside reserved source QA; uncertain pixels excluded. The original ten-instance adaptation pilot is unchanged; six reviewed additions have not entered training. |

## Current results and limits

The [Pinterest expansion](real-pinterest-expansion.md) includes all four supplied
pins. Download success, photograph count, heart-instance count and motif-family
count are different measures. Of the 1,034 source files, 475 remain reserved by
existing QA or connected source groups; the rest still need family, instance
and usage review before allocation. See the [real audit](real-validation.json)
and [synthetic asset checks](synthetic-batch.json).

The [latest completed fitter release](junction-recovery.md) passes all 22
regular Hunodan designs below ten seconds (maximum 8.07 seconds, unchanged
errors) and retains hard-photo recovery at **25/31**. All 25 pairs
also pass production editable conversion and independent geometry/paper checks.
Verification includes 791 inverse tests, 855 application tests, ten Chromium
flows, type checking, lint and build. These
31 photographs are a fixed reconstruction benchmark, not the full collected
573-file photographic corpus.

The [shared-return follow-up](visible-shared-returns.md) reduces two star notches
and protects real corners against one-pixel source shifts. Its latest scheduling
fix, `fa7774c`, reserves time for shared-cut alignment after speculative repairs.
Its completed checks retain eight fixed crop variants through editable conversion
and restore the Viking's 15.21 mm alignment. Historical score differences and
the earlier Hunodan paired-run exception remain recorded in that report.

The [interior-tint crop fallback](interior-palette.md) recovers the previously
undetected blue outlined star. All 28 existing crops and classified masks remain
identical; the other two missing crops remain unresolved. The first release run
stopped when JPEG recompression caused a missing crop. A bounded repair to the
physical-paper registration mask resolves that failure, and the complete replay
now passes original, JPEG and half-resolution uploads through the browser and
editable export. Original and JPEG exports retain all 28 reviewed star points.
The preview at `http://127.0.0.1:5232/editor/mal/` serves the checked build.
Visible contour defects remain. The latest junction-recovery release takes
8.65 seconds for the original star and 28.14 seconds for the Viking; native
ten-second benchmarks are not browser latency guarantees. Nothing is pushed or
deployed.

An offline [star input intervention](star-input-factorial.md) separates JPEG
pixel changes from crop changes. A stronger provisional trace followed by longer
common Bézier refinement reduces the original fixed-mask error from 1.3063% to
1.1556%, with fewer curves; editable export and all 28 source observations pass.
This was one controlled case, not a whole-pipeline speed result. It exposed
sensitivity in routing topology and refinement scheduling and motivated the
bounded fallback below.

The [bounded junction-recovery follow-up](junction-recovery.md) implements that
alternative in the main fitter. Focused tests, all 22 Hunodan cases and all 25
previous hard-photo passes hold, including editable conversion. Full inverse,
application and ten rebuilt-browser flows pass; the preview serves the checked
build. The original star's browser editable error is 1.153125%, while the
half-resolution variant retains visible contour defects. Five passing native
photo cases have slightly higher errors, by at most 0.068125 percentage points;
pass retention does not imply uniform error reduction.

All neural models remain offline. [Balanced corner training and broader angle
coverage](boundary-localization.md) improve synthetic junction proposals, but
[the current app initializer](app-baseline-correction.md) still has better
one-pixel boundary localization. Learned proposal scores have not established
an advantage in complete template recovery or solving time.

[Grouped real-photo adaptation](real-adaptation.md) improves known-region
foreground IoU from 76.95% to 78.63% on the ten-instance pilot. Its full mask-to-cut
pipeline still checks only 3/10 pairs, compared with 4/10 for the current cropper
on that diagnostic. The [annotation report](real-annotation-pilot.md) explains
unknown pixels, grouping and scope. A [two-image supplement](real-annotation-supplement.md)
adds blue/yellow paper and decorated baskets on pale backgrounds.
[Two more annotations](real-motif-annotations.md) add boar/rabbit
motifs, a clipped lobe and textured fabric with strong shadows; they also remain
outside training. The [scene supplement](real-scene-annotations.md) adds reflective
gold paper and hands occluding a heart, with uncertain contact regions withheld.
More checked real labels, distinct motif
families and complete photo-to-export measurements are the next data priorities.

The [six-label frozen follow-up](real-supplement-diagnostic.md) now evaluates
the additions without training. The scene-trained model has 87.20% mean
known-region foreground IoU, versus 50.28% for its background-only control.
Complete reconstruction checks pass 2/6 with its fields, 0/6 with the control
and 1/6 with the current production cropper. All three accepted pairs survive
editable conversion. Reflective wood, hands and inadequate lobe-outline evidence
remain failures, and the blue/yellow checker still uses an extra slit. These
six inspected observations are separate from both the original ten-photo pilot
and the fixed 31-photo benchmark; the model is not deployed.

The [experiment history](experiment-history.md) retains the earlier studies,
failed alternatives and verification records without mixing their historical
scores into the current summary.

## Collected assets

The [real-photo collection](real-collection.md) records original image URLs,
source pages, retrieval times, file hashes, dimensions, visual classifications
and duplicate groups. The [manifest](real-manifest.json) is the inventory;
downloaded image bytes stay under `tmp/heart-training-real/`, outside Git.
Photographs, scans, illustrations, composites and irrelevant images are counted
separately. A photograph containing twenty hearts is one source image until
its individual heart instances have been annotated.

Open `tmp/heart-training-real/index.html` for the filterable local photo gallery,
and `tmp/heart-training-synthetic/batch-v1/index.html` for synthetic comparisons.

Public Pinterest pins can be imported from an explicit URL list or bounded
keyword discovery and related pin records exposed by public pages. The importer
uses the main image advertised by the public page, choosing its original-size
URL when the page actually supplies one. It records the pin and image URLs;
it does not infer missing full-resolution URLs. Some returned pins contain
unrelated material, so download success alone does not admit a training photo.

The [synthetic generator](synthetic-training.md) creates new validated template
pairs, then varies paper color, lighting, background, pose, perspective, blur,
compression and crop error. Every image retains its exact canonical curves,
phase, shared-edge identities and coordinate transforms. Geometry and nominal
paper checks run before admission, followed by an independent exported render.
These are planar simulations with limited procedural motif diversity, not
substitutes for real photographs.

The selected first encoder is [MobileNetV3-Small](pretrained-models.md). The
research document compares eight pretrained alternatives and records their
sources. The runnable experiment uses the already installed TorchVision model
and its separately hash-verified checkpoint, rather than the researched timm
LAMB checkpoint. Browser inference speed and ONNX export remain unmeasured.

## What the network should learn

The [full-photo foreground labels](foreground-supervision.md) add physical
paper/background supervision for all 768 existing synthetic views, including
both lobes and both paper colours. They preserve the original images and recipe
splits. This supports a separate full-photo localization task. Foreground
models have been trained offline; none is added to the website.

Start with rectified RGB plus the existing uncertain color mask. Predict paper
membership, visible boundaries, junctions and border endpoints. Score a small
set of proposed connections using those features. Keep the MILP, curve
refinement and independent geometry checks in charge of accepting templates.

Synthetic examples provide precise graph supervision. Real photographs still
need checked overlap corners, visible material boundaries and heart-instance
annotations. Linked template downloads are candidate references until their
relationship to the photograph and cut geometry has been verified. Existing
solver outputs are not automatically ground truth.

A cut graph is a valid witness, not a unique answer: hidden shared cuts can
have several valid routings. Do not label every unused connection as a negative.
Keep shared curves as one geometric object, handle interchangeable sheet labels,
and measure whether the proposed graph admits a valid solution within the
overall time budget.

## Keep evaluation separate

Existing Hunodan and photographic QA inputs stay reserved for evaluation.
Reposts, resolutions and collage crops inherit the same source-photo group;
motif families must also stay together before any train/test split is assigned.
The real-image inventory intentionally leaves unreviewed family assignments
unassigned. A file hash or perceptual similarity score alone is insufficient
to establish that two motifs are unrelated.

All synthetic lattice variants share one training recipe group; channel and
frame recipes are reserved for validation and test respectively. These are
**recipe holdouts, not topology-disjoint evaluation sets**: for example, a
one-cell shared lattice and a channel can describe the same routing after
redundant subdivisions are removed. A future motif/topology-aware split must
account for these equivalences. Photometric view counts and stored graph
signatures must not be presented as counts of independent motif families.

Image accessibility, attribution and declared usage terms are recorded
separately from visual suitability. The source collection is an inventory for
review, not a redistribution package or a claim that every image is cleared
for training.

## Reproduce and verify

Follow the real and synthetic documents above for collection/generation commands.
The synthetic output directory must be new so inspected experiments are not
overwritten. The verifier checks asset hashes, source grouping and projective
label consistency after copying a dataset.

```sh
node --test --test-concurrency=1 scripts/inverse/datasets/*.test.mjs
python3 scripts/inverse/datasets/real-collect.test.py
```

The Node dataset tests are included in `npm run test:inverse`. The Python
collector tests are offline and require Pillow, which is already present in
the collection environment. No new project dependencies were installed.

The [latest completed release record](interior-palette-release.json) pins
its solver, application and browser checks, including all 153 served build
assets. The [release report](interior-palette.md) records focused tests,
interrupted attempts, visual limitations and the completed QA separately.
Earlier validation records remain in the [experiment history](experiment-history.md).
The synthetic verifiers checked all 5,952 referenced assets, and the real-image
audit checked all 1,034 source files and decoded image identities. Gallery
browser checks are recorded in the real-photo collection report.

Whole-pipeline comparisons must report time, valid-template recovery, mask and
feature error, candidate graph size, and sensitivity to crop, color and noise.
A lower aggregate pixel error must not conceal missing rays or false seams.
