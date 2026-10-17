# Retaining improved approximations

On 2026-10-17, a controlled late-stage fit exposed a selection bug: final
polishing could improve a geometrically valid template, but the main fitter
discarded it whenever its disagreement still exceeded the image acceptance
limit. The earlier, worse approximation was then exported.

Commit `8149da2` requires the polished candidate to pass the existing geometry,
paper and feature checks and to improve the original-source score. Crossing
the image acceptance threshold is no longer required to retain that
improvement. The threshold, mismatch warning, final validation and search
budget are unchanged. An acceptable incumbent cannot be replaced with a
higher-error approximation.

## Controlled regression

`scripts/inverse/polishing-approximation.test.mjs` starts from the photograph
and horizontal crop variant in `photographic-near-miss-seed.json`. It checks
the source mask hash and initializes fresh grids; no saved cutting paths
enter the fitter. A simulated clock interrupts ordinary refinement after a
fixed checkpoint, then permits the ordinary polishing work. Matching-sheet
preference is disabled to isolate this selection decision.

| Measurement | Before correction | After correction |
| --- | ---: | ---: |
| Earlier candidate, engine source error | 4.874375% | 4.874375% |
| Polished checkpoint, independent exported renderer | 4.00625% | 4.00625% |
| Final export, independent exported renderer | 4.89000% | 4.01625% |
| Geometry, paper and source-feature checks | Pass | Pass |
| Within the unchanged 3% image limit | No | No |

The regression fails on the old selection rule and passes after the change.
It also checks that the source mask/probability are unchanged, that the final
result still reports `image_mismatch`, and that `templateChecksPassed` remains
false. This is a deterministic work/scheduling regression, not a speed claim
or a comparison against unknown original cutting paths.

All nine focused late-feature and polishing tests pass. The final regression
was then replayed with its additional feature assertion and measurements;
it passes with the values above. Local evidence is under
`tmp/heart-learning/late-routing-deadline-v1/` (`approximation-before.log`,
`approximation-after.log`, and `polishing-after.log`).

## Other unresolved QA failures

Before this correction, all 24 focused tests covering the five outstanding
full-suite failures passed without a production change: two late-routing
tests plus 22 feature-seed, dense-count and late-initialization tests. Their
earlier failures remain recorded in `interior-count-release-results.json`.
These reruns do not establish a cause or clear the full suite. The separate
polishing bug above was found by controlling the remaining refinement time;
it is not claimed to explain all five failures.

Broader QA for `8149da2` is running serially at nice 15, with one application
test worker, numerical thread pools limited to one, source hashes pinned,
and a 10 GiB free-space floor. Its state and logs are under
`tmp/heart-learning/late-polishing-release-v1/qa/`. Browser verification remains
pending. Nothing has been pushed or deployed.
