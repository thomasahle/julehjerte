# Spatial paper colors and recovery from a crossing trace

The spatial color model remains experimental. It improves many controlled glare images, but introduces photographic texture and border defects on some real hearts. The production change from this investigation is in routing: stop repeating a proven bad local trace, then try another trace within the existing budget. The normal photo classifier and crop coordinates are unchanged.

## Controlled color experiment

The experiment uses 24 selected views from three synthetic design families, each with its ordinary appearance and three fixed glare interventions: 96 views in total. Camera geometry, crop coordinates, paper labels and design geometry remain fixed. These are paired interventions on a small development set, not 96 independent designs or a held-out estimate of generalization. Predictions are saved before the material labels are read for evaluation.

The candidate estimates smooth local RGB color fields for the two papers. It starts with the ordinary classifier, fits color fields from eroded class interiors on a coarse grid with a global-color prior, reclassifies, and iterates. A 7% inset excludes the outer border from field fitting. It interpolates the color fields to the original resolution and classifies the original RGB pixels; it does not enlarge a coarse binary mask. The JavaScript implementation is `static/inverse/core/spatial-color.js` and is not imported by the automatic pipeline.

| Appearance | Ordinary classifier, mean error | Spatial fields, mean error | Improvements / regressions greater than 0.1 percentage point |
| --- | ---: | ---: | ---: |
| Original | 0.513% | 0.379% | 8 / 0 |
| Mild glare | 5.103% | 1.701% | 23 / 1 |
| Offset strong glare | 17.015% | 11.190% | 20 / 2 |
| Centered strong glare | 18.778% | 12.470% | 16 / 6 |

Errors compare predicted paper membership to fixed synthetic material labels within the known overlap, with a global phase flip permitted for scoring. The worst offset-glare result still has 42.06% error; the worst centered-glare result has 38.30%. Other tested bandwidths and a multiscale variant remain in the raw report. The selected single-bandwidth variant is a development choice, not a demonstrated optimum.

Unit tests cover pure-color boundaries, one-pixel strips, controlled glare, invariance of the interior to an outer-border color change with fixed initial classes, and malformed/single-class inputs. The Python and JavaScript predictions agree pixel-for-pixel across the 96 selected views; the final-source replay and timings are recorded in the companion JSON.

## Real photographs prevent enabling this by default

A separate pass holds 22 Hunodan crops and four collage crops fixed. It fits the new masks from fresh initialization, without reference cutting paths. Before the routing fix, 20 of the 22 Hunodan fits passed the full checks. The changed anchor and `hjsta-05` failed. These real photographs do not have registered true paper labels; disagreement with a new classified mask cannot establish reconstruction accuracy by itself.

| Collage crop | Ordinary mask: checked / own-mask error | Spatial mask: checked / own-mask error | Spatial fit versus unchanged ordinary mask |
| --- | --- | --- | ---: |
| Outline star | Yes / 2.303% | Yes / 1.847% | 1.916% |
| Flower | Yes / 0.450% | Yes / 1.153% | 1.324% |
| Jigsaw | Yes / 2.920% | No / 2.399% | 3.184% |
| Bauble | No / 3.856% | Yes / 2.517% | 3.876% |

The jigsaw loses required source features despite an error below 3%. The bauble's improved score against its changed mask is not evidence of improved agreement with the artwork: it disagrees with the unchanged mask slightly more. Visual comparisons also show added texture and altered borders on metallic paper. The experimental color model therefore remains outside the user-facing automatic path.

## Root cause and production fix

The changed anchor mask differs from its ordinary counterpart in **0.8585% of pixels**, with exactly the same crop. At 337 × 337, the earlier solver used almost its full 10-second budget and returned an unchecked four-cut pair with **4.0812% independently rendered disagreement**, missing the small enclosed feature.

The first trace was infeasible. A second, slightly smoother trace contained an intrinsically self-crossing required cubic. Choosing more optional hidden connections could not repair that cubic. The old fallback rejected complete template pairs, allowing unrelated cut changes to present the same local defect repeatedly and consume the remaining budget.

The fix has three parts:

1. For a failed path, identify a short directed edge chain containing the crossing and exclude that chain from the MILP. Include the preceding curve so that the witness retains the actual joined endpoint. Preserve direction: reversed adaptive flattening and inexact joins can differ, so a reverse traversal must be evaluated independently.
2. Before solving, reject an intrinsically self-crossing required curve when both traversal directions cross and all incident endpoint joins are exact. This is a contradiction in the current graph, not a proof that the artwork is impossible. Inexact joins retain the ordinary path validation.
3. After exhausted crossing traces, try one additional smoother initialization if the existing recovery budget permits. A timeout alone never triggers this retry. Image, feature, geometric and paper checks are unchanged, and the original mask is never edited.

The final-source 337-pixel replay passes with four cuts per sheet and **2.0904% independent disagreement**, taking about **5.80 seconds**. A committed regression checks the same pixels, the actual exhausted-trace path, all acceptance gates, the exported renderer, and source-mask immutability. Separate small geometric tests cover reflection, reversed edge storage, clean adjacent corners, inexact joins, suppression of invalid incumbents, and skipping futile connector expansion.

Paint normally resamples imports to 400 × 400. The browser test uploads the original 337-pixel mask, verifies the resized mask against an independently computed nearest-neighbor hash, runs the real worker, opens the editable result, and checks exported SVG geometry and PDF download. It must not be described as an exact replay of the 337-pixel trace defect. The successful browser run reports **1.0119% editable disagreement** and **4.34 seconds from Find to ready**. Screenshots and exports are retained locally.

## Verification and reproduction

The 22-design Hunodan run passes all existing quality and speed criteria, with a maximum of 9.23 seconds and exactly the same independently rendered errors as the previous run. Check and lint pass; the application suite passes 855 tests with one existing skip, the inverse suite passes 698 tests, and the production build succeeds. Type checking reports zero errors and seven existing warnings. All five selected browser cases pass after correcting the anchor resampling assertion.

Machine-readable evidence is in [spatial-paper-colors.json](spatial-paper-colors.json). Raw predictions, fixed inputs, rejected experiments, code snapshots, benchmark reports, screenshots and logs are under `tmp/heart-learning/spatial-colors-v1/`. The 337-pixel mask and provenance are committed under `scripts/inverse/fixtures/photographic-anchor-perturbation.*`.

```sh
node --test --test-concurrency=1 scripts/inverse/self-intersections.test.mjs scripts/inverse/anchor-perturbation.test.mjs
INVERSE_SPEED_OUT=tmp/spatial-routing-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_TEST_BROWSERS=chromium INVERSE_TEST_CASES=anchor-spatial-mask,flower-native-mask,star,top-hat-preferred,hard-flettede-puppy-half node scripts/inverse/paint-browser-test.mjs
```

The browser harness needs Playwright and the local production preview. `PLAYWRIGHT_MODULE` can point to the existing workspace installation; no new package installation is needed. Timing evidence is specific to this machine and serial run. Passing numerical geometry/paper checks is not a physical assembly test.
