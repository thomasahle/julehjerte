# All 22 regular Hunodan designs in the browser

All 22 regular designs complete through the current production browser pipeline
in under ten seconds: **5.63 s median, 8.67 s maximum**. Every run passes the
independent exported-geometry and paper checks. Native-image error is unchanged
or lower for every design.

The photographs are imported through automatic corner detection and mask
conversion before fitting. The engine receives no reference-template seed,
substituted version or shortened time budget. Find-click-to-ready timing
includes preparation, worker solving and editor conversion; artifact capture
and independent audits follow afterward. All native masks, coverage, crop
coordinates, settings and browser versions match the earlier 22-case run.

| Design | Click to ready | Native exported error |
| --- | ---: | ---: |
| hjfig-01 | 4.12 s | 0.9892% |
| hjfig-02 | 3.72 s | 0.5481% |
| hjfig-03 | 4.41 s | 0.6592% |
| hjfig-04 | 4.55 s | 1.4016% |
| hjfig-05 | 5.58 s | 0.7678% |
| hjfla-01 | 6.29 s | 0.7121% |
| hjcur-01 | 5.61 s | 0.5092% |
| hjcur-02 | 7.00 s | 0.4878% |
| hjcur-03 | 5.42 s | 0.4238% |
| hjcur-04 | 7.70 s | 0.5419% |
| hjcur-05 | 4.28 s | 0.9451% |
| hjhih-01 | 6.98 s | 0.5920% |
| hjhih-02 | 5.47 s | 0.3859% |
| hjhih-04 | 7.62 s | 0.7750% |
| hjstr-01 | 4.99 s | 0.7295% |
| hjstr-02 | 6.53 s | 0.4122% |
| hjstr-03 | 8.66 s | 0.5447% |
| hjsta-01 | 5.65 s | 0.7888% |
| hjsta-02 | 4.52 s | 0.2169% |
| hjsta-03 | 8.58 s | 1.2257% |
| hjsta-04 | 7.18 s | 0.4885% |
| hjsta-05 | 6.69 s | 1.0577% |

## The resized-mask qualification

The 400-pixel Paint-mask error for hjfig-05 increases from 1.008125% to 1.015625%:
**12 additional pixels out of 160,000**, or 0.0075 percentage points. Its native
337-pixel error improves from 0.777501% to 0.767815%, 11 fewer mismatched pixels.
Both measurements are retained. This result meets the speed target and
preserves native source accuracy; it does not establish that every resized
comparison improves too.

## Limits and follow-up

This is one complete current run. Historical timing differences do not isolate
an implementation speedup. The separate [counterbalanced five-case comparison](hunodan-five-browser-comparison.md)
measures about 2% lower median time and identical exported coordinates across
all four runs. The two experiments answer different questions.

The full inverse suite on the preceding runtime had five failures. All 38 focused
current replays and 874 application tests now pass (one existing skip), as do
check, lint and build. The next complete inverse run will capture the exact
source and output after any coverage or near-miss assertion fails, without
adding capture work to a successful solve or changing any acceptance limit.
The stable preview has not been refreshed.

[Full measurements, input identities and evidence hashes](hunodan-22-browser-speed.json).
