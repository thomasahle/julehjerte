# Straight and curved spans in the main fitter

Raster artwork now always enters `fitDirect`. The automatic workflow no longer classifies an entire image as photographic, angular or linear, and no longer returns a separate line-art solver result. A single candidate can contain straight spans, curved spans and sharp corners.

The shared `refineCurves` loop proposes lower-degree geometry for nearly straight cubic spans. It replaces their handles with the exact one-third/two-thirds positions on the endpoint chord. A two-pixel complexity cost per curved span encourages fewer unnecessary bends, but a straightened checkpoint is eligible only when it does not increase the mask error of that checkpoint. It must also pass the usual independent geometry and paper-core checks. The continuous optimizer retains its trajectory; selecting a simpler checkpoint does not reset Adam. Sharpening arbitrary rounded corners after fitting is not sufficient to recover a poor cut layout.

Initialization therefore also uses local boundary evidence. Raster staircases are simplified with pixel-aware line fitting; consecutive gentle turns identify spans that need cubic curvature. Both kinds of span coexist in the same boundary graph. A small HiGHS routing problem can supply a topology proposal when that graph preserves the mask within 0.5% and is no worse than the best initialized grid. Every accepted raster topology proposal then passes through `refineCurves`, including the existing feature-recovery proposal. Fresh grid initialization remains available when boundary topology is unreliable. No published cutting templates seed the search.

The join penalty preserves sharp corners already present in an initializer, while retaining the previous smoothing force for smooth joins. The common geometry policy uses the previously supported 175-degree turn limit and local slit-neighborhood factor of eight, including for cubic candidates. Inter-slit spacing and paper-core requirements remain in force. Imported SVGs retain their separate exact-vector handling because their original paths are already available.

The original paths preview now displays the boundary evidence used by initialization. Original mask and comparison views remain available after fitting. All raster results identify the main algorithm as `direct-bezier`; optional topology initialization and primitive counts are recorded in the report.

## Regression diagnosis

The first photo replay exposed regressions that the synthetic hat/house examples did not reveal:

- Replacing every legacy contour initializer with the new mixed boundary approximation made an established feature-recovery graph infeasible. That existing smooth contour proposal is retained as another initializer; its successful result now receives the common refinement and validation.
- Resetting the optimizer after selecting straight geometry changed later search trajectories. Straightening now supplies a checkpoint candidate without that reset, and requires no additional mask disagreement at the checkpoint.
- Removing smoothing from all sharp joins allowed accidental kinks to survive. Corner preservation now applies to corners already present in the initial geometry; smooth joins retain their existing penalty.

Browser QA also found premature abandonment of the circle's topology proposal in Firefox, followed by a poor grid fallback. Its normalized MILP model matches Chromium's exactly, and an extended replay finds the same optimum in 7.57 seconds. The five-second initializer cutoff was too short. A longer requested search budget now permits up to ten seconds for topology within a fifteen-second initialization phase; requests of ten seconds or less retain their previous allocation. The UI replay harness also saves a needs-attention candidate's report before asserting quality, so this failure is reported directly instead of appearing as a missing success heading.

This is local primitive selection and multiple initialization within one fitting process. It does not establish that every border topology can be reconstructed, nor that photographs yield exact original cutting paths.

## Measured results

All 22 regular Hunodan photo crops pass the existing quality and ten-second benchmark criteria. The slowest takes 9.67 seconds. Twenty have no greater independent mask disagreement than the release baseline. The two identical-sheet selections, `hjfig-02` and `hjfig-04`, add 0.676 and 0.912 percentage points respectively, within the existing one-percentage-point matching preference.

Fresh four-cell motif runs use the same main fitter with a ten-second budget:

| Motif | Independent centre disagreement | Straight / curved exported spans | Elapsed time |
| --- | ---: | ---: | ---: |
| Hat | 0.164% | 60 / 0 | 2.28 s |
| House | 0.004% | 49 / 0 | 1.87 s |
| Circle | 0.268% | 38 / 18 | 2.23 s |

All pass geometry and paper-core checks. These timings include preparation, fitting, validation, export and independent rendering on this machine. Centre disagreement excludes the supporting checker border. Curved spans include hidden routing sections; the count is not a count of visible motif arcs. The hat and house retain the preceding specialized route's measured quality, now within the main fitting process.

[Recorded results, settings, source hashes and exported-template hashes](UNIFIED-FITTER-VALIDATION.json) accompany these measurements. CPU contention and runtime differences can affect a search with a wall-clock budget.

The full test suite passes: 132 Vitest tests and 150 inverse-engine tests. Lint and the production build pass. Svelte checking reports zero errors and eight existing editor warnings.

All nine final production-browser replays pass, with the same centre errors in Chromium, Firefox and WebKit. Solve-to-checked-result times range from 2.33 to 10.44 seconds with normal UI defaults, including the 60-second search budget and perturbation checks. The slowest is Firefox's circle; the ten-second Hunodan benchmark uses a separate, explicitly ten-second configuration. The final budget adjustment is additionally covered by 14 focused tests; its allocation for the recorded ten-second motif and photo runs is unchanged.

## Reproduce

```sh
npm test
node scripts/inverse/motif-border-benchmark.mjs --cells=4 --shapes=hat,house,circle --output=tmp/unified-motifs
INVERSE_SPEED_SETTINGS='{"algorithm":"auto"}' INVERSE_SPEED_OUT=tmp/unified-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs INVERSE_TEST_URL=http://127.0.0.1:4174 node scripts/inverse/straight-artwork-browser-test.mjs
```

The focused unit test places a noisy straight span and a real S-curve in the same candidate, then checks that one becomes exactly straight and the other remains unchanged. Integration tests start from fresh hat, house and circle masks, including resize and subpixel-translation preparation tests. Browser replays upload PNGs, solve through the actual worker, download the template ZIP, independently render the exported cuts, and visit both templates and all comparison views in Chromium, Firefox and WebKit.

The Hunodan benchmark uses the frozen photograph crops and compares independent export-renderer errors with the existing release baseline. Its quality criterion allows the already requested one percentage point additional error when the selected sheets are identical. Timing covers preparation, fitting, validation and export; decoding and external rendering are measured separately.
