# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. Offline studies cover synthetic
proposal learning and a small real-photo adaptation pilot. No learned model
has been added to the website.

The inventory, with material annotations updated on 2026-10-15, contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 1,034 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 573 | Includes multi-heart scenes and mixed photo/template pages; 461 reviewed near-duplicate groups. |
| Public Pinterest imports | 470 of 487 selected pins | 198 image files contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries in existing experiments | 192 | Original 128 plus 64 mixed-angle lattices; color phase is excluded from geometry identity; still only three recipe groups. |
| Synthetic photographic views in existing experiments | 768 | Original 512 plus 256 supplementary views; all 5,952 referenced assets verified. |
| Unassigned radial-motif candidates | 64 geometries / 256 views | One additional recipe group with exact shared approaches; not used in training. All 1,984 referenced assets verified. |
| Pretrained encoder checkpoints | 2 | MobileNetV3-Small: researched timm LAMB weights and the TorchVision weights used by the experiment. |
| Trained proposal models | 4 | Same 880,466-parameter network: random/ImageNet, balanced loss, and broader corner data; synthetic-only, offline. |
| Trained foreground models | 5 | RGB-only, 880,449 parameters; random/ImageNet, background augmentation, and paired clutter/control runs, all offline. |
| Decoder-adaptation checkpoints | 4 | One synthetic control and three grouped real/synthetic folds; no all-data or deployed model. |
| Training background variants | 2,040 | Five changes to each of 408 original training views; geometry labels and split groups unchanged. |
| Training scene variants | 2,448 | Neighbours and handles paired with all six backgrounds for the same 408 training views; no new geometry families. |
| Source-photo material QA samples | 78 | Three hearts in two reserved photographs; sparse assistant-reviewed development observations, not dense labels or training data. |
| Real visible-body annotations | 18 | Seventeen instances in fifteen groups outside source QA, plus one reserved gold-angel instance. Uncertain pixels are excluded; the eight additions to the original ten-instance pilot have not entered training. |
| Real partial paper-material annotations | 7 existing heart instances | Five earlier paper pairs plus red/green boar and pale/green rabbit silhouettes. Separate body and material uncertainty; no additional photographs and no material-trained checkpoint. |

## Current results and limits

The latest validated solver revision is `c000d30`. Its
[release record](return-projection-speed.json) passes **22/22 regular Hunodan
designs below ten seconds**, with a maximum of **8.100 seconds**. Automatic
cropping and fitting pass **25/31 hard photographs**. All 47 accepted editable
SVG pairs pass independent checks; all sixteen main Chromium workflows and
four additional budget comparisons pass. Full QA passes 853 inverse tests,
857 application tests (one existing skip), type checking, lint and build.
The preceding `99399ff` [release record](small-feature-release.json) is preserved.

These are complete-pipeline results on fixed development benchmarks, not all
573 collected photo files. The six photographic failures remain unresolved.
[Controlled crop interventions](remaining-photo-failures.md) recover three,
but do not establish a reliable automatic detector. Pale-material loss,
inconsistent border transitions and small-feature loss also occur. Agreement
with an estimated photographic mask is not agreement with unavailable original
artwork. Native ten-second results are not browser latency guarantees; the
Viking browser flow takes 29.71 seconds with its ordinary 180-second allowance.

### Latest solver and browser validation

Runtime revision `c000d30` passes **853/853 inverse tests**, **857 application
tests** (one existing skip), type checking, lint and build. The pinned run
verifies all 845 recorded source files. The fresh Hunodan comparison passes
**22/22 within ten seconds**, maximum **8.100 seconds**, with 21 mask errors
unchanged and the bird improving from 0.8444% to 0.8022%. Source photographs,
crop coordinates and settings are unchanged. The photographic comparison
retains **25/31**, with seven errors lower and none higher; the leaf improves
from 2.5625% to 1.3163%. All photographed inputs, selected corners and classified
masks are unchanged. The same six failures remain. All **47 accepted editable
SVG pairs** pass independent source-feature, geometry and paper checks. All
sixteen main browser workflows pass, as do shifted-star and leaf uploads with
both the ordinary allowance and an explicit ten-second worker request. The
actual downloaded SVGs pass independent 400/800-pixel checks.

