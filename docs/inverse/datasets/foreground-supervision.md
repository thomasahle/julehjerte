# Full-photo foreground supervision

Commit `045bc82` adds physical paper/background labels for all **768 existing synthetic photographs**. The labels include both paper colours and both lobes. They exclude shadows and background texture, and describe material occupancy before blur, glare, resampling and JPEG compression.

The photographs, cutting geometry, previous labels and recipe splits are unchanged. This adds supervision, not new photographs or motif diversity. These views still represent 192 geometries from three broad recipe groups. No network has yet been trained on the new target, and the production cropper and fitter are unchanged.

## Why the crop diagnosis led here

The remaining real-photo failures include foreground segmentation errors. Visual inspection shows the existing red/white locator claiming parts of the wooden background as paper. Other masks erase one paper colour or leave gaps along blurred red/white transitions. Either error can distort the physical lower edges before the template search starts.

Six unresolved collage cases were replayed from the larger Pinterest photograph. An RGB-only scale/translation registration transferred the rough selections from the existing screenshot. Neither cutting templates nor solver error entered registration. These are two different file variants, with different colour and image degradation; this replay is **not** a controlled resolution-only experiment. The earlier [resolution study](../FINALIST-DIVERSITY.md) retains that separate controlled comparison.

| Larger-source case | Result of complete crop/classify/fit replay |
| --- | --- |
| Nested squares | No crop |
| Outline star | 3.632% disagreement; uncertain paper support |
| Santa | 2.708% disagreement; lost source feature and uncertain paper support |
| Jigsaw | Numerically checked pair at 1.616%; crop outline remains weak |
| Crossed ribbons | Numerically checked pair at 1.683%; weak outline and a corner outside the photograph |
| Bauble | No crop |

The two checked fits do not establish correct physical crops. They use different targets from the original screenshot benchmark, which remains **24/31**. A fitter can reproduce an incorrectly selected region. Better mask agreement alone cannot validate the preceding crop.

## Rejected colour-model experiments

Seven prototype variants were tested on the same six cases in both file variants, with unchanged outline-support requirements:

- A red/white colour-plane model, allowing mixtures and intensity changes, still confuses some wood with paper and loses red regions.
- Colour distributions seeded from the rough selection's interior and exterior give cleaner masks, but produce false gaps at mixed red/white boundary pixels.
- Selection-relative seeds, a lower edge-sampling band, continuous paper-colour mixtures and separate colour-specific lobe outlines were then tested as recorded variants.

Only the final mixture variants return a supported proposal for the larger-source bauble. Its estimated tip still lies outside the photograph. The full fitter on that fixed proposal has **5.074% disagreement** and loses a source feature; geometry and paper checks alone pass. It is rejected. No colour-model prototype was promoted into the application, and no proposed real-photo mask or crop became a training label.

The local archive contains the executable prototypes, registration, masks, crop proposals, complete fitting outputs and logs. Its inventory and checksum are in [the evidence record](foreground-supervision.json). These experiments support separating physical paper boundaries from visible motif boundaries; they do not establish that colour modelling alone can solve touching hearts, occlusion or non-planar paper.

## New target and data integrity

The old `photo-paper-a.png` is zero for both background and paper B. The old `photo-overlap-valid.png` excludes the lobes. Those files are useful for the rectified graph task, but neither is a full-photo foreground label.

The new opaque binary PNG uses **255 for either paper** and **0 for background**, at photograph pixel centres. It is derived from the saved camera transform and the simulator's canonical physical outline. It does not use RGB classification, inferred corners, fitting results or the imperfect crop proposal. Photographic stressors leave these physical labels unchanged.

Labels are exported into a separate directory. Its manifest pins the parent manifest, source photograph and camera-label hashes, preserves every view's design/family/group/split identity, and records the implementation hashes. Existing directories are not overwritten. Verification rechecks all parent assets and every new mask pixel against the saved geometry, including dimensions and area metadata. A forged all-background mask is rejected even when its checksum has been updated to match.

The completed exports contain **512 labels** for the original batch and **256 labels** for the corner supplement. All **5,952 parent assets** pass integrity verification. No original file or training/evaluation assignment is modified.

```sh
node scripts/inverse/datasets/foreground-dataset.mjs \
  --dataset=tmp/heart-training-synthetic/batch-v1 \
  --output=tmp/heart-training-foreground-new

node scripts/inverse/datasets/foreground-dataset.mjs \
  --dataset=tmp/heart-training-synthetic/batch-v1 \
  --output=tmp/heart-training-foreground-new --verify=true
```

Repeat with the corner supplement as the parent and a separate output directory. Training consumers should read the parent `photo.jpg` and the corresponding sidecar foreground PNG; old rectified-graph training inputs remain unchanged.

## Verification and scope

Independent SVG rasterization checks translated, rotated, projective and clipped outlines. Tests also ensure that both lobes and paper B remain foreground when paper-A coverage is zero, photographic interventions cannot change occupancy, and malformed labels, altered splits, escaping asset paths and incorrect masks are rejected.

The 12-view gallery covers all three recipe groups and the corner supplement. Each sampled mask is checked against a separate projected-outline renderer, and the browser checks all 48 displayed images. Full validation includes 718 inverse tests, 855 application tests with one existing skip, type checking, lint and the production build. Detailed results and hashes are recorded in the evidence JSON.

This makes a full-photo foreground network trainable with existing synthetic data. It is not evidence of improved neural inference or a solved real-photo cropper. The simulator still uses planar paper, fixed semicircular lobes and one heart per scene; neighbouring hearts and non-planar paper require further data and evaluation. Real-photo instance annotations remain necessary, and the existing diagnostic photographs stay reserved for QA.

Raw outputs and the gallery are under `tmp/heart-learning/real-edge-v1/`. The implementation is committed locally; nothing was pushed or deployed.
