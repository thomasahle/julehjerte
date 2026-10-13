# Retaining the sparse routing until its actual deadline

Browser QA of the [search-scheduling change](search-scheduling.md) found a
remaining timing cliff. The same uploaded sloth mask could produce either a
clean 2+2-cut pair in nine seconds or a fragmented 6+6-cut pair in nearly a
minute. Both cleared the general 3% image limit. Visual review and comparison
with the previously recorded close fit rejected the latter as an improvement.

## Controlled browser comparison

Every row below uses the same 400-pixel classified mask, original upload,
requested settings and browser application. The mask SHA-256 is
`3e296fe2d3c49167d74ce59a20654efc12ef37e12fbc2f6cff21ee3cce036ff4`.
No cutting paths or previous fitted templates enter the worker. Errors are
measured from the downloaded editable SVG against that 400-pixel mask, rather
than the harness's separate historical 200-pixel thumbnail score.

| Run | Click to ready | Editable disagreement | Slits per sheet |
| --- | ---: | ---: | ---: |
| Earlier recorded browser run, old allocation | 8.71 s | 1.4813% | 2 |
| New QA discovery, old allocation | 53.74 s | 2.4163% | 6 |
| Fresh controlled replay, old allocation | 56.00 s | 2.4225% | 6 |
| Full sparse allowance, first replay | 8.64 s | 1.4813% | 2 |
| Full sparse allowance, control-suite replay | 8.50 s | 1.4813% | 2 |

The prototype changes only one allocation expression. HTTP proxies serve
hashed engine snapshots to fresh browser workers, preserving the same built
application and recording the actual engine requests. The unchanged baseline
is `0ff2baf`. Exact bytes, browser reports, prepared masks, SVG/PDF downloads and
screenshots are retained under `tmp/heart-learning/routing-timeout-v1/`.
The earlier discovery remains under `routing-scheduling-v1/browser/`.

## Cause and change

Feature recovery reserved 20% of its remaining allowance for a denser graph.
On this upload, the sparse graph received about 4.4 seconds. Its first integer
solution had a narrow return and was correctly rejected. The second validation
round was close to finding the valid two-cut routing when the local time limit
ended. The reserved second then went to a much larger graph, which also timed
out. Subsequent grid refinement eventually found the inferior six-cut pair.

The sparse graph has 126 hidden candidates; its denser successor has 393.
Timing out establishes neither infeasibility nor a need for those additional
connections. The revised allocation lets the current graph use the full
remaining recovery allowance. A proof of exhaustion still returns immediately,
leaving later graphs, smoother traces and alternative boundary interpretations
available. The caller's deadline and all image, feature, geometry and paper
checks are unchanged.

With the full allowance, this sparse graph finishes in about 4.6 seconds and
polishing retains the simpler pair. Its paper audit passes at the requested
360-cell resolution. The old six-cut fallbacks used the existing finer 700-cell
verification; this output audit-resolution difference is recorded separately
from the identical requested settings.

## Verification status

All ten prototype Chromium upload/example/export flows pass. The other nine
include the remaining five sloth masks, the star, the free-border hat, the leaf
and the photographed tree. The hat retains exact shared cuts; all accepted
editable exports pass geometry, paper and source-feature checks. This is a
controlled local browser comparison, not a new unseen-photo success count.

The browser regression now requires less than 2% source-resolution editable
disagreement on the shifted sloth. Merely passing the general 3% acceptance gate
can no longer hide the observed loss of quality. A native regression resamples
the existing source mask at the same destination-cell centres, checks its exact
browser hash, fits from pixels with a ten-second allowance and independently
checks exported image/feature fidelity at 400 and 800 pixels.

The committed implementation's broader native, corpus, full-suite and rebuilt
browser verification are still in progress. Nothing has been pushed or deployed.
