# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. A first synthetic-only neural
comparison is complete; no learned model has been added to the website.

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
| Real visible-body annotations | 10 | Eight source groups outside reserved QA; uncertain outline/occlusion pixels excluded, five approximate overlap references; temporary grouped adaptation only. |

The latest [Pinterest expansion](real-pinterest-expansion.md) downloaded 428 of
442 visited pins, including all four user-supplied examples. After merging, it
added 362 source files, 176 photo-containing files and 116 reviewed photo groups
to the previous snapshot. These are source-image counts, not heart-instance
or independent motif-family counts.

The [real annotation pilot](real-annotation-pilot.md) adds ten reviewed visible
basket masks with explicit uncertain regions, without using solver output as
ground truth. A frozen-model comparison improves known-region IoU from 57.56%
to 76.95% with clutter training, while known-paper loss rises from 0.47% to 6.14%.
Hands, pale textured backgrounds, borders and tips remain problematic. The
examples retain their source/duplicate grouping; cross-corpus motif review and
global allocation remain pending. This is a development diagnostic, not a new
production or unseen-test score.

The [grouped real-photo adaptation](real-adaptation.md) subsequently trains only
the 9,889 decoder parameters, keeping encoder weights and batch-normalization
statistics frozen. Known-region IoU rises from 76.95% to 78.63% when each real
photo is evaluated outside its training group. The complete Mal mask pipeline
still yields only 3/10 checked pairs, the same as further synthetic training and
below the current cropper's 4/10 on this pilot. A sloth crop shift smaller than
one source pixel changes trace routing and raises final disagreement from 1.37%
to 5.43%. Neither the segmentation average nor those crop coordinates establish
a reconstruction improvement. All learned models remain offline.

The new [search-scheduling study](search-scheduling.md) reaches 8/8 checked
editable pairs on the same fixed sloth crop variants, compared with 5/8 in a
fresh baseline run. It preserves useful grid reservations, shares the short
topology-initialization allowance and distinguishes near-repairable traces
from larger raster returns. The committed implementation reproduces the result
below ten seconds per case. Fresh broader replays retain 22/22 regular Hunodan
designs, with identical errors and a maximum of 8.25 seconds, and 24/31 hard
photographs. The corrected scheduling tests preserve the original image-quality
limit and add a real-photo deferred-recovery case. Full release QA is complete
with the routing-timeout follow-up below.

That browser QA exposed a remaining [routing timeout cliff](routing-timeout.md):
the same shifted mask could finish in 8.7 seconds with two cuts per sheet, or
take 54–56 seconds and return a poorer six-cut pair. A controlled prototype
gives the sparse graph its full remaining recovery allowance, recovering the
two-cut pair in 8.5–8.6 seconds with 1.48% editable disagreement. All ten
prototype browser flows pass. Fresh committed-runtime replays retain all eight
checked crop variants, 22/22 regular Hunodan designs with unchanged errors, and
24/31 hard photographs. All 772 inverse tests, 855 application tests and ten
rebuilt Chromium flows pass; eight flows also check PDF download signatures.
The final production replay recovers the shifted mask in 8.75 seconds with
1.48% editable disagreement. The [release record](routing-timeout.json) pins
the full verification; no new corpus-wide improvement is claimed.

The [polishing checkpoint follow-up](polishing-alternative.md) finds and fixes
an omitted finer-paper check on retained final-polish alternatives. A controlled
Chromium pair improves the same blue-star mask from 0.596% to 0.545% editable
disagreement, taking 8.36 seconds instead of 7.62 seconds. Geometry and paper
checks remain mandatory; the photographed border loss and visible notches remain.
The focused tests pass; broader release QA is still running. This is a fitter
change, not deployment of the neural cropper or a new full-corpus result.

A [fresh neural fallback replay](neural-fallback-current.md) now passes the two
frozen foreground models through the current binary-mask fitter on the three
production no-crop failures. Both recover a numerical blue-star pair; neither
recovers nested squares or Santa. The background proposal retains all 28 frozen
source observations, while the scene proposal crops away one border detail
despite its lower mask error. Visible curve artifacts remain. Source-photo QA
is now built into the offline replay; no model is enabled in the website and
the production benchmark remains 24/31.

A read-only [neural fallback source review](neural-fallback-source-review.md)
checks 28 frozen original-photo observations on the blue outlined star against
existing offline outputs. The background model retains 28/28; the scene model
crops away a lower blue border point and retains 27/28. The missing point stays
in the denominator. No new model or fit was run, and sparse agreement does not
certify the previously observed tiny seams or physical corner locations.

