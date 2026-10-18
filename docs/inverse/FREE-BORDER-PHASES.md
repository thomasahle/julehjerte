# Choosing free-border topology without fixing its colours

The first weighted implementation recovered the larger motifs well, but its
small house sometimes had 0.52% protected disagreement and its small wizard
hat 0.85%, despite more accurate solutions in the earlier checker experiment.
The failure starts in topology initialization, before final candidate ranking.

The free region was always completed with checker phase zero. The old checker
experiment happened to use phase one on these inputs. Those completions have
different cut connections even though both preserve exactly the same protected
pixels. On phase zero, the MILP repeatedly excludes cuts that approach another
part of themselves too closely. The small house's attempts reported two, four,
three and six self-neck chains before timing out after five seconds. The
subsequent grid fit had little time for free-curve refinement and returned a
legal approximate two-cut layout.

A controlled replay gives each phase 1.25 seconds on the same fresh masks. Phase
one finds the house's exact valid topology in 0.26 seconds, and the wizard hat's
in 0.34 seconds; phase zero fails within that allocation. A smaller boundary
colour jump does not predict the better routing: on these two inputs the
protected-interface disagreement is 39% for phase zero and 61% for phase one.
This is why simply selecting the smoother-looking colour join is insufficient.

## Change in the existing fitter

For artwork with explicitly free pixels, topology initialization now compares
both checker phases, allocating up to 1.25 seconds to each within a 2.5-second
initialization budget. It chooses the valid result with the lowest original
weighted error, or returns to grid/curve fitting when neither succeeds. An
exact valid result can stop the topology attempts immediately. This is a
bounded solver allocation; graph construction and final checks also take time.

Both completions preserve every positive-weight pixel. Their colours are only
initialization proposals, never a fitting target. The same original weighted
mask, feature tests, nominal geometry and paper-core checks accept or reject
both. Phase-one tracing does not reuse phase zero's cached boundary, and the
phase used for symmetry evidence matches the traced proposal. Reports retain
every attempt and the selected phase.

Unweighted artwork and weighted artwork without any zero-weight pixels keep
the existing single-topology path. The grid count/phase search is unchanged;
this adds neither a separate fitter nor another visitor control.

## Uploaded masks and redundant raster corners

Browser QA exposed a second failure at a different resolution. Paint classifies
these uploaded 240-pixel PNGs at their original size, then resizes the binary
mask into its 400-cell canvas. Nearest-neighbour resizing turns the original
pixel stairs into longer steps. Tracing retained 84/88 boundary segments for
the house and 153/157 for the wizard hat, depending on checker phase. Both
topology attempts could then time out even though the fresh 200-pixel benchmark
solved the same motifs easily.

The simplifier already tried larger tolerances, but skipped the intermediate
0.6 mm tolerance and rejected everything above 0.2% weighted disagreement.
That cap is much stricter over a small protected motif than over the whole
square. For explicitly free borders, simplified initialization now uses the
existing topology acceptance cap of 0.5%, with feature preservation still
required. Ordinary photographic inputs retain the 0.2% simplification cap.
An additional 0.6 mm retry is available between 0.5 and 0.75 mm, all scaled to
the overlap width. This changes initialization; it does not increase the final
image acceptance limit or change protected input pixels.

On the exact masks captured from the browser, the two graphs shrink to 49/53
segments for the house and 53/57 for the hat. The isolated topology replay
finds legal exported pairs in about 1.8 seconds each, with 0.276% and 0.385%
protected disagreement respectively. Both new resize regressions fail against
`bb57ca0`, which retains the original redundant segment counts. The regressions
check compactness and source fidelity; complete timing and cutting validation
belong to the separate browser and benchmark replays.

The browser test also retains a sampling diagnosis. Its historical score
resized the 400-cell target to 200 cells before comparison. That changed edge
pixels: the same exported wizard hat measured about 0.34% disagreement at the
source resolution but 0.59% at 200 cells. Editable conversion adds some further
approximation, separately visible in the recorded measurements. Acceptance
now compares the editable result with the actual source mask at its resolution;
the 200-cell score remains in every row for comparison. Paint's result panel
uses the same source-resolution comparison, and the browser replay checks its
displayed percentage against the downloaded editable heart. The small uploaded
motifs have a stricter 0.5% test threshold. Shared exported controls and editor
crossings are checked separately, since a small area error cannot certify
that invisible cuts coincide.

## Fresh solves and perturbations

`weighted-solve-benchmark.mjs` now supports original inputs, inverted colours,
a one-pixel translation in both source axes, and deterministic noise confined
to the zero-weight region. The protected frame remains fixed. `target.png`
records the exact binary input after that transformation; `original.png`
retains the source silhouette. All solves start from the image with fresh
initialization, and exported cubics are independently rendered with resvg.

