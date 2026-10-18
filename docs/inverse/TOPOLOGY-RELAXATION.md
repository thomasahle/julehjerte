# Check integral LP candidates before branching on free-border topology

The previous browser replays sometimes selected different templates for the
same small house. One run accepted a four-cut topology seed and exported
**0.1846%** protected-mask disagreement; another missed that seed and selected
a two-cut fit at **0.4532%**. The coarse-grid scores and traced topology sizes
were unchanged. The second checker phase sat close to its roughly one-second
MILP search limit, making the result sensitive to when its first incumbent
arrived.

The free-border initializer now prepares both checker-phase graphs once and
probes their continuous relaxations first. A relaxed model can already choose
integral paths. Such an answer still has to pass the original model's binary,
bound and row-residual checks, path extraction, self-neck and geometric checks,
paper-core validation, original-image error and feature checks, and requested
symmetries. Fractional answers are discarded without rounding.

Only the native model copy loses integrality for this probe. The original
`LinearModel` retains every binary flag, and the ordinary MILP formulation is
unchanged. An optimal LP objective is a bound on that original model; a
nonoptimal LP probe records no bound. LP reports explicitly identify the mode
and record the original-model residual. A failure to obtain an integral LP
answer is reported separately from proving the candidate graph infeasible.

Each probe receives at most **0.5 seconds**, normally 20% of the free-border
topology allocation, with one validation round. The enclosing allocation stays
at **2.5 seconds**. If neither probe supplies a valid candidate, the normal MILP
search continues on the same prepared graphs and shares the remaining budget
between the eligible phases. A phase whose LP proves infeasibility needs no
integer search. Geometry and paper validation can finish after a native solve's
timer expires; complete workflow timing remains part of the release checks.

The unweighted path keeps its existing MILP route. No paper threshold, error
limit, interpolation rule or exported-curve rule is relaxed. The selected
topology still enters the common Bézier refinement and final shared-cut repair.

## Experiments and regression checks

Two smaller MILP formulations were tried first. Making direction variables
continuous helped one difficult hat phase but did not speed up the useful
house phase. Replacing directed arcs with signed connectivity flow reduced the
model further but made the useful house and hat phases slower. Neither change
was adopted. Their fixed-graph measurements are retained with the release data.

The LP probe instead preserves the entire integer formulation. On the fixed
small-house and hat graphs, one phase produced fractional solutions and was
rejected; the other produced integral, independently validated solutions.
These experiments used saved masks to prepare fresh graphs, without supplying
any fitted templates.

Three new tests check an integral routing against the original residual and
paper audit, reject a fractional result before extraction or paper validation,
and reject an integral result when the paper gate fails. The existing guide
phase, ignored-pixel invariance and complete topology tests also pass.

## Browser comparison provenance

The Paint replay now supports repeated uploads with separate artifacts for
each repetition. A reference engine can be served from a Git commit while
retaining the current page and editor. Both comparison sides use the same
local HTTP proxy, and every worker must request the reference solver and
topology files from that server. Reference file hashes and request counts are
recorded separately from workspace hashes.

The first comparison attempted to substitute reference modules with Playwright
request routing. Firefox worker imports bypassed that override: reports from
the supposedly older engine contained the new LP mode. That comparison is
invalid and is retained with this diagnosis. The corrected comparison serves
the actual bytes over HTTP and verifies delivery, independently of browser
automation request interception.

## Fresh replay results

The corrected Firefox comparison makes five fresh uploads per engine, using
the same prepared masks and the same HTTP reference server implementation.
The previous engine is `ab91958`; the new runtime is `a592fb6`. The page,
editor, worker entry point and HiGHS vendor files are unchanged between them.

| Small-house workflow | Previous engine | LP-first engine |
| --- | ---: | ---: |
| Accepted four-cut topology | 1/5 | 5/5 |
| Median click-to-ready time | 14.364 s | 8.534 s |
| Time range | 9.375–15.167 s | 7.806–8.628 s |
| Protected-mask disagreement | 0.1724–0.4532% | 0.1846–0.1968% |

The median is **40.6% shorter** in this replay. All five new runs accept an
integral phase-one LP and retain four cuts per sheet. Four of the five previous
runs time out on that phase and use the less accurate two-cut result. The old
run that does obtain the topology has slightly lower final error than the new
runs; downstream refinement still selects timed checkpoints. The old five
runs precede the new five, so these observations are not an alternating-order
benchmark or a general reliability guarantee.

The full production release replay passes **22/22 regular Hunodan photographs**
and **32/32 weighted motif variants**, with the existing error, feature,
geometry and strict paper-core gates. Node preparation, solve, validation and
export take at most **9.072 seconds** for Hunodan (median **5.899**) and **8.666
seconds** for the weighted set (median **5.064**), on an Apple M2 Pro with Node
25.6.1. Photograph decoding and the additional independent SVG rendering are
timed separately. The previous release medians were 5.825 and 4.845 seconds;
this change does not demonstrate a speedup across the whole dataset.

Compared with that release, 21 Hunodan errors are identical and `hjstr-03`
increases by **0.001329 percentage points**. Twenty-seven weighted errors are
identical: the inverted large hat increases by one sampled pixel, three small
circle cases increase by one or two pixels, and the noisy large circle improves
by one pixel. The largest increase is **0.012207 percentage points**. Passing
the unchanged release limits does not mean every individual error decreased.

All **24 production browser workflows** pass in Firefox, Chromium and WebKit,
including import, solve, editor crossing/spacing checks and SVG export. Star
cases also export PDF. One additional Chromium replay blocks the numerical
Wasm kernel and passes using JavaScript. The matching top hat retains **114
exact shared spans** through editor conversion and export in every browser,
with the same **0.4447%** protected-mask error. Its click-to-ready times are
**22.376, 10.956 and 15.073 seconds**, respectively; each is slower than the
preceding single release replay, so the small-house result should not be
generalized to this larger hat.

The subsequent [ordered-grid sweep](GRID-PARITY.md) targets the separate count
initialization cost without changing the resulting candidate controls or this
LP/MILP search.

Twenty browser errors are unchanged. Firefox's small house and WebKit's large
house improve by 0.268555 and 0.054032 percentage points. The large basic hat
increases by 0.115150 points in Chromium and 0.092120 in WebKit, remaining at
0.3959% and 0.3623% disagreement. These are fresh timed fits; the measurements
alone do not isolate the cause of every changed checkpoint. All differences
are retained in the report.

All **718 application tests and 239 engine tests** pass. Lint and the production
build pass, and Svelte checking reports zero errors and seven existing warnings.
The hat preview and drawing, the star preview, and the old/new house previews
were visually inspected. All **49 served engine files** match the benchmark
sources. [TOPOLOGY-RELAXATION-VALIDATION.json](TOPOLOGY-RELAXATION-VALIDATION.json)
records source hashes, actual reference HTTP requests, all per-case results,
the rejected formulations and the invalid first comparison.

```sh
node --test scripts/inverse/relaxation.test.mjs scripts/inverse/topology-phases.test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 \
  INVERSE_TEST_BROWSERS=firefox INVERSE_TEST_CASES=house-free-small \
  INVERSE_TEST_REPEATS=5 INVERSE_TEST_ENGINE_REFERENCE=ab91958 \
  node scripts/inverse/paint-browser-test.mjs
```
