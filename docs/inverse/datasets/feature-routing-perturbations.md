# A retained eye can still have the wrong cutting topology

A one-pixel horizontal translation of the bird crop retains the white eye in the input mask, yet the ten-second fitter still fails its feature check. This study isolates a routing failure: a local refinement proposal closes the eye by making one slit cross itself. The validator rejects that proposal and returns an earlier, geometrically valid candidate whose eye remains connected to the background.

There is **no additional reconstruction success to report from these experiments**. None of the experimental changes below is enabled in production. Commit `cb2790e` improves diagnostics by retaining every local-detail attempt and its rejected geometry checkpoints. It leaves initialization, optimization objectives and acceptance rules unchanged.

## Frozen inputs and the failing trajectory

The study starts at `8fea32d`, using the existing photographic bird fixture. The detector is not rerun: the recorded quadrilateral is translated one source-image pixel horizontally or vertically before the unchanged classifier runs. Each variant keeps its own resulting mask as the final reference.

For the horizontal shift, the mask SHA-256 is `bc122e4659773ece5abab69eae4934c528c8eba8feda8c0aa92d5e6ba86afe91`. Its eye occupies **3.3125 mm²** on the nominal 100 mm square, remains fully enclosed in the source, and exceeds the existing feature threshold. This case therefore cannot be explained by the eye disappearing during classification.

The original crop selects a feature-preserving five-cut initialization with phase +1. The horizontal shift selects five cuts with phase −1. These are different optimization starts, not an instruction to invert the photograph. The latter retains eye pixels but routes a white channel to the surrounding background.

A captured local-detail replay runs all **160 steps**. At step 40, its source disagreement is **2.556%** and the eye is closed, but sheet A's second slit crosses itself. The same checkpoint also violates short self-clearance. Its eye component IoU is approximately **0.481**, so even its enclosed shape is inflated. Later checkpoints remain invalid. The valid incumbent still has an open eye; the final feature check correctly rejects it despite less than 3% global disagreement.

The earlier report exposed only the most recent `featureDetail` attempt. That field alone could not establish whether the search lacked time or had already spent a full attempt on an unsuitable shape. The new `featureDetailAttempts` list records counts, phase, seed, actual paper resolution, elapsed time and geometry/paper results for every checkpoint of each attempt. Rejected checkpoints remain diagnostic data; they are not promoted to usable templates.

The new diagnostic replay confirms the original bird still passes, while the horizontal shift receives 160 detail steps and records four rejected geometry checkpoints. Source mask bytes remain unchanged in both cases.

## Initialization experiments

All these experiments create proposals from the same source pixels. They do not supply saved templates or change final acceptance thresholds.

| Experiment | Work performed | Observation |
| --- | --- | --- |
| Alternate sheet update orientation | 24 starts across three inputs, using normal and transposed initialization | No starting grid produced a compact, faithful enclosed eye. |
| Row-DP sampling resolution | 72 starts at 64, 80, 96, 112, 128 and 160 pixels | Colour-retaining alternatives exist, but their eye regions remain open. |
| Deterministic perturbed grids | 192 starts, 16 seeds at each of two log-gap amplitudes and both phases | More colour-retaining alternatives, without a faithful enclosed eye. |
| Surrounding-colour emphasis | Fifteen initializer runs with 0–2 mm halos around small interior features | Most added halos eliminate all eligible seeds; surviving starts still have open eyes. |
| Protect every source feature during initialization | Six runs, with and without a 1 mm halo | No eligible seeds under the existing retention and error filters. |

These are **seed-level** measurements. They do not prove that every alternative would fail after full refinement. In particular, the successful unshifted seed also starts with an open eye. Consequently, requiring enclosure of every coarse seed would discard a known useful route. The experiments do not justify replacing that route or selecting a new default sampling resolution.

For this comparison, a faithful enclosed eye has no connection to the image border and a component IoU above 0.8 against the source eye. This is a diagnostic criterion for the experiment, not a new production acceptance threshold.

## The optimizer and validator do not enforce identical local constraints

The existing free-curve separation penalty excludes same-slit neighbourhoods up to `localNeighborhoodFactor × nominalWidth`. The independent validator additionally rejects certain short returns inside that exclusion: non-adjacent cubics whose nearest approach is less than 1.5 mm apart on a 100 mm square, with suitable arc separation and endpoint exclusions.

