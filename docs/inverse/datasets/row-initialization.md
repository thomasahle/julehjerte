# Faster initialization and short-budget outline refinement

Commit `45c73b5` moves the ordered-row dynamic program into a small Float64
WebAssembly kernel. It preserves the JavaScript arithmetic order, strict tie
breaking, infeasible-row fallback, count/phase enumeration and spline projection.
There is no fast-math or additional count pruning. The JavaScript path remains
available when the kernel cannot load.

Paired runs on four unchanged photographic targets measure **1.3–1.7× faster
initialization**, with exactly equal complete seed objects and diagnostic
reports. These are initialization timings, not whole-pipeline speedups. Three
repeats alternate implementation order. Regression tests compare 1,280 row
configurations, complete initializer trajectories, output ownership and fallback
behavior. The benchmark predates a final malformed-dimension guard; its archived
source hashes are retained rather than represented as hashes of the final tree.

## Why faster initialization alone was insufficient

The previous [deadline diagnostic](feature-deadline-diagnostic.json) found a
scheduling cutoff: a ten-second request could skip feature initialization and
spend the remaining time on unsuccessful traced recovery. The availability
test subtracted clearance and polishing reserves before requiring another 3.5
seconds. The revised test requires 2.5 seconds after those same reserves.

A second problem affected alternate sampling grids. A preflight check could
promote one to the primary layout, but it still received the last-chance retry
policy with no polishing reserve. Promoted layouts now retain the ordinary
1.7-second reserve. An actual late retry keeps its existing allocation.

Finally, a coarse layout just outside the image limit could not request finer
outline curves, even when it retained all source features and passed geometry
and paper checks. Such a candidate can now propose subdivisions when it is
within one percentage point of the limit. This is proposal eligibility only:
the original image, feature, geometry and paper acceptance limits are unchanged.

## Matched photographic replays

All four ordinary-speed outputs retain exactly the preceding independent errors.
With a monotonic clock advancing 1.5 times faster, all four now meet the original
fixture criteria at both 400 and 800 pixels. The vertical-shift sun window has
2.29% local disagreement, below its unchanged 4% bound. Row acceleration alone
passed only two of these four strict checks under that accelerated clock.

The accelerated clock is a counterfactual scheduling experiment, not an actual
CPU/browser latency measurement. The source photographs, crops, masks and
probability fields are hash-checked. Every fit starts from fresh grids, and an
independent renderer evaluates the exported cuts. This does not establish
unchanged output under every possible machine load.

## Rejected handoff experiments and remaining geometry issue

Handing a candidate to outline refinement immediately after it reaches the
global image limit made the horizontal-shift result worse. Waiting for repeated
unchanged checkpoints did not fix the accelerated-clock sun-detail failure.
Neither policy is included in the fitter.

The immediate-handoff diagnostic also exposed a segmentation-dependent geometry
check: exact subdivision of a previously accepted pair exposes short returns
inside formerly adjacent cubics. The subdivided candidate fails before any
gradient step. The short-return audit skips adjacent cubics; the editor has
related adjacency exclusions. No validation rule was weakened to accept this
proposal. A representation-independent treatment of these tight bends remains
unresolved and requires separate geometry/editor regression coverage.

The [evidence record](row-initialization.json) preserves the successful and failed
replays and the captured pre/post-subdivision geometry. Raw artifacts and frozen
prototype sources remain under `tmp/heart-learning/row-kernel-v1/`.

## Validation status

All 19 focused initializer, outline and photographic regression tests pass,
including the four accelerated-clock cases. Full corpus/repository validation
of `5db8425` completed all **22 Hunodan cases below ten seconds**, with a maximum
of **7.975 seconds**. All 22 independent errors exactly match the last fully
validated release, recovering the two small increases in the preceding full run.

The subsequent photo run exposed a dense-checker regression, from 2.245% to
4.807% disagreement. Validation was stopped before repository/build/browser
checks, and its partial results are retained. Faster initialization and the
changed time cutoff allowed a speculative weak-region grid to run where the
previous full run skipped it. Its fine-grid error improved from 5.498% to 5.251%,
but enforcing strip width reversed the ranking: the original grid became 5.949%
and the speculative one 6.123%. Refining the latter exhausted the useful budget.

The existing clearance comparison now also covers speculative weak-region
starts, which already retain every required source feature. It compares one
retained ordinary finalist, requires its geometry/paper/colour checks, caches
both preparations and keeps the original queue. Genuine missing-feature starts
retain their previous policy. A fresh replay recovers the checker at 2.279%
disagreement. Both the new checker regression and the existing faded-frame
weak-region regression pass. The full suite and corpus still need a fresh run.

The previous full inverse run was not green; focused passes do not replace that
result. The preview remains on its previously checked build until the new corpus
and repository checks complete. Nothing is pushed or deployed.
