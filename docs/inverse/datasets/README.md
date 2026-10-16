# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. Offline studies cover synthetic
proposal learning and a small real-photo adaptation pilot. No learned model
has been added to the website.

The inventory, with material annotations updated on 2026-10-16, contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 1,034 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 564 | Includes multi-heart scenes and mixed photo/template pages; 451 reviewed near-duplicate groups after source-kind and repost corrections. |
| Public Pinterest imports | 470 of 487 selected pins | 190 image files contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries in existing experiments | 192 | Original 128 plus 64 mixed-angle lattices; color phase is excluded from geometry identity; still only three recipe groups. |
| Synthetic photographic views in existing experiments | 768 | Original 512 plus 256 supplementary views; all 5,952 referenced assets verified. |
| Unassigned radial-motif candidates | 64 geometries / 256 views | One additional recipe group with exact shared approaches; not used in training. All 1,984 referenced assets verified. |
| Pretrained encoder checkpoints | 2 | MobileNetV3-Small: researched timm LAMB weights and the TorchVision weights used by the experiment. |
| Pretrained segmentation checkpoint | 1 | Pinned official MobileSAM weights, 10,130,092 instantiated parameters; automatic-prompt experiments only, no browser integration. |
| Trained proposal models | 4 | Same 880,466-parameter network: random/ImageNet, balanced loss, and broader corner data; synthetic-only, offline. |
| Trained foreground models | 5 | RGB-only, 880,449 parameters; random/ImageNet, background augmentation, and paired clutter/control runs, all offline. |
| Decoder-adaptation checkpoints | 4 | One synthetic control and three grouped real/synthetic folds; no all-data or deployed model. |
| Material-pilot checkpoints | 18, plus 2 synthetic diagnostics | Four earlier grouped pilots and two corrected-family study arms independently audited; no integration. |
| Printed-paper photographic variants | 96 | Three ink recipes on the same 32 training replay geometries, plus 32 byte-identical controls. Exact body, material and graph labels retained. |
| Training background variants | 2,040 | Five changes to each of 408 original training views; geometry labels and split groups unchanged. |
| Training scene variants | 2,448 | Neighbours and handles paired with all six backgrounds for the same 408 training views; no new geometry families. |
| Foreground occlusion pilot | 16 views | Sixteen existing training geometries, with exact visible/hidden paper labels; generated and reviewed, no training. |
| Source-photo material QA samples | 78 integrated + 25 new | Four hearts in two reserved photographs; sparse assistant-reviewed development observations, not dense labels or training data. The new jigsaw review is not yet in the common benchmark fixture. |
| Sparse four-sector neighbourhood observations | 25 on two sources, plus 8 ordinary-edge controls | Reviewed locations and uncertainty boxes; exact physical joining is unknown. Development observations, not training labels. |
| Real visible-body annotations | 24 | Includes newly admitted printed-checker/candle/fish instances and one reserved gold-angel instance. Uncertain pixels are excluded; the completed corrected-family study retains its original nineteen instances. |
| Real partial paper-material annotations | 22 heart instances | Nineteen enter the completed corrected-family study; three new instances remain unassigned and unused in training. Separate body and material uncertainty; all are reviewed development examples. |

## Current results and limits

A [selective boundary-cleanup candidate](primitive-boundary-groups-results.json)
keeps useful straightening edits when an unrelated subpixel-supported bend makes
the whole batch fail its objective. Fourteen focused tests pass. An untimed
64-fit replay isolates additional reductions on the faceted star and Hunodan
hjfig-04, with unchanged or lower independently rendered error; all 64 retain
geometry, paper and source-feature checks. Eight paired editable exports pass.
The prior passes run first, and no acceptance gate is relaxed. Fresh Hunodan
replay passes **22/22** with exactly unchanged errors, median **5.29 s**, maximum
**8.83 s**. The fresh photo benchmark remains **27/31**, with unchanged masks
and statuses; all 29 pairs convert without editor issues. All ten changed-error
outputs were reviewed, including Viking's increase from **2.08% to 2.23%**.
Check, lint, build and three browser workflows pass. The full regression retry
passes **865 application tests** (one existing skip) and **1,002 inverse tests**,
with all 931 pinned files unchanged. The earlier incomplete attempt during a
[disk-space incident](storage-recovery.json) remains recorded separately. This
is not an additional reconstruction pass or a fix for the flower photograph's
hidden centre.


A [controlled import-resolution replay](browser-hunodan-resolution-results.json)
finds a concrete browser/native discrepancy on Hunodan hjfig-05. The crop corners
are identical, but the import helper enlarges a **337px** classified mask to
**400px** before solving. With otherwise identical browser settings in fresh
Node processes, the original grid takes **6.08 s** and yields four cuts per
sheet; the enlargement takes **10.70 s** at a 10-second allowance or **19.05 s**
at 180 seconds, yielding four and six cuts with a visible extra seam. The native
grid also has lower error against the same 400px target (**1.09% versus 1.59%
and 1.47%**). All four editable exports pass existing checks. This is one
controlled diagnostic, not a deployed fix or a general browser-speed claim.

A [fixed-mask ribbon diagnosis](flower-occlusion-results.json) separates input
agreement from recovering the underlying weave. The synthetic ribbon-corrupted
grid fits within **0.37%** but differs from its known clean design by **5.25%**.
Supplying the correct ribbon uncertainty recovers the clean grid exactly in this
control; hiding an unrelated border does not. The real flower-cap photograph
still has distorted central cuts after cap and ribbon observations are excluded,
despite **0.25%** observed-region error. All eight diagnostic outputs convert to
editable SVG without editor issues; no real-photograph pass is added. These are
manual uncertainty interventions, not automatic segmentation or deployed changes. A [later annotation review](ribbon-coverage-plan.json)
shows the vertical polygon clips the ribbon edge. The completed
[coverage experiment](ribbon-coverage-results.json) removes both large hooks at
the widest exclusion, supporting input contamination as a cause. However, that
same exclusion distorts the known synthetic grid: its editable output has
**2.70% clean-design error** despite **0.00146% observed-region error**. Narrower
exclusions recover the synthetic grid exactly after editable conversion. All
six outputs pass geometry/paper and editor checks; no real-photo pass is added.
Accurate visibility evidence matters more than simply excluding a wider band.

A [one-photo color-residual probe](ribbon-color-residual.json) does not support
using a global residual threshold to exclude the ribbon automatically. With
automatically estimated palettes, the sampled gold and white-paper residuals
nearly coincide. Manual paper-patch calibration separates these samples, but
this is not an automatic or held-out detection result; no masks were changed.



An [existing-finalist comparison](finalist-retention-fit-results.json) improves
the fixed brown checker from **9.59% to 2.48%** mask disagreement and the bicycle
from **4.69% to 3.29%**, with geometry and nominal-paper checks passing. It prefers
an already available, lower-error grid only when it recovers missing features
without eroding represented ones. All five checked controls remain checked;
both improved cases still lose details, so this adds **zero complete passes**.
All thirteen exports convert and all eight changed outputs were inspected.
The bicycle's [published construction](bicycle-template-review.json) uses extra
enclosed cutouts on one sheet. Its existing failed-case denominator and warning
remain; improved scheduling does not establish recovery of that unsupported
reference. It is retained as a regression, not a target for further regular-slit
optimization.

A cold regression exposed another scheduling defect: the clearance stage could
promote the old simpler grid again using its cut-count bonus. The follow-up
checks feature retention on the actual clearance masks before changing priority.
The [clearance follow-up](finalist-retention-clearance-results.json) improves
the checker further to **2.14%**, with the bicycle at **3.29%**. All thirteen
exports retain geometry/paper passes, all five checked controls remain checked,
and all seven changed outputs were inspected. Three focused regressions pass
in three fresh Node processes with unchanged photographic error bounds; nineteen
existing routing/clearance regressions pass too. **22/22 Hunodan cases pass**,
with exactly unchanged errors, a **5.51 s** median and **8.81 s** maximum.
The automatic-mask benchmark remains **27/31**, with the same crops, masks and
statuses. All 29 generated pairs convert to editable geometry without editor
issues. Nine image errors changed; the largest increase is the dense checker,
**1.67% to 1.94%**. All nine changed-error exports were inspected. The new
preference selected no candidate on these established 31 cases. Check, lint,
build and three Chromium upload/solve/editable-export workflows pass. The
runtime change is committed in `bcd30af`. Full repository QA passes **865
application tests** (one existing skip) and **1,001 inverse tests**, with all
922 pinned sources unchanged. This is adopted on the local branch only;
nothing was pushed or deployed. The [plan](finalist-retention-fit-plan.json)
records the cold failure and the separate synthetic-fixture correction.


A [thirteen-mask solver experiment](feature-finalist-fit-results.json) rejects
alternate-base feature seeding as a runtime change. Although the initial
[seed diagnostic](feature-finalist-results.json) retained missing regions for
two cases, full fitting adds **zero checked templates**. The bicycle worsens
from **4.69% to 7.25%** mask error and its paper core becomes uncertain; the
flower improves only from **3.40% to 3.26%**, still failing. All seven changed
exports were inspected. The patch was reversed; the app's solver is unchanged.
The existing-finalist comparison above follows that rejection.

The [fixed real-photo projective comparison](projective-real-results.json)
adds ten crop proposals and five checked derived masks: the additional-photo
cohort moves from **4/20 to 9/20**, while the earlier group remains **15/22**.
All 22 prior crops, masks, coverage and statuses are unchanged. All 32 exported
pairs convert to editable geometry; 24 pass the complete checks. All twenty
fallback photo panels and twelve new/changed exports were inspected. This is
an offline result, not deployed or ground-truth reconstruction accuracy.

The remaining errors span the whole pipeline. The floral-paper crop still has
**14.01% maximum corner offset** against an approximate reference, and its
material classification disagrees on **15.05% of covered labelled source
pixels** before fitting. Printed text is similarly mistaken for a weave. On
the brown checker, the crop includes decoration, then a low-count finalist
loses the center grid: feature initialization stays near (1,2) despite an
existing lower-error (5,5) finalist, before roughly six seconds of unsuccessful
MILP recovery. The fixed-mask comparisons above test those already available
alternate count bases independently of cropping. Check, lint, build and twenty
focused tests pass. Full repository QA also passes: **865 application tests**
(one skipped) and **998 inverse tests**; all 896 pinned sources verify unchanged.

A [projective body-only crop comparison](projective-body-results.json) now
recovers all sixteen controlled synthetic overlaps behind small notch occluders
within 5% maximum corner error. With frozen predicted segmentation, median
maximum corner error is **1.22% original / 1.50% occluded**, with **15/16 and
16/16** within 5%. Exact-body diagnostic controls have **1.23%** median error,
all within 3%. All 48 comparisons were visually inspected; one source clips a
corner and remains included. Four focused tests and lint pass. This uses the
existing projective model with colour terms removed, not additional training.
The sixteen geometries belong to one training-source recipe family; this is
not held-out photo accuracy. Crop fitting alone takes roughly 0.2 seconds
median, excluding neural inference and template solving. The adapter remains
offline; the fixed real-photo and export comparison above records its limits.

A [separate shape/visibility experiment](shape-visibility-results.json) rejects
the known false small-checker notch, but **adds no accepted real-photo crops**.
All 22 original supported crops, masks, coverage and pass/fail results remain
unchanged: **15/22** earlier-development and **4/20** additional-photo fits pass;
all 22 exports convert to editable geometry, with the same 19 complete passes.
The coarse network is too unreliable to serve as a hard local corner gate.

Exact-label tests also expose the affine construction's perspective bias: even
with the true notch, tip and lower-edge directions, its median maximum corner
offset is **8.88% of a side length** over sixteen synthetic geometries. With
actual model fields, the separate-evidence variant proposes only two of the
sixteen occluded crops, at **5.52% and 14.00%** maximum corner error. Neither
meets the declared 5% threshold. All 32 synthetic images, 20 real fallback
rejections and three changed exports were inspected. This variant remains
offline and is not adopted. Sixteen focused Node tests, type checking, lint
and build pass. Full repository QA passes: 865 application tests (one skipped)
and 994 inverse tests, with all 896 pinned sources verified unchanged.


