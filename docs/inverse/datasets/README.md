# Data for learned heart reconstruction

Neural release status reviewed on **2026-10-20**; dataset counts last audited on
**2026-10-20**. **The adapted U2NETP paper-body model is deployed as a crop
fallback.** It runs locally in the browser; the existing colour classifier and
geometric solver still produce the cutting templates. The experimental
paper-identity heads remain rejected for production. The
[outline-only extension](u2netp-outline-upload-results.json) is also deployed
and passes all 11 live browser checks after merging PR #17.

## Current results and limits

| Area | Verified evidence | Remaining limitation |
| --- | --- | --- |
| Real-image inventory | 1,341 files; 811 contain assembled-heart photographs; all files and decoded identities audited | File counts are not counts of independent motifs or fully labelled training examples |
| Sabrina Danholm's Pinterest board | All 225 pins imported; 220 new image files, about 35 MiB | No new corner, material or cutting-path labels; the whole board is QA-reserved |
| Conni’s heart-template board | [All 122 pins preserved](conni-board.md); 90 distinct files, 87 new, 12.5 MiB downloaded; 23 photo/template composites | Whole board QA-reserved; 42 visual duplicate links grouped; creators and cutting geometry mostly unverified |
| Synthetic geometry | 256 saved witnesses pass the current geometry/paper re-audit across 768 original/subdivided/reflected representations | Limited procedural diversity; recipe holdouts are not topology-disjoint splits |
| Small learned model | Earlier MobileNetV3-Small fallback raises checked editable pairs from 7/16 to 9/16 on its development cohort; a newer fixed candidate stays at 7/16 on separately selected Sabrina photos | These are different cohorts; no deployment or established source generalization |
| Saliency models | Adapted U2NETP crop fallback is deployed; the outline extension preserves all 32 original crops and selects five tested alternatives on the additional 18-photo cohort | Raw numerical parity still fails; output-level parity is separately verified. Printed paper, missing body regions and false seams remain; this is development evidence |
| Expanded body supervision | Initial 120-update comparison gives 12/32 versus 10/32; preserving old-photo visits in a 180-update comparison restores both to 12/32 before editable rendering | Final raw editable counts are 11/32 versus 12/32, with the difference traced to a borderline rasterization artifact; no extra design coverage established |
| Late encoder adaptation | Training-pixel error falls from 2.91% to 1.78%, but full editable recovery stays at the same 12/32 designs | No new crop-support decisions or recovered designs; not promoted |
| Broader photo evaluation | Outline extension retains 12/32 and raises the additional set from 4/18 checked derived masks (three supported by full-body evidence) to 6/18, all six body-supported | Replacing a fragment crop with the whole overlap can reveal a reconstruction failure. Printed paper, crop assumptions and feature loss remain separate problems |
| Paper-colour calibration | Original-resolution colour mixtures restore detail lost by raw neural masks; fresh fixed-crop comparison gives 11/32 checked pairs with learned palettes versus 13/32 with RGB clustering | No learned-only checked gain; print confusion and unsuitable crops remain; these are derived-mask checks, not artwork ground truth |
| Paired paper-identity training | Matched 256-update runs reduce synthetic printed-paper error from 10.84% to 9.64%; every real training/development photo reviewed | Known-region real training error increases from 3.53% to 3.65%; print confusion and lost small features persist; head rejected for deployment |
| Paper examples from exposed lobes | Fixed-crop production comparison yields 18/32 editable checked candidates versus 13/32 for production; all production passes retained | Self-mask scores overstate artwork recovery: one additional pass has a wrong crop; thin details regress and printed ink remains ambiguous; not deployed |
| Larger segmentation baseline | Official pretrained MobileSAM evaluated offline | A useful body mask alone does not establish correct corners, material boundaries or legal templates |
| Solver | Deployed outline release passes 1,183 inverse correctness tests; earlier dedicated runs solve all 22 regular Hunodan designs under ten seconds | Some hard fits retain thin false seams; 17/77 original main-CI timing targets miss; the earlier 27/31 photo benchmark has not been rerun |

The experiment history below retains its original cohorts, counts and release
decisions. References to an experiment remaining offline describe that stage;
the current deployment status is stated above and in the release audits.

The [whole-body selection comparison](u2netp-balanced-body-results.json) now
allows a supported neural crop to replace a weak existing proposal when it
substantially improves coverage of the predicted paper. It recovers the angel:
the new full-overlap crop produces **0.87% exported / 0.90% editable disagreement**
and passes nominal paper checks, whereas the old crop failed them. Those errors
refer to different crop-derived targets, not identical pixels or original
cutting ground truth. All 12 checked cases on the original 32-photo cohort
remain. The additional set rises from three to four checked derived masks;
**three also pass the new whole-body evidence check**. The remaining bird crop
contains only 17.9% of the predicted paper and remains an editable, flagged
failure rather than a whole-heart success.

The [first whole-body score](u2netp-whole-body-first-results.json) incorrectly
rejected the checker: it discounted uncertain foreground but counted the entire
outline area as certain background. The corrected metric treats foreground and
background confidence symmetrically, without changing thresholds. Both complete
cohorts were rerun. All 15 distinct exports across the two versions pass editable
conversion and geometry; the printed swan paper fails paper checks in both.
Every comparison page was inspected. The ten focused tests pass. This is still
offline research: the next step is replacing source injection with an explicit
locator field-provider API and checking model loading, cancellation and the
actual user flow before production integration.

The initial [expanded photo evaluation](u2netp-expanded-evaluation-results.json) tests
the existing 16-photo-adapted checkpoint without further training. All 18
eligible additional photos remain in the denominator, including two variants
of the Santa photograph already assigned to the same duplicate group. This is
development evaluation, not an untouched holdout. The original 32-photo
regression retains all 12 checked editable pairs. The additional set retains
three with or without neural assistance; the two new crops fail later checks.

Visual inspection exposes an important false success: the green-and-gold bird
crop contains only a small part of the heart. Its **2.47% derived-mask error is
not successful whole-heart reconstruction**. The current fallback keeps every
production crop, so it cannot repair that selection. A separate neural-only
diagnostic also fails on the bird. On the miscropped angel, it instead proposes
a visually plausible full overlap; the subsequent comparison above fits it.
These observations motivate checking whole-heart coverage and considering
neural alternatives to weak existing crops, without weakening geometry or
image-fidelity checks. The Santa variants lose enclosed features despite less
than 3% error; printed decorations are mistaken for cuts in both new neural
targets. Better cropping alone cannot resolve those downstream failures.

All 13 distinct new exports were audited through editable conversion; reused
audits require matching source, geometry and mask hashes. Every comparison page
was inspected. Actual one-thread browser inference takes a **1.073 s warm
median** on this machine. Browser RGB and input tensors are exact, and both
additional neural crops, masks and fitted geometries match the native run
exactly. The original raw numerical gates still fail (maximum probability
difference 0.0001524 and one changed half-threshold pixel against PyTorch).
This remains an offline experiment; no model is included in the website.

The [latest palette-to-template comparison](u2netp-material-palette-pipeline-results.json)
holds all 25 crops fixed and retains seven unresolved inputs. Both colour methods
use original photograph pixels, then the unchanged fitter with a ten-second search
allowance. All 50 exported candidates pass editable conversion and geometry;
48 pass nominal paper checks and two remain uncertain. The learned palette loses
the shaded checker and printed-tree designs relative to RGB clustering and adds
no checked pair. All eight comparison pages were reviewed. Neither method fixes
bad crops, and both still mistake some printed ink for paper boundaries.

The nativity case exposes a separate deterministic search problem: **59 of
160,000 mask pixels change**, yet the three-slot shortlist drops the six-cut
grid for a four-cut grid. Replaying fixed initialization and gradient steps in
ABBA order exactly reproduces the divergence. The omitted six-cut grid still
preserves the source regions' colours on both targets; the remaining grids do
not. This isolates a scheduling weakness before timed curve refinement, without
claiming the omitted grid is a valid template or the original cutting design.
No production code or acceptance limit changes in this experiment. The diagnostic
now accepts `--reference-method` and `--candidate-method` for paired runs.

The [discarded-grid follow-up](displaced-finalist-results.json) exactly replays
968 coarse scores and 150 initial fine-grid scores across all 50 targets, including
the ten partially observed crops. A bounded extra-grid rule triggers on 14 targets.
Fresh baseline/proposal fits improve the nativity from **6.89% to 2.85%** mask
disagreement and restore recognizable figures, but two small openings still join
the exterior. Seven targets get lower error, two get higher error, five are
unchanged, and **neither arm produces a fully checked pair on these 14 targets**.
All 28 exports pass conversion and geometry; three paper-support results remain
uncertain. Every comparison was inspected. This stays an isolated experiment,
with no production scheduling change or added disagreement allowance.

The [reviewed label expansion](diverse-paper-label-expansion.json) adds eight
photographs to the earlier 16, giving **24 instances and nine approximate
overlap references**. It includes pale printed paper, low-contrast red/pink paper,
dense checks and decorative motifs. All six sources in this batch already occur
in the earlier subset: it adds photographs within the same 14 source groups,
not independent sources. These remain separate from the five source groups in
the 32-photo development evaluation. Every new body/material overlay was inspected
at 256 and 768 pixels; uncertain boundaries and unlabelled material stay unknown.
These are assistant annotations without independent human review, exact artwork
or cutting-path labels. Both the original and expanded pools have now trained
fresh U2NETP body models under the same predeclared 120-update budget.

The [fixed-model probe on those eight photos](diverse-paper-probe-results.json)
separates two problems. The body model often includes handles, a detached paper
strip, pinecones or chocolates. The material head rounds checker cells and loses
small openings, even where its sparse labelled patches score perfectly. Existing
colour calibration restores much of that detail, but increases observed paper
error from **9.45% to about 24%** on the floral/striped photo by treating printed
ink as material changes. All four comparison pages were inspected, and saved
probability fields reproduce every reported metric exactly. These photos share
sources with training; they are development diagnostics, not generalization
results or template successes.

The [completed paired body experiment](u2netp-body-expanded-results.json) uses
the same pretrained initialization, synthetic inputs/draws and reflections;
every real photo is visited. Both checkpoint audits reproduce initial and final
predictions exactly and verify unchanged frozen encoder weights and BatchNorm
statistics. On the original 16 labelled training photos, body pixel error worsens
from **2.57% to 2.83%**; on the additional eight it improves from **4.36% to
3.63%**. These training diagnostics do not establish generalization. With a fixed
budget, 33 candidate draws visit new photos and only 87 visit the original pool,
so this does not show that more labels are intrinsically harmful.

