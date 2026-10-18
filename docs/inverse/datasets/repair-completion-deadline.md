# A completed repair discarded at its deadline

The full inverse run on `6efe473` exposed a quality loss after a repair had
finished its checks. The fully observed curved-triangle photograph returned
1.7994% engine disagreement. Its alternate routing had reached 1.4131% and
passed the logged geometry, source-feature and paper checks, but was discarded
because the last check finished 21.91 ms beyond the recovery deadline.

| Measurement | Captured value |
| --- | ---: |
| Recovery allowance remaining | 2.611248 s |
| Recovery elapsed time | 2.633159 s |
| Clearance projection | 0.710307 s |
| Curve refinement | 1.768883 s, 85 steps |
| Discarded candidate image disagreement | 1.413125% |
| Returned candidate image disagreement | 1.799375% |

`repairRejectedRouting` checks the deadline both before final verification and
after the paper audit. The captured failure reached the second check: the
report contains passing geometry and feature results and `paper.status=pass`,
followed by `reason=deadline`. `initializeTopologyPhase` consequently receives
no repaired solution, and the comparison keeps the earlier, worse routing.

This is downstream of cropping. Both candidates are scored against the same
prepared image. The small-feature detail pass was not used in this solve, so
the failure does not demonstrate a direct effect of the new local-control
scope. Timing can change the selected trajectory; no particular source of
that timing variation has been established.

The correction retains a candidate whose mandatory final checks have completed
successfully, even if those checks crossed the cutoff. It records the overrun
and does no further optimization or verification. Expired admission and an
unresolved paper result remain rejections.

A controlled-clock regression reproduces the failure using an actual paper
audit, advancing time only as that final audit returns. Before the correction,
the 0.8192% fit passes geometry, features and paper but is discarded for
finishing 25 ms late. Afterward it is retained and independently rendered and
validated. Two companion tests confirm that expired work cannot start and
that a genuinely uncertain coarse paper audit cannot bypass finer verification
when time is gone. All three pass.

## Fresh replay and application checks

The serial replay on `eaa358a` passes 19 related repair tests and 19 tests
covering the earlier coverage and near-miss failures. Type checks, lint, 874
application tests (one existing skip) and the build also pass. All 1,045
pinned sources match after the run.

Independent rendering of the saved curved-pattern outputs measures:

| Input | Previous full-run result | Fresh current result |
| --- | ---: | ---: |
| Partially observed photograph | 1.5030% | 0.6046% |
| Fully observed mask | 1.8094% | 1.3356% |

All four saved outputs independently pass geometry and paper checks. The
source masks and observation weights are unchanged. These runs followed
different timed trajectories: the new partial-photo repair records no deadline
overrun. Its entire quality gain therefore cannot be attributed to this fix.

The partial bauble remains unresolved despite its fallback regression passing:
its returned legal pair has 4.3973% engine disagreement and loses three source
regions. The regression permits a useful fallback below 5%; the normal 3%
acceptance gate still rejects this result.

A counterbalanced five-case browser diagnostic is now running, with the older
full-suite failures explicitly recorded. It measures actual UI timing and
independent exported errors; it is not a release claim or a substitute for the
complete 22-design Hunodan benchmark. The stable preview is unchanged.

These percentages come from the engine's logged sampling. The discarded
candidate's coordinates were not saved, so its independent exported error is
unknown. The returned candidate's coordinates are preserved in the failure
diagnostic. The full run on the preceding runtime finished with **1,057 passes
and five failures**, all 1,044 pinned sources unchanged. Its other failures
were a legal partial-photo fit at 5.1611% disagreement (limit 5%), the partially
observed curved pattern's independent error (limit 1.5%), the delayed sun's
4.7193% local error (limit 4%), and an unaccepted delayed diagonal near miss.
These are unresolved quality failures, not a reason to loosen their limits.
The browser comparison and preview refresh remain pending.

[Machine-readable evidence](repair-completion-deadline.json).