A [foreground-occlusion pilot](foreground-occlusion-results.json) adds sixteen
ribbon-covered views from sixteen existing training geometries. It supplies
separate complete-paper, visible-paper, hidden-paper and foreground-object
coverage, and masks material observation where paper is covered. Every ribbon
crosses the known notch while hiding only **0.31–1.85%** of the paper. Original
camera and cutting labels are unchanged; 160 source assets and 64 generated
assets verify. All sixteen panels were inspected and seven focused tests pass.
These are raster-composited training examples from one procedural family; no
retraining or real-photo reconstruction gain is claimed.

The [paired frozen-model diagnostic](foreground-occlusion-inference-results.json)
then isolates the visibility assumption. The small CNN retains most covered
paper (mean probability **97.88% → 89.32%**). MobileSAM drops from **98.31% to
14.57%** with its original box and point held fixed; recomputing prompts gives
**14.98%**. All sixteen CNN comparisons and three-arm SAM panels were inspected.
SAM is describing visible paper, while the notch cropper interprets its absence
as background. Complete-shape evidence and visibility therefore need separate
roles; globally unioning the masks would also admit foreground objects. These
are controlled perturbations of training-source images, not held-out recovery
results. No model was retrained.


An [affine notch/edge prototype](notch-overlap-results.json) produces no new
accepted crops. A subsequent [local-support variant](notch-local-support-results.json)
adds five crop proposals across the two cohorts. Previous development remains
**15/22** checked masks; the new-source cohort rises from **4/20 to 7/20** derived-mask
checks, but **one new pass has a visibly wrong crop**. This is not a verified
reconstruction gain or a released change. All 22 supported prior crops, masks,
coverage and pass/fail results are retained exactly. All new/changed exports
were inspected; 27 candidates convert to editable geometry.

The follow-up isolates two limitations: notch plus lower edges do not determine
a projective quadrilateral (the floral reference has **15.02%** maximum corner
offset), and removing an occluding handle from visible-paper segmentation can
create a false notch. An independent synthetic occluder reproduces the latter
with a **30px** notch error while passing the prototype's local checks. The
current synthetic scenes explicitly forbid foreground occlusion of the selected
heart. Further work needs visibility/occlusion supervision and independent
perspective evidence; lower target-mask error does not resolve either issue.
Both prototypes remain offline. Eleven focused checks and [full repository
QA](notch-overlap-qa.json) pass: 865 application tests (one skipped), 989 inverse
tests, type checking, lint and build. All 880 pinned source files are unchanged.

The [frozen new-photo comparison](new-photo-generalization-results.json) completes
on twenty additional source photographs: **4/20** checked reconstructions with
the learned policy versus **3/20** with production. The learned pipeline adds the
yellow/white cross and retains the three shared passes; all seven accepted
exports pass independent editable checks. All twenty field/crop panels and nine
exports were visually inspected, with all 886 pinned runtime sources unchanged.
This is one fixed model on new source groups, unlike the earlier family-held-out
development study below. It is not motif-disjoint or verified pretraining-disjoint
accuracy. Sixteen learned inputs stop at crop rejection; ten retain internal
quadrilaterals, including both plausible overlaps and visibly wrong ones. Printed
paper, reflections and wrong-object selection remain upstream failures. The
production flower-cap crop is visibly oversized and its reconstruction fails.
No learned model is integrated.

The [rejected-crop diagnostic](new-photo-rejected-crops-results.json) then fits
all ten available final rejected quadrilaterals, with no manual corner changes.
**Six produce checked editable masks**, and all ten candidates convert. All ten
outputs were inspected and all 884 pinned sources remain unchanged. This does
not raise the automatic 4/20 count: the visibly undersized small-checker crop
still fits at 0.77%, and another crop cuts through a bird. Flower/flame caps and
the framed bird show useful candidates blocked by the outline model; a global
relaxation would also admit incorrect crops. The four remaining fits fail on
image/paper quality or retained features. Crop evidence must be evaluated
separately from downstream mask fit; printed paper and reflections still need
material supervision.

A [conditional two-paper segmentation fallback](locator-paper-fallback-results.json)
raises the offline development result from **13/22 to 15/22 checked
reconstructions**. It retains all sixteen existing crop geometries, classified
masks and source observations, and calls the alternative segmentation only for
the six inputs without a supported crop. Fresh detection recovers the hand-held
printed checker and the checker among leaves. All eighteen exports convert to
editable templates; the same fifteen pass complete checks. All five preview
panels and the four unresolved source photographs were inspected, and all 884
pinned sources are unchanged. The new foliage crop has a maximum offset of
3.45% of side length against an approximate visible reference; the hand-held
crop has no comparable reference. These are checked derived-mask fits on a
development set, not held-out artwork accuracy. Model fields are cached and no
learned model is integrated into the website. Additional independent photographs
are the next validation step.

A [controlled border-fragment experiment](border-feature-routing-results.json)
isolates a fitter scheduling failure. On the rabbit, changing only 61 of 160,000
mask pixels recovers the main motif; that diagnostic does not count as a fit to
the original photo. The production fix instead keeps every target pixel and
allows a guarded interior-feature proposal before tracing consumes its time.
Original-mask disagreement falls from **6.36% to 1.39%**, with valid geometry and
nominal paper checks. The unresolved border feature still fails the final
feature check: this is a much better candidate, not a new fully checked pass.
Full QA passes: 865 application tests (one skipped), 978 inverse tests, type
checking, lint, build and browser smoke tests. All 22 regular Hunodan designs
still finish below ten seconds with exactly the previous errors. The photo
benchmark retains 27/31 successes; all 29 exported candidates convert to
editable geometry, with the same 27 complete passes. Nine time-limited photo
errors change slightly; all changed previews were inspected. The orb uses two
additional cuts and has more border protrusions despite lower disagreement.
All 876 pinned sources remain unchanged.

The [fixed-input material replay](border-feature-material-replay-results.json)
then repeats all 44 fits with the guarded retry. Rabbit improves from 6.36% to
**1.34%**, and now converts into editable geometry. The counts remain **13/22
coarse and 12/22 crop-RGB** because its original border-feature warning remains.
All previous checked results are retained. Of 32 exports, 31 convert and the
same 25 pass complete checks; only the already rejected bicycle fails
conversion. The retry also runs on the sharper candle without fixing its border
features, while a worse coarse-candle proposal is correctly rejected. All five
changed weave images were inspected; the other 27 PNGs are byte-identical.
All 878 pinned sources and all frozen input masks remain unchanged.

The [completed material-resolution comparison](material-resolution-results.json)
runs 44 fresh fits on the same 22 fixed crops, with identical frozen paper
colours. Classifying the actual crop RGB instead of interpolating the coarse
full-photo material field improves the star, but reduces complete checked
reconstruction from **13/22 to 12/22**. It exposes small border components and
paint flecks, and does not solve printed decoration being mistaken for a paper
boundary. All 32 exports were visually inspected; all 25 accepted outputs pass
editable checks. Two already rejected candidates fail editor conversion. The
global classification change is rejected. These results precede the guarded
fitter retry above; the subsequent fixed-input replay measures it separately.

A [conditional crop fallback](locator-contrast-fallback-results.json) improves
the SAM-assisted development pipeline from **12/22 to 13/22 checked
reconstructions**, retaining all twelve previous passes and adding rabbit.
It preserves all fourteen supported primary crops and their classified masks
exactly, and invokes the alternative contrast objective only for the eight
unsupported inputs. Fresh detection produces sixteen crops, including star;
star still fails its border-feature check. All sixteen exports convert to
editable SVG, the same thirteen pass complete checks, and all four reconstruction
panels were inspected. All 876 pinned sources remain unchanged. Crop search
takes a median 0.64 s and maximum 5.14 s, excluding model inference; fitting
and engine export take a median 7.69 s and maximum 9.63 s separately. This is
an actual fixed-policy replay, not a union selected by template quality. It
remains offline; the subsequent material-resolution test is described above.

A [component-wise locator study](locator-diameter-components-results.json)
separates cap-side colour purity from the reward for a visible colour step at
the lobe diameter. Removing only the contrast reward recovers the rotated star
and rabbit, but loses aircraft: **14 to 15 crop proposals, 12 to 11 checked
reconstructions**. Removing only purity retains the original 14 proposal IDs.
All 66 crop attempts, 44 paired fitting attempts and 29 editable-export audits
complete; all eight reconstruction panels were inspected. The global change
is rejected; the conditional follow-up above preserves already accepted crops.

The offline learned-material replay now preserves the production rectifier's
source coverage through fitting, independent scoring and editable conversion.
For the newly recovered star, 159 of 160,000 rectified pixels lie outside full
source support and are excluded. Its 0.75% observed-mask disagreement still
fails the feature check: a thin dark strip visible near the photographed outer
edge is omitted. Rabbit passes at 0.57%; candle loses a border feature. All 23
accepted outputs pass editable checks. The rejected bicycle cannot pass editor
geometry conversion, so the controller's nonzero exit is retained in the
report. Twelve focused Node checks and six analytic corner-metric tests pass.
Full repository QA also passes: 865 application tests (one skipped), 972 inverse
tests, type checking, lint and build, with all 870 pinned source files unchanged.
No learned model or locator-objective change is integrated into the website.

A [single-star resolution diagnostic](material-resolution-diagnostic.json)
identifies a separate preprocessing effect. Interpolating the 256-pixel
full-photo material map leaves the dark edge strip as an isolated 151-pixel
component. Applying the same frozen paper colours to the actual 400-pixel crop
RGB joins it to the large dark region touching the border. The existing weave
then passes the unchanged feature check, but its error against this sharper
target rises from 0.75% to 1.25%. Six diagnostic artifacts reproduce exactly.
This is a fixed-output re-score on one inspected photo; the full-dataset fitting
comparison above subsequently rejected a global classification replacement.

A [locator-objective isolation](locator-diameter-isolation-results.json) confirms
that the strong colour-step term at the two lobe diameters can pull an accurate
silhouette into a poor crop fit. With identical SAM fields, removing only that
term raises rabbit lobe support from 47%/83% to 97%/86%, recovers its crop and
produces a checked template at 1.51% mask disagreement. Across all 22 photos,
crop proposals rise from 14 to 16, also recovering floral/striped. However,
complete fitting remains **12/22 in both arms**: candle loses a checked feature,
the floral print becomes false weave detail, and several common outputs worsen.
All six crop panels and eight reconstruction panels were inspected. The editable
audit converts 29/30 outputs; the one rejection is a bicycle candidate already
rejected by the engine. All 24 accepted outputs pass editable checks. The global
objective change is not adopted, and no combined best-arm success rate is
claimed. The [production RGB-only replay](production-diameter-isolation-results.json)
produces one extra crop (9 to 10), but its yellow/teal checker corners are visibly
wrong: the maximum offset is 14.94% of side length against an existing approximate
visible reference, versus 1.31% for the SAM baseline. Its partial body-outline
IoU of 97.5% therefore does not certify overlap corners. All six panels were
reviewed, and no full fitting gain or production change is claimed.

A [pretrained MobileSAM experiment](mobilesam-foreground-results.json) improves
the difficult 22-photo development replay from 7 checked derived-mask fits with
production and 3 with the earlier neural pipeline to **12 with automatically
prompted segmentation**. The existing neural silhouette supplies a padded box
and one interior point; no annotations or supplied corners enter inference.
Frozen RGB paper estimates, crop support gates and the ten-second fitting
allowance remain unchanged. All 66 crop attempts and 66 full-pipeline attempts
complete; all 26 exported reconstructions were visually inspected. The
box-plus-point arm proposes 14 crops, versus 9 with box-only prompts and 3 with
the original neural body. It still loses two earlier neural crops, sometimes
selects only one paper colour, and retains some handles or decorations. The
mean partial-label body IoU increases from 79.85% to 90.70%; this does not verify
hidden overlap corners. Printed-paper classification and small reconstruction
artifacts remain, and the bicycle's published construction is outside the
regular model. SAM image encoding takes a median 0.52 seconds on this CPU;
proposal-network inference, startup and browser execution are not included.
All 26 exports convert to editable SVG, with the same 22 complete passes across
the three arms and no editor geometry issues. No model is integrated.

