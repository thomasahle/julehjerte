# Direct Bézier fitting: browser port and photographic benchmark

The app now offers **Pattern style → Fit curves to image** at `/en/generate/` and its Danish counterpart. It fits independent cutting curves for both sheets inside the existing JavaScript worker. It needs no Python service, PyTorch runtime, traced interior graph or saved cutting templates. **General** and **Matching sheets** retain their existing solvers.

The first full comparison produced **11/31 accepted pairs, versus 3/31 for tracing**, using the same source photographs, fixed crops, general colour conversion, 60-second search budget and normal app checks. Nine of the 24 complete collage motifs pass direct fitting; two of seven individual photographs pass. The yellow individual star still works with General and fails direct fitting. Choosing whichever method succeeds would give 12/31, but the app does not perform that automatic selection, and it is not the direct fitter's score.

These are numerical acceptance results, **not 11 verified original designs**. Original artwork and cutting paths are unavailable. Visual inspection found some false seams even below the 3% image-error threshold, especially in the original flower crop. The 15 clipped collage hearts and one obscured by glare remain in the inventory, outside the 31 fully observed inputs.

## What was ported

`static/inverse/core/direct/` ports the supplied study's ordered B-spline initializer, continuous boundary-motion derivative, free Bézier refinement and exact shared-cut recovery. The original Python archive remains untouched under `tmp/inverse-recrops-handoff/heart_recrop_study/`.

1. Preparation rectifies the accepted crop and estimates its two-colour mask. Red/white photographs can also retain the continuous empirical colour-mixture estimate. The classified source remains unchanged and supplies the final error reference.
2. Fresh ordered grids test 1–8 slits per sheet and both colour phases. Independent family shapes and some unequal-count candidates are allowed. Smoothed inset-border measurements suggest counts; inconsistent opposite edges do not prevent solving.
3. The initializer uses positive-gap cubic B-splines, an annealed parity image loss at 96 pixels, smoothing and Euclidean separation costs. Three candidates proceed through clearance and free refinement. A later improvement reserves one candidate when each opposite edge independently supports the same count by majority vote; it remains a suggestion, not a forced constraint.
4. Both coordinates of anchors and handles can move during free refinement. Endpoints stay on their assigned sides. The boundary-motion gradient gives horizontal cuts a vertical image force and cancels exactly shared cuts before integration. Geometry and guarded paper-core checks run at checkpoints; failed updates roll back to a valid checkpoint when one exists.
5. Near-coincident runs may become exactly shared Bézier segments. Acceptance requires nonincreasing mask error at two resolutions, geometry and paper checks, and no additional sharp turns. This changes cutting geometry rather than painting over the rendered seam.
6. Final validation retains the app's existing export gates. The benchmark separately reads exported cubic coordinates and renders with resvg, independently of the fitting rasterizer.

The optimizer reserves space for the paper audit's finite-grid uncertainty in addition to the nominal cutting allowance. Default settings require approximately **2.505 mm nominal width**; fitting targets about **3.268 mm** to leave a numerical guard. The Pro study's **1.5 mm** acceptance criterion is different. No acceptance threshold was relaxed for the 11/31 result.

This port uses a fixed initial segment layout, bounded candidate search and local optimization. It does not implement arbitrary path rerouting, adaptive segment insertion or a global optimality guarantee. Grid loss uses 96 pixels and free fitting at most 256; final image checks retain the full prepared mask. More time can finish additional iterations but cannot necessarily escape the selected routing.

## Controlled crop and colour comparison

The Pro cropper used a slightly different screenshot of the same collage. SIFT correspondences and a robust homography transferred its frozen coordinates onto the existing benchmark image: 3,333 inliers from 3,443 matches, with 0.147-pixel median inlier error. The transform uses photographic features, not fitted curves or reconstruction scores. Pixel-centre coordinates are converted to the app's pixel-edge convention. All five proposals retain `needs_review` status.

The table holds the source photograph, solver, settings and budget fixed. Column two changes only the crop; column three additionally changes colour estimation.

| Motif | Original crop, general colour | Pro crop, general colour | Pro crop, red/white mixture |
| --- | ---: | ---: | ---: |
| Six-point star | 0.97% | 0.80% | 1.07% |
| Dense checkerboard | 1.81% | 0.84% | 0.98% |
| Flower | 2.55% | 0.58% | 0.54% |
| Framed tree (`gingerbread` in the inventory) | 5.27% | 7.44% | 9.11% |
| Stacked hearts | 1.90% | 0.89% | 0.91% |

These are independent full-mask mismatch percentages. Better crop coordinates materially improve four motifs. The flower also changes from four slits per sheet with visible internal seams to three with a much cleaner silhouette. The frame counterexample rules out a general claim that replacing the crop fixes every case. Mixture conversion is useful, but it does not uniformly improve the general classifier on these five photographs.

A separate run on the Pro archive's actual 256-pixel rectified images passes **4/5** with mixture conversion: checkerboard 1.03%, star 0.94%, flower 0.52%, stacked hearts 0.88%. The framed motif fails at 9.09%. These are different sampled inputs from the mapped-crop experiment and are not added to the 31-case denominator.

## Common failure patterns and tested causes

**Cropping affects more than the border.** Incorrect corners change perspective and the apparent geometry throughout the square. In the original 31-case run, 19 of the 20 failed candidates still exceed 3% mismatch inside the central 90% by 90% region. Simply ignoring or repairing the outer 5% band cannot make those existing candidates accurate. This does not exclude crop error as a cause of interior distortion. The fixed-crop comparison above is the stronger causal test.