A prototype adds a sampled soft penalty for these short returns. On the captured horizontal-shift detail seed, a stronger penalty obtains valid checkpoints at steps 40 and 80, where the ordinary trajectory was already invalid. Its selected independent image disagreement falls to **2.377%**, but the eye remains open; later checkpoints still fail geometry checks. The unshifted bird's selected image stays unchanged in these local replays.

This is useful evidence of an objective/validation mismatch, not a completed fix. The sampled penalty is not an exact barrier or a proof of equivalence to the validator. It remains experimental because it does not recover the missing feature, and it has not earned promotion through the full corpus.

## Direct fitting followed by MILP rerouting

The rejected, closed-eye geometry supplies a possible boundary proposal without revisiting the photograph. Its original-image error is 2.556%; only path assignment would need to change initially. This tests a direct-fit → MILP → direct-refinement route while retaining the original mask as the acceptance reference.

The existing topology initializer expands the 140 input cubics into **542 visible edges and 663 hidden candidates**, including 192 guide portals. The resulting MILP has **7,230 binary variables and 60,697 constraints**. Fresh three- and ten-second attempts both reach their time limit without a validated pair. That is not a proof of infeasibility.

Retracing the predicted image at tolerance 0.5 reduces the input outline to 151 segments and keeps original-image disagreement at 2.853%. However, the graph adds 1,184 hidden candidates and produces **8,616 binary variables and 110,480 constraints**—larger than the first model. Its five-second attempt also times out. A finer trace exceeds the initializer's segment guard; the coarser traces exceed the unchanged 3% image gate.

One initial ten-second retry accidentally reused the boundary object mutated by graph construction. It was rejected before search because that object already contained 542 segments. That attempt is retained in `reroute/results.json` but excluded from the comparison; `reroute-clean/results.json` is the fresh ten-second replay. This avoids presenting a mutated-input early rejection as an independent MILP failure.

The next routing experiment should therefore constrain graph growth—for example, a small probe without inferred grid portals or a local rerouting problem around the failed feature. Merely reducing the number of visible curves is not enough. Neither proposed change is implemented by this study.

## Verification and artifacts

The [machine-readable report](feature-routing-perturbations.json) records source hashes, all experiment summaries, rejected-attempt provenance and verification results. The local directory `tmp/heart-learning/feature-perturbations-v1/` retains instrumented source copies, full seed coordinates, checkpoint diagnostics, exported debug curves and independent images. Invalid proposals are explicitly research artifacts.

The actual cropped-mask replay uses the ordinary production fitter after the reporting change. It verifies mask hashes, unchanged source pixels, paper-resolution reporting and preservation of rejected checkpoint evidence. The earlier complete hard-photo benchmark remains **24/31**; this study does not claim another corpus improvement.

All required verification completed successfully: type checking reports zero errors and seven existing warnings, lint passes, **855 application tests pass with one existing skip**, all **699 inverse tests pass**, and the production build succeeds. All **22 regular Hunodan cases pass**, with exactly unchanged image errors against the preceding run and a maximum measured solver time of **9.080 seconds**.

The Chromium bird-mask replay passes the ordinary import, worker, editable-template and PDF checks, with no page errors. It reaches an editable result in **25.215 seconds**, with **2.455%** independent editable-template disagreement. This uses the ordinary 180-second allowance, not the ten-second benchmark setting. Its exported solver report retains one complete 160-step detail attempt and all checkpoints. Visual review confirms the small eye remains visible; the result still follows irregular photographic boundaries around the frame.

The preview was restarted after building at `http://127.0.0.1:5232/`. Both advertised entry modules return HTTP 200, and the served fitter bytes match the committed source exactly. Verification logs, browser screenshots, exported templates and report hashes are included in the local artifact inventory.

The [subsequent fitted-boundary rerouting study](fitted-boundary-rerouting.md) implements the smaller-graph experiment suggested here. It recovers the horizontal-shift case and also identifies and fixes a separate long-budget initialization problem found by browser QA. The failed experiments and unresolved results above remain historical evidence.