The [two-paper prompt follow-up](mobilesam-paper-prompts-results.json) completes
another 66 crop attempts. It recovers the hand-held printed checker and foliage
checker, but loses the aircraft and ribbon checker, leaving 14/22 proposals.
On the ribbon checker, one positive prompt lands on blue background wrongly
included by the original neural silhouette. The single-point predictions and
crop coordinates reproduce exactly. All six mask/crop panels and both prompt
panels were reviewed; nine prompt/alignment tests pass. No two-paper template
replay or per-photo best-arm combination is claimed.

Detailed traces also separate segmentation from locator failures. The rotated
green/gold star reaches the upright orientation and has strong lower-edge and
cap-colour support, but one fitted lobe misses the support threshold. Rabbit
has a similar shape-fit failure. Floral/striped instead fails the assumption
that each lobe has one paper colour, despite adequate outline support. These
are specific next targets; no acceptance thresholds were weakened.

A [published-template review](bicycle-template-review.json) qualifies the
bicycle failure: the designer's matching PDF requires additional enclosed
cutouts in the green sheet, outside the regular slit-chain model. This does
not prove that no regular alternative exists. Historical benchmark counts and
training splits remain unchanged. An [independent paper-label replay](neural-palette-source-paper-results.json)
also exposes an evaluation gap: the bicycle's 296 known reference-interior
pixels omit its fine strokes, so their zero error cannot certify the motif.
For the printed-heart checker, the exported weave disagrees with 23.87% of
known underlying-paper samples, although it passes its derived-mask checks;
the classifier already disagrees with 23.82%. Decorative print and paper
identity are different targets. This diagnostic covers six photos with prior
approximate overlap references and leaves sixteen unscored.

[Shared-cut fine-scale scoring](sharing-original-scale-results.json) now uses the
original classified mask and coverage directly, avoiding enlargement of the
reduced fitting mask. All 49 fixed-export alignment replays pass geometry,
paper and feature checks; all 22 Hunodan geometries remain byte-identical.
Four photographic outputs change, with mixed small error differences across
render resolutions. The orb improves consistently and supplies a regression
that fails before the correction and passes afterward. All 111 focused checks
pass. Fresh browser, build, Hunodan and photographic checks also pass: all 22
Hunodan designs finish below ten seconds (maximum 8.83 s), and the photographic
benchmark retains 27/31 with identical crops and classified inputs. Quality
changes are mixed: Viking improves, while fine-checker, orb and floral-checker
worsen. Those photo runs already enter sharing with different refined candidates,
so the timed-run differences cannot all be attributed to this scoring change.
Hunodan hjsta-03 gains three disagreement pixels at 383×383. Full QA passes
865 application tests (one skipped), all 968 inverse tests, type checking,
lint, build and private Chromium checks, with all 801 pinned files unchanged.
All 29 photographic exports convert to editable SVG; 27 pass the complete
checks, with no editor geometry issues. The slower area-recovery
proposal remains offline and no uniform photographic improvement is claimed.

The [partial-body intervention](known-body-crop-intervention-results.json) is
complete: unchanged predictions produce 3/22 crop proposals, correcting only
known background produces 13, only known paper produces 7, and both produces
16. Material probabilities and unknown pixels remain unchanged. All six panels
were inspected, the unchanged controls reproduce exactly, and all 99 pinned
files match. This identifies background leakage as the strongest tested cause,
but the paper corrections lose the candle and six cases still fail with both
corrections. These are annotation-assisted crop counts, not model or template
success rates. A [fixed foreground-probability offset](body-threshold-crop-results.json)
was then tested without annotations in the detector. It improves partial-label
body IoU from 79.85% to 83.66%, but reduces crop proposals from 3/22 to 2/22 and
is rejected. The lost foliage checker fails lower-edge support, despite good
lobe and cap-colour evidence. Better pixel overlap alone does not establish
better corner detection; no neural change is integrated.

[Initial narrow-neck recovery](initial-paper-separation-results.json) reuses the
existing local separation retry after a complete paper-failed refinement block,
only when the best safe fitting error still exceeds the image target. A fixed-work
Viking replay improves independently rendered disagreement from 3.00% to 2.51%;
a fresh ten-second solve improves from 2.78% to 2.13%. The guard avoids changing
already accurate trajectories: all 22 Hunodan errors remain identical, with all
22 fits under ten seconds (maximum 8.81 s). Ten focused tests pass, including
actual export checks and rejection of a lower-error paper-invalid checkpoint.
Full QA now passes 865 application tests (one skipped), all 967 inverse tests,
type checking, lint, build and private Chromium star/hat checks. The paired
photographic replay retains **27/31** reviewable cases, with identical crops,
classified masks and observation fields in both arms. All 29 exported candidates
convert successfully through editable SVG; the same 27 pass the complete checks.
Viking improves from 2.525% to 2.223% independent mask disagreement. Fine-checker
and orb worsen by 0.061 and 0.121 percentage points; the leaf differs by one pixel.
The checker reaches fewer polishing steps; the orb changes starting geometry and
later paper-check outcomes, so its cause is not yet isolated. This is not a claim
of uniform photographic-error improvement. Two unresolved crops, the outlined
star's lost edge feature and the bauble's image error remain failures.

An [offline palette calibration](neural-palette-calibration-results.json) now
compares all 22 annotated photos using frozen family-held-out predictions. Mean
paper-identity error on the known annotated patches is 16.90% for the network,
8.12% when its paper predictions seed an illumination-aware RGB mixture, and
1.62% when RGB clustering supplies the palette inside its predicted body. Body
probabilities remain byte-identical. Visual review confirms much cleaner fish,
candle, bicycle and checker interiors, but substantial foreground leakage and
printed-paper errors remain. These partial-label scores do not certify boundaries
or cutting templates. Seven analytical tests pass; the evaluated calibration
helper is committed for offline use. The completed
[full-pipeline replay](neural-palette-pipeline-results.json) produces checked
results for 3/22 with RGB correction, 3/22 with the uncorrected network and 7/22
with production. RGB gains the candle but loses the rabbit crop. Both learned
arms fail 19 times before fitting. All 15 exported candidates survive editable
conversion, and the same 13 pass complete checks. Better partial material scores
therefore do not establish better overall recovery; no model or palette change
has been added to the website.

The [reviewed cream/blue fish photograph](fish-annotation-admission.json) adds one
visible-body and partial-material annotation. Its handle, cast shadow and four
narrow contacts remain unknown; no hidden cut connectivity is asserted. Final
256/768-pixel compilation reproduces all eight reviewed PNGs exactly. The source
remains unassigned and unused in training pending motif-family grouping.

[Preserving photographic coverage](photo-observation-results.json) now separates
real source pixels from crop padding through colour estimation, editing and
fitting. Missing areas are hatched; painting specifies their colour, and
Undo/Redo preserves that distinction. The real collage browser replay retains
coverage through the worker and downloaded SVG, with geometry/paper checks
passing and 0.55% observed-mask disagreement. Crossed-ribbons now passes in the
three-case clipped-photo replay, bottom-flower still passes, and bauble remains
failed with a worse fit. Both old/new exports are rescored against both old/new
observed classifications, because neither the target nor denominator stayed
unchanged. All 865 application tests and twelve focused core checks pass;
ordinary star/hat browser exports remain byte-identical. The completed inverse
suite passes 958/964 checks: five prior fitter failures plus an observer
expectation corrected in the follow-up below. All 22 regular Hunodan fits pass
within ten seconds (maximum 8.81 seconds), with every error unchanged from the
preceding run. No full photographic-corpus improvement is claimed yet.

[Irregular red/white mixtures](irregular-mixture-results.json) keep the original
square layout while excluding missing pixels from palette estimation. Compacting
those pixels previously caused clipped photos to throw or moved the estimator's
inset. All eighteen focused tests, type checking, lint and build pass. A private
Chromium replay toggles the red/white option on a real clipped collage crop, then
returns to Automatic for editing, undo/redo, solving and SVG download. The
downloaded result passes geometry/paper checks at 0.55% observed disagreement.
The subsequent full run passes 865 application tests (one skipped) and 962/967
inverse tests; the five pre-existing fitter assertions remain. Type checking,
lint and build pass. This does not establish a quality improvement from changing
classification.

[Fresh regression outcome checks](fitter-regression-outcomes.json) independently
validate the blue-star and horizontally shifted puppy exports. Both pass geometry
and paper checks, retaining the original error and small-opening requirements.
Three focused tests now check those outcomes instead of requiring historical
uncertain intermediate states; all three pass. The full-run count above remains
the earlier frozen run; the gift/Viking follow-up is recorded in the initial
narrow-neck recovery study above.

[Keeping the best valid rollback point](best-safe-rollback-results.json) restores
the shifted bird's small eye while preserving exploration through worse valid
checkpoints. Fresh isolated fits pass in 9.79 seconds with a ten-second allowance
and 13.98 seconds with a longer allowance, versus roughly 87 seconds and an open
eye in the regressed long runs. Independent 400/800-pixel renders retain eye IoU
above 0.90 and total disagreement below 2.7%; actual geometry and paper checks
pass. Both outputs were visually reviewed. The minimal fitter change and two
analytic regression tests are integrated, with all ten focused tests passing,
including the unchanged photographic, finer-paper and rollback-cycle checks.
Type checking, lint, build, 857 application tests (one skipped), and private
Chromium star/hat checks pass. Both browser exports are byte-identical to the
previous QA run and were visually reviewed. The completed frozen-source replay passes 951/956 inverse tests, with five
existing failures still under investigation. All 22 regular Hunodan fits finish
within ten seconds (maximum 8.83 seconds), with errors unchanged from the
immediately preceding run. Photos remain 26/31 accepted and editable exports
48/48; several individual photo errors increased, and visual review still finds
artifacts, including an extra small opening in the unshifted bird. The strict
no-regression quality gate therefore remains false. This is not a universal
quality or speed claim.

[Source-crop review](accepted-crop-review.json) qualifies the photographic solve
rate: 18 of the 26 accepted outputs in the preceding corpus run have weak
crop-outline support. Source views show clear corner misplacement in gift,
round-checker and jigsaw; bottom-flower's proposed tip is outside the photograph.
Other flagged crops look plausible or remain uncertain, so the diagnostic must
not be treated as eighteen proven crop failures. The 26/31 result counts valid
templates fitting estimated masks, not verified physical crops or known cuts.
At the time of that review, production rectification filled outside-source
pixels with white without carrying observation coverage into the fitting target.
Independent sampling and an actual
rectifier replay measure 1.68%/2.77%/0.174% synthetic padding weight in crossed-ribbons,
bauble and bottom-flower respectively. No crops, masks or benchmark denominators
were changed by this review.

[Production handoff reproductions](photo-observation-handoff.json) show why loss
weights alone will not fix clipping. A controlled crop with one-quarter observed
image produces 75% artificial mismatch, and binary preparation drops an explicit
observation mask. In a second fixture, adding white outside-source padding makes
automatic classification collapse two photographed grey papers into one: half
the observed pixels become misclassified before fitting starts. Import, editing,
undo, persistence and solver handoff must carry observation separately from free-
border permission. These are correctness diagnoses, not photographic solve gains;
the coverage fix and irregular-mixture follow-up above address that handoff.

[A muted teal/pale candle photograph](real-candle-annotation-review.json) now has
reviewed candidate body/material polygons and six four-sector contact
neighbourhoods, three ordinary-edge controls and one separately recorded narrow
neck. Native source and local edge/contact views were inspected. The right-hand
cast shadow is excluded, and the uncertain flame tip and handle attachment are
not assigned a paper identity. These and the previously reviewed printed-checker labels are now
[admitted development annotations](contact-annotation-admission.json). Final
compilation and verification at 256/768 pixels reproduce all sixteen reviewed
RGB/body/material/overlay PNGs exactly. Counts rise to 23 body and 21 material
instances; neither source has been allocated or used in training. Related motif
families still require cross-corpus review before allocation.

