# Frozen foreground CNN experiment

The pretrained model improved synthetic paper segmentation, but this experiment **does not justify changing the application**. It produced no supported crops on the 31 real benchmark cases. The production algorithms and the previously established 24/31 checked-template result remain unchanged; this is not a new full solver benchmark claiming that rate.

The [machine-readable evidence](foreground-learning.json) records both runs, input and checkpoint hashes, all crop outcomes, and independent reconstruction scores. Local artifacts, model weights, probabilities and the comparison gallery are in `tmp/heart-learning/foreground-v1/`. The model is not exported to ONNX or loaded by the website.

## Training and selection

The new task predicts **all physical paper**, including both colors and both lobes, directly from RGB. It uses the existing MobileNetV3-Small encoder and dense decoder with one output channel: 880,449 parameters. The decoder's unused fourth input channel is always zero; no mask, crop corners, paper classifier or latent target is supplied to the network.

All 768 source masks were independently generated from the simulator's saved camera geometry. The Python loader verifies source checksums and every native foreground pixel, then reprojects geometry at the 256 × 256 network pixel centers. Labels are not recovered by thresholding the photograph. All views of an exact geometry remain together across both source datasets.

| Partition | Geometries | Photographic views |
| --- | ---: | ---: |
| Training | 102 | 408 |
| Development | 26 | 104 |
| Channel recipe holdout | 32 | 128 |
| Frame recipe holdout | 32 | 128 |

These are recipe holdouts, **not topology-disjoint or real-motif-family-disjoint splits**. No existing gallery, Hunodan or real-photo benchmark image enters training. Both initializations receive 20 epochs, 51 updates per epoch, the same training order and reflection decisions, AdamW settings and BCE-plus-Dice loss. The checkpoint is selected by development loss; the probability threshold stays fixed at 0.5. Exact MPS training determinism is not claimed.

The pretrained run uses the pinned TorchVision ImageNet1K V1 checkpoint, SHA-256 `047dcff4addef86ea5bc2eff13c9614dc11f47ab1160d0a71a25e7db994f4e1f`. This is the installed TorchVision checkpoint, not the separately researched timm LAMB weights.

| Initialization | Development IoU | Channel IoU | Frame IoU | Worst frame-view IoU |
| --- | ---: | ---: | ---: | ---: |
| Random | 97.65% | 98.04% | 97.97% | 73.82% |
| ImageNet | 98.85% | 98.88% | 98.87% | 95.57% |

Development loss selects the pretrained run (0.08259 versus 0.08876), independently of holdout and real-photo scores. The random model sometimes loses much of a dark sheet against a similar-colored background; pretraining substantially reduces this failure in synthetic images. The selected model's warm batch-one native forward plus CPU transfer takes about **9.4 ms**, excluding preprocessing. This is not a browser or complete cropper latency measurement. Training epochs took about 120 seconds for the pretrained run, excluding loading and final evaluation.

## Cropping and full reconstruction

Frozen probability images replace only the locator's foreground fields in an **offline adapter**. Two paper colors are estimated from high-confidence foreground RGB pixels; the existing shape optimizer, lower-edge refinement, orientation hypotheses, and palette support thresholds remain in force. The adapter has explicit tests for source-window coordinates, rejection of a one-color rectangle, and recovery of known physical corners.

All 31 complete real cases were evaluated for cropping. Only the seven previously unresolved real cases were selected for fitting; the other production proposals were not refitted in this experiment.

| Real-photo crop measure | Production | Learned foreground |
| --- | ---: | ---: |
| Editable proposals | 28/31 | 0/31 |
| Both lobes/lower edges pass the common support predicate | 8/31 | 0/31 |
| Proposals with every corner inside the photograph | 25/31 | 0/31 |

The distinction matters: the original red/white path can return a weak proposal with warnings, while the experimental palette path rejects insufficient support. **28 versus 0 is not a comparison of verified crops.** The common strong-outline diagnostic is 8 versus 0, and even that measures support against the estimated foreground, not known physical corners.

For the learned path's initial upright fits, 28 cases fail the combined lobe/lower-edge/color support gate, two cannot identify both lower edges, and one has no nondegenerate fit. Orientation retries also find no supported crop. Inspection of the actual probability maps reveals neighboring paper objects and handles, holes along internal motifs, and uncertain paper/background transitions. Several otherwise plausible fits miss a lobe outline by a few source pixels, enough to fail support. The synthetic silhouette IoU therefore does not establish sufficient precision on real photographs.

