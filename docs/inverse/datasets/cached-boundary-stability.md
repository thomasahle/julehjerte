# Reusing a boundary must not change the next routing attempt

Commit `ec52ee4` fixes mutation of the direct fitter's cached image boundary. The topology initializer handed that cache to graph construction, which expands its curve array during intersection noding and guide-portal insertion. A later initialization could therefore consume the previous graph's subdivisions instead of the original boundary.

The dense regression starts with 13 vertical and 12 horizontal cuts. Before the fix, the first routing expanded its 25 cached curves to 362. The second attempt then rejected the unchanged design at the initializer's 160-input-curve guard. A smaller asymmetric 1+1 fixture expanded two curves to six; both attempts still found solutions, but the reusable input was no longer unchanged.

Graph construction now receives its own curve array. The cached boundary and the routing seed remain separate from that mutable graph. The two regression cases initialize twice and check the original curve-array identity, all control coordinates, the classified mask and probability array, valid returned geometry, and an exactly unchanged forward-rendered design. No acceptance threshold changes.

## The vertical crop shift is a different failure

This fix is not presented as the explanation for the remaining bird crop-shift failure. Fresh fitting of the photograph with a one-source-pixel vertical crop translation still fails the existing feature check. The original crop and horizontal translation continue to pass.

A 30-second allowance reduces the vertical variant's independently rendered mask disagreement to 2.391%, but still retains only 52 of 95 pixels in a 5.9375 mm² white fragment near the bottom edge. The eye stays enclosed. Thus, adding time alone does not resolve this failure.

The returned horizontal cut beside that fragment has all four Bézier controls at **y = 96.922959 mm**. This is exactly the fitter's upper coordinate clamp at a 100 mm overlap width:

```
100 − (2.505010 nominal width + √2 × 100/700 + 2 × 0.01 + 0.35)
```

Exactly 52 fragment pixels lie above that limit; the other 43 lie below it. Their fraction, **54.7368%**, equals the failed retention measurement. This identifies an active optimization constraint in this routing; it does not prove that no legal template pair can reproduce the fragment. The extra 0.35 mm is an optimization cushion, in addition to the stated nominal width, raster allowance and geometry tolerance.

The source fragment is present in the unshifted and horizontally shifted crops too. Its centre moves from y = 97.488 mm in the original to y = 96.949 mm in the vertical variant. This is not evidence that the shift creates a new source component. It changes that feature's position relative to the fitter's clearance constraint, while also changing the chosen starting layout.

Four candidate changes were tested separately and remain outside production:

- Admit ordinary feature starts up to 12% initial disagreement instead of 9%, and protect their initially open regions. This selects a 5+5 start for the vertical variant but does not solve it.
- Allow local detail refinement without first requiring all source colours to pass. The cold ten-second run still exhausts the broad stage before a usable detail pass.
- Require the entire emphasized source component to lie beyond the nominal edge band. This also breaks the previously working original crop.
- Increase feature emphasis from 16× to 64× in protected refinement. This also breaks the original crop and enlarges the horizontally shifted eye.

These are bounded, wall-clock-limited experiments, not converged optimization comparisons. Their source-mask hashes are checked against a production control in the same three-case order. The 10-second vertical control has 3.043% disagreement, compared with 2.693% in the preceding warmed replay; short-budget trajectories are timing-sensitive. Both fail the same bottom-fragment retention check.

## A narrow valid clearance intervention

A separate diagnostic starts from the saved 30-second candidate, identifies two nearby movable controls at the active clamp, and displaces them toward the edge. It does not edit the photograph or mask, and it keeps the final geometry and nominal paper checks unchanged.

| Control displacement | Original-mask disagreement | Fragment retention | Geometry | Paper |
| --- | ---: | ---: | --- | --- |
| 0 mm | 2.391% | 54.74% | Pass | Pass |
| 0.125 mm | 2.391% | 54.74% | Pass | Pass |
| 0.250 mm | 2.376% | 72.63% | Pass | Uncertain |
| 0.350 mm | 2.374% | 76.84% | Pass | Uncertain |

The larger displacements pass the independently rasterized image and feature checks but lose paper certification, so those proposals are rejected. A follow-up samples the same displacement in 0.025 mm increments: **0.200 mm** retains **64.21%** of the fragment in that independent raster while still passing both geometry and the strict paper check. The next sample, 0.225 mm, is already paper-uncertain.

**Subsequent correction:** the 0.200 mm two-control intervention is not a fully validated solution. The engine's pixel-centre sampler retains only **54.74%**, so it still fails the production feature gate. The original claim that this established a valid local correction was too strong. [The follow-up](clamped-feature-recovery.md) records this discrepancy and tests a whole-span correction against both the engine and independent higher-resolution exports; no acceptance threshold is relaxed.

The intervention is diagnostic code outside the production fitter. It starts from a saved 30-second fit, not a fresh image-only ten-second search. Generalizing this correction while preserving valid paper and the search budget remains unfinished.

## Verification

Verification at `ec52ee4` is complete. Type checking reports zero errors and seven existing warnings; lint passes; **855 application tests pass with one existing skip**; all **705 inverse tests pass**; and the production build succeeds. The before/after cache replay independently reproduces the legacy 25 → 362 → rejection sequence and the corrected 25 → 25 → accepted sequence.

All **22 regular Hunodan designs pass in less than ten seconds**, with a maximum measured prepare/solve/validate/export time of **9.199 seconds** and exactly unchanged independent image errors. The complete-photo benchmark remains **24/31**, with the same passing cases, crop coordinates and target hashes. Wall-clock-limited image errors are recorded per case rather than assumed unchanged.

Four actual Chromium replays pass import, worker, editable-template, geometry, paper and PDF checks without page errors:

| Browser case | Click to editable result | Independent editable-template disagreement |
| --- | ---: | ---: |
| Horizontally shifted bird | 17.585 s | 2.255% |
| Original bird | 12.824 s | 2.519% |
| Star | 2.173 s | 0.160% |
| Hat with matching-sheet preference | 7.978 s | 0.412% |

These browser cases use the ordinary 180-second allowance; their timings are distinct from the ten-second Node benchmark. Heavy diagnostics, benchmarks, tests and browser checks ran serially.

The preview was restarted after the build at `http://127.0.0.1:5232/`. Both advertised entry modules return HTTP 200, and the served topology initializer, fitter and rerouting module exactly match their tested source bytes. No code was pushed or deployed.

The [machine-readable report](cached-boundary-stability.json) records the experiments, source and artifact hashes, benchmark comparisons and verification. Raw artifacts remain under `tmp/heart-learning/input-stability-v1/`. The production change is cache isolation only; the targeted clearance intervention remains a research result.