All **32 cases** pass geometry, paper and the 3% protected-error criterion,
with a maximum observed disagreement of **0.61%**. Preparation, solving,
validation and export finish within ten seconds in **31/32 cases**; the noisy
large top hat takes **10.62 seconds**, including 0.83 seconds of preparation.
These are Apple M2 Pro / Node 25.6.1 measurements. Input decoding and the
independent export renderer are outside that timing.

| Motif | Protected size | Previous weighted error | New weighted error | New seconds |
| --- | ---: | ---: | ---: | ---: |
| Top hat | 64% | 0.360% | 0.360% | 4.23 |
| Top hat | 84% | 0.028% | 0.124% | 9.99 |
| Wizard hat | 64% | 0.854% | 0.055% | 5.42 |
| Wizard hat | 84% | 0.184% | 0.039% | 9.31 |
| House | 64% | 0.519% | 0.000% | 4.55 |
| House | 84% | 0.181% | 0.004% | 8.80 |
| Circle | 64% | 0.031% | 0.031% | 3.56 |
| Circle | 84% | 0.170% | 0.043% | 9.09 |

The small house is exact again, and the small wizard hat returns to 0.055%
disagreement. The larger wizard hat, house and circle also improve with more
time for curve refinement after unsuccessful topology attempts. This does not make every
case faster: trying the second phase adds some work when the first was already
good. Small differences across time-limited replays are retained in the JSON;
the table uses the complete perturbation run, not the best result per case.

Five regressions cover uploaded-mask resizing, guide invariance under changes
to free pixels and colour inversion, phase-specific boundary caching, and the independently
rendered exact house. The house regression fails against `1ffdd50` and passes
with the new initializer.

The previous phase-only 32-case run finished every case within ten seconds,
with a maximum 0.41% error; those results are retained too. The final replay is
not uniformly better. Its colour-inverted large top hat has 0.61% disagreement,
compared with 0.021% previously. Both choose two cuts per sheet. Initialization
increases from 1.76 to 2.74 seconds, and the second candidate receives only
0.11 seconds of curve refinement instead of 1.37 seconds. These logs expose
remaining sensitivity to the available refinement time. The separate noisy
border overrun includes preparation, which precedes the fitter's own timed
budget. The timing overrun is recorded as a speed failure even though the
image and cutting checks pass.

## Browser verification

All **24 production browser workflows pass** in Chromium 145, Firefox 146 and
WebKit 26. Each browser imports the small house and wizard hat, tests both
top-hat sheet settings and the larger free motifs, and solves the star example
and a Hunodan photograph. The downloaded editable SVG must retain every exact
shared cutting span, pass the editor's crossing checks, and reproduce the
percentage shown in Paint within its displayed rounding. The star's PDF
download is checked too.

The small motifs stay below the stricter 0.5% protected-error threshold in
every browser. Chromium finds compact four-cut topologies for them in 8.55 and
9.10 seconds, with 0.185% house error and 0.481% hat error. Firefox's initial
grid search takes long enough to skip topology on these inputs, so it uses the
valid two-cut fallback. Its errors remain below 0.46%, but it is slower. Across
all 24 cases the solve-through-conversion time is 3.96–33.29 seconds. These are
browser measurements, separate from the ten-second Node benchmark.

The earlier browser run's five failures of the 200-cell 0.5% score are retained,
alongside the three-resolution replay that separates export error, editable
conversion error and sampling effects. A subsequent run was intentionally
stopped after ten completed cases to fix the same measurement in the result
panel. The final 24-case run checks the corrected panel against the exported
heart; it does not erase those earlier measurements.

The unchanged photograph benchmark passes **22/22 regular Hunodan designs**
within ten seconds each, with a maximum of **9.74 seconds**. Each result must
meet its established release error, with the existing one-percentage-point
allowance when identical sheets are selected, plus geometry, paper and feature
checks. Timings include preparation, solving, validation and export; photograph
decoding and independent resvg replay are recorded separately. The browser and
both Node benchmarks use the same served engine files, verified by SHA-256.

All **718 application tests and 201 engine tests** pass, along with lint and
the production build. Svelte checking reports zero errors and seven existing
warnings.

[FREE-BORDER-PHASES-VALIDATION.json](FREE-BORDER-PHASES-VALIDATION.json) contains
the source hashes, per-case measurements, topology diagnostics and release
checks. These tests do not establish a global optimum or physical assembly.

```sh
node --test scripts/inverse/topology-phases.test.mjs
node scripts/inverse/weighted-solve-benchmark.mjs --strategies=weighted \
  --variants=original,inverted,shifted,free-noise --output=tmp/free-border-phases
```