Full reconstruction on all 32 development photos gives **12 checked pairs for
the control versus 10 for the expanded candidate**, with nine unchanged
production-only pairs. The candidate loses blue/gold checkerboard and star crops.
It adds a green/black motif crop, but its fit fails the image-quality gate. All
six training pages, eleven evaluation-body pages and both fit pages were reviewed.
Handles, printed-paper confusion, glare and false seams remain. A decorated
blue/gold training photo already loses 37% of labelled paper in the control and
49% in the candidate; unseen sources alone cannot explain that failure.

The comparison also exposed a concrete preprocessing bug: the supposedly
continuous palette still ran only after an older `p > .95` colour-sampling gate
succeeded. The offline adapter can now construct weighted fields directly.
All **63 previously admitted field sets remain exactly equal**; the remaining
checkerboard field set is recovered. However, its crop then fails the physical
outline check. Fresh full replays retain **12/32 versus 10/32**, with all seven
selected crop coordinates and input masks unchanged. All fourteen pre/post-fix
exports pass editable conversion, geometry and nominal paper checks, and the
same four pass image/feature checks in each replay. Both new fit pages were
inspected; numerical acceptance still allows visible seams in the stacked hearts.

Untimed intervention tests isolate the two lost crops further. Both candidate
crops still fail after all 19 alternate orientations. Replacing only the binary
paper mask and its distance field with the control's fields restores outline
support on both; replacing colour fields does not. These mixed fields are
diagnostic probes, not deployable predictions or newly validated templates.
This motivated a follow-up separating reduced training exposure from
representation/loss limitations. No network, support threshold or solver change
was deployed from that study; the ten focused palette/crop regression tests pass.

The [completed added-exposure comparison](u2netp-body-exposure-results.json)
preserves every original 120-update control draw, then inserts 60 updates.
The 16-photo control spends the added real visits on old photos; the 24-photo
candidate spends them on the new eight. Both use identical synthetic inputs and
reflections, and both train for 180 updates from the same pretrained weights.
The candidate recovers the two lost metallic-paper crops, so both arms reach
**12/32 exported-image passes**, matching the earlier control. Its training
error improves on both the original and added photos, but it adds no previously
unrecovered design. All ten new exports pass conversion, geometry and nominal
paper checks. Six paired training pages, eleven evaluation-body pages and four
fit pages were inspected. Eleven scheduling/provenance/audit tests pass.

The final editable counts are **11/32 for the control and 12/32 for the
candidate**, but this is not strong evidence for ranking the candidate higher.
One control fit moves from **2.95875%** exported-SVG disagreement to **3.0075%**
in the editor's mask renderer—only twelve pixels beyond the 3% cutoff. The
unsimplified and simplified editable masks are identical at 400 and 800 pixels.
An isolated diagnostic keeps the curves fixed and tightens only the editor's
quarter-pixel flattening: disagreement falls to about **2.97%**, consistent with
supersampled SVG centre tests. This is a renderer-precision threshold artifact,
not a demonstrated simplification defect. Original scores and failures remain
recorded; no production rasterizer or acceptance limit was changed. The next
comparison needs consistent rendering precision before selecting models on
borderline scores. These models have not undergone browser/runtime release QA.

A [31-output precision replay](u2netp-body-renderer-cohort-results.json) now
covers all 21 production exports and ten fresh neural exports from that study.
Every saved editable mask is reproduced exactly before changing precision;
editor intersections and paper/geometry checks are rerun. The stacked-heart
control is the only classification change across four fixed tolerances.
At the two finest tolerances, masks differ by at most four pixels and no
classification changes. Both models therefore recover the same twelve designs
in this diagnostic; the original benchmark counts remain recorded separately.

The [completed late-encoder experiment](u2netp-body-encoder-results.json) tests
whether fixed pretrained features limit whole-paper recognition. It trains
encoder stages 4–6 at one quarter the decoder learning rate, retaining the same
24 photos, all 180 draws, synthetic examples, loss and publisher initialization.
Early encoder weights and every normalization statistic stay frozen. The
checkpoint audit and 14 focused tests pass. Training-pixel error drops from
**2.91% to 1.78%**, but the complete reconstruction pipeline still recovers the
same **12/32 checked editable pairs**. No outline-support eligibility changes.
All five fresh exports pass editable geometry and nominal paper checks; their
mask/feature checks retain the same three passes and two failures. All six
training, eleven evaluation-body and two new fit contact sheets were reviewed.

Across the full cohort, six photos still have no accepted crop, twelve fitted
outputs exceed 3% target disagreement, one loses a motif feature despite low
aggregate error, and one fails nominal paper-core checks despite low error.
These are stage outcomes, not proofs that the artwork is impossible. Printed
paper and glare also corrupt some classified targets, while dark/metallic body
omissions persist. Better training segmentation alone has not fixed those
problems. This candidate is retained as an experiment, without browser export
or production promotion.

The [known-outline-loss follow-up](u2netp-body-outline-results.json) keeps that
training setup fixed and adds balanced supervision near known paper/background
boundaries, excluding uncertain pixels. The independent audit regenerates all
88 real/synthetic outline fields. Training-band error falls from **5.34% to
4.80%**, but whole-mask error rises from **1.78% to 2.14%**. Full reconstruction
still yields the same **12/32 checked editable pairs**, and accepted crops fall
from 26 to 25. All four new exports pass conversion, geometry and nominal paper
checks; the printed-tree fit still fails image fidelity. All training,
evaluation and new-fit galleries were inspected. This candidate is not promoted.

A [replayable sampling diagnostic](../../../scripts/inverse/learning/body-outline-crop-diagnostic.mjs)
isolates the lost green/black crop: a larger false hole in the NN's body mask
causes 84 of 178 scanlines to stop inside the paper, more than ten working pixels
from their previous endpoint. Right-edge support drops from **87.08% to 52.81%**,
below the unchanged 65% requirement, although the proposed corners move by at
most 19.62 pixels in the 2048-pixel photograph. Swapping only the two models'
binary masks reproduces the opposite edge evidence exactly in both directions.
The next crop experiment should distinguish enclosed gaps from the outer
silhouette while retaining photograph evidence and lobe checks. No acceptance
threshold was relaxed. Better segmentation scores alone have not established
better usable templates; broader evaluation is also needed beyond this
repeatedly inspected development cohort.

The [outer-boundary sampling replay](u2netp-outer-boundary-results.json) now tests
that fix on both saved models. It ignores enclosed background holes only while
sampling the lower edges; original probabilities, distance fields, foreground
selection, colour evidence and cutting targets remain unchanged. Open and
diagonal gaps remain open. Nineteen focused tests pass, and the default mode
reproduces all 22 saved neural detections exactly. The new mode restores the
lost green/black crop with both lower-edge support scores at 100%, without
lowering the 65% threshold. Both models now return 26 crops and retain the same
**12/32 checked editable pairs**. All ten fresh exports pass conversion and
nominal geometry/paper checks; the restored motif still exceeds the image-error
limit. Four fit contact sheets were inspected. This fixes a crop sensitivity,
but is still an offline option rather than a deployed NN or a new template
success. Small differences between fresh fits of identical targets are recorded
separately from crop changes.

The [fixed expanded evaluation selection](u2netp-expanded-qa-selection.json)
includes all 18 reserved single-object photos with a shortest side of at least
160 pixels outside the source/duplicate groups of the 24 training and 32 current
development photos. They span 17 split groups. Fifteen already appear in prior
probe manifests, and all were classified during dataset review, so this is an
expanded development evaluation, not an untouched holdout. Original bytes and
decoded RGB are pinned; no photographs were copied or train/test groups changed.
Inference and full reconstruction on this extension remain to be run before
claiming a broader improvement from the browser-tested NN candidate.

The [complete balanced-epoch follow-up](u2netp-material-complete-epochs-results.json)
adds 384 updates to the fixed relative-colour head, visiting every synthetic
view four times. Known-region real training error falls from **5.06% to 2.78%**.
However, boundary-band error increases on all three synthetic groups: clean
views **8.25% → 11.15%**, printed views **22.42% → 23.68%**, and scenes
**21.93% → 22.63%**. Printed/scene interiors improve; clean-view interiors do not.
All training, worst-synthetic and 32-photo evaluation galleries were inspected.
Print confusion, lost checker squares and rounded/disconnected joins remain.
This head is rejected for integration; these are development diagnostics, not
held-out reconstruction scores.

The [paired boundary-weighted continuation](u2netp-material-boundary-results.json)
keeps those inputs, initial weights and all 384 draws fixed, giving known paper
boundaries four times the loss weight. Boundary error improves to **9.38%** on
clean views, **21.54%** on printed views and **19.55%** in scenes. Scene interiors
and real partial training error regress; the shorter 120-update parent still
has lower clean-view boundary error. All 32 real evaluation photos were reviewed:
print confusion, lost shaded checker squares and near-erasure of the stacked-heart
motif remain. These full-photo material failures precede cropping and fitting.
No new template fits, browser export or production changes were justified.
Fifteen focused tests pass, and historical checkpoint reloads reproduce both
older models' stored predictions exactly.

The [output-grid capacity diagnostic](u2netp-material-grid-results.json) fits
free 160-by-160 logits directly to all 32 synthetic training masks, then uses
the identity head's exact float32 bilinear upsampling convention. Its **1.067%
expected classification error** is close to the **1.059%** optimum of an
unconstrained hard pixel map against the fractional targets. The mean excess is
just **0.00759 percentage points**, with zero interior errors. The learned
boundary-weighted head instead has 2.12% error on the clean views, 9.25% on their
printed counterparts and 6.99% in scenes, despite identical target labels.

All 32 saved grids decode exactly to the recorded fields; four focused tests
pass, and both largest-error galleries were inspected. This shows that output
resolution alone cannot explain those training failures. It is a target-informed
reference, not a working image predictor, certified optimum or evidence for
every fine real motif. The following experiment tests paired print invariance
while preserving clean-paper boundaries. No model or app behavior changes in
this diagnostic.

The [paired consistency experiment](u2netp-paired-results.json) starts both arms
from the same 120-update identity head. Each receives the same 256 batches:
one real photo and two synthetic views of identical geometry, with identical
reflections, supervised loss and optimizer. The candidate additionally penalizes
material predictions that change when printing or the surrounding scene changes.
Each image may swap its two paper labels once; individual pixels cannot swap
independently. All 32 geometries, 96 synthetic views and 16 real training photos
receive the predeclared number of visits.

