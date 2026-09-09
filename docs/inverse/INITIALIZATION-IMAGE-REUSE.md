# Reusing the image across starting grids

The free-border perturbation replay exposed two sources of wasted time. A
colour-inverted top hat received only 0.11 seconds of refinement for its second
candidate after initialization took 2.74 seconds. A separate noisy-border case
spent 0.83 seconds preparing the image before the fitter's own timer started.
Both could leave an otherwise solvable drawing slower or less accurate.

## Fixed image work within one search

A CPU profile of three weighted top-hat initializations spent about 0.72 seconds
validating weights, 0.52 seconds preparing resampled objectives, and 0.43 seconds
in disagreement scoring and its callbacks. The same image, weights and sample
resolutions were being processed again for each count, phase and starting
layout. Dynamic programming remains the largest part of initialization.

`initializationImage` now owns one snapshot of the probabilities and weights.
It prepares each requested image scale once, together with its binary scoring
mask and weight normalization. `gridInitializer` reuses these values for the
same uniform, border-informed, separable and checker-guided starting grids.
Rows assembled from already validated weights enter the dynamic program
directly. The all-one row case keeps the previous arithmetic, including when
the global weight normalization is different from one.

There is no global image cache. A later drawing or weight edit creates a new
snapshot, including for scales that the previous search had not yet used.
The existing `sharedWork: false` reference remains available. Counts, candidate
order, stopping conditions, loss definitions and geometry checks are unchanged.

The paired benchmark also loads the original initializer and count search from
`2243708`. It checks that their other numerical dependencies still match that
commit, rather than comparing two callers of a changed numerical helper.

## Initializer replay

All **129 fixed inputs** preserve every selected starting grid's coordinates,
score, phase, spline size, initialization rounds, termination reasons and seed
order exactly. They comprise the existing 91-case frozen photo/crop corpus,
32 weighted masks and perturbations, and six 400-cell masks captured from the
production browser. No saved cutting templates initialize either policy.

| Inputs | Cases | Median before | Median after | Median paired saving |
| --- | ---: | ---: | ---: | ---: |
| All inputs | 129 | 0.939 s | 0.858 s | 9.5% |
| Regular Hunodan photographs | 22 | 0.706 s | 0.651 s | 8.1% |
| Weighted masks and perturbations | 32 | 1.820 s | 1.285 s | 29.3% |
| Uploaded 400-cell masks | 6 | 2.448 s | 1.377 s | 44.0% |

Policies run serially with alternating order. These are Apple M2 Pro / Node
25.6.1 measurements of initialization, not promises of proportional savings
in a complete solve. The other work performed while this comparison ran was
source editing and a brief preview-only regression; full builds and solver
benchmarks ran separately. Per-case timings and exact equality results are
retained, including inputs with little or no measured saving.

## Original outlines without a second fit

Free-border preparation used to fit, node and repeatedly score the entire
original mask just to make its outline preview. Those curves never entered the
solver: its actual initialization already had a separately prepared supporting
grid. Noise in an editable band therefore caused substantial work even though
its colours were irrelevant to the fitting objective.

The original outline now comes directly from neighbouring binary pixels.
Adjacent horizontal or vertical edges are merged into runs, stored as integer
coordinates in an SVG pixel view box. The physical size and stroke width are
preserved. The preview is pixel-exact, with a title and metadata identifying
that representation; it is no longer a fitted approximation. The original
mask and the fitted supporting outline remain unchanged. Unweighted inputs
keep their existing fitted outline preview.

All **28 paired preparation cases** preserve the original mask and fitted
initialization guide exactly. The median paired preparation saving is 46.3%.
For the 200-cell noisy large top hat, preparation drops from **0.687 seconds to
0.015 seconds** and the outline SVG from 1.63 MB to 31 KB. For its 400-cell
uploaded counterpart, it drops from **1.858 seconds to 0.159 seconds**, with an
82 KB outline instead of 2.03 MB. These are preparation-only measurements.

Regressions reconstruct every two-by-two binary arrangement through the SVG
loader and sampler, then check noisier and larger masks, arbitrary paper widths,
colour annotations, and the separation of original pixels from the fitting
guide. Image-reuse tests compare exact scores and grids across unequal counts,
both phases, soft weights, ignored rows, changed resolutions and later edits.

## Complete fits and a timing-sensitive failure

The full 32-case free-border replay passes every geometry, paper, image and
ten-second check. Its maximum protected-motif disagreement is **0.409%**, with
**5.846 seconds median** and **9.857 seconds maximum** preparation-through-export
time. The formerly slow noisy large top hat finishes in **8.526 seconds**. The
inverted large top hat finishes at **0.0213%** protected disagreement instead of
the previous run's 0.613%.

The first 22-case Hunodan batch passes only **16/22** combined checks: three
cases exceed ten seconds and three different cases exceed their established
image-error limits. These failures are retained in the validation data. In two
affected curved designs, the unchanged fine-grid fits reach exactly the same
errors and iteration counts as before, but take roughly twice as long. That
leaves less of the wall-clock budget for free-curve refinement and polishing.

A subsequent serial, alternating-order comparison substitutes the previous
initializer into the otherwise unchanged full fitter:

| Photograph | Previous initializer | Current initializer | Previous error | Current error |
| --- | ---: | ---: | ---: | ---: |
| `hjcur-03` | 7.311 s | 7.138 s | 0.4516% | 0.4516% |
| `hjcur-04` | 9.212 s | 9.205 s | 0.5511% | 0.5525% |

Both policies pass in these paired fits. A separate complete current-source
replay passes **22/22** Hunodan designs, with **7.605 seconds median** and
**9.530 seconds maximum**, using the same release error limits and existing
one-percentage-point allowance for identical sheets. The recorded timing
includes preparation, solving, validation and export; photograph decoding and
the independent export renderer are measured separately.

These observations identify a refinement-budget deficit in the failed batch,
but do **not** establish why the unchanged computations ran slower. The
successful replay does not guarantee ten-second quality under every runtime
condition. Final fitting remains sensitive to available processing time; exact
initialization equivalence alone cannot guarantee an identical final result.

The failure also exposed a benchmark-harness bug: failed rows were written to
JSON while the process still exited successfully. Both complete-fit benchmarks
now exit unsuccessfully if any requested check fails, and record aggregate
process CPU time alongside wall time. A deliberately failed fitter, an empty
Hunodan selection and a one-second weighted budget verify unsuccessful exit
status while retaining the available failure records.

## Reproduction

The preparation and initialization comparisons use the fixed data described in
[COUNT-STRATEGIES.md](COUNT-STRATEGIES.md) and
[FREE-BORDER-PHASES.md](FREE-BORDER-PHASES.md). The previous weighted and browser
artifacts provide inputs, not fitted solutions. Paths are configurable:

```sh
node scripts/inverse/initialization-image-benchmark.mjs \
  --corpus=tmp/initialization-corpus --weighted=tmp/phase-robustness-final \
  --browser=tmp/phase-browser-final --output=tmp/initialization-image
node scripts/inverse/prepare-preview-benchmark.mjs \
  --weighted=tmp/phase-robustness-final --browser=tmp/phase-browser-final \
  --output=tmp/prepare-preview
```
