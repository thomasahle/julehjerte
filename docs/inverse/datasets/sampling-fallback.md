# Recovering feature fits from a different sampling grid

The fitter now compares one bounded alternative before committing its short refinement budget to a coarse feature layout. It initializes that alternative from the unchanged photograph using a 98-sample row-DP grid, instead of the ordinary 96 samples. Ordinary fits that do not need feature recovery keep their existing route. This follows the [initializer-resolution study](initializer-resolution.md), which rejected replacing every initializer globally because that regressed other images.

The fresh nine-crop development study improves from **5/9 to 8/9** checked exports. The half-resolution puppy control also passes. These are translations of one photograph, not nine independent motif families. Every result is checked against its own fixed source at 400 and 800 pixels, with unchanged feature, geometry and paper-support requirements. No saved template is used as an initializer. The base crop comes from the offline neural-crop experiment, remains `needs_review`, and is frozen before fitting; it is not a ground-truth crop.

| Crop translation in source pixels | Previous error | New error | New 800-pixel error | Result |
| --- | ---: | ---: | ---: | --- |
| Original | 2.669% | 2.669% | 2.744% | Pass |
| +1, 0 | 2.466% | 2.466% | 2.550% | Pass |
| 0, +1 | 3.093% | 2.893% | 2.995% | Newly passes |
| −1, 0 | 2.761% | 2.761% | 2.848% | Pass |
| 0, −1 | 2.601% | 2.614% | 2.706% | Pass |
| +1, +1 | 4.244% | 2.774% | 2.882% | Still fails feature check |
| −1, +1 | 2.678% | 2.678% | 2.758% | Pass |
| +1, −1 | 3.821% | 2.734% | 2.801% | Newly passes |
| −1, −1 | 3.218% | 2.509% | 2.612% | Newly passes |

The errors compare with estimated photographic masks, not original artwork or known cutting paths. Time-bounded fits can vary even on unchanged routes; individual results are retained, including increases. Solve, validation and export take 7.09–9.40 seconds for these nine crops. Image preparation and independent replay are outside that timer.

## Why the first fallback was insufficient

The first implementation passed a focused replay but failed two tests in the full inverse suite. The vertical shift's 800-pixel disagreement was **3.00203125%**, thirteen pixels above the limit. The negative diagonal sometimes exhausted the retry window before scheduling the alternative. Lowering the time threshold alone still skipped that retry in a repeated test. Those failed logs remain in the experiment directory.

An initial-geometry probe identified a more useful scheduling signal. The negative diagonal's ordinary feature search chose five cuts in one sheet and three in the other. After clearance fitting, two slits were only **0.597 mm** apart against a **2.505 mm** nominal requirement. Free refinement spent most of the budget on a layout that never established a valid paper checkpoint. A fresh three-by-three alternative started with **3.258 mm** minimum slit separation and passed both geometry and paper checks.

Prioritizing only initially invalid layouts recovered both negative-y diagonal cases, but the vertical shift still sometimes ran out of retry time. A cold-process check also failed the finer export limit after scheduling the retry. The final policy compares the bounded alternative before free refinement for ordinary 16-control feature layouts. An alternative can go first only after geometry and paper validation; if the incumbent geometry is valid, the alternative must also have lower unweighted clearance-grid error. The original layout remains queued, with its clearance result cached. The protected opening route and finer-spline route retain their established treatment.

The two new sampling phases may produce no eligible alternative: that is the observed outcome for the original and horizontal crops, whose established layouts remain selected. They add a small initialization cost to these feature-recovery cases.

The refinement trace also exposed exact repeated rollback cycles. At the minimum learning rate, identical safe coordinates and a complete optimizer reset produce the same next 40-step block. Feature refinement can now skip additional exact copies while retaining the final partial block. A regression compares 650- and 750-step runs with skipping enabled and disabled, requiring identical selected coordinates and retained uncertain alternatives. The diagnostic 750-step run skips 120 steps and saves about 0.6 seconds; this isolated timing is not a general speed guarantee.

The alternative uses the remaining refinement and optional-polishing allowance. The outer cleanup/export reserve, original target pixels, feature requirements and final acceptance limits are unchanged. A grid is never accepted as a template merely because this preliminary check passes.

## What remains visibly wrong

The sun's fine rays are heavily smoothed in the exported result. In a manually selected review window around the sun, the vertical-shift error is **7.66%**, compared with **2.89%** across the whole square. That window is a post-hoc visual diagnostic, not a new training label or acceptance rule. It demonstrates that a low whole-image disagreement and retained color regions do not establish faithful small-detail reconstruction.

The +1,+1 crop remains rejected. Its alternate coarse layout has 9.93% disagreement, above the unchanged 9% initialization cutoff, so this fallback cannot refine it. That is an observed rejection point, not proof that further refinement would succeed. In the final replay its selected ordinary fallback reaches 2.77% global disagreement but loses an interior feature, so it remains unaccepted. Earlier attempts returned worse global fits; those records are preserved. No claim of uniformly improved error or complete perturbation robustness is made.

## Broader comparison

The automatic-crop corpus remains **24/31**, with no status changes across its 47-entry inventory. Fifteen clipped cases and one obscured case remain separately excluded; the 31 complete cases include three failures to propose a crop and four rejected reconstructions. All crop coordinates, input hashes and classified target hashes match the earlier run. This initialization change does not claim a new success in that broader corpus.

The separate fixed-crop x/y shifts, JPEG-75 image and half-resolution image all pass. The vertical shift improves from 3.093% to 2.893% disagreement. All **22 regular Hunodan designs** retain exactly their previous errors and pass within ten seconds; the maximum is **9.186 seconds** for preparation, solving, validation and export. Decoding and independent replay are timed separately.

## Reproduction and evidence

The final scheduling change is committed as `7972977`, with exact-cycle skipping in `4574a41`. Earlier attempts are retained in `b96d94f` and `ed2b27d`. The baseline replay is pinned to `31ce66e`. Raw inputs, source snapshots, exported geometry, failed experiments and logs are under `tmp/heart-learning/sampling-fallback-v1/`. The new fixture is in `scripts/inverse/fixtures/photographic-near-miss-seed.json`.

```sh
node --test --test-concurrency=1 scripts/inverse/feature-near-miss.test.mjs
node scripts/inverse/initializer-resolution-replay.mjs \
  --policies=baseline \
  '--cases=original;horizontal;vertical;puppy-half;-1,0;0,-1;1,1;-1,1;1,-1;-1,-1' \
  --output=tmp/heart-learning/sampling-replay-new
```

The [machine-readable audit](sampling-fallback.json) records paired input hashes,
unchanged targets, source snapshots, failed earlier attempts and the final checks:

- 736 inverse tests and 855 application tests pass; one existing application test is skipped.
- Type checking reports zero errors and seven existing warnings. Lint and the production build pass.
- Seven Chromium flows pass: the original, horizontal, vertical and negative-diagonal masks, bird, half-resolution puppy and free-border hat. They cover independent geometry/paper checks, editable SVG and PDF export, and conversion fidelity at 400 and 800 pixels, with no page errors.
- Browser click-to-ready times range from 2.54 to 26.03 seconds under the UI's larger time allowance. The four near-miss masks take 9.10–9.81 seconds; these timings are separate from the native ten-second benchmark.
- All recorded browser source and harness hashes match the tested checkout. Fifty served static modules match their local hashes after rebuilding and restarting the owned preview at `http://127.0.0.1:5232/editor/mal/`.

Browser visual review confirms the missing sun rays described above. The puppy
also retains rough border details despite passing the numerical checks. None of
the templates has been physically assembled as part of this experiment.