Fresh Draw and Paint contexts make no initial solver/WASM requests. Their
initial JavaScript sizes are unchanged at 473,483 and 503,384 bytes. The
corrected browser harness checks current served bytes and compares bundle
sizes; it no longer requires content-hashed filenames from an older build.
All application JS/CSS size multisets match, but only 31 of 68 assets have
identical content. Build-version changes propagate through hashed imports.
The original harness failure and two correction attempts remain in the record.

A newer [shared-alignment optimization](shared-alignment-speed.md) checks an
existing cutting-quality rejection before the full geometry audit. It produces
identical final curves across 47 frozen accepted exports, reducing their total
alignment time from 29.44 to 26.52 seconds; 110 focused tests pass. Fresh full
QA on runtime `b8e20f2` passes 853 inverse tests, 857 application tests (one
existing skip), type checking, lint and build; all 848 pinned source files
remain unchanged. Fresh Hunodan fitting passes 22/22 within ten seconds
(maximum 8.149 seconds), with all 22 image errors unchanged from `c000d30`.
The photo replay retains 25/31 passes and all 47 editable pairs pass, but three
image errors increase slightly, failing the strict comparison gate. Browser
replays and preview refresh were skipped. The leaf exposes a best-intermediate
alignment issue; the two checkerboards stop refinement fifteen steps earlier.
The failed record is retained. This is not a validated whole-pipeline speedup.

The [long-budget leaf diagnosis](long-budget-selection.md) confirms identical
prepared inputs and initial grid scores in the ordinary and ten-second browser
runs. The longer request returns a valid traced recovery before trying grids;
the shorter one reaches a better grid refinement. The first queued comparison did not run after the sharing release failed.
A new twenty-run isolated comparison uses the validated runtime: extending
routing interpolation to long searches reduces the original leaf error from
2.6050% to 1.3163%, with all sixteen long-budget arms passing. The short
vertically shifted control fails at 4.9769%, exposing a skipped clearance-grid
comparison. These are fixed-mask development results; no policy is adopted.
A [repeated clearance-window study](clearance-window.md) recovers the downward
leaf shift in both repeats; the upward shift exposes a separate shortlist
cutoff. A [best-source-prefix sharing experiment](shared-prefix.md) gives
mixed independent-render results and is rejected for adoption.
A [36-run shortlist follow-up](clearance-candidate-repair.md) improves the
right-shifted leaf and exposes a genuinely invalid clearance initializer in
the upward shift. Standalone bounded refinement repairs that seed and passes
the finer paper audit. The [bounded integration](clearance-repair-integration.md)
now passes focused fresh-solve and flower regressions while retaining all final
checks. Two shortlist variants exposed and corrected count-diversity issues;
the corrected paired replay and full corpus/browser checks remain pending.

The [short-search scheduling correction](photo-feature-stability.md) reserves
curve-refinement time for nearly fitting grids while retaining routing priority
when a grid loses a protected feature. Its fixed shifted-star prototype improves
independent disagreement from 2.9869% to 0.7569%, and the leaf from 2.5625% to
1.32875%; these are earlier experimental results, not new corpus measurements.
Subsequent fixes preserve feature-tradeoff routing and useful small junction
probes. A confirmed HiGHS clock bug charged previous native solve time again
on later rounds; resetting native clocks preserves the outer deadline and
restores the intended per-round budget. Reports retain search timing,
skipped-repair reasons and initialization costs.

The [return-projection optimization](return-projection-speed.md) addresses a
separate anchor-repair timeout, also reproduced on the older validated runtime.
It preserves all 104 probe decisions and all 27 accepted cut geometries while
reducing their total projection time by about 30%. Intermediate iterations check
the return constraints; the complete geometry validator still gates every
returned repair. The full QA run includes the previously failing anchor case.
This is a local-operation speed result, not whole-pipeline or browser latency.

