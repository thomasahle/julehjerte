# Indexing scalar image loss without changing its values

The common Bézier fitter built a spatial row index, then ignored it when
integrating image loss: every integration row scanned every sampled segment.
It now uses that index in the ordinary orientation and builds corresponding
bins for transposed integration. Segment order, direction, crossing arithmetic,
image integrals, shared-cut multiplicity and pixel conventions stay unchanged.
The gradient, objective, iteration caps and acceptance limits are unchanged.

A frozen full-scan reference checks the optimization independently of its row
selection. The regression covers empty and dense grids, shared cuts, horizontal
segments, bin boundaries, backward-running curves, out-of-square controls,
disconnected joins, perturbed controls, both phases and weighted observations.
Every compared scalar is exactly equal, including the one-call API.

The [recorded study](indexed-boundary-loss.json) uses 40 combinations of fixed
geometry, image resolution and weights, with four alternating timing orders.
Both implementations prepare image integrals once. The committed reproducer
measures a **47% median reduction in evaluation time**; dense-grid reductions
are **77–79%**. An earlier isolated prototype measured 57% at the median. The
four empty-geometry cases are slightly slower; all cases remain in the report.
These are component measurements, not whole-solver or browser speed claims.

```sh
nice -n 15 node scripts/inverse/diagnostics/boundary-row-index-study.mjs \
  --output=tmp/boundary-row-index-study
```

The output directory must be new. The script records source hashes, individual
timing batches and exact-agreement checks. Saved curves are evaluation inputs;
they never initialize the fresh-fit tests.

All nine failures from the preceding complete suite pass in one serial replay
after this change, with unchanged tests and source masks. The dense checker
has 2.670625% engine disagreement, versus 4.32125% in the failed full run. The
half-resolution puppy's independently rendered exports show:

| Fresh-process output | Error at 390 px | Opening overlap | Error at 780 px |
| --- | ---: | ---: | ---: |
| Before indexing | 1.2235% | 37.94% | 1.3309% |
| Indexed loss | 1.0000% | 52.50% | 1.1315% |

Both outputs pass geometry and paper checks, but the earlier opening is too
large for the existing shape regression. The new output retains an enclosed
opening and passes that unchanged threshold. Its shape remains imperfect:
overlap is only slightly above the required 50%. The doubled-resolution
measurements supplement the original 390-pixel test.

These fresh fits are timed runs, not a counterbalanced attribution of all nine
recoveries to indexing. In particular, the three original sloth failures spent
their recovery allowances in HiGHS without a rejected candidate to refine;
their MILP recovery cannot simply be credited to a faster continuous loss.

Seven scalar/native checks, 21 weighted checks, the nine captured replays,
type checking, lint, the build, and 874 application tests pass (one existing
skip). All 1,041 pinned sources match after standard QA. The standalone
benchmark was then added, executed and linted. The complete inverse suite and
browser benchmarks still require a new run. The preview remains on its prior
validated snapshot.
