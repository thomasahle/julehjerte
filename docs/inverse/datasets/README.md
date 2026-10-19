# Data for learned heart reconstruction

Neural release status reviewed on **2026-10-19**; dataset counts last audited on
**2026-10-17**. **No neural network is ready for production or
included in the website.** The collection, synthetic generator and learned
prototypes are research tools; the existing geometric solver remains the
production path.

## Current results and limits

| Area | Verified evidence | Remaining limitation |
| --- | --- | --- |
| Real-image inventory | 1,254 files; 783 contain assembled-heart photographs; all files and decoded identities audited | File counts are not counts of independent motifs or fully labelled training examples |
| Sabrina Danholm's Pinterest board | All 225 pins imported; 220 new image files, about 35 MiB | No new corner, material or cutting-path labels; the whole board is QA-reserved |
| Synthetic geometry | 256 saved witnesses pass the current geometry/paper re-audit across 768 original/subdivided/reflected representations | Limited procedural diversity; recipe holdouts are not topology-disjoint splits |
| Small learned model | Earlier MobileNetV3-Small fallback raises checked editable pairs from 7/16 to 9/16 on its development cohort; a newer fixed candidate stays at 7/16 on separately selected Sabrina photos | These are different cohorts; no deployment or established source generalization |
| Saliency models | Frozen U2NETP raises checked derived-mask pairs from 10/32 to 12/32; whole-paper decoder adaptation reaches 13/32 in a native follow-up | Adapted model has no browser validation yet; printed paper, missing body regions and false seams remain; no production integration |
| Larger segmentation baseline | Official pretrained MobileSAM evaluated offline | A useful body mask alone does not establish correct corners, material boundaries or legal templates |
| Solver | Current revision passes 1,109/1,109 inverse tests and 34 browser workflows; all 22 regular Hunodan designs finish under ten seconds | Some hard fits retain thin false seams; the earlier 27/31 photo benchmark has not been rerun |

### Latest solver and browser validation

The drawing improvements (red/white/XOR, full-circle weave icon, brush slider and
hover outline) and archive are **deployed**. The [19 October release record](oct19-release-qa.json)
contains live Danish/English and mobile QA, 2,216 application tests and 1,122
inverse correctness checks. Ten of 77 advisory timed quality targets still miss;
these are retained separately from correctness. Subsequent main commit
`7c6e232a` also passed [CI and deployment](https://github.com/thomasahle/julehjerte/actions/runs/39309081068).
The local preview is at `http://localhost:4173/editor/mal/`.

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
confuses material classification. The adapted checkpoint has **not** been tested
in the browser; the frozen-model experiment used WASM, so this is not yet a
controlled model-to-model runtime comparison or a production release.

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

The [preservation manifest](heart-archive-storage.json) records **147 unique
original files, 16,507,399 bytes**, including 54 template PDFs (286 pages),
five editable SVG originals,
seven recovered Permo images, nineteen Haabet images and source/history/license
evidence. These are documents and photographs, not 147 independent designs or
new training labels.
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
The source index now contains **1,126 external records**, alongside the
**56 published Juleflet hearts**. These batches add no public media mirrors.

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

Current inventory: **783 photo-containing files**, **670 near-duplicate photo
groups**, **748 QA-reserved files**, and **695 downloaded / 712 selected
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
