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

The [completed broader QA for `8149da2`](late-polishing-release-qa.json) passes
type checking, lint, build, 874 application tests (one skipped) and 1,037/1,038
inverse tests. All five earlier unresolved failures pass, without establishing
their earlier causes. One repaired-initializer handoff fails instead: its
report has no completed final checks after the work cutoff.

## Verification handoff correction

The earlier retention correction only allowed an audit already in progress
to finish after the reserved work cutoff. A completed refinement could still
lose its useful checkpoint **before** final source/geometry/paper checks began.
Those checks are necessary to continue fitting, and the caller still had time.

Commit `b7daccc` charges that bounded verification to the caller deadline.
It does not permit additional gradient steps, new initializers or routing
search. The entry-time guard still requires enough work budget to begin the
repair, and the caller deadline remains checked before returning a candidate.

The new deterministic case stops after 45 gradient steps and advances its
clock beyond the work cutoff before verification. It fails on the old code
because no paper audit runs. It passes after the correction, alongside the
existing control that rejects an audit completed after the caller deadline.
All 17 affected tests pass, including the fresh-photo full-suite failure,
weighted/symmetry constraints, crossings and exhausted budgets. Evidence is
in `verification-handoff-before.log`, `verification-handoff-after.log` and
`verification-handoff-controls.log` beneath the same local experiment folder.

Type checking, lint, build and 874 application tests (one skipped) pass on the
corrected runtime. All **30 browser workflows pass**: two original-photo
uploads with rough selections, five smoke workflows, one observed-coverage
edit/undo/redo/export workflow and the 22 regular Hunodan designs. The latter
finish in **5.72 seconds median, 8.62 seconds maximum**, measured from the click
to an enabled Open in Draw action with the normal application search budget.
All 22 finish within ten seconds; the budget was not artificially set to ten.

Against the preceding complete browser run (`7904e6f`), all 22 crop records and
classified painting masks are unchanged. Eighteen native geometries and
editable SVGs are byte-identical. Four exports have lower mask disagreement;
none has higher error:

| Hunodan design | Previous error | Current error |
| --- | ---: | ---: |
| hjfig-05 | 1.111875% | 1.015625% |
| hjcur-02 | 0.830625% | 0.829375% |
| hjstr-02 | 0.440625% | 0.440000% |
| hjstr-03 | 0.830000% | 0.808125% |

Before/after screenshots of all four changed cases were inspected, along with
the selected star and dense-checker uploads. There is no obvious visual
regression, but small border protrusions, uneven endpoints and wavy cell edges
remain. The tiny score differences are not claimed as visible improvements.
Error is measured against unchanged classified masks, not unknown original
cutting paths. These are previously inspected development cases, and the
faster observed timings cannot be attributed to this deadline fix alone.

The [release record](late-polishing-release-qa.json) includes the comparison,
source/log hashes and stage results under `qa-handoff/`. Full inverse
verification now passes **1,039/1,039 tests** with no failures, skips or
cancellations. The controller verifies all 1,018 pinned source files unchanged.
It completed in 1,168.7 seconds. A separate fresh replay of all 31 complete
photographic heart cases follows; no updated corpus score is claimed yet.
All heavy jobs stay serial at nice 15 with one numerical thread and a 10 GiB
free-space floor. Nothing has been pushed or deployed.
