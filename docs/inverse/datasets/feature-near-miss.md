# Refining a feature-retaining layout before changing cut counts

A new automatic-crop experiment exposed a discontinuity in the main fitter: a useful three-cut layout retained the source's interior feature, but its **9.274% coarse error** narrowly exceeded the initializer's 9% cutoff. It was discarded before ordinary refinement. The replacement routing exported a rejected **4.698%** mask fit.

The fitter now gives the closest such near miss one ordinary fine-grid pass before trying a joint cut-count change. In the diagnosed case, this lowers the seed error to **8.783%**, meeting the original cutoff. The full reconstruction then passes at **2.669%** independent exported-mask disagreement with three cuts per sheet, within the same ten-second search allowance.

This is an improvement against an estimated photographic mask, not recovery of known cutting paths. Visual inspection still shows smoothed sun rays and uneven borders. The neural foreground model and experimental cropper retry remain offline; the production change is in the shared fitter.

## Why a small crop difference changed the result

The experiment keeps the photograph and neural foreground prediction fixed. The locator's normal starts fail to fit one Stonehenge lobe, while a broader starting-point search finds an outline passing the same support checks. The ordinary production crop also passes those checks, but their corners differ by several pixels. Neither set is physical corner ground truth.

Using the unchanged fitter, the production crop yields 2.49% disagreement, the earlier reviewed crop yields 2.96%, and the new neural crop yields 4.70%. The resulting classified masks differ, so this does not establish which crop is physically best. It does establish sensitivity to plausible input geometry.

The new crop's best ordinary grid misses an interior source region. Feature-weighted initialization proposes a three-cut alternative that retains it. However, the pre-refinement cutoff rejects that alternative at 9.274%. The subsequent joint-count search selects a different four-cut routing. The production crop's corresponding three-cut proposal scores 8.061% and takes the useful refinement path. The threshold is therefore part of the failure mechanism, rather than inconsistent endpoint counts or a missing count hypothesis.

## Change and bounds

The existing accepted initialization path stays unchanged. Only when no ordinary feature-weighted seed qualifies does the fitter:

1. Consider color-retaining near misses between the ordinary cutoff and the existing looser bound used for protected joint-count seeds.
2. Select the lowest unweighted image-error near miss and run at most 150 fine-grid steps, preferring checkpoints that retain the source regions.
3. Recheck source-region retention and the **original ordinary cutoff**. If either fails, continue the existing joint-count and finer-grid fallback.

This retries one already computed count/phase layout; it does not expand count enumeration. It changes neither source pixels nor the final 3% error cap, enclosure, geometry, paper-width or matching-sheet rules. A qualifying grid is only a starting point for the ordinary clearance and Bézier stages. The final exported templates must still pass every check.

## Perturbation results

The old and new implementations receive identical masks and probabilities for each variant. The baseline is `f7faa4c`, loaded from an isolated source snapshot; the change is `65172eb`. Crop translations move the frozen quadrilateral by one source pixel without rerunning detection. JPEG and half-resolution variants are generated before classification.

| Frozen neural crop input | Before disagreement | After disagreement | After outcome |
| --- | ---: | ---: | --- |
| Original | 4.698% | 2.669% | Pass |
| Crop translated +1 px horizontally | 3.46% | 3.58% | Still rejected |
| Crop translated +1 px vertically | 5.44% | 3.09% | Still rejected |
| JPEG quality 75 | 2.41% | 2.41% | Pass; existing path |
| Half-resolution photograph | 2.22% | 2.22% | Pass; existing path |

The horizontal variant's nearest color-retaining layout uses 5+3 cuts. Its fine-grid error remains 9.491%, above the unchanged cutoff, so the original protected 4+4 fallback is retained. The extra initialization costs time and its final error slightly worsens; this is recorded as a tradeoff, not a success. The vertical variant keeps the three-cut layout after the retry but still misses final acceptance by about 0.09 percentage points. Small perturbations remain an unresolved robustness requirement.

## Cropper experiment not adopted

The rejected-lobe retry was replayed through classification, fitting and independent export on all 31 real cases and twelve fixed synthetic diagnostic views. It adds one supported Stonehenge crop but no accepted pair with the old fitter: the real count remains five, and the synthetic count remains ten. All 24 collage crops still fail.

It also changes the cross's selected crop: an earlier supported pose displaces the later orientation used before. The cross remains accepted, but its disagreement rises from 0.939% to 1.148%. This demonstrates why preserving an already supported initial fit does not guarantee preservation of the complete orientation-search result. The retry is retained as diagnostic code and evidence, not shipped as a cropping improvement.

The retained fitter change works on fixed artwork regardless of how it was cropped. It does not enable the neural cropper or change the original real-photo benchmark's input geometry.

## Broader comparison

The [machine-readable evidence](feature-near-miss.json) records the paired corpus and perturbation runs, unchanged input hashes, crop experiments and exported artifacts. Fresh old/new runs both accept **24/31 complete photographs**, with no changed acceptance outcomes. Fifteen clipped and one obscured heart remain separately inventoried. Crops, masks and fitting probabilities match exactly. None of these existing cases needs the new retry; the new frozen-crop regression exercises it separately.

Wall-clock-limited fitting still gives slightly different errors on some unchanged paths. The largest increase is 0.081875 percentage points for the gift, which remains accepted. Those per-case differences remain in the evidence rather than being presented as identical reconstructions.

All **22 regular Hunodan designs** retain exactly the previous validated errors and pass the speed/quality checks. The slowest preparation-plus-solve/validation/export time is **9.007 seconds**. The change therefore preserves this benchmark's ten-second requirement; it does not establish that all real-photo interactions finish within ten seconds.

## Regression and reproduction

The new fixture records the source-photo checksums, crop coordinates and exact classified-mask/probability hashes. Its coordinates were generated before fitting and remain `needs_review`, not ground truth. One regression exercises rejection and recovery at the unchanged initialization cutoff. Another performs a fresh ten-second solve, independently renders the exports at 400 and 800 pixels, requires less than 3% original-mask disagreement at both scales, checks source features and paper/geometry validity, and confirms that the input arrays remain unchanged.

```sh
node --test --test-concurrency=1 scripts/inverse/feature-near-miss.test.mjs
node scripts/inverse/hard-photo-benchmark.mjs \
  --ids=flettede-stonehenge --crop=fixed --seconds=10 \
  --crop-overrides=tmp/heart-learning/foreground-locator-v1/retry-crop.json \
  --output=tmp/heart-learning/near-miss-replay
```

Raw before/after outputs, crop-model experiments and logs are preserved under `tmp/heart-learning/foreground-locator-v1/`.