| Material error on synthetic training views | Supervised control | Paired consistency |
| --- | ---: | ---: |
| Original | 2.16% | 2.06% |
| Printed paper | 10.84% | 9.64% |
| Changed scene | 5.93% | 5.85% |

Printed/original prediction disagreement also falls from **10.16% to 9.01%**.
Boundary error improves in all three groups, but clean and scene interior error
slightly increases. Sparse known-region real training error increases from
**3.53% to 3.65%**. All 16 training and 32 previously inspected, source-separated
development photos were visually reviewed. Printed ink still becomes false paper
boundaries; shaded motifs and small openings disappear. Missing dark/reflective
paper and included hands/handles remain separate problems in the frozen body
model. These full-photo failures precede crop selection and curve fitting.
Neither head is approved for deployment.

Fourteen focused tests pass, and 485 source/artifact hash checks pass. A failed
bitwise check is retained: saved training body and initial identity probabilities
differ by at most **0.0000001192**, with no changed half-threshold pixels. Fresh
inference in one process gives exactly equal checkpoint bodies; all 32 native
development body fields also match the previous reference exactly. This supports
small cross-process floating-point variation, without establishing its kernel
cause or a deterministic causal effect from one training pair. The comparison
gallery now records raw equality failures and uses each model's actual body.

The experiment uses one low-priority CPU worker, adds about **92.1 MiB** of
local artifacts and downloads no photos. Each learned head is 77 KB. No
browser model export or new template fit was justified. The following diagnostic
tests conditioning on examples of each paper in its exposed lobe.

The [lobe-example experiment](paper-exemplar-results.json) fits a small linear
classifier separately on each image. Its labels come only from inset parts of
the two exposed lobes; it never fits labels inside the woven square. Both arms
use the same samples and ridge penalty. One uses RGB and local colour statistics;
the other adds frozen U2NETP features. All 96 synthetic views and 32 real photos
remain in the experiment, including six real inputs without a usable crop.

The neural-feature arm fits **every selected lobe training sample perfectly**, yet transfers
poorly into the overlap: synthetic error reaches **20.07% on plain paper** and
**23.71% in changed scenes**. RGB texture suppresses some printed ink, but
shrinks ordinary checks into isolated islands. This neural-feature classifier
is rejected; these results do not establish the cause of failures in previously
trained, different heads.

A subsequent controlled ablation isolates the RGB-texture failure. The fitting
samples remain identical; only local-deviation features outside those samples
are replaced by their support mean. This removes that feature block's centred
contribution without changing the trained classifier. All **122 original score
fields replay exactly** before comparison.

| Overlap-only synthetic error | Prior NN head | RGB texture | RGB only | Neutralized query deviation |
| --- | ---: | ---: | ---: | ---: |
| Plain paper | 3.55% | 12.46% | 2.69% | 3.00% |
| Printed paper | 13.08% | 9.13% | 6.33% | 4.33% |
| Changed scene | 7.88% | 12.54% | 2.70% | 3.04% |

About **65.4%** of plain overlap pixels have a local-deviation channel above
the maximum seen in the lobe samples. Neighborhoods crossing between papers
have variation absent from the smooth lobe interiors. The intervention reduces
plain-paper boundary error from **32.53% to 7.77%**, establishing that this
feature block causes much of this classifier's shrinkage.

All 27 comparison pages were inspected. Simpler colour features restore small
checks, nativity details, dragonfly wings and fox legs. Printed decorations are
suppressed on some papers, but similar-coloured prints remain ambiguous; the
wrongly cropped basket and reflective building still fail. The ablation's
real panels show the entire fixed overlap without body gating, so formerly
missing body regions appearing there are **not** a body-model improvement.

These scores use known synthetic corners and measure only the overlap; they
are not comparable to the earlier full-body percentages. The prior NN head is
also an experimental baseline, not the deployed RGB classifier. Five focused
tests pass, and 384 saved-field errors were independently recomputed. No neural
weights changed, no source images were copied, and the two experiments added
about **43.5 MiB** of local artifacts.

The subsequent [complete pipeline comparison](paper-exemplar-pipeline-results.json)
uses the **actual deployed RGB classifier**, the same 26 automatic quads and all
six unresolved crops. All 26 production masks reproduce their earlier hashes
exactly. The two lobe classifiers reuse their saved scores without refitting.
Each of the 78 available masks receives fresh fitting with a ten-second search
allowance on the binary-mask objective used by Mal. Methods rotate by photo;
source coverage, resolution and acceptance limits remain fixed.

| Method | Engine plus independent mask checks | Also passes editable SVG checks |
| --- | ---: | ---: |
| Production colour classification | 13/32 | 13/32 |
| Lobe RGB only | 14/32 | 14/32 |
| Lobe classifier with neutralized query deviation | 19/32 | 18/32 |

These are **checks against each method's own derived mask**, not counts of
recovered original designs. Every one of the 13 production passes remains a pass
under neutralized deviation. Four additional candidates preserve recognizable
mother/child, fox, petal-flower and tentacled motifs. A fifth additional pass is
the wrongly cropped basket, which remains a failure of the complete photo task.
The reflective-building crop produces an almost empty mask and zero cuts:
the engine's self-mask checks pass, but the editor correctly rejects it.
The neutral-deviation nativity also fails editable geometry; it already failed
the engine checks. All 78 export errors were independently recomputed, all
11 comparison pages reviewed, and these failures retained.

The visual review prevents a blanket replacement. Plain-paper checks become
rounded, the moon gains an extra cut, and small details change. Printed stripes
and floral ink are suppressed in some photos, but the printed central flower
is still mistaken for a cutting motif by **all three methods**, despite passing
their fit checks. Production already handles the red-tree/blue-snowflake paper.

The nativity illustrates a separate search problem: changing just **0.967%** of
the production mask pixels raises fitting error from **1.96% to 12.47%**, with
five cuts per sheet in both outputs. The production result itself still misses
a feature. The logs show different phase finalists, refinement reservations and
feature-recovery decisions; they do not yet prove which branch causes the
regression. Crop quality and cut count alone cannot explain it.

No application code or neural weights changed. Choosing a classifier solely by
its own reconstruction error would reward the near-empty-mask failure above.

Verification passes: type checking, lint, build, **2,374 application tests**
(142 skipped), **1,183 inverse correctness tests**, and all five classifier
tests. The timing-inclusive local command was stopped after 224 seconds; the
complete CI correctness suite was then run separately, without changing any
expectation. The final audit checks another 234 source/input hashes and retains
checksums for 152 editable SVG/preview artifacts. The experiment adds about
**74 MiB excluding logs**, including its detailed JSON records, with no new
photos or model weights. Application and solver files match the successful main
CI build exactly.

The [resolution diagnostic](paper-exemplar-native-results.json) now isolates
sampling losses while keeping the lobe samples, normalization, ridge penalty
and fitted coefficients fixed. All **122 RGB-texture and 122 RGB-only fields**
and their fit metadata replay exactly after separating fitting from scoring.
Synthetic comparisons use the same 320-pixel evaluation frame, removing the
intermediate 160-pixel scoring grid. Real-photo scoring instead uses the exact
stored production crop RGB at each case's original target resolution.

| Overlap-only synthetic error | Reduced scoring grid | Direct RGB scoring |
| --- | ---: | ---: |
| Plain paper | 2.69% | 2.47% |
| Printed paper | 6.33% | 7.13% |
| Changed scene | 2.70% | 2.45% |

Plain-paper boundary error falls from **7.10% to 6.61%**, but printed-paper
interior error rises from **3.42% to 4.51%**. Visual review confirms both effects:
check corners and thin details become sharper, while stripes, dots and fine
speckle return as false cuts. These are the same 96 synthetic training views
with privileged corners, not an unseen evaluation set.

All 26 native masks received fresh fitting with the unchanged production
fitter and ten-second search allowance. All **26 editable conversions pass**;
only **10/32** cases pass the complete self-mask checks, compared with **14/32**
for the frozen lower-resolution RGB baseline. The four lost passes are retained:

- Mother/child loses an interior detail during fitting, although it remains
  visible in the mask.
- Repeated hearts exceed the 3% mask-error limit, at 3.17%.
- Dinosaur and star preserve recognizable motifs at 1.29% and 0.84% error,
  respectively, but fail feature checks on isolated classified fragments near
  the crop edge. Their feature gates remain enforced.

The crops, coverage and resolutions are identical throughout. The wrong
basket/building crops and six missing proposals remain failures; the printed
central flower still illustrates a false success against a method's own mask.
Higher scoring resolution alone is therefore rejected as a production change.

All 29 new review pages were inspected. The comparison checks 1,443 hashes and
recomputes all 104 independent exported-image errors; a further audit recomputes
the 26 native editable errors and records all 52 SVG/preview hashes. Seven
classifier tests, seven material-target tests, type checking, lint and build
pass. The earlier full application and inverse correctness run remains the
reference for unchanged production code. This experiment adds about **28.4 MiB
of unique artifacts excluding external logs**, with no photo downloads or copies.

The next material-model experiment should combine learned context for paper
identity with a high-resolution RGB path for boundaries, trained explicitly to
transfer from exposed lobes into the overlap. Search stability under small mask
changes remains a separate problem. No new neural weights were trained in this
diagnostic, and none of these classifier alternatives has been deployed.

The subsequent [learned feature-transfer experiment](exemplar-projection-results.json)
trains **1,536 weights** through the per-photo classifier itself. A linear
projection reduces the frozen U2NETP decoder's 192 channels to eight context
channels. Those channels and RGB enter a lobe-fitted ridge classifier; gradients
pass through its support-only normalization and solve. The query retains direct
RGB at the evaluation/crop resolution. Overlap labels supervise the outer loss
only and never enter the per-photo fit.

The fixed schedule uses two passes over the same 96 synthetic training views.
All backbone weights and buffers remain unchanged. The new checkpoint is
**7,870 bytes**, in addition to the existing backbone. Neither the 32 development
photos nor the newly archived Pinterest board supervise this projection.

| Overlap-only synthetic error | Direct RGB | Untrained projection | Trained projection |
| --- | ---: | ---: | ---: |
| Plain paper | 2.47% | 2.86% | 2.20% |
| Printed paper | 7.13% | 8.95% | 4.33% |
| Changed scene | 2.45% | 3.06% | 2.19% |

