# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and a verified pretrained encoder checkpoint. No model has been trained or
added to the website yet.

The 2026-10-12 snapshot contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 672 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 397 | Includes multi-heart scenes and mixed photo/template pages; 345 reviewed near-duplicate groups. |
| Public Pinterest imports | 42 of 45 selected pins | 22 contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries | 128 | Color phase is excluded from geometry identity; only three procedural recipe groups. |
| Synthetic photographic views | 512 | Exact curve/phase/projection labels; all 3,968 referenced assets verified. |
| Pretrained encoder checkpoint | 1 | MobileNetV3-Small; downloaded, not trained or deployed. |

Of the real-source files, 372 are reserved by existing QA or connected source
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

Public Pinterest pins can be imported from an explicit URL list. The importer
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

The selected first encoder is [MobileNetV3-Small](pretrained-models.md), with an
approximately 10.2 MB checkpoint already downloaded and hash-verified. The
research document compares eight pretrained alternatives and records their
sources. Browser inference speed and ONNX export remain unmeasured.

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

Snapshot verification passed five Node dataset tests, ten offline collector
tests, Python compilation and project lint. The synthetic verifier checked all
3,968 referenced assets, and the real-image audit checked all 672 source files
and decoded image identities. A Chromium check of the local gallery verified
the complete inventory, photo/template/all filters and image loading without
page errors. The earlier application/solver release checks are recorded in
[the solver validation report](../CONNECTOR-RETRY-VALIDATION.json); data tooling
does not change production inference.

Before evaluating a learned proposal model, compare against the current
geometric pipeline and the same small network initialized randomly. Report
whole-pipeline time, valid-solution recall, mask and feature error, candidate
graph size, and sensitivity to crop/color/noise perturbations on held-out real
photographs. A lower pixel error must not conceal missing rays or false seams.