[A bounded finer finalist check](finalist-paper-resolution-results.json) restores
the round-checker candidate without changing its cuts, classified image or
physical tolerances. The candidate is still uncertain at resolution 700, but
passes at 1000 and under independent polygon offsets. A fresh ten-second fit
returns 1.20875% independently rendered disagreement in 9.73 seconds, versus
1.215% before the connectivity change and 2.67875% in its paired regressed run.
The exported result and comparison were visually reviewed. The main fitter now
tries 1000 only for an otherwise acceptable unresolved candidate, retaining the
existing half-second reserve and the actual verified resolution through export.
All 17 focused tests, type checking, lint and build pass. Broad QA is complete
with 789 source files verified: application tests pass 857 with one skip, and
inverse tests pass 947/954. All 22 Hunodan designs finish below ten seconds
(maximum 8.797 seconds); photographs remain 26/31 and editable exports 48/48.
The quality gate still fails: one Hunodan and four accepted photo errors exceed
the pre-diagonal baseline. All fifteen changed photographic outputs were
visually reviewed; round-checker is restored, while fine-checker, jigsaw,
maple-leaf and Viking remain worse by the measured mask error.

[Bird routing alternatives](bird-reroute-candidate-results.json) expose a deeper
optimization issue. A newly certified early checkpoint changes the subsequent
rollback trajectory. Trying a second rejected checkpoint within the original
1.5-second routing allowance closes the eye, but enlarges it: independent eye
IoU remains around 0.60–0.69 instead of the required 0.85. More frequent detail
checkpoints also fail. Neither experiment is integrated. Fixed-work gift and
Viking replays show changed exploration and inferior retained alternatives too;
these failures must not be fixed by merely updating historical hashes or
loosening image/feature bounds.
The [twenty-fit rollback comparison](refinement-rollback-study.json) is complete.
Keeping the best valid fallback recovers the useful bird boundary at a later
checkpoint, without forbidding uphill exploration. Selected and retained gift,
floral and Viking results are unchanged in this arm. Continuing without rollback
finds useful finer-verifiable alternatives in gift and Viking, but worsens the
ordinary Viking incumbent; that diagnostic is not integrated. The study covers
four source motifs; two floral step counts are related trials, not extra photos.

[A guarded diagonal-connectivity correction](diagonal-paper-core-results.json)
addresses valid paper checkpoints discarded by four-neighbour lattice labelling.
The existing clearance guard certifies the whole cell, so diagonally touching
certain-core cells can connect through their shared safe corner. Only that
certified mask uses eight neighbours; possible-core labelling, physical widths,
distance masks and the independent polygon-offset final gate are unchanged.
Sixteen of 72 analytic corridor cases change from uncertain to pass, all with
independent offset confirmation; too-narrow controls still fail. An actual tree
checkpoint now passes at resolution 1000 with identical controls and 0.82625%
independently rendered disagreement. Two captures contain that same geometry,
so they are not independent motif successes. The JavaScript and rebuilt Wasm
implementations agree, and an old cached Wasm module safely falls back for the
new adjacency mode. All 35 focused tests and ten kernel-compatibility tests pass.
Type checking, lint, build and the private Chromium star/hat checks pass; the
star's exported geometry is unchanged from the preceding browser replay. The
application suite passes 857 tests with one skip. The full inverse suite passes
945/953; the remaining assertions include genuine regressions as well as
historical method hashes and changed checkpoint trajectories. The terminal
corpus still passes all 22 regular Hunodan designs below ten seconds (maximum
9.018 seconds), but `hjfla-01` disagreement increases from 0.7107% to 0.7182%.
Complete photographs remain 26/31 and editable exports 48/48. Six accepted
photographs have higher error, most visibly round-checker (1.215% to 2.7144%).
All seventeen changed photo comparisons were visually reviewed; the quality
regression gate fails. Source crop and classified-mask hashes are unchanged.

Twelve paired fresh puppy/bird replays, with two reversed-order repeats and
independently checked saved exports, confirm that the shifted bird is a real
failure: the eye opens in both current short and long runs, despite valid cuts
and paper. The old runs preserve it. The long current runs take about 87 seconds
versus about 14 previously. Puppy instead improves and passes both repeats.
Round-checker capture confirms that identical 4+4 candidate controls change from
paper-pass to uncertain at resolution 700. Diagonal labelling merges previously
sub-threshold floating core fragments into two 0.2653 mm² components, exceeding
the unchanged 0.25 mm² threshold. The same controls pass the current lattice at
1000 and the independent polygon-offset check. The bounded finer verification
described above restores this candidate without changing the threshold or mask.


[Thirty-six fresh graph-order comparisons](topology-graph-budget-results.json)
finish below ten seconds and pass the actual template and feature checks in all
three arms. Trying detailed recovery first saves about two seconds on a shifted
photo and the outlined star, but worsens the tree and larger individual-photo
errors in both repeats. A sparse coarse graph halves the outlined-star error and
preserves the tree result, but slightly worsens the individual photo and adds
visible corner detail to the star. Both baseline and detailed-first switch between
different leaf fits across repeats. All exported images were reviewed; neither
policy is integrated. A saved-mask polarity mismatch stopped one harness attempt
before fitting; the original hash caught it, the failure is preserved, and the
remaining cases resumed with the correct original mask. Six cases include related
perturbations and are not six independent photographs.
The [combined-policy follow-up](topology-graph-hybrid-results.json) completed 24
fresh fits. It gives sparse coarse preparation/routing at most 1.1 seconds, then
tries detailed recovery, with guided coarse fallback limited to the unused
original coarse allowance. The [runtime patch](topology-graph-hybrid.patch) is
recorded for review and is not applied to production. Source pixels, objectives,
validity checks and the ten-second request remain unchanged.
All fits pass within ten seconds, but five paired errors increase (one tree,
both individual-photo repeats and both leaf repeats). The outlined star gains
accuracy while adding corner detail, and the shifted photo gains about 1–1.5
seconds without changing its rendered error. Every output was visually reviewed.
This universal order is not integrated; the next diagnosis captures the actual
paper-uncertain polishing checkpoints instead of inferring their validity from
their image scores.

[A contact-supervision audit](contact-supervision-audit.json) maps the nine reviewed
orange/yellow checker junctions into the existing material labels. All 97 sampled
pixels in those boxes at 256 resolution are known heart body but unknown paper
identity; rerasterizing at 768 leaves all 831 sampled pixels unknown too. Eight
ordinary-edge controls have only one labelled material pixel in total at each
resolution. The uncertainty band is therefore a missing-supervision
issue, not just low raster resolution. Source, compiled input, labels and saved
probabilities were inspected for all seventeen regions. The thresholded model
loses the approaching yellow tips at the contacts. This is one development photo,
not exact physical-joining ground truth or evidence that extra labels improve
the solver. Both model arms used the same held-out checkpoint on this checker
family. A future junction-location target must preserve that grouped treatment
and the uncertainty of the observed meeting points.

[Nine additional four-sector observations and eight ordinary-edge controls](orange-contact-observations.json)
cover an existing orange/yellow checker photograph. The full source, numbered
overview and all seventeen local patches were inspected. The controls distinguish
single material boundaries from candidate junctions; unlisted pixels remain
unlabelled. Shadows and small offsets prevent claims of exact physical joining.
These observations add no image, body/material label, split assignment or training
run, and must inherit this already-studied source's grouped evaluation treatment.

[Sixteen sparse junction observations](curved-contact-observations.json) now mark
four alternating-colour neighbourhoods on an existing green/cream curved checker.
The original source, full overview and every local patch were reviewed. Several
have visible gaps or almost tangent approaches, so the 16-pixel boxes describe
candidate locations, not exact cutting intersections or physical joining. The
source remains unassigned; no body/material label, split, model or training run
changes. These observations address the missing contact supervision exposed by
the neural checker masks, but one photograph is not a generalization result.

**Source-kind correction:** a larger-pixel review removed five false positive
heart classifications: two star photographs, one process photograph, one folded
square object and one bead heart. The [recorded correction](real-source-kind-correction.json)
keeps all 1,034 source files and changes only those five kind/review records.
A subsequent native-source review identifies a leather-like woven heart among
the apparent paper photographs. Its pebbled surface, thick edges and fibrous
backing justify the separate `photo-other-material` category; exact composition
is not established. The [admission record](contact-annotation-admission.json)
records this sixth correction and the complete repeated asset audit. The current
inventory has 567 photograph-containing files in 455 near-duplicate groups;
Pinterest contributes 192 such files. These sources were unassigned and
absent from the body-annotation sets. Completed training studies and historical
573-file collection reports retain their original inputs and counts. No new
training data or benchmark exclusions are introduced by this correction.

**Source correction:** the four little hearts in Pinterest source
`real-8c875dd0f298b5a4` are printed on white paper. The
[verified publisher pattern](printed-heart-source-correction.json) has three
straight cuts per sheet. Earlier descriptions calling these shapes apertures
were incorrect. The fixed-crop and neck studies below measure an appearance
reinterpretation, not recovery of that photograph's published cutting paths.
Their numerical results remain recorded. Historical partial labels excluded
these motifs. The [current material revision](printed-paper-material-correction.json)
adds 1,627 white-paper pixels at 256 resolution, including red ink and dark ink
outlines. All prior known pixels, RGB/body images and source split groups remain
unchanged. The existing expanded model is wrong on 59.62% of these newly observed
pixels: its error on this photo rises from 0.060% to 6.493% when scored against
the corrected labels. This is a post-hoc diagnosis of the historical model. The
new paired study below uses the correction in training the opposite-family
model; this photo remains held out from its own inference model. The 22 Hunodan
and 31 hard-photo benchmark counts are unaffected.

**Construction review:** the publisher's bicycle and sloth templates use closed
interior cut-outs, as verified in the [source review](krymmel-cutout-source-review.json).
They remain useful photographs for body and material identification, but their
original cutting paths are outside the regular-slit model. The historical
nineteen-photo studies retain all outcomes and their original denominators;
future regular-template comparisons should identify these cases separately.
This does not prove that every alternative regular construction of the same
visible design is impossible.

The source correction also changes real-photo family grouping. Earlier material
pilots placed the printed checker in the framed-motif family, so it could train
the model evaluated on the other checker photographs. Source/duplicate separation
was preserved, but this was not complete real-checker-family holdout. A
[new paired experiment](material-corrected-scenes-plan.json) retrains a seventeen-
photo baseline and a corrected nineteen-photo candidate with every real checker
in the checker family. Its [completed results](material-corrected-scenes-results.json)
show no useful pipeline gain. On identical current labels, average material error
changes from 17.6341% to 17.6210%, and body IoU from 80.2687% to 80.6784%.
All 57 full-photo attempts finish: production has six checked derived-mask pairs
out of nineteen, versus three for each learned arm. Sixteen learned attempts
fail before fitting. All fourteen exported pairs preserve geometry through the
editable conversion; twelve pass the complete candidate checks.

All nineteen prediction pairs and fourteen exported reconstructions were visually
reviewed. Learned checker masks erode touching cells into separated islands, so
low template error against those masks does not establish good reconstruction.
The rabbit retains frame defects, and the green/pale star's material prediction
worsens despite a better body outline. No learned model is integrated. Historical
metrics are not replaced or directly compared across the different splits.

The [body-only ROI experiment](foreground-roi-results.json) is also complete.
It keeps original RGB for the cropper, classifier and fitter, using only the
largest predicted body component plus fixed padding as a rough rectangle.
Across 38 fresh attempts, each arm has six checked derived-mask pairs out of
nineteen. The predeclared fallback appears to produce eight, but its two additions
crop the wrong part of the boar and hand-held checker. Their outer outlines have
only 36.85% and 29.59% IoU against independent body annotations. Both also fail
the existing outline-support predicate. No verified recovery gain is established,
and the helper remains an offline experiment.

