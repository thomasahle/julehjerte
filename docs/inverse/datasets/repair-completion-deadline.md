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

The proposed correction is to retain a candidate whose mandatory final checks
have completed successfully, even if those checks crossed the cutoff. This
must not authorize more optimization after the deadline, waive any check, or
allow a repair to start after its allowance has expired. Test it with a
controlled clock advancing during an actual final audit, then rerun the fresh
photograph. No runtime correction has been applied yet: the full suite is
still running against pinned sources.

These percentages come from the engine's logged sampling. The discarded
candidate's coordinates were not saved, so its independent exported error is
unknown. The returned candidate's coordinates are preserved in the failure
diagnostic. The full run has also reported failures in partial-photo recovery,
the partially observed curved pattern and two delayed near-miss cases; their
exact final assertion diagnostics still need review. The browser comparison
and preview refresh remain pending.

[Machine-readable evidence](repair-completion-deadline.json).
