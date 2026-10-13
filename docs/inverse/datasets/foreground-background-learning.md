# Foreground training: isolate and correct the background gap

Changing the synthetic training backgrounds recovers **six supported real-photo crops and five numerically accepted template pairs**, compared with zero from the original frozen foreground model. One is the previously unresolved blue outlined star. This is useful progress, but **the model remains offline**: every collage crop still fails, one synthetic crop regresses, and visual defects remain in some accepted reconstructions. The production application and its previously established 24/31 benchmark are unchanged.

The [machine-readable evidence](foreground-background-learning.json) verifies 1,110 referenced model, prediction and replay artifacts. Complete outputs and the 43-case gallery are under `tmp/heart-learning/foreground-refinement-v1/`. All source photographs, existing masks, split assignments and acceptance thresholds remain unchanged.

## Controlled diagnosis

The original simulator sampled each background base-color channel only between 65 and 165, and always used a striped or cloth texture. This omitted plain, white and black backgrounds, although many real inputs have white backgrounds.

Sixteen channel/frame views were selected by geometry identity, without consulting model scores. Each is rerendered with five background changes and an exact original baseline, giving 96 photographs. Camera geometry, paper colors, lighting, glare, crop, blur, compression and random draws remain fixed. All target PNGs remain byte-identical, and all original baseline images reproduce their stored hashes. The probe verifier checks 688 assets.

| Background | Original model: paper IoU | Augmented model: paper IoU |
| --- | ---: | ---: |
| Original texture/color | 98.96% | 98.51% |
| White, original texture | 75.25% | 97.79% |
| Black, original texture | 92.15% | 99.16% |
| Gray, original texture | 99.12% | 98.61% |
| Plain, original color | 94.21% | 98.52% |
| Plain white | 52.78% | 97.87% |

For plain white backgrounds, the original model incorrectly calls 36.15% of background pixels paper; the augmented model reduces this to 0.45%. On the paper interior, excluding an eight-pixel edge band, the mean RGB change is only 0.00020 on a 0–1 scale, while the original model's mean probability change is 0.0754. Blur and JPEG can affect neighboring paper pixels, so the photographs are not assumed pixel-identical inside the outline. Their measured small interior change supports a background-dependent failure rather than a change to the actual motif.

This establishes a specific synthetic domain gap. It does not establish that backgrounds explain all remaining real-photo failures.

## Training without changing the comparison budget

The same interventions were generated for all **408 original training views** from 102 geometry groups, adding 2,040 variant photographs. Neither development nor recipe-held-out views enter this augmentation. The loader checks source identity, baseline hashes, fixed geometry/camera, unchanged non-background parameters and the original global split. Attempts to import held-out views or modify other photographic parameters fail.

At each epoch, every original training view appears once, using either its original RGB or one of five variants. Variant sampling has an independent random stream, preserving the original view-order and reflection draws. The original and augmented models both use:

- The same ImageNet-initialized 880,449-parameter RGB-only foreground network and AdamW settings.
- 20 epochs, 51 updates per epoch, **1,020 optimizer updates total**.
- The same 104 development and 256 recipe-held-out views; no real-photo training.
- Checkpoint selection by original development loss and a fixed probability threshold of 0.5.

Both select epoch 20. Development IoU drops from 98.85% to 98.24%; channel/frame IoU drops from about 98.9% to about 98.4%. The augmented model's warm native forward plus CPU transfer takes about 9.1 ms, excluding preprocessing; browser inference is unmeasured. This is a single run of each training condition, not a multi-seed estimate. The recipe holdouts are not topology-disjoint.

## Full crop-to-template replay

Both frozen models receive the same 31 real photographs/regions and 12 synthetic diagnostic views. No known corners or cutting templates are supplied to the learned path. Every returned new proposal goes through classification, the unchanged ten-second fitter, geometry/paper checks, independent exported-curve rendering, source-feature retention and the 3% mask-error limit.

| Offline foreground method | Real supported crops | Real accepted pairs | Synthetic accepted pairs |
| --- | ---: | ---: | ---: |
| Original model | 0/31 | 0/31 | 11/12 |
| Original + bounded RGB refinement | 1/31 | 1/31 | 11/12 |
| Original + enclosed-hole filling | 0/31 | 0/31 | 11/12 |
| Background-augmented model | 6/31 | 5/31 | 10/12 |

The RGB experiment fits robust paper/background color models from confident neural seeds, then applies a bounded log-odds correction. It recovers only the curved star, which production already handles. Filling enclosed holes in the predicted foreground recovers no real crop. Neither is a substitute for correcting training coverage; both remain optional offline diagnostics.

All six augmented-model real proposals remain `needs_review`, with corners inside the photograph and the common outline-support predicate satisfied:

| Real motif | Independent mask disagreement | Fit time | Outcome |
| --- | ---: | ---: | --- |
| Eight-point star | 0.53% | 7.96 s | Numerically accepted |
| Curved star | 1.01% | 7.58 s | Numerically accepted |
| Blue outlined star | 1.51% | 9.37 s | Numerically accepted; previously no automatic crop |
| Cross | 0.94% | 5.88 s | Numerically accepted |
| Puppy | 1.85% | 9.31 s | Numerically accepted |
| Viking ship | 6.83% | 9.24 s | Rejected by the image-error limit |