This establishes improvement on the synthetic training views, **not unseen
generalization**. Printed-paper interior error falls from 4.51% with direct RGB
to 1.07%, but the real-photo previews still confuse printing with cuts. They also
add false seams and islands to plain-paper designs, most visibly the cat.

Fresh fitting on all 26 available masks gives **10/32 complete self-mask passes**,
the same count as native RGB and below the production classifier's 13/32.
Mother/child, repeated hearts and dinosaur gain passes relative to native RGB;
cat, heart-checkerboard and hummingbird lose passes. These changes include
different routing/cut-count choices and do not isolate a particular search
branch. All 26 editable conversions pass; image and feature gates continue to
reject the other candidates. Wrong crops, six unresolved proposals, and the
printed central flower's misleading self-mask success remain in the records.
The material head is **not ready for deployment**.

The pipeline initially rejected a missing crop-manifest checksum before fitting.
The corrected packaging hardlinks the exact same masks and manifest into a
separate input directory; the original training report and outputs remain
immutable. The writer is fixed for future runs. All **208 tests across 43 offline
learning modules pass**, including finite-difference verification through the
ridge solve. Independent audits recompute 288 synthetic errors, 104 exported
fit errors and 26 editable errors; all 29 review pages were inspected.
The experiment retains about **33.5 MiB excluding external logs/audit JSON**,
without new photo downloads, copies or a disk feature cache.

The [controlled continuation](exemplar-continuation-results.json) starts both arms
from those same weights. Each takes 96 further updates with the same shuffled
synthetic images and fresh AdamW state. One arm uses synthetic loss alone; the
other averages synthetic loss with one reviewed real-photo example per update.
The six real photos each appear 16 times. This matches optimizer steps and
synthetic draws, **not example counts or computation**.

These six already belonged to the parent's 16-photo training set. They have
both material annotations and approximate overlap corners; the other ten lack
reviewed corners and do not supervise this continuation. None of the development
photos or newly archived Pinterest images enters training. The approximate
corners are conditioning references, not exact cutting geometry.

Known overlap labels cover only **4.0–54.5%** of each real training photo.
Uncertain bands separate all differently labelled regions, leaving **no known
real material boundaries** for the boundary-weighted loss. This is an important
limitation: improving these labels' accuracy primarily measures paper interiors.

| Training diagnostic | Parent | Synthetic continuation | Mixed real supervision |
| --- | ---: | ---: | ---: |
| Synthetic plain paper | 2.20% | 2.13% | 2.17% |
| Synthetic printed paper | 4.33% | 3.78% | 4.04% |
| Synthetic changed scene | 2.19% | 2.09% | 2.13% |
| Six real photos, known overlap pixels only | 4.50% | 4.55% | 0.65% |

The real improvement is concentrated in the two printed-paper training
examples. It does not establish full-design or unseen-photo accuracy. All 96
synthetic and 26 available real parent masks replay exactly after extracting
shared input/evaluation helpers. The frozen backbone remains unchanged, and all
32 development photos, including six unresolved crops, remain in the comparison.

Visual inspection finds cleaner star edges and greater suppression of purple
floral printing with mixed supervision. False islands remain on the cat;
the tilted candle gains border noise, and red stripes/dots, trees and lettering
still become false cuts. The printed central flower still appears as a cut
motif. Wrong basket/building crops remain wrong. The real training annotations
help transfer some material appearance, but this experiment has not resolved the
classification failures that precede curve fitting.

Fresh fitting and independent editable-export checks give:

| Method | Engine + mask checks | Editable conversion | Complete checks |
| --- | ---: | ---: | ---: |
| Frozen production reference | 13/32 | 26/26 | 13/32 |
| Parent projection | 10/32 | 26/26 | 10/32 |
| Synthetic continuation | 11/32 | 26/26 | 11/32 |
| Mixed real supervision | 11/32 | 25/26 | 10/32 |

These remain **self-mask and geometry checks, not recovered-design counts**.
The mixed model gains the crescent relative to its matched control, loses the
dinosaur, and loses the simple heart/checker motif at editable conversion.
That last candidate has good image fidelity and no reported intersections,
but its independent paper-support check is **uncertain**, so it is not counted
as a complete pass. The uncertainty does not prove a physical defect.
Neither continuation is promoted.

The dinosaur is a useful end-to-end regression fixture. Only **334 of 160,000
mask pixels (0.20875%)** change from the parent, yet fit error rises from
**1.58% to 4.32%**. The photo crop itself shows a thin red margin at the far
right of a white border cell. The new missing component has area 8.875 mm²
and centre x=99.086 mm on a nominal 100 mm square. Logs change from
`traceUsed=true, featureRoutingFirst=false` to the opposite routing choice.
This points to an interaction between crop margins, classification and
feature-driven search. The continuation established an association; the
controlled intervention below separates the repair gate from search timing.

All 32 photos and all failures are retained. The review recomputes 130 distinct
engine-render errors (78 frozen controls and 52 new fits) and all 52 editable
render errors. All **210 tests in 44 offline learning modules pass**; all 44
new preparation/training/development/pipeline gallery pages were inspected.
Repeated crops and parent masks share immutable files through hardlinks.
The study adds about **42.6 MiB** of artifact content, with no new photographs,
feature cache or browser work.

The border-fragment intervention below now isolates the routing regression.
The editable paper-support discrepancy remains unresolved. The 32
synthetic geometries here are all lattice families (11 lattice, seven shared
lattice, 14 corner lattice); sparse real interiors add little supervision of
the detailed cut boundaries that still cause trouble. The current experiment
does not establish which representation or richer labels will resolve that gap.

### Border fragments and provisional geometry repair

The [controlled repair study](border-fragment-repair-results.json) retains
24 repeated fits, fixed-work initialization, the full 32-photo cohort and
eight additional timing comparisons. Removing just 142 pixels (0.08875% of
the mask) recovered the dinosaur. The fragment does change routing priority,
but a scheduling-only patch did **not** improve either repeat and was reverted.
The successful variants instead repair a nearly valid MILP proposal. On the
original mixed mask, the old repair gate rejects that proposal before moving
any curves because the narrow border fragment is missing.

Commit `5d86da68` allows that repair to supply a **provisional** starting pair
when every interior feature is retained. It must pass the unchanged image,
geometry and paper checks, and cannot erode existing features. A border-feature
loss remains a failed final check. The original mask is never edited.
The full-cohort dinosaur improves from **4.32% to 1.52%** disagreement and
converts successfully; it still has a missing-feature warning.

All **11/32** prior engine passes and **10/32** complete passes remain.
Conversion passes fall from **25/26 to 24/26**: the already-failing diving
figure also fails conversion in this run. Both previous and current code
produce variable, unsuccessful fits in the paired timing study; neither case
uses the new provisional repair path. All repeats and failures are retained,
including the original heart-checker paper-support uncertainty. This does not
establish equal quality distributions or eliminate the timing instability.

The review independently recomputes 52 cohort engine renders and 51 available
editable renders; all seven comparison pages were inspected. Its “editable
pass” labels mean successful conversion, not complete reconstruction. Eleven
focused tests pass, including the existing rabbit-border regression and checks
that interior-feature loss and failed paper support remain ineligible.
Full CI is running on the pushed runtime commit. No neural weights or crop
rules change in this fix; the material projection remains experimental.
Study artifacts occupy about **36.9 MiB**, with no new source photographs.

### Latest solver and browser validation

