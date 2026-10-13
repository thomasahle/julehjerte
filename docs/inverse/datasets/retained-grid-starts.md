# Reusing an existing layout before adding cuts

The [near-miss refinement](feature-near-miss.md) still rejected the Stonehenge photograph when its frozen crop moved one source pixel horizontally. The next investigation found a separate cause: a useful three-cut layout had already been computed, then discarded before source-feature checks could see it.

## Diagnosis

For each cut-count and color-phase hypothesis, initialization compares uniform, border-informed and separable starts. The feature-weighted search kept only the lowest weighted mean error from these choices. In the shifted crop, that winner retained **48.6%** of the small opening, below the unchanged 60% region-retention requirement. Another already computed three-cut start retained **66.2%**, but its weighted error was slightly higher:

| Three-cut start | Weighted initialization error | Original image error | Opening retained |
| --- | ---: | ---: | ---: |
| Previously selected | 10.2828% | 8.1955% | 48.6% |
| Previously discarded | 10.2886% | 9.1156% | 66.2% |

The weighted mean is not equivalent to the per-region gate. A slightly better mean can lose the very opening that prompted feature-aware initialization. The discarded layout also needs refinement before it meets the ordinary 9% coarse cutoff; keeping it is a proposal, not a success certificate.

## Change

Count initialization can now return its already computed alternatives without changing any ordinary winner, order or searched hypothesis. Feature initialization uses alternative shapes at the **original cut counts** only after its existing ordinary seeds and near-miss retry fail. It filters them against the original image and source-region checks, then gives the best remaining start one bounded, 150-step grid refinement. The original 9% initialization cutoff and final 3% error cap remain unchanged.

On this input, the former five-plus-three near-miss retry still fails. The retained three-plus-three alternative improves from 9.1156% to **8.5678%** and enters the ordinary curve stages. The final guarded implementation's fresh ten-second photo-engine replay exports a checked pair at **2.4663%** independent mask disagreement, down from **3.5819%**. Solve, validation and export take **7.786 seconds** in that run. The crop, classified pixels and probabilities match the baseline exactly; no cutting template enters this replay.

The regression checks both the useful discarded start and a fresh solve from the original photograph. It independently renders the exported curves at 400 and 800 pixels, checks source features, geometry and nominal paper support, and confirms that the source arrays remain unchanged. Count-search coverage also verifies that retaining alternatives leaves ordinary winners unchanged. The first ten targeted tests passed.

The first implementation, `dbe3654`, also tried discarded starts at other counts. The full inverse suite exposed a real regression: an unequal three-plus-four seed displaced the half-resolution puppy's working finer-spline route and then lost its opening during curve refinement. A separate probe continued past the first route assertion and confirmed failed final feature checks, despite low aggregate image error. The correction, `a8b8a73`, limits this fallback to the original count pair and retains the existing puppy regression unchanged, with an explicit check against that displacement. Both the Stonehenge and puppy regressions passed after the correction.

## Broader photo replay

The final implementation retains **24/31** accepted complete photographs, with no changed pass/fail outcomes. The 15 clipped and one obscured photograph remain separately inventoried. All input-photo, crop, mask and probability checks match the baseline. None of these original cases uses the new fallback; the frozen crop-shift regression exercises it separately.

The wall-clock-bounded fits do not export identical curves in every replay. The largest observed image-error increase is 0.2425 percentage points for the floral checker, which remains accepted. Per-case scores are retained in the evidence rather than treated as identical reconstructions.

| Frozen-crop perturbation | Before disagreement | After disagreement | Outcome |
| --- | ---: | ---: | --- |
| Horizontal +1 source pixel | 3.5819% | 2.4663% | Newly accepted |
| Vertical +1 source pixel | 3.0931% | 3.0931% | Still rejected |
| JPEG quality 75 | 2.4131% | 2.4131% | Accepted; existing path |
| Half-resolution photograph | 2.2185% | 2.2185% | Accepted; existing path |

All **22 regular Hunodan designs** retain exactly their previous independent errors. Every speed/quality check passes; the slowest preparation-plus-solve/validation/export time is **8.711 seconds**.

## Application and export checks

The corrected code passes **731 inverse tests**, **855 Vitest tests**, type checks, lint and build. Vitest retains one existing skipped test; type checks report zero errors and seven existing warnings. The earlier failed full run and the diagnostic confirming the puppy regression are retained alongside the successful rerun.

Five Chromium flows pass through the actual worker, Open in Draw, and SVG/PDF downloads without browser errors. Their downloaded SVGs pass the independent geometry, paper-support and applicable source-feature checks.

