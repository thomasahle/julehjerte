# Repository templates as candidate synthetic sources

The procedural corpus has 192 cutting geometries but only three recipe groups.
This diagnostic checks whether the existing gallery can contribute more varied
curves with known cutting paths. It does not allocate training data or change
the existing splits.

All 38 unique catalogue SVGs were imported through the production parser.
Square overlap regions were normalized to 100 mm, converted to the direct curve
graph, checked with the existing synthetic geometry and paper-core profile,
and rendered independently through resvg. The source application's rasterizer
was also compared with that independent render. No cuts were fitted or repaired.

| Initial result at 256 pixels | Templates |
| --- | ---: |
| Pass geometry, paper and both rendering comparisons | 14 |
| Pass geometry/paper, exceed 0.5% rendering disagreement | 4 |
| Rejected by strict square-overlap import | 5 |
| Rejected by the synthetic geometry profile | 15 |

The four rendering failures (`gaver`, `jul`, `sun`, `lilje2`) and one passing
control (`ramme`) were replayed at 512 and 1024 pixels. All five pass at both
resolutions, with identical exported cutting geometry. For example, `gaver`
has 0.7782%, 0.3899% and 0.1951% disagreement at 256, 512 and 1024 respectively.
Every differing pixel in that example touches a source-mask boundary; these
are axis-aligned boundaries, not diagonal cut errors. Across the five designs,
differences concentrate on boundaries, although several curved cases also
have a few differences away from immediate boundary pixels. This supports
sampling sensitivity; it does not prove the exact renderer quantization cause.
The original failures and their masks remain preserved.

There are therefore **18 numerical candidates**, not 18 new training families.
Visual review of all 18 source/independent pairs finds matching motif structure
at contact-sheet scale. It also finds specks and faint internal seams in
`circle`, and faint diagonal traces in `stjerne`. Those need further coverage
and shared-cut review before using them as clean supervision. The audit does
not silently remove these marks or relabel the source.

The rejected geometry must also be interpreted in context. The synthetic
profile uses a 150-degree turn limit, stricter than the automatic fitter's
175-degree limit, and assumes a 100 mm overlap with explicit cutting clearance.
Failures include turns, clearance, out-of-square geometry and self-crossings;
they are not a general verdict on the gallery's physical templates. The strict
square-overlap check also rejects some very small width/height discrepancies.
No stretching or tolerance change was introduced to admit them.

All candidates remain **unassigned**. Gallery designs may overlap existing QA
inputs or each other's motif families. Review those relationships before
allocating new synthetic examples, keep evaluation families reserved, and do
not random-split by SVG filename. No training, ONNX export or browser-model
deployment occurred in this study.

The [evidence record](repository-template-candidates.json) pins the source
implementations and SVGs, per-design outcomes, resolution comparisons and
local artifacts. Probes, masks, cutting graphs and the three reviewed contact
sheets are under `tmp/heart-learning/library-geometry-v1/`. The latest full
[production release checks](trace-search-order.md) remain unchanged.