All nineteen ROI overlays and eighteen reconstructions were visually reviewed.
All eighteen exports preserve editor geometry; twelve pass complete candidate
checks. Fixed source-paper observations expose about 23.8% material disagreement
on the printed checker despite its roughly 2.1% derived-mask fit. These partial
observations cannot certify all detail: they miss the lost bicycle entirely.
Five ROI coordinate/component tests, type checking, lint, build and all 857
application tests pass (one skip). The full inverse suite has **942/945 passing**:
the original stacked mask and two near-miss cases under a faster clock fail.
All three isolated diagnostics subsequently pass the relevant output checks,
but do not replace the failed suite. The vertical case receives ten outline
polishing steps in the failing run versus eighty-five in its replay. Timed
search and refinement variability remains unresolved; no acceptance rule changes.

A [refinement checkpoint profile](refinement-checkpoint-cost.json) localizes
most refinement time to geometry and paper checks. In particular, the first
finer paper audit repeats JavaScript and WebAssembly to calibrate the new lattice
size. An offline native-first prototype reduces first-audit time by roughly 60%
on the large saved cases in both Node and Chromium; all 336 timed complete
audits preserve every non-time field and paper-map pixel. Twelve fresh solves
retain six checked pairs per arm, but the native-first policy worsens the
stacked and diagonal image errors in both repetitions. Visual review confirms
less complete sun rays in the diagonal case. It remains offline. A follow-up
[limits the native preference to polishing](polishing-native-kernels.json).
A fixed 41-step crown replay preserves all 874 coordinates, checkpoint history
and audit decisions while taking 1.07 s rather than 1.66 s. Twelve fresh solves
improve five paired errors but worsen one vertical result, which loses sun rays
and exceeds the unchanged 4% local-detail criterion. Earlier fitting states also
vary, so those full runs do not isolate the change. The candidate is not ready for
promotion. All 29 focused regressions, type checking, lint, build and private
Chromium star/hat workflows pass, but completed corpus QA has only 20/22 Hunodan
speed-and-quality passes. The two failures take 11.03 and 11.25 seconds and also
exceed their source-error bounds. Hard-photo acceptance stays at 26/31, with ten
accepted-photo errors higher than the previous run. All 48 editable conversions
preserve legal geometry; 46 pass all candidate criteria, with the same two
Hunodan source-error failures retained. Visual comparison of all 17 changed
photo renders and six changed Hunodan renders finds extra faint star seams and
more distorted floral-checker contacts. Observed concurrent CPU load is a
confound, not an established explanation or exemption. The application suite
also had one anchor-return failure (856 pass, one skip), which prevented its
chained inverse suite from starting. The separate run passes all 945 inverse
tests, and the anchor passes in isolation. Neither replaces the original failed
suite. The experimental polishing policy has been removed from the runtime.

A [fixed-geometry clock replay](anchor-projection-clock-results.json) reproduces
the anchor failure at 4x and 8x virtual clock speed: local repairs exhaust their
400 ms allowance despite an infinite overall refinement deadline. The diagnostic
fixed-work policy repairs all eight cases with identical exported coordinates;
the current policy repairs four. A regression test reproduces this before the
fix. Untimed refinement now keeps a finite repair-iteration cap without adding a
wall-time cutoff. Finite-deadline website fitting keeps the existing 400 ms
allowance and all quality rules. All 29 focused regressions pass, including
explicit deadlines. All 857 application tests pass (one skipped), together with
type checking, lint, build and private Chromium star/hat workflows. The full
inverse suite completes with **945/946 passing**. The remaining ten-second Viking
fit has 3.2094% mask disagreement and a paper failure; the new fixed-work regression
passes. This suite failure is retained, and the finite-deadline search needs further
diagnosis. The change fixes fixed-work repeatability, not the broader timed fitting
problem or the ten-second speed goal.

A [return-audit reuse experiment](return-audit-reuse-results.json) preserves all
1,344 complete-witness comparisons and every fixed-work projection report and
coordinate. Median local projection time falls about 33% with whole-path reuse
and 39% with additional curve preparation reuse. Neither improves the four-of-eight
repair count under the timed anchor stress. Across 36 fresh photo fits, the path
and curve versions each pass 10/12, versus 9/12 for the baseline, but respectively
three and five paired mask errors increase. All outputs were visually reviewed.
The Viking recovery cannot be attributed to this cache: its relevant refinement
records no return projection, and the repeated baseline also passes. Neither
runtime change is integrated.

A [fixed-input Viking checkpoint study](viking-checkpoint-cliff-results.json)
finds a separate retention problem. After 395 steps, the refiner returns an older
candidate with 3.2406% mask error; after 401 steps it retains one at 2.6938%.
Both pass the independent finer paper check. More significantly, checkpoints
280/320/360 already pass the 700-pixel paper audit and have errors below 3%, yet
are discarded because the 360-pixel audit calls them failed. A
[bounded alternative-retention change](coarse-paper-recheck-results.json) retains
one such checkpoint separately, checks the original image and features, and then
requires an actual finer paper audit. At a controlled 395-step ceiling the baseline
fails twice at 3.2094%; the candidate passes twice at 2.2269–2.2775%, below ten
seconds in this limited experiment. The ceiling is not a production change. The
original optimization trajectory and incumbent remain identical in fixed work,
and the retained alternative passes both 700- and 1000-pixel paper audits. The new
regression fails before the change and passes afterwards, including independent
SVG replay. All six focused checks, 857 application tests (one skip), type checking, lint,
build and private star/hat browser checks pass. The completed inverse suite passes
945/947; two clearance-repair failures are under a
[separate controlled investigation](clearance-handoff-regression-plan.json).
The complete corpus passes 22/22 Hunodan designs (maximum 9.490 seconds, every
error unchanged), 26/31 complete-heart photos and all 48 editable conversions.
The same 47-entry photo inventory, crop coordinates and mask hashes are retained.
Six accepted photo errors increase, so the strict no-regression gate fails.
All twelve changed photo outputs were visually reviewed: small contour changes,
checker-contact defects and thin seams remain. The twelve earlier uncapped fresh
trials also contain paired error increases. Prior failed runs remain recorded;
the current candidate is not a clean release result.

The [initializer handoff regression](clearance-handoff-regression-results.json)
isolates one of those failures: a completed, independently verified repair was
discarded at 1.248 seconds because its local cap was 1.2 seconds, even though the
caller still had search time. Final verification now retains that continuation
within the original caller deadline; it is not an accepted template above the
image limit. The deterministic regression fails before the fix, and all eleven
focused checks pass afterwards, including the strict caller-deadline rejection.
The second routing failure remains open: a later integer proposal leaves only
enough repair time for an uncertain paper checkpoint. Paired fresh trials before
this fix pass 6/6 on the pre-retention runtime and 3/6 on the current runtime, so
the small candidate-retention change is not declared free of timing regressions.
The post-fix full run passes 947/949 inverse tests and all 857 application tests,
type checks, lint, build and star/hat browser checks. The upward-leaf failure is
specifically an expected internal repair route: its initial template check passes,
but the test stops before independent image verification. Its complete output
was not captured. The other failure rejects a short, geometry-invalid routing
repair before paper verification. Corpus replay again passes 22/22 Hunodan designs
(maximum 9.515 seconds, identical errors), 26/31 complete-heart photos and all 48
editable conversions. Four accepted photo errors increase against the pinned
comparison, so strict quality still fails. All seven changed outputs were visually
reviewed; fine contact/seam defects and the rejected bauble's broken frame remain.
All 785 pinned source files stayed unchanged through the full run.
The leaf integration test now reloads and checks the exported geometry and paper,
independently renders its image, requires less than 2% disagreement and retained
features, and records full output on any failure. It accepts whichever valid
route wins; the deterministic repair-specific tests remain. All eight focused
tests pass. This later replay cannot establish the uncaptured earlier output's
quality, and the full-suite failure record remains intact.

A [fixed routing-checkpoint follow-up](routing-paper-continuation-results.json)
finds that the 81-step repair passes actual paper verification at 1000 pixels;
120 further steps at 700 improve its independently rendered error to 1.0944%.
That offline result does not fit the existing timing allocation. A bounded finer-
audit prototype still fails both controlled fresh trials: one integer proposal is
too late to enter repair, and the other completes a passing audit after its caller
deadline. All eight fresh outputs were reviewed; controlled failures lose the
three white openings when the pipeline selects its worse fallback. This prototype
is not integrated. The next scheduling experiment must fund useful verification
or continuation inside the original total budget, not accept uncertainty.

A [graph-budget investigation](topology-graph-budget-plan.json) finds that fewer
traced boundary segments do not guarantee a smaller MILP: guide portals can expand
the graph again. Across the latest 22 Hunodan and 29 classified-photo reports,
15 enter coarse preparation, one reaches its MILP and none accepts a coarse seed.
That `bibel-star-outline` graph has 5070 binary variables, compared with 708–834
in later detailed recovery. The separate perturbed routing fixture spends about
2.3 seconds on 2544 binaries before trying the useful 1380-variable graph.
These saved outcomes motivate a serial copied-runtime comparison of a sparse
coarse attempt with guided fallback, and detailed routing before coarse fallback.
The six-case repeated experiment is queued after full QA, preserves all source
hashes and the ten-second request, and has no results or production integration yet.

A [controlled photo-border experiment](border-fragment-perturbation-results.json)
replays 228 crop/resolution combinations with both re-estimated and frozen colour
clusters. All four original 400-pixel masks reproduce exactly. The outline-star
and crossed-ribbons failures each contain a small bottom fragment excluded at
200 pixels but mandatory at 400 and 600: its physical gap is similar, while the
one-rectified-pixel exclusion changes meaning. A quarter-source-pixel shift also
switches the star requirement. The star interior, bird eye/body opening and Viking
opening remain mandatory in all 57 variants for each classifier arm. This supports
source-resolution-aware photographic uncertainty, but does not certify the saved
reconstructions or justify deleting genuine small drawn features. No masks, image
error pixels, feature gates or benchmark denominators change. The timed Viking
failure is a separate issue; its source opening is stable in this experiment.

The [source-pixel support diagnostic](photo-sampling-support-results.json) checks
all 228 rectifications and the unchanged 47-entry corpus (29 classified masks,
98 mandatory features). The star and ribbons failure fragments include bilinear
samples outside their proposed crops; the four tracked genuine interior features
do not in any of their 57 variants. However, this does not explain every unstable
border fragment. A blanket exclusion would also flag large white-birds and jigsaw
features in accepted cases. No such policy is integrated. The initial corpus
reader correctly stopped on a hash mismatch because benchmark mask PNGs use red,
not black; the corrected reader asserts their exact palette and every original
mask hash. All original observations and the failed diagnostic log are retained.

A [boundary preparation refactor](boundary-trace-reuse.json) reuses cleanup and
pixel chains when trying several tracing tolerances. Across 29 photographic
masks and five border radii, all 145 resulting boundaries retain every control
coordinate and preprocessing field. Alternating before/after measurements show
22.7% less time in boundary preparation; this is not a whole-solve speed claim.
All 33 focused checks pass, including frozen pre-change outputs and mutation
isolation. Full QA passes 940 inverse and 857 application tests (one skip),
type checking, lint, build and private star/hat browser workflows. Fresh fitting
retains 22/22 Hunodan below ten seconds (maximum 9.591 s), 26/31 photographic
acceptances and 48/48 editable exports. The strict no-regression gate still
fails: one Hunodan and eight accepted photo errors increase. All eighteen
changed photo render pairs and the changed Hunodan output were visually reviewed.
The jigsaw recovers its puzzle tabs and 0.9744% disagreement in this run, but
the controlled delay study still reproduces its skipped-initializer failure.

A [paired initializer study](separable-start-reuse-plan.json) tested skipping
exactly repeated separable starts. Complete seeds and reports match for all
29 ordinary and 26 feature-weighted image-only probes, but the aggregate gains
are only 0.44% and 1.03%, respectively. The candidate remains offline; no
whole-solver improvement or repair of the scheduling cliff is demonstrated.

