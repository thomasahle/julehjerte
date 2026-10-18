# Five-case browser comparison

The counterbalanced browser replay compares `f4a1af2` with `eaa358a` in
baseline/current/current/baseline order. Each stage starts a fresh Chrome
process, runs the same five photograph imports and uses the same current UI.
The changes under comparison are scalar-loss row indexing, local refinement
of accepted small details and retention of a repair whose successful final
audit finishes late. This experiment does not isolate their individual costs.

All **20 solves finish within ten seconds**. All input identities, crop
coordinates, coverage, settings and browser versions match. Each design's
exported `cut_geometry.json` is byte-for-byte identical across all four runs;
independent native and Paint-mask errors are also identical. Geometry and
paper checks pass for every exported result.

| Design | Baseline median | Current median | Native exported error |
| --- | ---: | ---: | ---: |
| hjfig-01 | 4.34 s | 4.33 s | 0.9892% |
| hjfla-01 | 6.82 s | 6.68 s | 0.7121% |
| hjcur-02 | 7.40 s | 7.15 s | 0.4878% |
| hjhih-04 | 7.98 s | 8.02 s | 0.7750% |
| hjstr-03 | 8.97 s | 8.77 s | 0.5447% |

The median of the five current/baseline timing ratios is 0.9794, about a 2.1%
reduction. One case is slightly slower. Two runs per engine do not establish
a statistically reliable speedup. The earlier component-level scalar-loss
speed improvement therefore must not be described as a comparable whole-app
gain.

Times run from Find-click to the visible, enabled Open in Draw button.
Screenshot capture, artifact writing and independent checks run afterward.
Native errors use the original prepared resolution; the separate enlarged
400-pixel Paint-mask errors are preserved in the data. No search-time override
or saved template initializes a solve.

This is five designs, not the complete 22-design target. A separate run of all
22 regular designs against the actual current build is now in progress. The
preceding full inverse suite's five failures remain recorded, even though all
38 focused replays and the application checks now pass. No preview refresh or
release claim follows from this diagnostic alone.

[Measurements, hashes and qualifications](hunodan-five-browser-comparison.json).
