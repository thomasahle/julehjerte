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

Count initialization can now return its already computed alternatives without changing any ordinary winner, order or searched hypothesis. Feature initialization uses these alternatives only after its existing ordinary seeds and near-miss retry fail. It filters them against the original image and source-region checks, then gives the best remaining start one bounded, 150-step grid refinement. The original 9% initialization cutoff and final 3% error cap remain unchanged.

On this input, the former five-plus-three near-miss retry still fails. The retained three-plus-three alternative improves from 9.1156% to **8.5678%** and enters the ordinary curve stages. The fresh ten-second photo-engine replay exports a checked pair at **2.4663%** independent mask disagreement, down from **3.5819%**. Solve, validation and export take **7.913 seconds** in that run. The crop, classified pixels and probabilities match the baseline exactly; no cutting template enters this replay.

The regression checks both the useful discarded start and a fresh solve from the original photograph. It independently renders the exported curves at 400 and 800 pixels, checks source features, geometry and nominal paper support, and confirms that the source arrays remain unchanged. Count-search coverage also verifies that retaining alternatives leaves ordinary winners unchanged. The first ten targeted tests passed.

The implementation is committed in `dbe3654`. Broader dataset and browser results will be recorded after their runs finish.

## A separate paper-resolution experiment

The vertical one-pixel crop shift retains three cuts but encounters repeated uncertain paper checkpoints. A diagnostic continued the saved fitted curves for 160 steps, comparing 360- and 700-cell material lattices and 256- and 400-pixel image objectives. Changing material resolution also changes the optimizer's conservative fitting margin, so this is not an isolated test of the validator.

None of those continuations passed the 3% image cap. The best checked vertical continuation reached 3.0313%; the horizontal continuation stayed above 3.3%, with its lower-error proposals paper-uncertain. Finer checks alone therefore did not resolve either failure. This diagnostic change is not part of the production fitter.

The horizontal repair still has rounded sun rays and border deviations. The vertical crop shift remains rejected at approximately 3.09% in the fresh short-budget replay. Numerical acceptance is agreement with an estimated photographic mask, not proof of recovery of the original artwork or a physical assembly test.

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
```

The last command is explicitly a continuation of saved image-derived fits. It cannot establish fresh solve latency or initialization success. Raw probes, continuations, fresh benchmarks and logs are retained under `tmp/heart-learning/near-miss-paper-v1/`.