A [late feature-start scheduling study](late-weak-feature-budget-plan.json)
finished sixteen fresh solves across four difficult photos and two clock-delay
conditions. Lowering the speculative-start allowance from 2.5 to 1.5 seconds
does not improve delayed-jigsaw error and worsens the undelayed fine checker
from 1.70% to 2.19% by leaving less refinement time. It remains offline. All
sixteen renders were reviewed. The delayed fine checker also varies despite
neither run entering the changed branch, so that failure is recorded as
remaining timing sensitivity rather than attributed to the candidate change.

A [fixed-crop material diagnosis](fixed-crop-material-diagnosis.json) separates
the learned mask from crop placement on the stacked-heart photograph. With
identical corners and source RGB, red coverage is 47.82% in the resampled neural
mask and 59.75% with existing RGB classification. All 19,078 disagreements are
red pixels omitted by the neural mask; visual inspection shows narrowed checker
cells and rounded corners well inside the crop. RGB is not artwork ground truth,
and both masks still have inconsistent outermost edge counts.

The partial material annotations cover only 26.25% of this crop, excluding
apertures, dark rims, seams and boundaries. Neural error on those conservative
interiors is just 0.057%, despite the visible boundary distortion; RGB has no
errors on that subset. This exposes a limitation of the annotation coverage and
metric. Fresh fitting and editable conversion now pass on both exact-crop targets.
The RGB fit retains 98.87--99.39% of each photographed heart in its largest
component, versus 43.98--70.41% for the neural fit. However, RGB fitting connects
two hearts to the border, while neural fitting splits one and joins another to
the border. Both results were visually inspected. Neither is faithful motif
recovery; the shared RGB reference remains a proxy, not original artwork.

An [inspection of those two RGB-fit connections](fixed-crop-neck-diagnosis.json)
finds that each is bounded by different cuts in the same sheet, about 3 mm
apart. Snapping them together would violate same-sheet clearance. Closing
these motifs requires a different routing or cut assignment. The four large
heart regions pass colour retention but exceed the current small-enclosure
gate's area limit; source-stability analysis detects the lost enclosures.
The proposed RGB-boundary routing experiment was retired before execution
after the publisher confirmed that these motifs are printed decoration.

A [clearance-initializer robustness fix](clearance-feature-recovery.json)
addresses a 116-pixel change in a fixed 400-pixel stacked-heart mask. A valid
but incomplete alternative previously missed a useful bounded refinement;
coarse paper uncertainty then repeatedly erased progress. The helper verifies
retained uncertain checkpoints without relaxing geometry or paper rules.

The first full replay passes 933 inverse tests, 857 application tests (one
skip), type checking, lint, build and the private star/hat browser workflows.
Hunodan remains 22/22 below ten seconds (maximum 9.547 seconds), with every
image error unchanged. However, the photographic benchmark regresses from
26/31 to 25/31: an unsuccessful extra retry steals refinement time from the
Viking. Seven other accepted-photo errors increase. All 47 accepted editable
outputs pass, and all twelve changed photo-render pairs were visually reviewed.
This first version does not meet the no-regression gate.

The follow-up limits this retry to features that the same seed retained before
clearance preparation. The Viking's alternative never contained its missing
opening; the stacked-heart seed did. All four focused checks pass, including
both stacked masks and the Viking at ten seconds. A fresh Viking export passes
at 2.15% disagreement in 9.86 seconds. Full QA nevertheless passes only 933/934
inverse tests: the perturbed stacked-heart repair stops after 50 updates and
discards legal intermediate curves above the final 3% image limit. The later
corpus benchmark was not run after that failure.

A further correction distinguishes a verified starting shape from an accepted
template. A source-improving, feature-retaining legal repair can continue in the
main fitter even before meeting the final image limit. Every final gate and the
overall deadline remain unchanged. Five focused tests and a separate forced
early-handoff integration test pass. Fresh original/resampled fits reach 1.23%
and 1.35% disagreement; the forced handoff improves a 3.31% intermediate shape
to 1.39%. All three editable exports pass. The forced run advances the global
clock once, so it is a scheduling regression check, not a throughput benchmark.
Complete QA passes 935/936 inverse tests. The stacked-heart regressions pass,
but the synthetic-control sloth times out in both MILP attempts and returns an
invalid grid fallback. That solve does not enter the changed clearance-handoff
branch. The failure is retained while its four-case scheduling regression is
replayed in order and the corpus benchmarks run separately. The ordered replay
passes all four scheduling tests. Hunodan remains 22/22 under ten seconds
(maximum 9.568 seconds), with every error unchanged. Photos remain 26/31, but
nine accepted-photo errors increase; the jigsaw visibly loses puzzle tabs as
error rises from 0.97% to 1.78%. All fourteen changed render pairs were inspected,
and all 48 accepted editable outputs pass. These diagnostics do not clear the
full-QA timeout or the strict photographic no-regression gate.

The stacked-heart fit still needs improvement despite its lower mask error.
One heart remains connected to the border; another is split, with only 67% of
its source region in the largest piece. The earlier border-only probe has
consistent endpoint counts but an undersized eight-pixel strip; it is rejected.
The [independent-edge proposal study](independent-border-proposals.json) preserves
healthy bent edges in synthetic tests and gives wider photographed proposals
without changing the original scoring reference. Those proposals exceed the
0.5% heuristic allowance and remain offline. All eight fresh trace/MILP attempts
reach routing but time out without an integer candidate, even as simplification
reduces the graph's visible curves from 124 to 51. Correcting endpoint counts
alone therefore does not provide a useful fit within this routing allowance.

The [guided-field experiment](guided-material-fields.json) is complete and
remains offline. Across seventeen development photos, RGB-guided sharpening
produces 2--4 supported crops depending on radius, versus three baseline crops.
All eleven available reconstructions and editable conversions were inspected.
The newly supported decorated checker has a displaced crop despite a low
derived-mask error; other fits still lose thin features or open heart motifs.
No guided filter is integrated. Its unfiltered control also exposed the small
resampling perturbation investigated by the initializer fix above.

Two [new Pinterest paper-scene annotations](paper-scene-labels.json) add a
hand-held red/green checker and a painted purple/pink and white checker.
The labels distinguish paper identity from paint variation and exclude
fingers, handles, seams, shadows and uncertain backing. Native outlines
and 256/768-pixel overlays were reviewed; admission reproduces all 28
reviewed PNGs exactly. Existing annotations and QA allocation are unchanged.
These two source groups are not yet used in training.

A [guarded-clearance WASM follow-up](paper-clearance-kernel.json) accelerates the
remaining paper-mask classification loop. Threshold ties and extreme distances
return to the existing JavaScript `hypot` calculation. All 37 fixed-geometry cases
retain every map pixel and audit field; complete audits are 18.8% faster at the
median in this Node comparison. Eight private Chromium cases also match exactly,
and the star and free-border hat workflows pass through editable SVG export.
Full QA now passes 930 inverse tests and 857 application tests (one skip),
plus type checking, lint and build. Fresh fitting keeps 22/22 Hunodan below
ten seconds (maximum 9.566 seconds), 26/31 photo acceptances and 48/48
editable-template checks. Hunodan total runtime is 4.5% lower in this single
before/after run. The strict incremental error gate **fails**: one Hunodan
render is one pixel worse and the puppy is fourteen pixels worse. Among
accepted photos, fifteen errors improve and ten are unchanged. All nineteen
changed photo renders were visually reviewed; existing seams and crop
distortions remain, and the orb gains small border artifacts despite a
lower error. The Hunodan change also exposes internal point-sampling versus
independent antialias scoring differences when more polishing steps fit
within the budget. This is not a no-regression release claim.

A [fixed-input polishing study](polishing-work-study.json) isolates the Viking
checkpoint from crop and initialization changes. With the production numerical
WASM backend and 160 updates, the old and strengthened checks choose identical
coordinates at the existing 40-step interval. Halving that interval adds work
without improving this fit; checking every ten steps slightly worsens independent
rendered error. No cadence change is integrated.

The [expanded material experiment](material-expanded-results.json) completes the
[seventeen-photo plan](material-expanded-plan.json), independent checkpoint audit,
visual review and 85 full-pipeline attempts. Evaluating both the previous and new
models on the same seventeen photos reduces observed material disagreement from
19.42% to 14.90%, while body IoU falls from 83.83% to 81.83%. On the original nine,
material disagreement improves from 15.41% to 12.56%; results for the eight
additions and both held-out families are recorded separately. Synthetic control
tensors, shared predictions and original input labels remain exactly identical.

With the same current solver, the learned joint pipeline increases checked
editable pairs from 2/17 to 3/17, losing the boar and adding rabbit and stacked
hearts. Production reaches 6/17. All fourteen expanded-joint failures stop at
cropping; some have almost zero observed material error but still lack usable
outline/lobe evidence. The fifteen available reconstructions were visually
reviewed, including rejected candidates. Opened heart motifs, lost thin strokes
and rounded cells remain visible in some accepted outputs. These counts measure
derived-mask and paper checks, not faithful recovery of original artwork. The
model remains offline, and this experiment does not replace the corpus benchmarks.

A [body/material swap diagnostic](material-crop-swaps.json) now separates the
two predicted fields across all seventeen photographs (68 crop attempts).
Both diagonal controls reproduce their historical crop decisions and
coordinates exactly. The rabbit and stacked hearts require both expanded
predictions; replacing either previous prediction loses the boar. Neither
fixed cross-combination improves the crop count. One newly supported
decorated checker passes full fitting and editable checks, but its neural
mask has already rounded and displaced the photographed straight cells.
Existing RGB classification on the identical crop restores straighter
interior edges; its fit also passes, while retaining border artifacts
around the displaced crop. The two fits use different targets, so their
error percentages are not a paired artwork-accuracy comparison. No
ensemble, replacement model or additional corpus success is claimed.

A [fixed appearance-sensitivity diagnostic](material-appearance-sensitivity.json)
checks 357 predictions: seventeen photos, three frozen models, and the original
image plus six small exposure, gamma and saturation changes. Padding, geometry
and labels stay fixed; all original predictions reproduce exactly. In the
expanded model, a 5% exposure increase changes 7.70% of known-body material
predictions on the orange/yellow checker. Its observed error falls from 39.29%
to 28.71%, still poor. The seventeen expanded-model comparisons were visually
reviewed. These changes isolate appearance sensitivity, while persistent missing
motifs and foreground errors show that it cannot explain every failure. No
per-photo variant is selected for fitting, and no model is retrained or deployed.

The [latest export-audit QA](editable-paper-qa.json) passes all 60 saved SVGs
through the stronger paper check, 857 application tests, type checking, lint,
build and two fresh browser workflows. The full inverse suite is **924/925**:
one ten-second sloth-routing case timed out before HiGHS found an integer
candidate. A fresh replay in the same two-case order passes, but does not erase
the failure. Solver sources match the earlier 923-test passing run exactly.
Short-search timing robustness remains open; no release replacement is claimed.

A [new orange/yellow Pinterest checker](palette-photo-labels.json) adds one
previously unlabelled photograph with body and partial paper-identity labels.
Source outlines and overlays at 256 and 768 pixels were reviewed; compilation
from the admitted sidecars reproduces every reviewed PNG byte. The source group
remains unassigned in the source inventory; it now enters the expanded grouped
development experiment above. A duplicate star draft
was excluded and a reserved QA photograph was kept out of training admission.

[Five additional material annotations](additional-material-labels.json) cover a
curved hanging checker, a green/white bicycle medallion, a yellow/purple sloth,
a decorated red/white checker and a yellow/teal checker on a reflective red
background. Conservative interiors were inspected on the source photographs
and compiled at 256 and 768 pixels. The compiler verifies every pixel, and RGB
and body assets remain byte-identical to the previous exports. One sloth
polygon initially crossed a paper boundary; it was corrected and re-reviewed.
Fine bicycle strokes, handles, occlusions, seams and uncertain material remain
unlabelled. These five labels are not new held-out photographs; they now enter
the expanded grouped experiment above. At admission the material inventory was
sixteen instances.