Times above cover fitting/export, not inference, cropping and preparation; the JSON records their sum separately. These disagreements are against each photograph's classified crop, not original artwork or known cutting paths. The five accepted pairs are not five additions to production's existing count. Only the outlined star was among its seven unresolved cases, and the combined production-plus-neural system has not been implemented or benchmarked.

The production locator can retain weak editable proposals, whereas this neural palette adapter requires strong support before returning a crop. The earlier production reference returned 28 editable proposals but only eight strongly supported outlines. Comparing all 28 with these six as if they were verified physical corners would be misleading.

## Visual review and remaining failure patterns

All six returned real crops and reconstructed masks were inspected together. The outlined star is recognizably recovered, but short uneven seams remain around its joins. The puppy loses a tiny interior hole and has an extra narrow white separation near its lower body. The existing source-feature check excludes sufficiently small/thin regions; passing it does not establish complete topology or fidelity to the photograph. These are reasons to retain visual review rather than promote the five numerical passes as flawless designs. The Viking's larger silhouette and detail loss is correctly rejected.

All **24 collage crops** still fail support, along with Stonehenge. Initial rejected fits commonly have weak lobe outlines even when lower-edge support is high. Stonehenge's initial lobe supports are 0.25 and 0.86. Foreground predictions still respond to handles, neighboring paper and internal motifs. These observations identify remaining segmentation/instance and edge-localization problems, but do not isolate their individual causes. More real photographs help only after per-heart foreground/instance labels and evaluation grouping are reviewed.

On the twelve synthetic pipeline views, the augmented model declines the photograph with a clipped tip, avoiding the original model's distorted proposal. It also loses `frame-829086-v0`, which previously worked: lower-edge detection fails for its new foreground. The ten accepted pairs average 0.654% latent-artwork disagreement over 98.96% observed true overlap. The original eleven average 0.763% over 99.11%. **These averages have different survivor sets** and do not establish a reconstruction improvement. Both missing crops stay in the denominator.

The next useful experiments are controlled clutter/handle examples and reviewed real instance masks, with explicit small-feature/topology inspection after fitting. Background augmentation closes one measured gap; it does not resolve the complete pipeline or justify relaxing its geometry gates.

Restricting the comparison to the ten cases accepted by both models gives 0.782% disagreement for the original model and 0.654% for the augmented one. Six improve and four worsen. These still cover each crop's observed overlap rather than an identical set of canonical pixels; the JSON retains the coverage measurements and individual outcomes.

## Reproduction

The saved background selections are in the study directory. Generate the diagnostic and the two training-only supplements serially using `synthetic-intervention-probe.mjs --profile=background --selection=... --dataset=... --output=...`; verify each with `--verify=...`. Training source selections come from the original model's `splits.train.viewIds`, never from the diagnostic cases.

```sh
python3 scripts/inverse/learning/foreground-train.py \
  --dataset tmp/heart-training-synthetic/batch-v1 \
  --foreground tmp/heart-learning/real-edge-v1/foreground-batch \
  --dataset tmp/heart-training-synthetic/corner-lattice-v1 \
  --foreground tmp/heart-learning/real-edge-v1/foreground-corners \
  --training-probe tmp/heart-learning/foreground-refinement-v1/background-training/batch \
  --training-probe tmp/heart-learning/foreground-refinement-v1/background-training/corners \
  --initialization imagenet --output tmp/heart-learning/background-replay-model

python3 scripts/inverse/learning/foreground-interventions.py \
  --run tmp/heart-learning/background-replay-model \
  --probe tmp/heart-learning/foreground-refinement-v1/background-probe \
  --output tmp/heart-learning/background-replay-controls

python3 scripts/inverse/learning/foreground-export.py \
  --run tmp/heart-learning/background-replay-model \
  --output tmp/heart-learning/background-replay-inputs

node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/background-replay-inputs \
  --output=tmp/heart-learning/background-replay-results \
  --methods=learned --solve-ids=all

python3 scripts/inverse/learning/foreground-background-report.py \
  --study tmp/heart-learning/foreground-refinement-v1 \
  --baseline tmp/heart-learning/foreground-v1 \
  --output tmp/heart-learning/background-evidence-replay.json
```

The final command audits the preserved study, checks identical training budgets and replay input windows, verifies referenced artifacts and regenerates its committed evidence. It does not train or rewrite any inputs. Original model, failed refinements, augmented model, rejected outputs and complete logs remain available.

## Validation

The [validation record](foreground-background-validation.json) records successful serial runs of 726 inverse tests, 855 application tests (one existing skip), 41 offline Python tests, lint and the build. Type checking has zero errors and seven existing warnings. The background tests preserve legacy generator hashes and exact geometry labels; training-import tests reject held-out data and changed camera or non-background parameters. Foreground-refinement tests cover bounded updates, insufficient seeds and preservation of exterior-connected gaps.

Chromium loads all 43 gallery cases and 177 images without broken images or page errors. All 16 display-only inverted masks were independently checked pixel-by-pixel; source masks and scores are unchanged. After restarting the owned preview following the build, the paint page renders successfully and three served core/locator modules match their source hashes. The local preview is at `http://127.0.0.1:5232/editor/mal/`.
