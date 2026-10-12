# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. A first synthetic-only neural
comparison is complete; no learned model has been added to the website.

The 2026-10-12 snapshot contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 1,034 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 573 | Includes multi-heart scenes and mixed photo/template pages; 461 reviewed near-duplicate groups. |
| Public Pinterest imports | 470 of 487 selected pins | 198 image files contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries | 192 | Original 128 plus 64 mixed-angle lattices; color phase is excluded from geometry identity; still only three recipe groups. |
| Synthetic photographic views | 768 | Original 512 plus 256 supplementary views; all 5,952 referenced assets verified. |
| Pretrained encoder checkpoints | 2 | MobileNetV3-Small: researched timm LAMB weights and the TorchVision weights used by the experiment. |
| Trained proposal models | 4 | Same 880,466-parameter network: random/ImageNet, balanced loss, and broader corner data; synthetic-only, offline. |

The latest [Pinterest expansion](real-pinterest-expansion.md) downloaded 428 of
442 visited pins, including all four user-supplied examples. After merging, it
added 362 source files, 176 photo-containing files and 116 reviewed photo groups
to the previous snapshot. These are source-image counts, not heart-instance
or independent motif-family counts.

The [localization follow-up](boundary-localization.md) found that the original
synthetic training split contained no acute or right-angle degree-two corners.
Adding a validated corner supplement at the same 520-update training budget
raised junction F1 from 61.92% to 82.05% on channel views and from 57.40% to
87.95% on frame views. The existing trace still has better boundary F1 on both
recipe groups. These are repeatedly inspected synthetic diagnostics; no
real-photo or full-solver improvement is established yet.

The [corrected app baseline and controlled diagnosis](app-baseline-correction.md)
also compare the automatic fitter's actual boundary initializer. Earlier trace
comparisons used the older `GENERAL_PRESET`; their frozen inputs and model
results remain unchanged. Candidate-knot F1 alone does not establish whether
the current application can reconstruct a template.

Controlled photo interventions now distinguish crop errors from color, blur
and compression sensitivity. Running the complete fitter on those 36 views
also exposed a false seam that passed aggregate checks. The shared-cut repair
now considers whole curve joins, and a separate fix stops straight cuts from
being rejected as zero-radius bends. The [diagnosis](app-baseline-correction.md#full-fitting-exposed-a-separate-seam-defect)
records the remaining border defects and the limited synthetic scope.

The [rotation study](oriented-photo-recovery.md) linked a remaining frame defect
to crop geometry and introduced pose search using a fixed paper segmentation.
The [background-model follow-up](background-photo-recovery.md) now recovers
all six diagnostic photographs and all 24 photographs in an additional
family-balanced synthetic sample. It separates background brightness variation
from color changes and refines the orientation of promising rejected outlines.
All 30 complete replays produce checked templates; three of the additional
sample's dense lattices exceed ten seconds overall. A
[shared-cut ordering follow-up](shared-cut-order.md) resolves the pale frame's
faint seam by retrying alignment after straight-span selection, retaining the
useful earlier alignments and the existing cleanup budget. The unnecessary
extra cut in another frame remains a complexity issue despite passing checks.
Common-coordinate comparisons document accuracy tradeoffs, including the
preference for matching sheets within the user's one-percentage-point limit.

Of the real-source files, 475 are reserved by existing QA or connected source
groups. Remaining files still need instance, motif-family and usage review;
they are not automatically a labeled training set. The
[real audit](real-validation.json) and [synthetic batch evidence](synthetic-batch.json)
retain the precise counts and checks.

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

The [first neural comparison](boundary-learning.md) trained both initializations
for 20 epochs against exact synthetic boundary and junction labels. Pretraining
helps this small network: held-out channel/frame junction F1 is 43.58%/41.82%,
versus 3.20%/8.88% from random initialization and 17.81%/21.10% from the existing
trace. However, the pretrained model loses to the trace on development junction
F1 and still misses most held-out corners. Thick neural boundary predictions
also flatter the pixel-tolerance metric. This is a useful starting experiment,
not evidence of a better complete solver or real-photo reconstruction.

## What the network should learn

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

The [shared-cut follow-up](shared-cut-order-results.json) passed 855 application
tests (one skipped), 677 inverse tests and 16 Chromium cases, along with type
checking, lint and build. Type checking retains seven existing warnings and no
errors. The [preceding background validation](background-validation.json) also
records 33 offline learning tests and 13 collector tests. The
[previous orientation validation](orientation-validation.json),
[intervention validation](intervention-validation.json),
[localization validation](localization-validation.json)
and [earlier snapshot validation](learning-validation.json) remain
available. The synthetic verifiers checked all 5,952 referenced assets across
the original batch and corner supplement, and the real-image audit checked
all 1,034 source files and decoded image identities.
Gallery browser checks are recorded in the real-photo collection report.
The earlier application/solver release checks are recorded in
[the solver validation report](../CONNECTOR-RETRY-VALIDATION.json). Neural
inference remains offline; the shared-cut fixes change geometric fitting and
the orientation and background models change photographic crop proposals.

The corrected component comparison uses the current app initializer; the
initial experiment also tests the same small network initialized randomly.
The selected synthetic interventions now include full solves. Next, report
whole-pipeline time, valid-solution recall, mask and feature error, candidate
graph size, and sensitivity to crop/color/noise perturbations on held-out real
photographs. A lower pixel error must not conceal missing rays or false seams.
