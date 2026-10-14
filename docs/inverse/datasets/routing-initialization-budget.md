# MILP clocks, initialization and rejected-candidate timing

These are offline experiments based on `523c377`, not a new validated solver
release. The [measurements](routing-initialization-budget.json) retain failures
as well as successful trials. The production initialization and repair budgets
remain unchanged; the separate cumulative-native-clock bug below is corrected.

## Repeated MILP calls charged prior solve time twice

The retry loop passes the remaining wall-clock allowance to each native call.
HiGHS interprets its limit against cumulative time across calls on the same
model, as documented by its
[clock reset API](https://ergo-code.github.io/HiGHS/dev/interfaces/c_api/).
Without a reset, later rounds can lose their earlier native solve time a second
time. This is distinct from native timeout overshoot or initialization policy.

`solver-clock.test.mjs` reproduces the integration error with the bundled WASM
runtime. It solves a real straight-cut model, rejects the unique routing at an
independent paper gate, and observes the second native call after the exclusion
constraint is added. Before the correction that call inherits 0.012634541
seconds of native time while receiving a reduced limit. The test fails.

The solver now calls `native.raw.zeroAllClocks()` before each native run. The
outer deadline still decreases, and the persistent model, exclusion constraints,
incumbent and all validation gates are retained. The regression and 17 existing
solver/progress/relaxation tests pass. This does not establish a complete-pipeline
speed or success-rate improvement; broad QA remains required.

## Findings

The failed production focused run in
`tmp/heart-learning/routing-budget-blend-v4/production-qa/` passed 11/14 tests.
Two sloth masks failed and a shifted star exceeded ten seconds. Precise/coarse
initialization spent approximately 2.5 seconds before the useful recovery
phase. Its budget already includes model construction: the timer begins before
loading HiGHS and formulating the model. The native timeout is not an exact
wall-clock cutoff; one 1.25-second initialization trial took 1.667 seconds.

Reducing the shared initialization allowance from 2.5 to 1.25 seconds recovered
the frozen sloth and shifted star in fresh processes, but the synthetic-control
sloth still failed with 5.3472% independent disagreement. A 0.75-second trial
recovered that mask in 9.317 seconds with 0.7824% disagreement at 250 pixels and
1.0528% at 500 pixels. The source-mask hash stayed unchanged.

That isolated success did not establish a general improvement. The 0.75-second
variant's focused replay also passed only 11/14 tests. Its failures were the
photographic junction's improvement threshold, the original outline-star's
expected recovery path, and final template acceptance on the frozen sloth.
Other worktrees were running generator benchmarks and Vitest during this run;
that is a timing confound, not proof that every failure is environmental.

The frozen sloth exposes another scheduling limit. Its first integer proposal
arrived after 2.928 seconds of recovery search with 2.888 seconds remaining in
the phase. Repair nevertheless stopped after 85 steps under its independent
two-second cap, with no valid checkpoint. Shortening initialization alone does
not guarantee enough useful continuous repair. A subsequent variant combining
the 0.75-second initializer with a three-second repair cap, still bounded by the
caller's existing deadline, passes all 14 focused tests in 85.774 seconds. This
variant includes the timing fields but predates the native-clock correction.
It has not passed corpus or browser QA and is not adopted in production.

The eligibility guard also considers only phase time before applying the
caller's permitted repair tail. Two offline variants move that guard after the
tail calculation, but their candidates arrived with more than 0.75 seconds of
phase time. They therefore do **not** establish any benefit from that change.

## Report corrections

The production reports now retain:

- Native search duration, its assigned budget, and cumulative elapsed time for
  each MILP round, including rounds that produce no feasible integer solution.
- Rejected-candidate arrival times and the reason repair was attempted or
  skipped. A repair's available caller budget is distinct from its local cap.
- Precise and coarse initialization reports when feature recovery returns a
  successful solution. Earlier successful reports omitted these fields; their
  absence must not be interpreted as zero initialization cost.

These fields change diagnostic output, not acceptance rules or search budgets.
The native-clock correction is the separate behavior change described above.
The last fully validated complete-pipeline revision remains `99399ff`. Neither
the 22-design Hunodan corpus nor the 31-photo corpus has been replayed with these
experimental budgets.
