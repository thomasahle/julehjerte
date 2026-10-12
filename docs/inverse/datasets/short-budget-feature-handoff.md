# Reserving short-search time for small enclosed features

The bird photograph exposed a scheduling failure after successful classification: its source mask contains a small white eye, but the ten-second fitter discarded it. Commit `6310e07` lets a promising coarse grid reach local shape refinement before the search budget runs out. The ordinary mask-error, enclosure, geometry and paper-core acceptance checks remain unchanged.

The paired frozen-crop replay improves independent exported-template disagreement from **5.708% to 2.470%**, closes the eye, and passes the existing checks in **9.435 seconds**. This measures agreement with an estimated photographic mask, not unavailable original cutting paths. Visual inspection still shows uneven borders and thin seams; this is not an exact reconstruction or a physical assembly test.

## Cause and change

The ordinary four-cut initialization loses the eye. Existing feature-aware initialization proposes five cuts per sheet and retains the eye's white pixels, but those pixels initially remain connected to the background. The early scheduler required enclosure before allowing this grid to refine. It instead spent most of the short budget on unsuccessful traced routing.

Merely accepting the colour-retaining seed reduces image error but leaves the false channel. The existing local-detail stage can close it, but its previous time reserve often prevents it from running. A first scheduling prototype also depended on where the broad refinement happened to stop at its wall-clock deadline; the new regression failed once before this was corrected.

For searches of at most ten seconds, the fitter now:

1. Lets a coarse feature seed earn refinement by retaining each protected region's colour, even if a small opening still needs closure. Ordinary initializations remain available.
2. Uses the existing short routing probe for this case, reserving time for curves.
3. Hands off from broad refinement at a geometry- and paper-checked checkpoint that meets the **original unweighted** image-error cap and colour-retention check.
4. Gives the existing bounded local-detail stage a larger update rate and a shorter finalization reserve. Its proposal must still pass the final enclosure and physical checks.

The continuous path and the final result have different eligibility requirements: an open coarse eye can be worth improving, while an open final eye is still rejected. Neither the source mask nor the final acceptance thresholds are edited. Longer searches retain their previous initialization eligibility, detail rate, reserve and stopping policy.

## Controlled perturbations

Both implementations receive the same mask bytes for each variant. The baseline is `52b70b9`; the new fitter is `6310e07`. Crop shifts transfer the recorded quadrilateral by one source-image pixel; the detector is not rerun. JPEG and half-resolution variants are generated before classification. Each exported template is independently rendered at 400 pixels.

| Input | Before disagreement | After disagreement | After checks | Eye observation |
| --- | ---: | ---: | --- | --- |
| Original | 5.708% | 2.470% | Pass | Enclosed; component IoU 0.912 |
| Crop translated +1 px horizontally | 7.109% | 2.934% | Fail | Still connected to background |
| Crop translated +1 px vertically | 2.817% | 2.686% | Fail | Enclosed but enlarged; a bottom feature loses colour |
| JPEG quality 75 | 5.258% | 1.718% | Pass | Enclosed; component IoU 0.970 |
| Half-resolution source | 1.565% | 1.565% | Pass with existing size filter | Both omit the visible eye |

The last row is **not** an eye-retention success. Its classified eye shrinks from 3.4375 to 0.75 mm² on the nominal 100 mm square, below the unchanged minimum feature-area gate. A separate component diagnostic, without that gate, measures zero eye retention for both outputs. Its pixels still count toward the whole-image error. This demonstrates a remaining classification/feature-selection limitation, distinct from refinement scheduling.

The horizontal crop shift preserves every source-eye pixel but joins them to the background; the unchanged enclosure check catches this. The vertical shift retains and encloses the eye, but its component IoU is only 0.552 and a small bottom region retains 54.7% of its colour, below the existing 60% requirement. Neither is reported as a successful fit. Improved average error alone does not establish robustness to crop perturbations.

## Rejected approaches and regression history

All prototypes and exported outputs remain under `tmp/heart-learning/hard-photo-followup-v1/`:

- Trying finer feature seeds whenever coarse seeds lacked enclosure still failed at 5.516% disagreement. No change to the feature-seed generator was retained.
- Scheduling the colour-retaining coarse seed alone reached 2.681%, but left the eye open.
- Shortening the detail reserve or the routing probe alone, or both with the old detail rate, also left the eye open.
- Intermediate-rate or enclosure-preferred local refinement produced enclosed checkpoints with uncertain paper-core results; they were not accepted.
- The larger local rate first produced a checked prototype at 2.377%, but a targeted regression subsequently exposed timing sensitivity. The final checkpoint-based handoff produces different geometry and is measured separately above.