The first [joint material pilot](material-pilot-results.md) has completed all
three training runs and its independent checkpoint audit. Mixed out-of-fold
material disagreement is 46.11%, versus 45.24% for the synthetic-only control;
visual review shows mostly single-paper predictions. These checkpoints are not
suitable for integration. Full reconstruction replay confirms zero crop proposals
from either joint material model; production yields two checked editable pairs
and mixed body evidence yields one on these nine development photos. Training-set
diagnostics expose underfitting: a tenfold rate increase reduces synthetic training
material disagreement from 48.24% to 4.09% at the same update count. A fresh grouped
photo follow-up has now [completed](material-pilot-v2-results.md): mixed observed
material disagreement falls to 17.84%, while body IoU falls to 81.24% from 85.42%.
The joint model recovers only one of nine complete reconstructions, versus two
for production. Restoring the original body predictions alone does not recover
the other joint crops. Printed-paper identity, clutter, outline evidence and
paper connectivity remain distinct failure sources. No learned model is deployed.

A [controlled printed-paper follow-up](material-printed-study.md) now reduces
mixed observed material disagreement to 15.41% and raises body IoU to 82.38%.
The joint pipeline yields two checked editable pairs out of nine, matching the
production count but on partly different photos. Floral/stripe and blue/gold
paper improve substantially; star, stacked hearts and the hand-held checker
regress. Seven joint crops remain unresolved, including photos with almost zero
observed material error. The model remains offline; these results do not replace
the established solver benchmarks below.

An [additional material annotation](protruding-material-labels.json) now covers
conservative red/white interiors on the existing photograph with protruding
motif pieces and a yellow background. Both 256- and 768-pixel overlays were
visually reviewed and pass the compiler's source, grouping and pixel checks.
The 256-pixel RGB and body PNGs are byte-identical to the earlier body-training
exports. Seams, fine tips, the handle, shadows and uncertain body regions remain
unlabelled. This brought the material inventory to ten existing heart instances.
The labels now enter the expanded grouped experiment; this previously used
foreground development photograph is not a new held-out test.

A [curved-checker material annotation](curved-material-labels.json) adds eleven
conservative red/white regions on an existing development photograph with a
painted background. Source and compiled overlays at 256 and 768 pixels were
visually reviewed; admitted PNGs reproduce those overlays exactly, and the
256-pixel RGB/body files match the previous training exports byte for byte.
This was the eleventh material-labelled instance and now enters the expanded pilot.
A hand-held printed heart was excluded because its pale ink could not be
confidently identified as a second sheet.

A [frozen stacked-hearts investigation](enclosure-corner-study.md) finds that
low pixel error and the current feature gate can still admit unwanted channels
from larger motifs to the background. It also isolates a corner fragment that
adds endpoints on two adjacent sides. New bounded routing proposals restore
consistent counts without changing the image reference, but later narrow-return
failures remain. The proposals and new photographic regression fixture are
offline; this is not an additional accepted-photo result.

A [fresh clearance-repair replay](corner-clearance-repair.md) now constructs a
checked three-by-three editable pair from that frozen mask, keeping all four
heart motifs enclosed. The repair adds nonlocal clearance witnesses to the
existing projector and preserves endpoint-based parameters on short straight
spans, preventing a newly diagnosed handle-overshoot crossing. Preparation,
routing, repair and engine finalization take 11.45 seconds; independent mask
disagreement is 2.4525%. A second fresh replay with ordinary Bézier refinement
reduces disagreement to 1.76125% while retaining all four enclosures, including
at the finer independent render scale. It passes editable-SVG checks and takes
14.91 seconds before independent audits. That isolated fixed-mask experiment
preceded automatic scheduling and did not change the 25/31 photo result.

The [automatic enclosure recovery](enclosure-recovery.md) now schedules the
same routing, repair and refinement for small supported corner disturbances.
The real Paint/worker/Draw workflow keeps all four hearts enclosed, with 1.73%
editable-mask error and 16.74 seconds click to ready. All 883 inverse tests,
857 application tests and six browser workflows pass. The 22 Hunodan designs
retain exactly their validated errors and finish within 7.94 seconds; all 47
accepted corpus exports pass editable checks. Photographic acceptance remains
25/31, but five errors increase slightly, so the strict release comparison
still fails. The linked record retains these regressions and a timing probe.