Earlier failed checks remain in the [routing](routing-budget-blend.json),
[retry](routing-retry-budget.json) and
[clock/initialization](routing-initialization-budget.md) records. The separate
initialization and repair-budget experiments remain unadopted.

A separate [render-test correction](shape-render-validation.md) avoids system
font discovery for text-free SVGs. All 152 paired renders are byte-identical;
it changes test performance, not the application renderer or solver quality.
The newest reviewed [Pinterest annotations](real-pinterest-annotations.md)
bring the body-label inventory to eighteen; the original ten-photo training
pilot remains unchanged.

### Neural experiments

No learned model is deployed. The approximately 880,000-parameter
[MobileNetV3-based proposal model](boundary-localization.md) benefits from
pretraining, but [the app initializer](app-baseline-correction.md) still has
better one-pixel boundary localization. Learned graph proposals have not yet
established better complete-template recovery or total solve time.

[Grouped real/synthetic adaptation](real-adaptation.md) improves known-region
foreground IoU from 76.95% to 78.63% on the ten-instance pilot. Full reconstruction
still passes 3/10 with the learned fields versus 4/10 with the existing cropper.
A separate [six-label diagnostic](real-supplement-diagnostic.md) passes 2/6 with
the frozen scene model versus 1/6 with the existing cropper. These small,
repeatedly inspected sets are distinct from the 31-photo benchmark and do not
justify a global replacement. The seven partial material labels and joint loss
are implemented and checked. A [tested decoder transfer](material-transfer.md)
preserves the learned foreground output when adding paper identities; no
material model has been trained. The
[earlier Pinterest annotations](pinterest-material-labels.md) include uneven
lighting on the same pale paper. The [two silhouette annotations](motif-material-labels.md)
add boar and rabbit interiors with contour shadows; all retain the existing
body labels unchanged.

The [experiment history](experiment-history.md) preserves earlier measurements,
failed alternatives and superseded verification states. Individual reports
retain source hashes, commands and limitations; their historical “current” or
“pending” statements should not replace the status above.

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
The [current geometry re-audit](synthetic-current-geometry.md) checks all 256
saved witnesses, including the 64 unassigned radial designs, against today’s
geometry and paper rules. All pass, with consistent decisions across 768
original/subdivided/reflected representations. These are planar simulations
with limited procedural motif diversity, not substitutes for real photographs.

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

`scripts/inverse/datasets/real_materials.py --output=<new-directory>` compiles
the reviewed material sidecar at 256 pixels (`--resolution=768` for inspection);
`--verify` rechecks the source photographs, pinned body annotations and every
RGB/body/material/overlay pixel. Its training loader checks current source QA
reservations even with historical catalogs. Unlabelled material remains 255,
including known body that still contributes to the independent foreground
loss. `joint_material_loss` permits one global A/B exchange per image, never a
separate exchange at every pixel. It also retains fractional synthetic material
coverage, so antialiased boundary targets need not be thresholded. This is
material supervision, not cut-path ground truth, and no real train/test
allocation has been added.

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

The [latest completed release record](small-feature-release.json) pins
its solver, application and browser checks. The newer runtime passes full QA
in [its separate record](return-projection-speed.json), with passing native
corpus and editable-export comparisons; browser checks remain pending.
Earlier and interrupted validation runs remain in the
[experiment history](experiment-history.md).
The synthetic verifiers checked all 5,952 referenced assets, and the real-image
audit checked all 1,034 source files and decoded image identities. Gallery
browser checks are recorded in the real-photo collection report.

Whole-pipeline comparisons must report time, valid-template recovery, mask and
feature error, candidate graph size, and sensitivity to crop, color and noise.
A lower aggregate pixel error must not conceal missing rays or false seams.