The drawing improvements (red/white/XOR, full-circle weave icon, brush slider and
hover outline) and archive are **deployed**. The [latest release record](conni-release-qa.json)
contains live Danish/English and mobile QA, 2,371 application tests and 1,207
inverse checks. Nineteen of 77 advisory timed quality targets still miss;
these are retained separately from correctness. Main commit `d0b882b5` passed
[CI and deployment](https://github.com/thomasahle/julehjerte/actions/runs/39324904486),
rechecked on 20 October. No neural network is deployed in that release.

The [upload integration audit](u2netp-upload-integration-results.json) records
the NN crop integration, **deployed and live-verified on 20 October** at
`127dc3c1`. Its [release workflow](https://github.com/thomasahle/julehjerte/actions/runs/39363520948)
passed, including 2,374 application tests and 1,175 inverse correctness tests.
Timed quality remains separate: 68/77 original targets passed, with nine misses
retained. The live browser passes all five upload/solve/failure/cancellation/
crowded-frame checks, and the served model, runtime and worker hashes match.
It packages the same
4.62 MB adapted U2NETP model and a pinned local ONNX Runtime Web, runs on one
WASM thread, and shares the tested whole-body crop policy with the offline
experiments through an explicit locator API. No photo upload is involved.
Manual regions stay authoritative; model failures retain the existing editable
crop. Suggested neural corners still require user review.

All 50 saved browser-field cases reproduce their selected corners exactly after
migration. Actual built-site tests pass for upload, mask preview, angel template
generation, unavailable model, cancellation/reopen, and a crowded frame. The
angel's UI fit passes geometry and nominal paper checks at 0.649375% mask
disagreement. This measures the classified crop, not original cutting paths;
small photographic edge irregularities remain visible. The historical strict
WASM-versus-Torch probability tolerance remains failed and has not been relaxed.
Output-level parity is checked separately; the development cohorts and desktop
browser checks do not establish mobile performance or unseen-photo accuracy.

The subsequent [outline-only diagnostic](u2netp-outline-only-diagnostic-results.json)
keeps all 18 additional photos and their saved browser NN predictions. Nine
rejected learned proposals fail lobe-outline support; five also fail the
uniform-lobe colour check. Removing only that acceptance check would therefore
not solve them. A research model that fits the body without colour objectives
produces 12 proposals passing the stated outline, body and coverage checks,
including five additional or replaced weak proposals. **No new templates were
fitted during that diagnostic; it is not deployed.**

All four diagnostic galleries were inspected. The reflective bird has two
green-looking lobes despite multicoloured print inside the square; its full
outline is recoverable, but a correct material mask is still unproven. The
tabletop checker proposal slightly overshoots its lower paper corner. The
newspaper and printed-bird crops also need material interpretation. Conversely,
the cat still has missing neural foreground, the child-held heart includes a
hand, and unusual swan-shaped caps still fail outline support. The next step
was full reconstruction of the five new proposals while preserving strong
existing crops.

The [completed reconstruction experiment](u2netp-outline-reconstruction-results.json)
freezes those five crops before fitting, retains the other 13 cases through
the pinned baseline, and uses the unchanged RGB classifier and 10-second
automatic solver. Three new results pass exported-mask and editable-template
checks: the cross (1.02% exported disagreement), printed birds/X (0.92%) and
tabletop checker (1.43%). All five exports pass geometry and nominal paper
checks. Across the complete 18-photo cohort, checked derived masks increase
from four to six; those also supported by whole-body evidence increase from
three to six. The old reflective-bird fragment is replaced by a full-overlap
attempt that correctly remains review-required.

Both reconstruction galleries were inspected. These numbers still overstate
recovery of the intended artwork: the printed birds extend beyond the overlap,
and the checker includes a handle/notch intrusion and noisy outer border.
The newspaper classifier follows printed letters, resulting in 12.90% error
and 42 missing features. The reflective bird misses four features despite
1.85% mean error. These fixed proposals were fitted without an inset. A separate
margin study and the original 32-photo regression followed before any promotion.
No model was retrained or application behavior changed in this experiment.

The [32-photo regression](u2netp-outline-regression-results.json) replays all
current crop decisions exactly and inspects all seven comparison galleries.
Preserving strong current crops and retaining the existing 0.05 whole-body
Dice improvement requirement leaves **all 32 original selections unchanged**.
The same rule selects exactly the five tested alternatives in the expanded
18-photo set. That offline selection simulation is now reproduced by the
application migration below.

The [paired inset comparison](u2netp-outline-inset-results.json) tests all five
new proposals against the same original photographic coordinates. One-percent
cropping worsens common-interior disagreement in three cases and improves two,
while the number of checked derived masks stays at three. The checker loses
some background rim, but retains the handle/notch intrusion; the newspaper
remains a material-classification failure. All five before/after panels were
inspected. **No default inset is enabled.** This agrees with the
[earlier 26-case study](automatic-crop-inset-2026-10-19.json), where 24 cases
worsened. Future border refinement must follow evidence for individual edges.

The [production migration audit](u2netp-outline-upload-results.json) now verifies
an explicit body-outline fallback after both existing crop attempts. Measured
colour evidence and body-only evidence are separate; absent colour measurements
cannot pass the colour-support check. The same model and classifier are retained.
All **50 declared crop selections** match (45 preserved, five newly supported),
and all **38 available classified masks** match exactly. All 11 actual browser
checks pass, including five new uploads, angel and cross reconstruction,
unavailable-model recovery, cancellation/reopen and crowded-frame handling.
The cross's editable result has **1.280625% disagreement against the UI's
400-pixel mask**, with geometry, paper and feature checks passing.

Type checks, lint, build, 2,374 application tests and all 1,183 CI inverse
correctness tests pass. The original timed quality targets remain advisory:
**61/77 pass, with 16 misses retained**. This crop change does not modify the
solver or its benchmark targets; the timed results are not evidence of a solver
quality improvement. All eight browser screenshots were inspected. Printed
decoration, glare and handle/border intrusions remain unresolved. These are the
same development photos, not an unseen test set.

Release PR #17 is **merged and deployed** at `77a9bda7`. Main CI passes all
1,183 correctness tests and 2,374 application tests; its fresh timed run retains
**60/77 passes and 17 original-target misses**. All 11 live browser checks pass,
and all eight checked assets match the tested implementation. The live cross
exports byte-identical geometry, so the independent export and editable-template
audits above still apply. Six changed live screenshots were inspected; the other
two are byte-identical to the reviewed local screenshots. The owned browser
closed after QA.

#### Latest neural experiments

The [whole-paper adaptation](u2netp-body-adaptation-results.json) trains the
U2NETP decoder for 120 updates on 16 reviewed photos from 14 separate source
groups, mixed with 64 existing synthetic views. The encoder and normalization
statistics stay fixed. Training takes about six minutes on one low-priority CPU
thread; model size and architecture remain unchanged. Known-pixel training error
falls from 4.09% to 2.77%, with regressions on some tips. This is training evidence,
not a generalization score.

On the same, now-inspected 32-photo evaluation cohort, the native adapted model
produces **13 checked pairs**, versus production's 10 and the frozen-model
experiment's 12. The additional dark/gold checker-and-silhouette heart survives
editable export at 0.695% derived-mask error. All four new exports pass geometry
and paper checks; three pass all reconstruction checks. Visual review confirms
recognizable motifs but retains the false seams in the checker hearts. The house
and candlestick still lose large paper regions, and printed decoration still
confuses material classification. These historical native counts use inverse
code from `3762b82c`.

The [adapted browser follow-up](u2netp-body-adapted-browser-results.json) uses
actual WASM fields and fresh controls after merging main at `8f22315d`. It adds
the same three recognizable checked pairs: **12/32 versus 9/32**, with 25 crop
proposals versus 21. All 25 distinct exports pass conversion and geometry;
24 pass nominal paper checks and 12 pass all reconstruction checks. All nine
comparison pages were inspected. The lower control count comes from a timed
solve of the same nested-heart mask: the earlier two-cut candidate was not
reached, and disagreement rises from 1.15% to 3.90%. That loss affects both
methods equally; its timing and implementation causes still need isolation.

The adapted ONNX model is 4.62 MB and warm one-thread browser inference has a
1.18-second median on this desktop. All 32 input tensors match exactly. Raw
probability parity still fails (maximum difference 0.000143; four threshold
pixels change across three photos). A deterministic crop replay retains every crop-presence and support decision,
but two printed-paper images shift corners by up to 1.94 pixels and change
their classified masks. Other crop outputs, including the three gains, agree
exactly. The numerical gates remain failed. These remain development results on an
already inspected cohort, not a production release.

The [causal crop-drift diagnostic](u2netp-crop-drift-results.json) reproduces
those two differences before substituting individual intermediate fields.
In one photo, a single resampled sample crosses the 95% palette cutoff;
replacing only the resulting chroma field restores the reference crop exactly.
In the other, one foreground pixel changes 589 paper-distance samples;
replacing only that distance field restores the reference crop. Component-mask
and colour-field substitutions do not. Continuous palette weighting and subpixel
distance geometry were then [tested separately and together](u2netp-continuous-fields-results.json).
Confidence-weighted colour sampling preserves all original crop/support decisions
and reduces maximum export-induced corner drift from 1.94 to 0.19 pixels.
Distance-only processing worsens it to 7.47 pixels; the combined variant loses
one existing crop. Both unsuccessful variants are retained. Colour weighting
also changes some corners by 5–9 pixels relative to the old algorithm.

The [fresh original-versus-weighted reconstruction comparison](u2netp-continuous-pipeline-results.json)
is now complete: both retain **12/32** formally checked pairs. All eight new
exports pass editable conversion, geometry and nominal paper checks; six pass
the image/feature checks. All eight were visually inspected. The three accepted
neural fits have slightly higher mask error with weighting, while the printed
tree-paper case still fails. Improved numerical stability is therefore **not**
an established reconstruction-quality improvement, and the NN stays outside
production.

The red/gold checker heart exposes another source of sensitivity: a **61-pixel
change out of 160,000** switches the selected counts from 8-by-8 to 7-by-3,
although the crop moves less than 0.05 source pixels. A fixed-work ABBA replay
exactly reproduces every initialized and fine-grid score. The simpler candidate's
worst retained region changes from 35.9% to 60.9%, crossing the 60% scheduling
gate. The cut-count preference then puts it ahead of the better-fitting 8-by-8
grid. This upstream change is independent of the later wall-clock refinement;
both final results still visibly distort the small checker squares. The
diagnostic is `scripts/inverse/learning/crop-count-sensitivity.mjs`; inputs and
checksums are in the linked result. Candidate scheduling and printed-paper
identity remain separate problems to address before release.

A [fresh cut-count capacity check](u2netp-count-alternative-results.json)
confirms that the overlooked 8-by-8 layout improves the **same** weighted-crop
mask from 2.69% to 2.20% exported disagreement. All eight comparison exports
pass editable geometry and paper checks. Their small squares remain distorted,
however. Restricting the count search is an oracle experiment, not a new
automatic selection rule; production scheduling remains unchanged.

The subsequent [paper-identity head pilot](u2netp-material-results.json) adds
18,193 trainable parameters to the frozen adapted U2NETP. It trains for 120
updates on 16 real photos and 96 synthetic original/scene/printed views from
32 geometries, in 106 seconds on one CPU thread. All 32 evaluation input tensors
and body predictions exactly match the prior native body probe. The saved new
head is 77 KB; no second body checkpoint is stored.

This material head is **rejected for integration**. Known-region training
identity error drops from 44.8% to 11.3%, but two non-white training palettes
still have 46–48% error. All four training and eight evaluation gallery pages
were inspected: many dark/metallic hearts collapse into one paper class, and
printed stripes, dots and flowers still appear as weave boundaries. The three
body-crop gains would lose their motifs. These native results do not justify
browser export or template-quality claims.

The [paired relative-colour experiment](u2netp-relative-material-results.json)
keeps the body, head size, initial weights, training inputs, sampling order and
120-update budget identical. Its fresh raw control exactly reproduces the
earlier head checkpoint, training losses and all 32 evaluation fields. Centring
RGB on the predicted heart and using one common colour scale reduces known-region
training error from **11.26% to 5.06%**. Under a fixed contrast-compression
intervention, errors are **23.73% versus 5.41%**. These are training-photo
diagnostics, not held-out accuracy.

All 16 training and 32 separate-source evaluation photos were visually reviewed.
Several previously lost metallic/coloured motifs reappear, including the star
and dark/gold checker. The shaded red/gold checker still loses its small squares;
printed decoration remains confused with cuts. The unchanged body still misses
parts of the house and candlestick. This native experiment remains **outside
production** pending reconstruction checks and browser validation.
Cached normalized body fields have small cross-process differences (maximum
1.20e-7, no changes at 0.5); fresh body outputs match their parent exactly in each
probe. No numerical gate has been relaxed.

The subsequent [fixed-crop reconstruction check](u2netp-material-fixed-crop-results.json)
keeps all 25 crop selections and seven unresolved cases unchanged. It yields
**14/32 checked derived-mask pairs**, versus 12 for historical RGB fits at those
same crops. All 25 exports pass editable geometry; 24 pass the nominal paper
check. However, inspection of all 32 cases **rejects this as a reconstruction
improvement**: six newly passing cases include unsuitable crops and simplified
motifs, while four previous passes regress. Printed ink becomes cut geometry,
the shaded checker disappears, and narrow joins/grid corners are altered before
fitting. Original-artwork ground truth is unavailable; neither mask's own fit
error settles which reconstruction is better.

The fixed-crop audit also corrected a small-photo resolution mismatch and a
black/white-preview reader in the offline comparison tooling. Only the affected
229-pixel photo was refitted; 24 unchanged, source-verified exports were reused.
Every final comparison reproduces the independent renderer's own mask error.
The retained synthetic diagnostic finds **1.91% paper error on plain views,
11.17% on printed counterparts**, already in the training pool. The short pilot
sampled only 23 of 32 printed views; some sampled views fail too. Crowded scenes
also hurt the frozen body detector. These observations motivate better training
coverage and preservation of original RGB boundaries, rather than longer fitting
against an incorrect neural mask.

The original [fresh 32-photo evaluation](u2netp-fresh-results.json) freezes the model and
crop policy before inference. It keeps every existing production crop and adds
a review-required neural proposal only where none exists. Crop proposals rise
from **21 to 24**, and checked pairs from **10 to 12**. The new checker-heart and
outlined-star fits have 2.93% and 0.48% independent derived-mask error. All 24
distinct exports pass conversion and geometry checks; 22 pass nominal paper
checks, and 12 pass all reconstruction checks. These are approximate templates,
not comparisons with original cutting paths or physical assembly tests.

[Visual review of every case](u2netp-fresh-output-review.json) finds conspicuous
seams in the gained checker-heart fit, printed ink mistaken for sheet boundaries,
and fine details lost despite reasonable crops and masks. One numerically checked
printed-rosette result is therefore not evidence of recovering its original
physical weave. Five weak existing crops are preserved by policy, including a
house cropped in half. No failure was removed from the denominator. The cohort
is new to recorded pipeline experiments, but has only five source groups and at
least one apparent repeated motif/photo.

All 32 browser input tensors match the independent Python inputs exactly.
Single-thread warm WASM inference has a 1.04-second median on this desktop.
The strict output gates still fail: browser-versus-PyTorch probability difference
reaches 0.000145, and four photos each change one threshold pixel. Actual browser
fields feed the reported crop/fitting results. Downstream consequences of those
small numerical differences need checking before any tolerance change.

A [separate diagnostic of all five weak production crops](u2netp-weak-crop-results.json)
finds only one additional neural crop, whose mask still traces printed dots and
stripes. On the house and candlestick, generic saliency emphasizes the interior
motif and misses surrounding paper. On the printed HO HO heart, the body mask
looks reasonable but the locator's lobe-color assumptions reject it. This
separates whole-paper recognition, geometric cropping and paper identity as
distinct problems; switching to the network on every weak crop is insufficient.
No new templates were fitted in this diagnostic.

Earlier experiments remain recorded below with their original policies and
denominators.

The [fixed material candidate](preserved-candidate-results.json) preserves its
foreground network exactly but adds no checked recovery on the separately
selected sixteen Sabrina photographs. Using the foreground only as a
[rough RGB search region](foreground-region-pipeline-results.json) also adds none.

The new [official pretrained U2NETP baseline](u2netp-pipeline-results.json) uses
1,131,181 parameters and no heart fine-tuning. Its clearer outlines produce two
additional checked approximate pairs: stacked hearts and a black/gold grid.
Their photographed overlap coverage is 99.994% and 99.828%, respectively, but
their lower tips lie outside the photograph. The frozen rule requiring every
corner inside the image selects neither, so its result remains **7/16**. These
partial-photo proposals are a separate development finding, not a retrospectively
improved held-out score. The third new fit loses small features and is rejected.
Visible rounding and thin seams remain even in the two checked results.

The [ONNX/browser audit](u2netp-runtime-results.json) verifies identical decoded
RGB and model input tensors for all sixteen original JPEGs. All six resulting
crop proposals, corners and classified masks are exactly unchanged. Browser
inference takes 1.12 seconds plus 0.12 seconds median preprocessing on this
desktop, excluding model startup and downstream cropping/fitting. The 4.62 MB
model still misses the strict raw-probability tolerance (maximum difference
0.000126 versus 0.000020 allowed), with zero threshold-pixel changes; the failed
numerical check remains recorded alongside the successful pipeline comparison.
This is not mobile validation, a new unseen cohort, or a production model.

#### Earlier 18 October solver validation

The **18 October validated revision** (`1921279a`) passes type checking, lint,
build, **874 application tests** (one skipped), and **1,109/1,109 inverse tests**.
All 1,124 pinned source files remained unchanged throughout the full run.
The [complete QA record](finalist-release-qa.json) includes the failed preceding
run, the captured defect, and the regression that fails before its fix.

All **34 actual Chromium workflows** pass: 22 regular Hunodan photographs,
eight photos/examples, three explicitly constrained ten-second mask diagnostics,
and one normal-budget replay of a related sloth mask. Engine checks and
independent checks of the downloaded editable SVGs pass in every case.
All **22 Hunodan designs finish under ten seconds**: **5.88 s median,
8.64 s maximum**, measured from clicking Find the cuts to an editable result.
Their crops, classified masks, observation coverage and weights match the earlier
`b7daccc` benchmark; every editable-mask error is unchanged. Timings come from
separate shared-machine runs, so this is not a causal speedup claim.

The changes remove a hidden wall-clock cutoff from explicitly untimed repairs,
prioritize useful feature routing, and protect refinement/polishing reserves.
The final fix concerns verification: a captured paper repair passed the polygon
offset checks but remained uncertain on a coarse 360-cell lattice. Both models
pass the same repaired curves at 700 cells. One bounded finer audit now verifies
that repair, and exports record the resolution actually used. No paper-width,
feature-retention or image-error limit is relaxed. This final verification adds
work after the optimization cutoff, just as the existing final audit does; one
diagnostic finer audit took 0.525 seconds.

Visual review covers all 34 rendered results, three import/Draw screenshots and
all nine downloaded PDF pages. PDF labels and templates are unclipped, and the
hat retains its shared seams. Small boundary spurs, imperfect curved contacts
and false seams remain in some hard fits. On one exact native sloth mask,
increasing the allowance from ten to 180 seconds reduces independent error from
**1.63% to 1.50%** in **16.36 seconds**, but leaves visible defects and the same
four-cut-per-sheet layout. More time alone is insufficient there; topology
choice remains a candidate cause. The cleaner browser sloth fixture is a
**different mask**, verified by hashes, and is not evidence of recovery on that
native input.

That historical QA does not replace the earlier, separately recorded 31-photo
benchmark. The neural prototypes remain offline; deployment status is recorded
above.

### Earlier solver experiments

The [interior-supported count proposal](interior-count-fit-results.json) retains
all original hypotheses and adds denser starts only with repeated interior
support. In four development inputs from two photographs it improves three
checker fits and leaves the star unchanged. Two checker variants still exceed
the image limit. The [integrated release record](interior-count-release-results.json)
records 1,028/1,035 inverse tests passing before subsequent fixes; it is not a
current full-suite pass.

Commit `5e48e29` separates a clearance repair's work cutoff from the deadline
for retaining completed verification. Commit `8149da2` fixes a different
selection bug: a better legal approximation was discarded when it still
exceeded the image acceptance limit. Its [deterministic regression](late-polishing.md)
improves independently rendered export error from **4.89% to 4.02%**, while
keeping the mismatch warning and geometry, paper and feature checks.

The [complete QA run for the polishing fix](late-polishing-release-qa.json)
passes type checking, lint, build, **874 application tests** (one skipped) and
**1,037/1,038 inverse tests**. The remaining failure discards a useful clearance
initializer before its final checks can begin, despite time remaining before
the caller deadline. Commit `b7daccc` permits that bounded verification without
extending the optimization cutoff or caller deadline. Its deterministic
regression fails before the change; all **17 affected tests** pass afterward.

Post-fix type checking, lint, build and **874 application tests** (one skipped)
pass. All **30 browser workflows** pass, including **22/22 regular Hunodan
designs under ten seconds** (5.72 s median, 8.62 s maximum, click to editable
result). Compared with the preceding complete browser run, all crops and masks
are identical; 18 editable exports are byte-identical and four have lower mask
error. None has higher mask error. Small edge irregularities remain visible.
Full inverse verification of `b7daccc` now passes **1,039/1,039 tests**, with
1,018 source files checked unchanged. The [fresh photo replay](late-polishing-photo-qa.json)
passes the current derived-mask checks for **27/31 complete heart cases**,
including their editable exports, with no lost previous passes. Jigsaw improves
from **5.64% to 1.00%** on an unchanged crop and target. Crossed ribbons also
passes, but classification/coverage changed and its old 72-pixel border feature
is still absent; this is not claimed as faithful feature recovery. Visible
false gaps and uneven edges remain in some accepted outputs. Evidence is under
`tmp/heart-learning/late-polishing-release-v1/`. Nothing has been pushed or
deployed.

Earlier [30-workflow browser validation](late-feature-browser-qa.json) and
[later slower follow-up](base-count-release-qa.json) describe their respective
revisions. Those timing differences are observations from a separate run,
not evidence that the deadline correction caused the speed difference. These
are development workflows, not a fresh holdout. The separate photo comparison
marks changed crops, targets and observation coverage before comparing errors.

### Neural experiments

The [pretrained-model research](pretrained-models.md) compares candidate
encoders. Actual experiments use TorchVision's hash-verified ImageNet
MobileNetV3-Small weights, not the separately researched timm LAMB checkpoint.
The [boundary/junction prototype](boundary-localization.md),
[foreground adaptation](real-adaptation.md) and
[body/material transfer](material-transfer.md) cover different tasks; their
metrics must not be pooled into one success rate.

In the [nineteen-photo corrected-material comparison](material-corrected-scenes-results.json),
the learned arms each produce **3/19** checked derived-mask reconstructions,
versus **6/19** for the existing pipeline. Sixteen learned attempts fail before
fitting. These are repeatedly inspected development photos, and agreement with
a derived mask is not agreement with unavailable original artwork. The
[body-only ROI experiment](foreground-roi-results.json) and
[MobileSAM foreground experiment](mobilesam-foreground-results.json) retain
separate results and limitations.

The October 19 [frozen-model resolution comparison](material-inference-scale.md)
replays those nineteen held-out predictions exactly, then tests the same weights
at 512 instead of 256 pixels. Mean body IoU falls from 80.68% to 64.24% and
supported crop proposals fall from three to one. This higher-resolution inference
change is rejected; source photos and checkpoints are reused, with no retraining
or website change. The failure begins in foreground/material prediction before
template search, and does not establish the outcome of multiscale training.

The [context/detail follow-up](material-context-detail-results.json) retains
256-pixel whole-heart features while using finer RGB detail. It avoids the large
foreground regression, but supported crops still fall from three to one. Better
average pixel scores do not compensate for losing crop support at the paper edges.

### Encoder adaptation and separating crop errors from mask errors

The [October 19 controlled study](material-encoder-tail-results.json) trains a
fresh frozen-encoder control and a model with the last three MobileNet blocks
unfrozen. Both use the same initialization, draws, 240 updates and two connected
source/motif folds. Three historical photos now belong to the QA-reserved Sabrina
group and were excluded before training; the remaining **16 development photos**
are not directly comparable with the earlier nineteen-photo percentages.
Independent audits reproduce every saved prediction exactly and verify that
the frozen parameters and all BatchNorm statistics remain unchanged.

Fine-tuning reduces observed paper-label error from **18.47% to 15.02%**, but
both joint-training runs lose foreground accuracy relative to their starting
model: body IoU falls from **85.11%** to **74.86% / 74.57%**. Two subsequent
stage-isolation experiments retain the candidate material predictions while
restoring the original foreground, then hold those crops fixed and replace
the learned mask with the existing RGB classifier.

| Method on the same 16 photos | Crop proposals | Checked editable pairs |
| --- | ---: | ---: |
| Existing production pipeline | 9 (7 supported) | 7 |
| Fresh frozen-encoder control | 1 | 1 |
| Fine-tuned encoder tail | 2 | 2 |
| Original foreground + fine-tuned material | 5 | 3 |
| Same five crops + production RGB classification | 5 | 5 |

All **22 exported candidates** pass editable SVG conversion, editor geometry
and physical paper checks. Four fail image/feature requirements and remain
review-required. All field images and exported fits were visually inspected.
The five-crop RGB comparison recovers recognizable sloth and curved-checker
detail and sharper checker contacts. Learned checker masks can score perfectly
on partial interior labels yet introduce rounded corners and false gaps at
unlabelled junctions. The solver then reproduces those defects. Conversely,
the production bicycle has a plausible mask but still loses features during
fitting, so the remaining problems are not exclusively upstream.

These are derived-mask checks on repeatedly inspected development photos, not
exact artwork recovery or a measured automatic fallback policy. Crop/target
changes prevent interpreting lower fitting error as a direct accuracy gain.
The useful next direction is to preserve foreground predictions and test
NN-assisted cropping with RGB classification on fresh grouped photos, while
adding boundary/junction supervision. No model is integrated into the app.

Type checking, lint, the static build, **1,598 application tests** (one skipped)
and **10 focused material/export tests** pass. The full inverse suite was not
repeated for these offline tools. Remote main's CI run `39277116968` completed
successfully; its advisory timed tests still record 17 quality misses. That run
does not validate these unpushed research commits. Training and evaluation used
one serial low-priority worker. This study retains about **127 MiB**, exceeding
its initial 100 MiB estimate after the extra ablations and audit figures;
source photographs were reused, and editable inputs use hard links.

The next deployment gate is improvement in complete photo-to-editable-template
recovery on properly grouped real images, including feature retention and
physical validity. The following experiment measures export and desktop inference;
full-resolution browser preprocessing, download cost, mobile latency and memory
still need validation. A better segmentation score alone does not meet that gate.

### Preserving foreground during adaptation and exporting to ONNX

The [runtime study](preserved-material-runtime-results.json) packages the two
previously audited held-out models with an immutable foreground branch. Both
branches share the first nine encoder blocks; only the material tail and decoder
can train. Unit tests verify that optimization changes material predictions while
foreground output and all frozen parameters/buffers remain exact. All **141 tests
in 26 offline learning modules** pass.

Each combined graph has **1.57 million parameters** and exports to **6.58 MB**.
Native ONNX inference takes **36–37 ms** per 256-pixel input on one CPU thread,
versus **57–58 ms** for the two separate Torch networks in the same experiment.
Both held-out models reproduce the archived classification on all sixteen photos;
the largest native probability difference is **0.00000754**.

Actual Chromium/WASM inference takes **67–68 ms**, also on one thread; the first
local session takes about **257 ms** to initialize. Browser-decoded RGB and
normalized input tensors are byte-identical to Python's. The largest output
difference is **0.0000312**, exceeding the predeclared **0.00002** tolerance on
one photograph. That numerical check remains **failed**, although no pixel changes
class at the original prediction resolution. The threshold was not relaxed.

A paired crop replay controls the finite orientation search independently of
machine speed. Native ONNX reproduces all corners and rectified masks exactly.
WASM retains the same five crop proposals across the sixteen photos, but moves
one corner by **0.00087 source pixels**. Across the five 400-pixel learned targets,
four mask pixels change; the corresponding RGB classifier targets change by two
pixels. Observation coverage and crop support decisions remain unchanged. This
does not establish downstream topology stability: fitting was not rerun for this
numerical comparison.

These are **two evaluation checkpoints**, not one production model. Packaging
preserves the earlier model's successes and failures; it does not fix the material
head's rounded checker contacts or establish a useful automatic fallback policy.
Browser validation starts from the exact prefiltered RGB inputs and does not yet
cover full-photo browser resizing. Models remain outside the website. Runtime
dependencies and outputs occupy about **170 MiB**, with no new source-photo copies;
the test browser and its temporary server were closed. Latest observed main CI
run `39287794295` is green, independently of these unpushed research commits.

The [final site checks](preserved-material-site-qa.json) pass type checking, lint,
build and **1,599 application tests** (one skipped). Actual Chromium checks cover
both archive languages, all three newly preserved reference records, pagination,
filtering, a saved PDF and mobile overflow. The first browser assertion mistakenly
forbade Ovalt's surviving source-photo link; the corrected check allows that exact
photo and still forbids unavailable templates. The rebuilt local preview is at
`http://localhost:4173/`. Nothing was pushed or deployed.

### Production-first neural crop fallback

The [fixed-policy experiment](photo-crop-fallback-results.json) keeps a supported
production crop, otherwise tries the held-out WASM neural fields through the
existing locator. A neural replacement must pass the original outline checks
and have all four corners inside the photograph. Both arms use the existing RGB
classifier and ten-second fitting allowance; no fitted error or annotation
selects the crop.

On the same sixteen development photographs, supported crops rise from **7 to 9**
and checked editable template pairs from **7 to 9**. The two recovered checker
photos have **1.19% and 0.72%** disagreement with their respective classified
masks after editable SVG conversion. All twenty method-labelled exports pass
geometry and paper checks; these represent eleven distinct pairs because fourteen
unchanged selections share their production fit. This isolates the policy from
timed-search variation and avoids duplicate computation. It is not a repeated
timing benchmark or an unseen evaluation.

All eleven distinct exports were visually reviewed. The recoveries retain the
checker structure, but uneven contacts and small seams remain. Other numerical
passes include distorted printed-heart decorations and contaminated borders.
The bicycle retains a plausible target mask but loses major detail during
fitting; it correctly remains review-required. The result therefore establishes
two additional checked approximations, not exact original-artwork recovery.

Crop detection takes **5.52 seconds median, 8.83 seconds maximum**, excluding
cached neural inference. Nine photos request the neural fallback. Its two
successful locator attempts take about **0.53–0.55 seconds**, after the ordinary
search has already spent several seconds. The geometric search is a larger
latency cost here than the previously measured 67–68 ms neural inference.
The browser preprocessing follow-ups below now reproduce both lossless source
inputs and the original JPEG inputs. Fresh grouped evaluation remains necessary;
the earlier strict WASM numerical tolerance remains failed. The neural fallback
is still an offline experiment.

### Matching photo preprocessing in the browser

The [full-photo preprocessing audit](photo-preprocessing-results.json) found
that Canvas high-quality resizing does not match the Python training transform.
Across sixteen photos, the average difference is only **0.92 RGB levels per
channel**, but **6,581 foreground pixels and 17,787 material pixels** change
classification. The old Python-prefiltered input and its WASM output replay
exactly in the same browser session, isolating this discrepancy to preprocessing.

A small portable JavaScript implementation now reproduces the antialiased
triangle prefilter, byte rounding and continuous letterbox transform. It passes
**twelve independent Pillow fixtures** plus padding/input-validation regressions.
In actual Chromium, all **sixteen full-photo RGB inputs, normalized tensors and
both output fields match exactly**. The final audit hardlinks the identical
prediction files to avoid duplicating them. Full source photos are reused.

The [original JPEG follow-up](photo-decoding-results.json) invokes the website's
actual `decodeImageFile` importer, including `createImageBitmap`, in Chromium.
All **sixteen original photographs and eight independent EXIF orientation
fixtures** match Pillow's oriented RGB and the portable neural input exactly.
The photographs include one embedded sRGB profile. The eight tiny fixtures
and their references occupy under 50 KB; no source photographs are copied.

This preserves the inputs of the earlier fallback experiment; it is not another
reconstruction gain. Wide-gamut profiles, transparent inputs, other formats,
mobile browsers and a fresh grouped evaluation remain untested. The older
WASM-versus-Torch numerical tolerance remains failed. No neural model is added
to the site.

## Collected assets

### Preservation archive, 2026-10-19

The [preservation manifest](heart-archive-storage.json) records **237 unique
original files, 29,657,897 bytes**, including 54 template PDFs (286 pages),
five editable SVG originals,
seven recovered Permo images, nineteen Haabet images and source/history/license
evidence, plus the 90 [new board originals](conni-board-preservation.json).
Those board files use hardlinks to the dataset's existing immutable bytes, so
their durable preservation adds no second copy. These are documents and
photographs, not 237 independent designs or new training labels.
[Additional collections](archive-additional.json) record Krümmel,
Bibelselskabet, Spejderliv and PaperMatrix; the [Permo history](archive-permo.json)
identifies five circle designs absent from Hunodan, plus an older anchor
version and weaving instructions. Drawings and variations are credited to
Per V. Mortensen, distinct from the earlier, unnamed pattern inventors.
The [discontinued-site rescue](archive-dead-sites.json) preserves six
JulehjerteDesign cutting templates and Haabet's polar bear, with primary
credit evidence for Johan Rosenkilde, Carola Heesemann and Peter Ole Kvint.
It also records a reference-only design whose template could not be recovered.
A [second Haabet batch](archive-haabet-patterns-2.json) adds **Vintersol** and
**9 hjerter / Firkløver**, both signed by Peter Ole Kvint. Seven new originals
and evidence files add only **35,570 bytes**; two existing evidence objects are
reused. The two names for 9 hjerter and the two Vintersol photographs do not
become additional design records. Original URLs, actual capture timestamps,
creator signatures and source history are retained. The year 2001 printed on
Vintersol's template is not treated as a verified first-publication date.
The attempted Damernes SVG replay also returned 404, so that design remains
reference-only. None of this batch is mirrored as a public image.
A [third Haabet batch](archive-haabet-patterns-3.json) adds **Klokke Julehjerte**,
**Freds Due** and **Håbets Anker**. Eight original GIFs and three source pages
add **18,128 bytes**, with two existing evidence objects reused. The bell and
anchor templates are signed Peter Ole Kvint 2001. The dove's designer remains
unknown: crediting the website's author would not establish motif authorship.
Original template links, working archive captures and sheet order are retained;
the preview illustrations are not counted as photographs or extra designs.
A [geometric-pattern follow-up](archive-jhd-geometric-1.json) preserves Johan
Rosenkilde's **Hexatriple**, **Ovalt Julehjerte** and **Square Twist** articles,
plus the original Ovalt photograph: **four new files, 427,968 bytes**, reusing
two existing evidence objects. All six linked PDF/SVG template replays returned
404, so these are **reference-only records**, not recovered templates or solver
ground truth. Hexatriple explicitly uses three sheets, outside the current
two-sheet inverse model. Publication timestamps, advent-calendar appearances,
variant descriptions and exact failed links remain separate source claims.
An [editable-source recovery](archive-jhd-original-svg-1.json) preserves the
original SVGs for **Darth Vader**, **Julehjertets Hjerte**, **Node**, **Fjerde
Søndag i Advent** and **Venus**, whose PDFs were already preserved. Five files
add **502,957 bytes** and no additional designs. Their original layers remain
intact; SHA-256 checks and historical archive digests identify the source bytes.
The public records gain working source links while keeping one PDF template
action, so the editable original does not appear to be another cutting sheet.
A [fourth Haabet batch](archive-haabet-figures-4.json) adds **Stjerne, af Cirkler**,
**8 Spisser Julehjerte** and **4 4kanter Julehjerte**, preserving the source names
and Peter Ole Kvint signatures. Three original GIF templates, three source
pages and three archive-index responses add **8,688 bytes**. Capture dates
establish availability only; invention and first-publication dates remain unknown.
The 8 Spisser template has irregular interior/side-entry cuts and is excluded
from automatic regular-solver benchmarking. The other two are visual candidates
for that model, not independently validated templates. Linked previews were not
retrieved and are not presented as saved photographs.
The [Conni board archive audit](conni-board-archive.json) subsequently adds
56 references, enriches 18 existing records and consolidates seven older
duplicates using reviewed same-image links. The source index now contains
**1,175 external records**, alongside the **56 published Juleflet hearts**.
All 119 relevant pin links are retained; three unrelated pins remain in the
research inventory only. These batches add no public media mirrors.

Original bytes were moved out of temporary work directories, not copied into
another full dataset. The private originals live in
`archive-store/heart-preservation/objects/`, named by SHA-256 and excluded from
Git. The manifest, source links, capture dates, credits and checksums are
tracked. Spejderliv's unchanged six-page collection by Kim G. L. Pedersen is
also a public website asset under its explicit CC BY-NC-SA 4.0 terms, with
attribution and source/license links. Other records link their original or
Wayback sources; a local preservation copy does not imply a public mirror.

The unlisted `/all/` and `/en/all/` pages combine the published catalog with
the broader source index. Counts refer to records, which can be photographs,
template bundles or historical references; they are not unique-design counts.
No collected raw HTML executes under the website's origin.

Verify originals after collection or restoring a backup:

```sh
node scripts/archive/verify-store.mjs --local
```

Without `--local`, missing private originals are reported so the public subset
can also be checked in a clean checkout. The laptop remains the only verified
copy of the new private store: back up that directory together with this
repository's manifests to separate storage. Git alone does not back it up.

The [real-photo collection](real-collection.md) explains collection and review.
The [manifest](real-manifest.json) and [independent audit](real-validation.json)
record source URLs, hashes, decoded identities, dimensions, image kinds and
groups. Image bytes remain under `tmp/heart-training-real/`, outside Git.

Current inventory: **811 photo-containing files**, **697 near-duplicate photo
groups**, **838 QA-reserved files**, and **817 downloaded / 834 selected
Pinterest pins**. Near-duplicate groups are not verified motif families.
A collage remains one file until its individual hearts are annotated.

The [complete Sabrina board import](sabrina-board.md) accounts for all 225
observed pins. Five image files were already present. One reused file was
QA-reserved, so reservation propagates to the board's source group; none of
these additions has been newly admitted to training. The new files consume
35.13 MiB, not another copy of the whole corpus.

The [synthetic generator](synthetic-training.md) keeps canonical curves, exact
shared-edge identities, phase and camera transforms while varying color,
lighting, background, pose, blur and crop error. The
[current geometry re-audit](synthetic-current-geometry.md) covers 256 witnesses
used for 1,024 photographic views, including 64 unassigned radial motifs.
These views are not independent designs or replacements for real photographs.

Local review galleries are `tmp/heart-training-real/index.html` and
`tmp/heart-training-synthetic/batch-v1/index.html`. Do not expand old archived
artifact collections just to inspect one case; use the retained compact exports.

The [four user-supplied regression cases received on 2026-10-17](../../../scripts/inverse/fixtures/user-photos-2026-10-17/README.md)
are retained separately from the 1,254-file inventory above. The
[edge-inset study](photo-edge-inset-study.md) reproduces the reported fringe and
tests all three hearts in the window photograph, including cropping and
downstream feature failures. These additions are QA-reserved, not new training
labels; no automatic border inset has been enabled.

The subsequent [chromatic-paper crop study](chromatic-crop-results.json) recovers
the blue/orange window heart through automatic cropping, fresh fitting and a
downloaded editable SVG. Reflections had interrupted the foreground scanlines
and reduced edge-confidence scores despite visible physical edges. The new
fallback learns two coloured papers and checks contrast along the fitted
outline, retaining the lobe checks. All 31 previous photographic crops and masks
remain identical. The hand-adjacent orange/white crop is still visibly wrong;
its low mask error does not establish a faithful reconstruction. Small boundary
tabs also remain in the blue/orange result. This is a deterministic preprocessing
improvement, not a neural-network release. The full inverse run passed
**1,047/1,048 tests**; its sole failure was the offline body-only crop adapter's
guarded source replacement, which still expected the old palette expression.
That adapter is fixed, and all four of its tests pass on replay. All other
1,031 pinned files remained unchanged. The full suite was not repeated after
this isolated offline fix; the linked record retains both the failed full run
and the successful focused replay. Lint passes with two existing warnings.

The newer [touching-semicircle mask investigation](curved-triangles.md) identifies
why a nominally valid 2.76% editable approximation opened white channels: the
opposing curves belonged to different cuts in the same sheet, so closing them
would violate the width constraint. Coarse rerouting followed by bounded
clearance repair and common Bézier refinement reduces editable disagreement to
**0.69%**, with a checked 2 / 4-cut pair in a 24.92-second integrated run. Small
join defects remain. The screenshot is committed as a development QA regression;
no saved templates or idealized circles enter its fresh solve. The subsequently
supplied original Art e Sta poster is also committed as a related QA fixture.
Its manually selected three-by-three artwork region gives **0.945%** editable
error in **30.63 seconds** through normal browser upload, fitting and export.
A shorter diagnostic browser run remains a documented 2.14% failure against the
stricter regression target; import masks match exactly, exposing timed-search
variability rather than a crop or classification difference.

## What the network should learn

Keep full-photo localization separate from rectified-pattern interpretation.
The [foreground labels](foreground-supervision.md) supervise physical paper
and background; [material labels and evaluation](material-evaluation.md)
supervise paper identity with partial observations. Graph proposals can predict
visible boundaries, junctions, border endpoints and connection scores. The MILP,
Bézier refinement and independent geometry checks still decide whether a
proposed template is legal.

A saved cut graph is one valid witness, not necessarily a unique answer.
Invisible shared cuts admit multiple routings; an unused edge is not
automatically a negative label. Preserve shared curves as one geometric object
and account for interchangeable sheet identities. Solver outputs and linked
template downloads are not ground truth until independently verified.

The material compiler, `scripts/inverse/datasets/real_materials.py`, supports
256-pixel training views and 768-pixel inspection. Its verifier checks source,
annotation and output pixels. Unlabelled material stays unknown (255), while
known body can still supervise foreground. Evaluation permits one global A/B
exchange per image, never a different exchange for each pixel; missed body
remains a material error.

## Keep evaluation separate

Existing Hunodan and photographic QA sources stay reserved. Reposts,
resolutions and collage crops inherit their source group; motif families must
also stay together before assigning a split. Unreviewed family assignments
remain unassigned. Hashes and perceptual similarity alone do not establish
independent designs.

Synthetic recipe splits are **not topology-disjoint evaluation sets**.
Equivalent geometry can arise from different recipes or subdivisions. Keep
counts of photographs, heart instances, motifs, graph witnesses and augmented
views distinct. Accessibility, attribution and usage terms are recorded
separately from visual suitability; downloading a photo does not itself admit
it to training.

## Reproduce and verify

Follow the linked collection, model and synthetic documents for individual
commands and pinned artifacts. Run heavy jobs **one at a time at nice 15**,
limit numerical thread pools to one, and keep at least **10 GiB free**. New
experiments need new output directories so they cannot overwrite prior evidence.

```sh
nice -n 15 node --test --test-concurrency=1 scripts/inverse/datasets/*.test.mjs
nice -n 15 python3 scripts/inverse/datasets/real-collect.test.py
```

Full application QA uses `npm run check`, `npm run lint`, the two `npm test`
phases (`vitest run --maxWorkers=1`, then `npm run test:inverse`), and
`npm run build`. Browser QA uses the assigned worktree's own preview and
Chrome-for-testing, with served assets checked against the current source.

Whole-pipeline reports must include failed crops and missing exports, total
time, valid-template recovery, image/feature errors and crop/color/noise
sensitivity. Inspect rendered results: low whole-image error can hide missing
rays or thin false seams. No physical assembly or paper-strength guarantee
follows from the nominal geometry checks.

The [complete overview archived on 2026-10-17](experiment-history-2026-10-17.md)
preserves every prior paragraph and report link. The
[earlier experiment history](experiment-history.md) retains older snapshots.
Their historical “current” and “pending” statements refer to those snapshots,
not to this status page.