**Count selection and local routing remain problems on clean borders.** All twelve inset measurements agree on three cuts for white birds and five for the yellow star. Ranking only by initializer image error discarded those counts before free refinement. Reserving a supported-count candidate fixes that omission, but the targeted retries still fail at 5.83% and 4.61%. Having the right count is insufficient: the initial ordered path layout must also reach the right motif. Silhouettes such as the puppy, Viking ship and Stonehenge, nested frames, and tightly interlocking patterns often gain false holes, seams or rounded features in the selected local solution.

**Some better image fits fail the requested paper geometry.** For example, the candle's two-slit candidate reaches about 1.2% internal mask error but fails checks; the selected valid three-slit candidate has 4.84% independent error. A diagnostic that changes only the requested minimum strip width from 2 mm to 1 mm produces a valid two-slit candle at 1.43%. The same relaxation does not rescue nested squares, the framed tree or the faceted star. This supports a constraint conflict for the candle, not a blanket explanation for every failed motif. These weaker-width results are excluded from the primary score.

**Dense patterns exceed both initialization capacity and photo detail.** The initializer currently searches at most eight cuts per sheet. A separate unconstrained 8–12-count experiment improves the fine checkerboard's best ordered-grid error from about 11.8% to 8.47% with eleven cuts; warped checkerboard still has at least 9.12%. These are initializer errors before free fitting and paper validation, not additional successes. Higher counts help but do not alone recover the dense designs. The small, blurred source cells also contain ambiguous joins after classification.

**The remaining frame problem is not a missing horizontal gradient.** Analytic horizontal/vertical fixtures and independent polygon-area derivatives pass in JavaScript. On identical frame targets and initial controls, JavaScript and PyTorch initializer losses differ by approximately `1.13e-8`, the maximum gradient difference is `9.15e-9`, and controls after ten Adam updates differ by at most `1.77e-6`. Testing Pillow's antialiased triangle downsampling versus the port's area downsampling and several initial random grids changes the local result but leaves roughly 6–7% ordered-grid error. These checks narrow the problem to initialization/refinement and constraint handling rather than demonstrating that the entire port reproduces the Python optimizer bit for bit.

## Robustness to input perturbations

Five complete collage cases—star, dense checkerboard, flower, stacked hearts and bottom flower—were rerun with four perturbations each: a one-pixel horizontal crop shift, a one-pixel vertical shift, JPEG quality 75, and half-resolution input. **20/20 retain accepted exports**, with independent mismatch between 0.63% and 2.93%.

However, **five of the twenty change slit counts** relative to their unperturbed fits. The two shifted stacked-heart crops choose 4+3 instead of 3+3; three flower variants choose 3+3 instead of the original crop's 4+4. All were fresh fits. The stacked-heart runs contain valid 3+3 alternatives, but the final image objective prefers the extra cut for a small reduction in error. Thus noisy border transitions no longer abort the solve, while topology stability and preference for a plausible simple design remain unresolved. Export success is a weaker robustness criterion than recovering identical cuts.

The next useful changes are a stronger treatment of crop uncertainty, search moves that change the path layout together, and a tested preference for simpler shared geometry when photographic error differences are small. Increasing runtime or loosening the image threshold alone does not address the observed causes.

## Verification and evidence

All **227 repository tests** pass, including ten direct-fitting tests for analytic gradients, unequal-count phase, free-control area derivatives, shared reverse-running cuts, inset-count noise and a fresh noisy-image solve. Type checking passes with eight pre-existing accessibility warnings; lint and the static build pass. Browser tests cover direct preparation, cancellation, a fresh shaded/noisy checker, the real flower photograph, downloads and independent exported-curve rendering in Chromium and Firefox. The example-button suite is also rerun after integration.

`DIRECT-FITTER-VALIDATION.json` records the exact run folders, source hashes, every scored outcome, perturbation counts and diagnostics. The local visual report is generated under `tmp/inverse-direct-study/index.html`; original photos and large per-case artifacts remain outside version control. Failed reconstructions remain inspectable and are not offered as cutting templates by the app.

The three simultaneous initial benchmark shards happened to receive the same millisecond timestamp. Individual case artifacts survived, but their aggregate JSON overwrote one another. The complete inventory was rebuilt by independently rescoring every saved export against its saved classified mask; the surviving summary and original per-process logs were retained. Solver timings remain in every report, while unavailable combined wall timings are explicitly null. Shard names now have unique suffixes.

To repeat the main comparison with the local photograph manifests:

```sh
npm run benchmark:inverse:hard-photos -- --presets=general,direct --seconds=60
npm run benchmark:inverse:hard-photos -- --presets=direct --seconds=60 \
  --ids=outline-star,dense-checker,flower,stacked-hearts,bottom-flower --perturb=true
npm run benchmark:inverse:hard-photos -- --presets=direct-mixture --seconds=60 \
  --recrops=tmp/inverse-recrops-handoff/heart_recrop_study
```

For production browser QA, build once, start the preview on port 4174, then run `test:inverse:direct:browser` with `INVERSE_TEST_URL=http://127.0.0.1:4174` and optional `INVERSE_RECROP_ARCHIVE=tmp/inverse-recrops-handoff/heart_recrop_study`. A local Playwright installation is required. Do not rebuild or run SvelteKit sync while a browser test is active.