Twelve additional synthetic views were chosen by geometry identity, four each from development, channel and frame partitions. These are `v0` views, **not all 256 recipe-held-out photographs**. Each goes through production, learned-foreground and perfect-foreground controls. The perfect foreground is a labeled diagnostic, not an available model input. Camera labels and original canonical artwork score the results only after fitting/export.

| Synthetic pipeline measure | Production | Learned foreground | Perfect foreground |
| --- | ---: | ---: | ---: |
| Checked exported pairs | 11/12 | 11/12 | 11/12 |
| Largest corner error among those 11 pairs | 7.61 px | 4.38 px | 3.84 px |
| Mean disagreement with latent artwork among those 11 | 0.758% | 0.763% | 0.794% |
| Mean true overlap observed in those scores | 98.44% | 99.11% | 99.12% |

All pair checks include an independent replay of the exported curves, geometry/paper checks, source-feature fidelity and the unchanged 3% input-mask disagreement limit. The latent-artwork scores allow exchange of the two paper colors and are conditional on the observed overlap; cropped-away areas do not silently become correct pixels. Missing crops remain in the 12-case denominator.

The remaining view, `corner-lattice-1031319-v0`, clips the physical tip outside the source photograph. Production and perfect-foreground paths decline the crop. The learned silhouette instead supports a distorted proposal: its largest corner error is 20.2 px, only 90.83% of its crop has an observed true-overlap label, and fitting/export gives 4.40% disagreement with the classified input and 3.34% with observed latent artwork. The final pair is rejected. This is a case where a plausible neural shape can conceal missing evidence, not a successful recovery of the hidden tip.

## What this changes about the next experiment

Pretraining helps this synthetic task, but it does not close the domain gap. The training simulator contains isolated flat hearts; real inputs contain neighboring hearts, handles, shading, glare, clipping and imperfect paper shapes. Those differences are visible in the failures, although this experiment does not isolate their individual causal contributions. A useful next dataset needs reviewed real foreground/instance labels and controlled clutter, handle, glare and clipping variations. A region-selection cue may also be needed to distinguish the intended heart from neighboring paper.

Better foreground does not automatically improve the final motif. The perfect-foreground control tightens corners without lowering mean latent reconstruction error. RGB classification and fitting still need their own evaluation. No confidence gate was relaxed and no neural output was promoted to a legal cutting template.

## Reproduction

Run the two initializations **serially**, changing `--initialization` and the fresh output directory:

```sh
python3 scripts/inverse/learning/foreground-train.py \
  --dataset tmp/heart-training-synthetic/batch-v1 \
  --foreground tmp/heart-learning/real-edge-v1/foreground-batch \
  --dataset tmp/heart-training-synthetic/corner-lattice-v1 \
  --foreground tmp/heart-learning/real-edge-v1/foreground-corners \
  --initialization imagenet --output tmp/heart-learning/foreground-replay-training

python3 scripts/inverse/learning/foreground-export.py \
  --run tmp/heart-learning/foreground-v1/imagenet \
  --output tmp/heart-learning/foreground-replay-inputs

node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/foreground-replay-inputs \
  --output=tmp/heart-learning/foreground-replay-results \
  --solve-ids=synthetic,nested-squares,santa,bibel-star-outline,outline-star,crossed-ribbons,jigsaw,bauble

python3 scripts/inverse/learning/foreground-gallery.py \
  --probe tmp/heart-learning/foreground-replay-inputs \
  --replay tmp/heart-learning/foreground-replay-results \
  --output tmp/heart-learning/foreground-replay-gallery
```

The checked evidence verifies 537 referenced model, probability and replay artifacts. Raw training/replay reports, logs and the local gallery are retained. Original source datasets and photographs are unchanged. Open `tmp/heart-learning/foreground-v1/gallery-final/index.html` for this run's final gallery.

Validation passes **721 inverse tests, 855 application tests** (one existing skip), **38 offline Python tests**, lint and the build. Type checking has zero errors and seven existing warnings. Chromium loads all 43 gallery cases and 346 images without broken images or page errors, and opens the rebuilt paint page successfully. Three served core/locator modules match the tested source hashes.

The first browser check caught a stale dynamic entry in the long-running preview after the build; restarting the owned server resolved it. Visual review also caught opposite black/white conventions in the initial mask and woven previews. The final gallery uses dark paper A in both, with 62 display-only mask copies independently verified pixel-by-pixel. Original mask files, targets and reported errors are unchanged. Both corrections and the initial failure log remain recorded.
