# Data for learned heart reconstruction

Status reviewed on **2026-10-17**. **No neural network is ready for production or
included in the website.** The collection, synthetic generator and learned
prototypes are research tools; the existing geometric solver remains the
production path.

## Current results and limits

| Area | Verified evidence | Remaining limitation |
| --- | --- | --- |
| Real-image inventory | 1,254 files; 783 contain assembled-heart photographs; all files and decoded identities audited | File counts are not counts of independent motifs or fully labelled training examples |
| Sabrina Danholm's Pinterest board | All 225 pins imported; 220 new image files, about 35 MiB | No new corner, material or cutting-path labels; the whole board is QA-reserved |
| Synthetic geometry | 256 saved witnesses pass the current geometry/paper re-audit across 768 original/subdivided/reflected representations | Limited procedural diversity; recipe holdouts are not topology-disjoint splits |
| Small learned model | TorchVision ImageNet-pretrained MobileNetV3-Small with task-specific heads; offline experiments exist | No demonstrated overall reconstruction advantage, ONNX/browser validation or deployment |
| Larger segmentation baseline | Official pretrained MobileSAM evaluated offline | A useful body mask alone does not establish correct corners, material boundaries or legal templates |
| Solver | Recent initialization, repair and polishing fixes are committed | Latest browser verification passes; full inverse verification of the deadline fix is running; see below |

### Latest solver and browser validation

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
Full inverse verification of `b7daccc` is running separately under
`tmp/heart-learning/late-polishing-release-v1/qa-handoff/`. Nothing has been
pushed or deployed.

Earlier [30-workflow browser validation](late-feature-browser-qa.json) and
[later slower follow-up](base-count-release-qa.json) describe their respective
revisions. The faster current timings are observations from a separate run,
not evidence that the deadline correction caused the speed difference. These
are development workflows, not a fresh holdout. The historical 31-photo
benchmark is not automatically updated by this validation.

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

The next deployment gate is improvement in complete photo-to-editable-template
recovery on properly grouped real images, including feature retention and
physical validity. Python/ONNX agreement, download/startup cost, memory and
browser inference latency still need measurement. A better segmentation score
alone does not meet that gate.

## Collected assets

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