A subsequent [rollback investigation](enclosure-recovery.md#refinement-rollback-follow-up)
verifies uncertain paper before repeatedly discarding a useful fit. Its fixed-work
floral-checker regression improves from 4.61% to 1.58% error. Fresh native fitting
keeps all 22 Hunodan designs below ten seconds, improves two of their errors and
leaves twenty unchanged. Photographic checks reach 26/31 and all 48 accepted
editable exports pass. The newly accepted jigsaw still has a visibly distorted
crop, so this does not establish 26 faithful original-design reconstructions.
Two historical photo error regressions remain. Full QA now passes 886 inverse
and 857 application tests, type checking, lint and build. Eleven browser
workflows and fresh entry-loading checks pass. The historical error gate still
fails, so this is not a validated release replacement.

The following [feature-analysis reuse experiment](feature-analysis-reuse.json)
avoids recomputing unchanged interior components. It verifies source bytes and
returns independent arrays; weighted and partially observed inputs keep the
original computation. All 112 semantic comparisons and 24 focused tests pass.
Sixteen paired ten-second fixed-mask fits retain checked outputs, with average
fit time decreasing from 9.442 to 9.361 seconds. The dense-checker pair also
improves its error, but two repetitions per condition do not establish broad
speed or quality gains. The change is committed as `3997441`. Full repository
QA passes 889 inverse tests, 857 application tests, type checking, lint and build;
all 733 pinned source files were verified. Native replay retains all 22 Hunodan
errors from the preceding runtime and completes them within 9.323 seconds.
Photographic checks remain 26/31, all 48 accepted editable pairs pass independent
checks, and eleven browser workflows plus initial-loading checks pass. The strict
historical photo-error gate still fails for crown: 2.411875% previously versus
2.454375% now. Viking clears that historical comparison. Small additional error
increases relative to the immediately preceding runtime are retained in the
record; the cache does not make a timed optimizer's output invariant to speed.

A [final-polishing diagnostic](paper-polishing-resolution.json) finds that a
better crown checkpoint remains uncertain even at the existing 700-cell paper
resolution. Its unchanged curves pass post-fit 1000- and 1400-cell rechecks
at 2.241875% mask disagreement. An isolated fresh solve that verifies such a
checkpoint and carries the finer resolution through finalization reaches
2.273125% in 9.60 seconds, versus 2.333125% in its paired run. This is one
cold-start comparison. A fixed 41-step replay now isolates the verification
benefit: 2.454375% becomes 2.241875% from identical initial controls. Full isolated
replay retains 22/22 Hunodan below ten seconds, 26/31 photo acceptances and 48/48
checked editable pairs, but the strict historical error gate fails on three
photos (two by one or two pixels, Viking by 102 at 400 squared). Fixed 160-step
comparisons produce identical coordinates for dense checker, round checker,
warped checker and Viking; fine checker improves from 1.5775% to 1.553125%.
The bounded finer polishing check is committed as `dfcd6e5`, with progress,
Stop and export regressions. Repository QA covers all 891 inverse tests after
a controlled-clock correction to one clearance-repair test: the initial full
run passed 890/891, and all six tests in the corrected file pass on rerun.
The other 885 results and unchanged application/runtime checks are reused.
Type checking, lint, 857 application tests and build pass. All twelve actual
Chromium upload/example-to-editable-export workflows and initial-loading checks
pass, with 735 source files verified. The ten-second-budget crown exports at
2.284375% disagreement and retains its actual 1000-resolution paper audit;
maple also uses 1000 and exports at 0.7975%. Crown click-to-ready time is 10.69
seconds, including preparation, export and conversion; the solver budget is
not a UI latency guarantee. All twelve Draw results were visually reviewed.
The repair failure also reproduces with the old runtime: its exact
100-step geometry passes at 1000 but not 700, while 125 steps pass at 700.
That production repair limitation remains; fixing the unit test does not cure
it. Default resolution and physical tolerances are unchanged. The timed
historical error regressions remain recorded, not explained away by this test.

A [paper-calibration change](paper-calibration-calls.json) spreads backend
measurements across two real audit requests, comparing both outputs on each
input before selecting WebAssembly. It retains only timings. Across seven
geometries, four alternating-order rounds in Node and Chromium preserve every
paper-map pixel and audit field in all 560 timed complete audits. Chromium's
median first-audit saving ranges from 21% to 43%; the first audit plus four
follow-ups saves 10% to 20%. Deferred work makes some follow-up batches slower,
so these are not uniform per-call gains. Eight cold leaf-repair runs are faster
with the new policy but all still fail the 700-resolution paper check. The
change is integrated locally after 33 focused tests. Its [full QA run failed](paper-calibration-release-failures.json):
880/895 inverse tests pass, while type checking, lint, application tests and build
pass. Corpus and browser stages did not start. Paired replays expose a frozen-clock
geometry test contaminating later backend selection, plus a tree test that rejects
a valid final export solely because its preliminary MILP timed out. The actual
failed tree export independently passes all final checks at 1.1375% mask error
and 0.375% central-region error. The geometry test now runs in its own process;
the tree test retains every final quality check while requiring the routing attempt.
All eight affected tests pass. Other failures remain unresolved. This does not
establish additional successful reconstructions or fix the repair's finer-verification
limitation.

A [repair-budget correction](available-repair-tail.json) now includes the
caller-provided verification tail when deciding whether continuous repair can
start. The previous guard ignored this already allocated time. Two fresh
silhouette fits improve from rejection at 5.3472% mask disagreement to checked
pairs at 1.6064%, with no source changes or larger overall deadline. Across four
fixed masks and two AB/BA rounds, acceptance rises from 4/8 to 6/8. The cropped
tree still fails; some accepted-case errors increase, so this is not a strict
no-regression result. A real-MILP controlled-delay regression fails before the
change and passes after it, including a no-borrow control. All eleven focused
integration tests pass. The subsequent full run passes 896/897 inverse tests,
857 application tests, type checking, lint and build; all 738 pinned source files
are verified. The remaining failure times out while seeking matching sheets,
after the independent pair passes template and paper checks. Native corpus and
browser stages did not start. That scheduling failure remains under investigation;
this is not a completed release validation.
A separate coarser-initializer experiment was not integrated because it did not
repeatably resolve the primary failure. The calibration comparison's remaining
13 tests were also replayed twice per runtime: 21/26 passes before and 22/26 after,
with failures shared across revisions. Those focused runs do not replace the
failed full-suite record.

A [matching-stage preparation optimization](matching-preparation.json) reuses
spline interval bases and snapshots the observed image objective once per
selection stage. All 216 old/new control-coordinate comparisons and 481 image
score comparisons are exactly equal. A fixed 200-step matching replay returns
identical exported coordinates and PNG pixels; its one observed run drops from
2.414 to 2.204 seconds. These are component measurements, not broad speed gains.
Four new snapshot/weight regressions pass, and focused checks pass 29/30; the
existing free-border matching test still times out. Neither a simple priority
budget nor a lower fitting resolution consistently fixes that failure, so those
experiments remain unintegrated. The subsequent full run passes 900/901 inverse
tests, all 857 application tests, type checking, lint and build, with all 739
pinned source files verified. Its only failure compares a computed
0.4999999999999991-second allowance with exactly 0.5 seconds. The matching-seed
regression passes in this run, but earlier timing failures remain unresolved.
The floating-point correction passes both real-MILP tests with all geometry
and paper assertions retained; native corpus and browser stages did not start.

A [late-matching deadline correction](late-matching-finalization.json) now
uses the requested allowance after the independent fit's initial ten-second
phase. Two isolated twenty-second handoffs that previously skipped matching
now find identical templates at 0.4013% independent mask disagreement. Each
has twelve seconds already elapsed and finishes finalization in about three
more seconds. Expired requests still skip refinement; ten-second deadlines are
unchanged. This is not a fresh-photo speed result or a demonstrated cure for
the separate ten-second matching timeout.

A [cropped-tree repair correction](cropped-tree-handoff.json) now lets a bounded
provisional trace improve against the original pixels before requiring final
image accuracy. Its first routing has 3.80125% mask error and two small clearance
violations; the old code rejected it before any gradient step. Final error,
feature, geometry and paper checks are unchanged. In two fresh ten-second runs,
the tree improves from rejected 7.88875% exports to checked pairs at 2.27625%
and 2.29875%, taking 8.39 and 8.66 seconds for design and export. Independent
800-pixel renders also remain below 2.46%. Across four fixed masks and two
alternating-order rounds, acceptance rises from 6/8 to 8/8; all three controls
retain passes, but one increases from 0.6000% to 0.6544% error. The frame still
has visible small defects. All eighteen focused integration tests pass, including
the old ten-second matching regression. The subsequent [full run and paired
diagnosis](feature-recovery-release-failures.json) record 902/905 inverse passes;
type checking, lint, application tests and build pass. Two failed assertions
required an intermediate rejection or a raw MILP success even when continuous
repair had already supplied a valid pair. Those assertions now recognize the
checked repair while retaining every final quality check. Both affected complete
test files pass on follow-up, 17/17. The third failure exceeded the unchanged
1.8% error bound after a one-pixel crop shift; four isolated fits and the complete
file replay each reach 1.341875%, but the original timing-sensitive failure is
not explained. Corpus and browser stages did not start. These experiments do not
increase the published 31-photo benchmark count.

A subsequent [complete QA and captured replay](timed-feature-diagnosis.json)
passes 904/905 inverse tests, along with application tests, type checking, lint
and build. The remaining accelerated-clock near-miss fit reaches 3.035% error
at the independent 800-pixel scale, exceeding the unchanged 3% limit. Two
complete near-miss file replays and one feature-seed file replay then pass all
32 tests, with 24 fits captured. Identical-mask comparisons show a shorter
broad refinement followed by lower-error detail candidates that fail paper
checks; this does not identify cropping as the cause or justify weakening
validity checks. The two intermittent fidelity assertions now retain typed
source arrays, the solver report and byte-identical cut geometry on failure.
Neither the successful replays nor this diagnostic helper cancel the failed
full-suite result. Native corpus and browser stages have not run.

The [count-order comparison](base-count-near-miss-probe.json) retains all 28
checked outputs but does not repeatably improve the difficult short-budget
case, so that shortcut is not integrated. A separate
[checkpoint capture](near-miss-paper-checkpoints.json) reproduces the failure
and locates a pinched hook whose paper-core failure persists at 1400 cells.
The automatic fit's separation force ignores nearby portions of one slit over
eight nominal widths. A shorter exclusion recovers quality in an equal-work
replay, but [applying it throughout polishing](outline-separation-force-probe.json)
damages neighbouring motifs. That version is rejected.

The [conditional paper-separation retry](conditional-paper-separation.json)
now activates only after a complete geometry-valid, paper-failed block during
outline polishing. In the fixed 120-step regression, independent error falls
from 3.0536% to 2.3316%, with paper checks passing at both 360 and 1000 cells.
A fresh cold-start pair improves from 2.9852% to 2.2878%; a successful control
retains every curve coordinate. All 23 focused tests pass. Neither acceptance
rules nor deadlines change, and a changed force resets rollback-cycle detection.
The 24-fit comparison also exposes existing fine-resolution paper failures:
20/24 pass at 1000 cells, and one failed output is byte-identical to an earlier
unmodified baseline export. The retry never ran on that output. This remains
an unresolved validation limitation. Full repository QA now passes all 907
inverse tests, 857 application tests (one existing skip), type checking, lint
and build; all 747 pinned source files remain unchanged. All twelve browser
workflows and fresh entry-loading checks pass. Native Hunodan results are
22/22 below ten seconds (maximum 9.454 seconds), with twenty errors unchanged
and two improved. Photo acceptance is 26/31 and all 48 accepted editable pairs
pass, but bird, round-checker and Viking errors regress against `c000d30`. The
first two changes are one and two pixels at 400 squared; Viking rises from
2.0244% to 2.2181%. The distorted jigsaw crop remains a fidelity limitation.
The strict error gate fails; this is not a validated-release replacement.

An [independent polygon-offset audit](paper-offset-cross-check.json) now
confirms three resolution-sensitive photographic false passes. At intermediate
offset radii, a connection can close before its island becomes too small; the
coarse guard endpoints can both look acceptable. A second case is a thin
fold-centred island that falls between lattice rows. Clipper2 WASM and separate
GEOS offsets agree on all 240 nominal comparisons across 60 current native and
browser exports: 59 pass, while Hunodan `hjcur-05` has a disconnected 4.154 mm²
core on paper A. This qualifies the earlier 22/22 result, which passed the
existing raster rules. The diagnostic has seven committed regression examples
and four passing tests. It is offline; the production lattice, acceptance
settings and fitting remain unchanged. Nominal fine-offset checks take a median
67 ms per pair in this run, excluding fitting.

The [post-diagnostic repository QA](paper-offset-qa.json) passes all 911 inverse
tests, 857 application tests (one existing skip), type checking, lint and build.
All 817 pinned files remained unchanged throughout the run. This verifies the
diagnostic additions; it does not integrate the geometric gate or repair.

A [fold-aware repair experiment](folded-cut-repair-probe.json) then runs 22
fixed-work continuations. Adding separation from the mirrored cut repairs the
Hunodan fold defect and both vertical-crop failures; the independent GEOS
radius probes confirm all three. Hunodan disagreement rises from 0.9259% to
0.9458%, while both vertical crops improve over their saved starting fits.
The original-crop hook also needs the shorter same-cut exclusion; its geometric
core passes, but the coarse lattice still reports uncertain. Always applying
the new force slightly worsens valid controls, so it is not integrated as a
blanket change. These are saved-fit continuations, not fresh ten-second solves.

The geometric check and a [conditional repair](geometric-paper-integration.json)
are now integrated into final export. Both the old lattice rule and fine
unfolded polygon offsets must pass; loading or numerical uncertainty never
silently certifies a candidate. Detected fold defects add a mirrored-cut force
only on the affected sheet, using the main constrained fitter. Valid geometry
is returned unchanged. Paper-support SVGs show the nominal polygon cores;
downloads remain available when checks fail. A fresh integration run passes
22/22 Hunodan below ten seconds (maximum 9.793 seconds); independent exported
errors versus `c000d30` are nineteen unchanged and three improved. Separate
GEOS geometry passes all 264 radius/tolerance/family probes for those exports.
These native timings precede two loading-only fixes; a full replay is pending.

Integration QA caught and corrected two startup issues: the test bundler
rewrote the static WASM URL, and the compute worker could lose its first job
while asynchronous initialization delayed its message handler. The receiver
is now installed before awaiting the engine. All 857 app tests (one existing
skip), type checking, lint, build, 22 focused inverse tests, deferred-entry
checks, delayed-worker and backend-failure browser checks pass. Star and
free-border hat complete the full Paint-to-Draw workflow. The complete inverse
suite then finishes with 918/921 passing. Three original/vertically shifted
near-miss photographic runs fail final acceptance, including one under the
accelerated clock. All 825 pinned files stayed unchanged. Final-report capture
is the next step to distinguish deadline exhaustion from inadequate repair.
The native/photo and remaining browser release stages were not run after that
failure; this candidate is not a new validated release.

A [polishing-stage repair](polishing-fold-recovery.json) identifies the cause:
the detailed fitter froze the border band even when the coarse paper check
missed a fold island. Geometric checks now run during detailed polishing,
activate separation on affected sheets and release only their temporary fold
locks, preserving endpoint constraints. Four fresh source/crop/clock replays
now pass, compared with one before. The two ordinary-clock runs finish design
and finalization in 9.94 and 9.36 seconds; independent mask errors are 1.2575%
and 1.335%, slightly above the earlier invalid outputs. Separate GEOS checks
pass all 48 family/radius/tolerance probes. The nineteen existing focused
tests and six outline tests pass, including two new orientation regressions.
Type checking, lint, all 857 application tests, build, entry-loading and
geometric-backend browser checks pass. Star and free-border hat also pass the
complete Paint-to-editable-Draw workflow, with screenshots visually reviewed.
The subsequent complete inverse suite passes all 923 tests in 1,040.93 seconds,
with all 827 pinned source files verified unchanged. Fresh native replay passes
22/22 Hunodan below ten seconds (maximum 9.646 seconds), with nineteen errors
unchanged and three improved versus `c000d30`. Photographic checks retain 26/31
and all 48 accepted editable pairs pass existing checks. All twelve actual
Chromium workflows pass and their Draw screenshots were visually reviewed.
An additional audit checks the actual editable SVGs with the geometric paper
model: all sixty native/browser exports pass. Separate GEOS checks pass all
1,440 family/radius/tolerance probes across both engine and editable forms.
The strict historical error gate still fails: dense checker and bird each add
one erroneous pixel, round checker adds five, and Viking rises from 2.024375%
to 2.225%. The previously accepted jigsaw still has crop-quality limitations.
Two failed fits pass physical checks but omit small near-border source regions;
their crop previews suggest boundary contamination, without establishing that
the regions can be discarded. Reference masks and feature rules are unchanged.
This is not a new validated release replacement.

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
checks. Two shortlist variants exposed and corrected count-diversity issues.
The corrected paired replay passes 12/12 versus 8/12, with no higher error at
either independent render scale and a maximum native time of 9.522 seconds.
The first full inverse run passes 857/859; its two failures require now-obsolete
search histories. [Paired output checks](shortlist-regression-review.md) retain
maple fidelity and improve the checker before updating those assertions. A
separate guard prevents a new reservation from evicting an already simpler
finalist. Fourteen focused tests pass. The [fresh release comparison](clearance-repair-release.md)
passes all 860 inverse tests, 857 application tests (one existing skip), check,
lint and build. Hunodan remains 22/22 below ten seconds (maximum 8.034 s),
with unchanged errors; photographs remain 25/31 and all 47 editable pairs pass.
Five accepted photo errors decrease, but floral checker and Viking increase
slightly, failing the strict no-higher-error gate. All eighteen main browser
workflows pass, but the ordinary-budget shifted leaf fails its focused quality
check while the ten-second version passes. Initial solver/WASM loading remains
deferred; a generated build-identifier length change adds four raw initial
script bytes and fails the strict size comparison. `c000d30` remains the latest
fully validated runtime.

The newer [robust-search comparison](robust-search-release.md), including exact
rollback skipping and long-budget grid comparisons, passes all 861 inverse tests
and the full application checks. Hunodan remains 22/22 below ten seconds
(maximum 8.113 s), photos remain 25/31 and all 47 editable pairs pass. Floral
checker improves to 1.896250%, but warped checker and Viking increase slightly;
the strict no-higher-error gate remains failed. All eighteen main browser
workflows and all six ordinary/ten-second leaf/star comparisons now pass, including
the previously failing ordinary shifted leaf. Its downloaded SVG scores 0.7600%
and 0.9525% at 400/800 pixels. Both entry routes retain baseline script sizes and
deferred solver/WASM loading.

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
The earlier [Pinterest annotations](real-pinterest-annotations.md) brought
the body-label inventory to eighteen; the additional palette photograph brings
it to nineteen. The original ten-photo training pilot remains unchanged.

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
justify a global replacement. The initial seven partial material labels and
joint loss were implemented and checked before the nine-instance pilots
summarized above. A [tested decoder transfer](material-transfer.md) preserves
the learned foreground output when adding paper identities. The
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
allocation has been added. The [joint evaluator](material-evaluation.md) counts
missed body as a material error and retains one global A/B assignment per image;
unknown regions cannot silently become correct background.

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