The preceding [clearance-routing follow-up](clearance-routing-repair.md) also
repairs near-valid nonlocal narrow sections and retains finer paper verification
through refinement and export. The same eight fixed crop variants improve from
3/8 to 5/8 checked editable pairs, with unchanged source masks and acceptance
limits. The complete automatic-photo benchmark remains 24/31, and all 22 regular
Hunodan designs retain their previous errors below ten seconds. Three crop
variants still fail because of search scheduling or the selected trace; this
does not establish a neural-model advantage. All 767 inverse tests, 855
application tests and seven Chromium upload/example/export flows pass. The
vertical sloth upload exercises the finer paper lattice through the browser
and editor, with 1.45% editable disagreement in 10.01 seconds on its separately
recorded 400-pixel mask.

The preceding [rejected-routing repair](rejected-routing-repair.md) connects
nearly valid MILP proposals to bounded continuous refinement. On eight fixed
sloth crop variants, independently checked editable pairs improve from 1/8 to
3/8 without changing the source masks or acceptance limits. The full automatic
photo benchmark remains 24/31. A repeated Hunodan run passes all 22 quality and
ten-second gates with unchanged errors; the earlier 20/22 run and paired
follow-ups remain recorded. All 763 inverse tests, 855 application tests and
five actual Chromium upload/export flows pass; the sloth upload takes 7.70
seconds on its separately recorded 400-pixel paint mask.

The [clutter-training follow-up](foreground-scene-learning.md) raises selected-body
IoU on controlled neighbouring-heart scenes from 61.86% to 95.01% with the same
background draws and update budget. Both models still produce only five numerical
passes on the real inputs. The new bauble pass loses much of its pale frame before
fitting, and the eight-point star loses its crop. This is evidence of a synthetic
segmentation improvement, not a recovered real design or a production gain.

The [source-photo review](source-photo-material-review.md) adds observations that
do not change with the classifier's mask. It separates the bauble's four frame
samples excluded by the neural crop from two further classification losses.
Bounded restoration and local contrast produce a candidate mask retaining all
26 samples. Fresh fitting fails at ten seconds, but a thirty-second run finds
a checked 5+4-cut pair at 1.733% mask disagreement and retains all samples.
The preprocessing remains experimental, visible artifacts remain, and this is
not a new production success. The derived mask is preserved for search diagnosis.

The [early routing follow-up](early-feature-routing.md) reduces that fixed-mask
fit to 1.721% disagreement in 9.369 seconds, retaining all 26 reviewed samples.
It tries a better layout for a poorly preserved region before the region
disappears, after allowing ordinary traced recovery to finish. Four selected
mask transformations pass within ten seconds; the full photograph pipeline
remains 24/31. All 22 regular Hunodan designs retain their release quality gates
under ten seconds. The crop and color prototypes remain offline.

The [geometry optimization](geometry-pruning.md) speeds up clearance and
intersection query batches by roughly 2–3× with identical query outputs.
A separate [search-scheduling change](verified-fit-comparison.md) preserves the
ordinary finalists, then directly tests competitive simpler layouts. In paired
Chromium runs it reduces the maple leaf from 21.88 to 15.93 seconds with
byte-identical cutting geometry, and the floral checker from 27.91 to 25.15
seconds with lower editable-mask disagreement. The full photo score remains
24/31; all 22 Hunodan errors are unchanged and their controlled timings remain
below ten seconds. The slower dense cases and real-photo preprocessing still
need further work.

The [background-training follow-up](foreground-background-learning.md) isolates
a concrete domain gap: plain white backgrounds reduce the original model's
paper IoU from 98.96% to 52.78% on controlled photographs. Background variants
raise it to 97.87% at the same training-update budget. The full replay recovers
five numerically accepted real-photo pairs, including the previously unresolved
blue outlined star. All 24 collage crops still fail; one synthetic crop regresses
and small visual defects remain. The network stays offline, with no new claim
for the production benchmark.

The original [foreground-model experiment](foreground-learning.md) compares random and
pretrained initialization using 768 verified physical-paper labels. Pretraining
raises synthetic holdout silhouette IoU to about 98.9%, but none of the 31 real
photographs yields a strongly supported crop from the frozen network. A
12-view synthetic replay compares production, learned and perfect foregrounds
through classification, fitting and independent export: each returns 11 checked
pairs, with no improvement in mean latent-artwork error. The clipped twelfth
view shows why a plausible predicted shape is not evidence for hidden corners.
The application remains unchanged; the real-photo domain gap is retained in
the report rather than hidden by the synthetic average.