| Browser flow | Exported SVG disagreement with source mask | Click to result ready |
| --- | ---: | ---: |
| Horizontal crop-shift mask | 2.4394% | 9.084 s |
| Original fixed-crop mask | 2.6600% | 9.077 s |
| Bird mask | 2.5188% | 12.612 s |
| Half-resolution puppy photo upload | 0.9150% | 21.952 s |
| Hat | 0.1575% | 2.106 s |

The shifted mask exercises the worker's retained-start fallback. The puppy browser flow uses automatic cropping and a 400-pixel prepared mask; it supplements the separate frozen-crop, 390-pixel regression that exposed the rejected proposal. Those inputs and scores are not interchangeable.

These browser runs use the UI's 180-second allowance. The bird and puppy interactions exceed ten seconds; the native Hunodan guarantee is not a claim about every browser input. Conversion to editable SVG adds zero measured weave drift at 400 pixels in every case. At 800 pixels, the puppy differs by three pixels out of 640,000; the other four have zero measured drift. Source-resolution disagreement does not increase during conversion.

All five result screenshots and the shifted result in Draw were inspected. Rounded sun rays and uneven photograph borders remain visible. All 62 browser-recorded workspace hashes and 22 harness hashes match the final source; all 50 served static modules/assets also match. The preview is running at `http://127.0.0.1:5232/editor/mal/`.

## A separate paper-resolution experiment

The vertical one-pixel crop shift retains three cuts but encounters repeated uncertain paper checkpoints. A diagnostic continued the saved fitted curves for 160 steps, comparing 360- and 700-cell material lattices and 256- and 400-pixel image objectives. Changing material resolution also changes the optimizer's conservative fitting margin, so this is not an isolated test of the validator.

None of those continuations passed the 3% image cap. The best checked vertical continuation reached 3.0313%; the horizontal continuation stayed above 3.3%, with its lower-error proposals paper-uncertain. Finer checks alone therefore did not resolve either failure. This diagnostic change is not part of the production fitter.

The horizontal repair still has rounded sun rays and border deviations. The vertical crop shift remains rejected at approximately 3.09% in the fresh short-budget replay. Numerical acceptance is agreement with an estimated photographic mask, not proof of recovery of the original artwork or a physical assembly test.

## Does the vertical crop admit an acceptable fit?

A separate diagnostic replays the fitter's three saved outputs against all three nearby crops without moving any geometry. Every off-diagonal comparison fails the image limit, so simply reusing another crop's coordinates is insufficient.

Next, each saved geometry receives the same 160-step continuation against the **unchanged vertical-crop target**. Starting from the original crop's fitted geometry reaches **2.8644%** disagreement at 400 pixels and **2.9305%** at 800 pixels, with source-feature, geometry and paper checks passing. Starting from the horizontal or vertical fit remains above 3% at both resolutions.

This supplies a checked example within the existing limits for that mask. It supports investigating the starting shape, curve routing and parameterization; all starts have three cuts per sheet, but their fitted shapes and segment counts differ. It does not prove the crop is physically correct or that a fresh solver can discover that example within ten seconds. The diagnostic uses saved image-derived fits, before the normal final cleanup, and is **not** a production warm start or an additional benchmark success. The three resulting geometries reproduce byte-for-byte from the tracked study scripts; adding the finer renderer audit leaves them unchanged.

The [machine-readable evidence](retained-grid-starts.json) preserves the paired inputs and scores, rejected first proposal, final test results, browser checks and these continuation controls. The local artifact manifest records checksums for the raw reports and generated files.

## Reproduction

```sh
node --test --test-concurrency=1 \
  scripts/inverse/count-strategy.test.mjs \
  scripts/inverse/feature-near-miss.test.mjs

node scripts/inverse/hard-photo-benchmark.mjs \
  --ids=flettede-stonehenge --crop=fixed --seconds=10 \
  --crop-overrides=tmp/heart-learning/foreground-locator-v1/retry-crop.json \
  --perturb=true --variants=crop-x-plus-1,crop-y-plus-1 \
  --output=tmp/heart-learning/retained-start-replay

node scripts/inverse/near-miss-paper-study.mjs

node scripts/inverse/crop-transfer-study.mjs
node scripts/inverse/crop-transfer-refinement-study.mjs
```

The paper and crop-transfer studies use saved image-derived fits. They cannot establish fresh solve latency or initialization success. Raw probes, continuations, fresh benchmarks and logs are retained under `tmp/heart-learning/near-miss-paper-v1/`.
