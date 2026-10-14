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
| Real visible-body annotations | 16 | Fifteen instances in thirteen groups outside source QA, plus one reserved gold-angel instance. Uncertain pixels are excluded; the six additions to the original ten-instance pilot have not entered training. |
| Real partial paper-material annotations | 3 existing heart instances | Blue/yellow, printed purple/blue and floral blue/gold. Separate body and material uncertainty; no additional photographs and no material-trained checkpoint. |

## Current results and limits

The [final-export integration](final-return-integration.md) now connects the
shared whole-cut checker and bounded repair to the engine and editor. Its
frozen-output replay retains all 47 accepted outputs without increasing image
error. Full inverse QA subsequently finds seven photographic regressions
(837/844 passing), so this integration is not release-ready. Consistent geometry
checks throughout fitting are now applied locally; their focused trial resolves
five regressions but exposes insufficient eye retention in the shifted bird.
Hidden-first checkpoint repair and additional bounded refinement improve the
ordinary Hunodan bird to 0.842% in 5.68 seconds. Its full inverse run passes
834/846 tests and exposes additional repair/scheduling and fixture failures;
the integration remains incomplete. The subsequent bounded-repair follow-up
restores all 16 focused routing tests, including the failed sloth crop shifts,
and independently verifies both repaired sloth SVGs. Its corrected full QA
passes **846/848 inverse tests**, all 857 application tests, checking, lint and
build. Only the two shifted-bird eye-retention regressions fail that full run. The next
[scoped polishing correction](small-feature-polishing.md) passes both fresh
regressions and improves eye shape overlap at two resolutions; all seven focused
tests pass. Full QA and fresh corpus validation for that correction remain pending. See the
[repair findings](final-return-integration.md#repair-eligibility-and-time-reserved-for-validation).
The benchmark figures below
describe the earlier completed releases; fresh release and browser QA are pending.

The [row-initialization and scheduling release](row-initialization.md) now
passes all 22 regular Hunodan designs below ten seconds (maximum 7.827 seconds,
unchanged validated errors) and retains 25/31 hard-photo recoveries. All 25
editable exports pass independent geometry/paper checks. Native comparisons
preserve every source image, crop and target. Completed QA passes 822 inverse
tests, 855 application tests and thirteen Chromium flows, plus type checking,
lint and build. The preview serves 153 hash-verified build assets. Visible
contour defects and six unresolved photographs remain; these native timings
do not establish a universal ten-second browser latency. See the
[full validation record](row-initialization-validation.json).

An offline [cut-subdivision audit](self-return-subdivision.md) exposes a limit
of those geometry checks: five saved exports change their short-return verdict
when the same curves are split. A candidate check gives consistent decisions
across 480 representations, but flags two previously accepted outputs. Fresh
fits recover checked alternatives with higher image error, so the proposal
remains offline while quality recovery and independent editor checks are studied.

The first offline [checkpoint-projection follow-up](short-return-projection.md)
reached 0.8612% bird error and 2.3038% gift error under its proposed geometry
check. Its full corpus retained 22/22 Hunodan and 25/31 photo passes. However,
the [subsequent SVG audit](short-return-export-audit.md) found returns that this
validator missed. A stronger search is consistent across 944 saved/edited
representations and 300 random subdivisions, but rejects both earlier outputs.
Fresh fitting trials have not recovered their quality with consistent validity.
The proposal remains offline; current editor reconciliation and optimization
under the stronger constraints are still required.

The [subsequent full QA](short-return-export-validation.json) passes 826 inverse
tests, 855 application tests and thirteen fresh Chromium flows, plus type
checking, lint and build. The refreshed preview serves 153 verified build
assets. The experimental geometry and optimizer remain outside the app.

A separate [turning-limit correction](turn-limit-refinement.md) now gives sharp
corners optimizer feedback near the unchanged maximum-turn constraint. Its
controlled regression retains a better valid approximation. The full native
replay retains 22/22 Hunodan results below ten seconds with identical errors and
25/31 photographic passes; all 47 accepted editable pairs pass current checks.
Four photo errors improve and four worsen slightly. Its
[completed validation](turn-limit-validation.json) passes 829 inverse tests,
855 application tests and thirteen fresh Chromium workflows, plus checking,
lint and build. The refreshed preview serves 154 verified assets. This correction
does not resolve the subdivision inconsistency or include the experimental
return rules.

The offline [short-return cache](short-return-cache.md) reduces the stronger
checker time by 27% across 504 saved representations while preserving every
reported issue exactly. Its cache expires after each audit, with a regression
for moved control points. It does not change the app's geometry rules.

An offline [active-return force experiment](short-return-active-forces.md)
improves two paired fits, but the bird remains worse than the app benchmark
and visible gift artifacts remain. Actual SVGs pass the stronger geometry
predicate in all 32 representations; the existing editor still changes its
verdict for three of the four outputs. The experiment remains outside the app.

The [whole-cut editor experiment](whole-cut-editor.md) removes subdivision-dependent
warnings while retaining captured returns, with 424 actual SVG checks.

The [shared typed geometry port](shared-return-geometry.md) also removes the
prototype's scale-dependent endpoint exemption, with 1,152 scaled representations
and a fresh 424-SVG replay. It is not yet activated in the app.

A [symmetry-preserving final repair](final-return-symmetry.md) retains matching
sheets and requested transforms, with a complete 51-output saved-corpus replay.

A [final shared-cut repair](final-return-repair.md) fixes the saved bird's
experimental clearance defects with a pixel-identical weave, and slightly
improves the gift's error. Both actual SVGs pass all eight stronger geometry
representations; the current editor still gives a gift warning in thirds.
A nearest-pair editor exemption was rejected because it hides other returns.
The projector and regression fixtures remain offline pending full integration.

The [Pinterest expansion](real-pinterest-expansion.md) includes all four supplied
pins. Download success, photograph count, heart-instance count and motif-family
count are different measures. Of the 1,034 source files, 476 are now reserved by
existing QA or connected source groups; the rest still need family, instance
and usage review before allocation. See the [real audit](real-validation.json)
and [synthetic asset checks](synthetic-batch.json).

The [current training-reservation check](real-qa-reservations.md) excludes the
gold-angel source now used by a committed solver regression, including when a
caller supplies an older label/catalog snapshot. Explicit diagnostic replays
remain available. All sixteen rebuilt annotation instances preserve their
previous RGB, label and overlay bytes; no model was retrained.

The [earlier trace-order fitter release](trace-search-order.md) passes all 22
regular Hunodan designs below ten seconds (maximum 8.22 seconds, unchanged
errors) and retains hard-photo recovery at **25/31**. All 25 pairs
also pass production editable conversion and independent geometry/paper checks.
Verification includes 794 inverse tests, 855 application tests, eleven Chromium
flows, type checking, lint and build. These
31 photographs are a fixed reconstruction benchmark, not the full collected
573-file photographic corpus.

A [remaining-failure diagnostic](remaining-photo-failures.md) isolates the six
unresolved collage cases. Historical approximate crops give checked editable
templates for nested squares, jigsaw and crossed ribbons; Santa, the outlined
star and bauble still fail. Five broader crop-search variants do not establish
a reliable replacement. Santa's tracing path stops on inconsistent border
endpoint counts before MILP search, while the bauble loses pale frame detail
before fitting. These interventions do not increase the automatic 25/31 result.

An offline [joint-border investigation](joint-border-profiles.md) now balances
both inconsistent endpoint pairs in Santa, but its proposals still fail margin
or routing checks. Slanted guides, coarser traces and relaxed initialization
have not recovered a valid pair. The experiment remains outside the app; the
automatic benchmark is unchanged. The latest completed QA passes 805 inverse
tests, 855 application tests and three refreshed Chromium flows.

A [controlled border-noise diagnostic](controlled-border-perturbations.md)
separates endpoint failures from complete reconstruction. The current fitter
already recovers all five valid synthetic designs after paired narrow fringes.
An experimental depth-varying border initializer reduces the observed solve
times to 1.03–2.15 seconds and makes four outputs identical to their clean-input
cuts. All twenty baseline/experimental pairs pass editable checks, but two
reference errors increase slightly. This initializer remains offline pending
broader noise and photograph comparisons.
Its completed serial QA passes 807 inverse tests, 855 application tests, type
checking, lint and build; the refreshed preview serves the verified assets.

The [photographic transfer check](smooth-border-photo-transfer.md) finds no
accepted smooth-row proposals across the 31-photo and 22-Hunodan benchmarks.
Pass counts hold, but the unsuccessful work costs about 0.2 seconds per input.
A committed inner-evidence check now skips 49 of 51 photographic masks while
preserving every selected synthetic proposal exactly. Its separate completed
native replay retains 25/31 photo passes and all 22 Hunodan passes with unchanged
release errors, maximum 8.36 seconds. No new proposal is accepted; photo errors
still fluctuate. The correction remains offline.

A [local-color evidence study](local-color-evidence.md) rejects two further
classification hypotheses as global replacements. On 96 paired synthetic views,
lower glare error comes with clean-image regressions. Nine fixed-crop fits and
four editable replays isolate an additional bauble loss during fitting, after
a corrected mask retains all sampled frame points. The new diagnostic helper
checks overlay pixel counts against the measured error; no photographic gain
or learned-model deployment is claimed. Completed QA passes 812 inverse tests,
855 application tests, type checking, lint and build; the local preview is refreshed.

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
Visible contour defects remain. The preceding junction-recovery release takes
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

The [partial material-label study](real-material-labels.json) adds independent
paper identities to three existing reviewed bodies. Printed marks retain their
containing sheet's identity. The 256-square labels cover 56.85–68.90% of known
body pixels; seams, uncertain contacts and unpainted interiors remain unknown.
All six existing body/RGB files reproduce byte-for-byte. An RGB model with
separate body and conditional-material outputs and an image-wide exchangeable
sheet loss is implemented and tested; it has not been trained or deployed.
The existing automatic colour classifier, supplied with reviewed known-body
pixels, already misclassifies only 0%, 0.529% and 0.420% of these labelled
interiors. This annotation-assisted diagnostic excludes difficult seams and
does not measure automatic cropping or complete reconstruction. Future joint
training must also be evaluated on outlines, narrow features and exported cuts.

The material study's QA passes 77 learning tests, 855 application tests,
type checking, lint, build and both annotation galleries. The inverse suite is
**811/812**, exposing a [flower scheduling regression](flower-budget-diagnostic.json)
reproduced using unchanged production code. Both classified-mask hashes remain
fixed. Minimum-width clearance makes the initially preferred 2+4 grid worse
than 3+3, but the first grid receives 3.13 seconds of curve refinement and the
second only 0.11 seconds. The replay returns a checked 4+2 pair at 1.332% error,
which fails the regression's 3+3 and below-1% requirements.

The subsequent [clearance-order correction](clearance-order.md) compares one
existing candidate after minimum-width preparation, retaining the original
deadline and acceptance checks. Fresh exports recover both flowers with 3+3
cuts at 0.450% and 0.615% error. All 25 previous hard-photo successes survive
editable conversion. All 22 regular Hunodan cases finish under ten seconds,
but two full-run errors rise slightly; isolated controls do not replace that
result. Type checking, lint and all 855 application tests pass after removing
unnecessary system-font scanning from a path-only clipping test, preserving
every checked pixel and geometry assertion. Full inverse QA passes the flower
but finishes at 809/813. The obsolete candle scheduling assertion is corrected
and passes with the same output limits. The other three failures expose an
existing [feature-initialization deadline cutoff](feature-deadline-diagnostic.json):
both unchanged/current engines lose the four near-miss variants when a scaled
clock models slower computation, despite unchanged initial grids and masks.
All seven focused near-miss tests pass without the slowdown; this does not
replace the failed full run. Offline scheduling prototypes recover some cases
but still fail stricter local-detail checks. They are not in production, and
build/browser validation and the preview update remain pending.

The [six-label frozen follow-up](real-supplement-diagnostic.md) now evaluates
the additions without training. The scene-trained model has 87.20% mean
known-region foreground IoU, versus 50.28% for its background-only control.
Complete reconstruction checks pass 2/6 with its fields, 0/6 with the control
and 1/6 with the current production cropper. All three accepted pairs survive
editable conversion. Reflective wood, hands and inadequate lobe-outline evidence
remain failures, and the blue/yellow checker still uses an extra slit. These
six inspected observations are separate from both the original ten-photo pilot
and the fixed 31-photo benchmark; the model is not deployed.

The [reviewed-foreground diagnostic](real-foreground-bounds.md) separates the
remaining crop and fitting problems. Including uncertain outline pixels gives
all six photos crop proposals, but only three checked fits. Printed-paper
texture, rabbit routing and reflective-gold classification remain problems.
An alternative trace on the fixed gold-angel mask reduces error from 7.07% to
0.76%, retaining editable geometry/paper checks. This is an annotation-assisted
search diagnostic, not a learned or automatic-upload improvement.

The [trace-order follow-up](trace-search-order.md) queues dense graphs behind
alternative traces after sparse exhaustion. Its gold fixed-mask regression and
twelve existing routing tests pass; all 22 Hunodan errors remain unchanged,
with a maximum 8.22 seconds. Native checks retain all 25 hard-photo passes,
including editable export and the two star perturbations. Full-suite and all
eleven browser checks pass. The gold fixed-mask browser upload takes 6.76
seconds with 0.73625% editable disagreement; its annotation-assisted crop is
not an automatic full-photo success. The preview serves this verified build.

A [rotated-support diagnostic](locator-support-consistency.md) tests another
possible cropper failure: inconsistent width-based tolerances during candidate
selection and final validation. Using one tolerance changes neither the selected
fit nor acceptance across 120 paired poses of the six frozen foreground fields.
It does not explain their four missed crops, so the cropper is unchanged.

A [gallery-template audit](repository-template-candidates.md) checks 38 existing
SVGs as possible additional synthetic sources. Eighteen pass the nominal
geometry/paper and rendering comparisons, including four whose initial raster
disagreement falls below the limit at finer resolution with unchanged curves.
Visual review flags faint seams in two candidates. None has entered training:
source-family and QA overlap must be reviewed before allocation.

The optional [radial motif generator](synthetic-training.md#optional-radial-motifs)
adds clean procedural flowers and polygonal shapes with four exactly shared
approaches and known cuts. Its first batch has 64 validated geometries and
256 views; seven invalid candidates were rejected. All 64 canonical/first-photo
pairs were inspected. The group stays unassigned, and existing experiment inputs
remain unchanged. [Generation evidence](synthetic-radial-motifs.json)

The [completed radial diagnostic](synthetic-radial-pipeline.md) reconstructs six
selected designs from clean masks, known photographic crops and automatic
uploads: all eighteen pairs pass, including editable export. Automatic uploads
have at most 0.607% disagreement with the latent design and take up to 6.19
seconds to solve, excluding detection. This is a simple synthetic development
set, separate from the real-photo benchmark. The study also fixes a reporting
bug that compared different raster resolutions; corrected scores preserve the
original masks and fitted cuts. No network training occurred.

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