A [subsequent crop-to-fit diagnosis](feature-near-miss.md) identifies a separate
initialization cutoff in the main fitter. A feature-retaining layout just above
the coarse cutoff now gets one bounded refinement before a joint count change.
A new Stonehenge crop improves from 4.70% to 2.67% disagreement. Its initial
one-pixel crop shifts remained failures. The original real-photo corpus stays at 24/31, while
all 22 regular Hunodan cases keep their previous errors and finish below ten
seconds. The experimental neural cropper is still not enabled in the app.

The [retained-start follow-up](retained-grid-starts.md) finds that a weighted
mean discarded a useful three-cut start which was already available. Reusing
that start before adding cuts improves the horizontal crop-shift case from
3.58% to 2.47% without changing its pixels or acceptance rules. The vertical
shift remains unresolved in fresh solving; finer paper checks alone did not
fix it. A controlled continuation from another crop's saved fit does meet the
same limits, pointing to further work on starting shapes and routing. The
guarded production change passes 731 inverse tests and five browser/export
flows; all 22 Hunodan cases retain their previous errors below ten seconds.

The [initializer-resolution study](initializer-resolution.md) finds a fresh
2.89% fit for the remaining vertical shift by changing row-DP sampling, while
keeping the crop, source pixels and final checks fixed. A global replacement
regresses other cases. A bounded alternative improves the nine-crop development
set from 5/9 to 6/9 but slightly increases some errors. Both policies remain
experimental; production behavior and the broader benchmark are unchanged.

The [sampling-fallback follow-up](sampling-fallback.md) turns that finding into
a bounded production comparison: a fresh feature grid can go first only after
geometry and paper checks, and must improve initial image agreement when the
original grid is valid. Exact repeated rollback cycles are skipped without
changing their selected coordinates. The nine-crop development study improves
from 5/9 to 8/9; the broader corpus remains 24/31, and all 22 Hunodan errors
remain unchanged below ten seconds. Fine sun rays are still visibly smoothed,
showing why global pixel error alone does not establish faithful reconstruction.

The [outline-detail follow-up](outline-detail.md) locates a separate obstruction:
global refinement damages a small paper core near the fold and rolls back useful
changes around the sun. Residual-selected curve subdivision with fixed outer
controls improves the vertical crop from 2.893% to 1.144% disagreement within
the existing polishing allowance. The nine-crop study remains 8/9 and the full
corpus remains 24/31. All 22 Hunodan cases retain or improve their previous
errors below ten seconds. Some rays, notches and faint seams remain imperfect;
the horizontal crop is slightly worse. Verification passes 740 inverse tests,
855 application tests and seven browser/export flows.

The [crop-edge evidence correction](crop-edge-evidence.md) finds that colour
refinement kept support counts from its earlier segmentation line. Final
support now uses the refined samples, with original-mask agreement recorded
separately. This preserves accurate blurred-paper crops while exposing
disagreements hidden by the earlier evidence. The full photo replay retains
24/31 accepted cases and every original crop and mask; alternative edge-search
policies did not establish a recovery of the remaining failures.

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

The [glare diagnosis](glare-classification.md) adds 96 controlled views with
unchanged material labels. A proposed covariance classifier recovers some
washed-out motifs but shifts clean boundaries and can change the inferred cut
counts. Nine exported-pair checks show why lower error against a changed mask
can hide worse artwork recovery. The glare controls are available for future
training and QA; the production classifier remains unchanged.

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
useful earlier alignments and the existing cleanup budget. The
[shadow-edge follow-up](shadow-edge-recovery.md) removes another frame's extra
cut by keeping physical-edge refinement from following the background shadow.
All 24 coverage cases now recover their source cut counts. The correction
does not improve every artwork score; the report preserves those tradeoffs.
Common-coordinate comparisons document accuracy tradeoffs, including the
preference for matching sheets within the user's one-percentage-point limit.

The [real-photo crop follow-up](../REAL-CROP-EVIDENCE.md) retains unresolved
jigsaw and bauble examples and rejects several apparently promising crop
alternatives. Longer fitting can pass numerical checks on distorted crops.
Reports now expose crop evidence separately, and these QA-reserved examples
are not converted into automatic training labels.

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

The [shadow-edge follow-up](shadow-edge-results.json) passed 855 application
tests (one skipped), 681 inverse tests and eight Chromium flows, along with
type checking, lint and build. All 30 synthetic pipeline replays pass, all 24
coverage cases recover their source cut counts, and all 22 real Hunodan crops
are unchanged. Common-coordinate errors include two channel regressions,
documented alongside the corrected frame.

The earlier [shared-cut follow-up](shared-cut-order-results.json) passed 855 application
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