The initial targeted run had **21 passes and one failure**. After the handoff fix, the isolated new short-search regression passed. The regression independently renders the exported geometry at both 400 and 800 pixels, requires less than 3% original-mask disagreement, an enclosed eye with component IoU above 0.8, unchanged source bytes, valid geometry and passing paper checks. The solver's time must remain below ten seconds; rendering and the test harness make the full test process longer.

## Remaining pipeline failures

The full-pipeline replay improves from **23/31 to 24/31** accepted complete cases, with the bird as the only newly accepted case and no lost passes. Exact crop coordinates, fitting masks and probability hashes match between runs. The inventory also retains 15 clipped and one obscured heart. Missing crop proposals for `nested-squares`, `santa` and `bibel-star-outline` remain failures in the denominator.

Other mask errors fluctuate in these wall-clock-bounded searches. Two previously passing cases have slightly higher error: fine checkerboard rises by 0.0325 percentage points and crown by 0.005625 points. Both remain below 3%. Their selected route uses neither feature detail nor the new early-seed handoff. The bauble's error falls from 9.296% to 6.763%, but its early feature seed still is not scheduled and it remains rejected. These differences are retained in the report rather than attributed to the new feature path.

The other rejected inputs show different problems: `outline-star` loses a tiny fragment near the crop border despite low global error; `jigsaw` has a distorted proposal; `crossed-ribbons` and `bauble` extend their proposed bottom corner outside the photograph, and the latter also loses coloured frame regions during classification. All five pre-change rejected fits, including the bird, lack full lobe-outline support. That diagnostic does not prove their corners wrong, but a good mask fit cannot certify the crop geometry.

This change targets the demonstrable fitting failure where the mask already contains the bird eye. It does not resolve those crop and classification failures, nor certify any disputed corners.

## Final verification

All **22 regular Hunodan cases** pass the speed and quality checks. Maximum measured solving and validation time is **9.005 seconds**, and every error is exactly equal to the preceding `spatial-colors-v1/hunodan-final` run.

Type checking reports zero errors and seven existing warnings in two files. Lint, **855 application tests** (one existing skip), **699 inverse tests**, and the production build pass. The full inverse suite includes the new short-search bird regression.

All five Chromium Paint-to-Draw replays pass with no page errors:

| Case | Click to ready | Independent editable-template error |
| --- | ---: | ---: |
| Bird mask | 24.97 s | 2.455% |
| Star | 2.02 s | 0.160% |
| Hat with matching-sheet preference | 7.96 s | 0.412% |
| Flower native mask | 7.69 s | 0.562% |
| Half-resolution puppy photograph | 22.31 s | 0.915% |

These browser cases use the normal 180-second allowance, not the short-search setting. Their editable-template results and UI timings are distinct from the ten-second engine comparisons.

The first browser attempt failed to load the newly built entry modules because the existing preview server retained the previous build's asset inventory. Its logs and results remain under `browser/`. Restarting the owned server on port 5232 restored those modules; all five cases were rerun into `browser-final/` without an application-code change. An HTTP byte/hash check confirms the served fitter matches commit `6310e07`.

## Evidence and reproduction

The [machine-readable comparison](short-budget-feature-handoff.json) records final corpus comparisons, prototype outcomes, input hashes, perturbation measurements and verification logs. Raw crops, masks, exported SVGs and independent renders remain in the ignored experiment directory. Prototype source copies are research artifacts, not alternate application fitters.

```sh
node scripts/inverse/hard-photo-benchmark.mjs \
  --crop=automatic --target=mask --seconds=10 \
  --output=tmp/heart-learning/hard-photo-followup-v1/automatic-replay
INVERSE_SPEED_OUT=tmp/heart-learning/hard-photo-followup-v1/hunodan-replay \
  node scripts/inverse/hunodan-speed-benchmark.mjs
node --test --test-concurrency=1 scripts/inverse/feature-seeds.test.mjs
```

The ten-second setting is a search allowance. Crop detection, preparation, independent replay and file writing are separately timed in the complete-pipeline report. Browser checks use the ordinary 180-second setting; their results are not evidence of a ten-second browser solve.
