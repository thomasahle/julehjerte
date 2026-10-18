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
The [controlled-probe evidence](routing-timeout-probe.json) records all twelve
browser flows, verifies identical prepared inputs and requested settings,
checks that only the allocation expression differs between the two snapshots,
and pins 117 completed artifacts by hash.

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

Commit `0bb8ace` applies the allocation and regression checks. All 14 targeted
tests pass, including native routing, delayed deferred recovery and retention of
later graphs after proven exhaustion. Eight fresh native crop-variant runs also
pass with less than 2% disagreement and under ten seconds each (maximum 9.61 s).
All eight retain their pass through independent rendering and complete editable
conversion; the eight preserved prior outputs also pass that replay.

The fresh Hunodan benchmark retains **22/22**, with exactly the same measured
errors and a maximum of **8.257 seconds**. The automatic-photo benchmark remains
**24/31**: all 47 inventory entries retain their prior status and pass/fail
outcome, including the 16 incomplete or obscured exclusions. Source quads,
classified masks and fitting probabilities are unchanged. The four remaining
fit failures pass geometry and paper checks but fail image or feature fidelity;
the other three eligible failures have no crop proposal. All 855 application
tests pass, with one existing skipped test.

All **772 inverse tests** pass, including the corrected longer-budget recovery
test and the added 400-pixel upload regression. Type checking and lint pass with
their existing warnings, and the production build passes. All **ten Chromium
flows** pass against that rebuilt application, with editable SVG reimport,
geometry, paper and source-feature checks. Eight flows additionally download a
PDF and verify its file signature; the hat and tree flows exercise SVG only.
The evidence audit originally assumed a PDF for every flow and was corrected
to the actual harness coverage before the release record was generated.

| Production browser case | Click to ready | Editable disagreement |
| --- | ---: | ---: |
| Sloth, mixed-model crop | 7.804 s | 1.3181% |
| Sloth, positive horizontal shift | 8.751 s | 1.4813% |
| Sloth, negative vertical shift | 9.974 s | 1.3306% |
| Sloth, frozen-model crop | 8.194 s | 2.1206% |
| Sloth, synthetic-control crop | 8.679 s | 0.8681% |
| Sloth, positive vertical shift | 9.205 s | 1.1119% |
| Star example | 1.999 s | 0.1600% |
| Free-border hat | 7.722 s | 0.4119% protected motif |
| Leaf mask | 9.118 s | 2.6300% |
| Photographed tree | 8.182 s | 1.0575% |

These browser inputs are 400-pixel Paint masks, including resampled versions of
the 250-pixel native sloth study. They are not identical optimization targets;
the frozen-model crop's 2.12% browser error is retained rather than presented as
its smaller native error. Browser timings end when Open in Draw becomes ready;
downloads and independent export auditing follow afterward. No neural model is
running in the browser: those crop labels identify the fixed test-mask origins.

Visual inspection of all ten result screenshots confirms that the shifted
sloth retains the cleaner two-cut silhouette. Some contour irregularities
remain, and this is not physical assembly validation. The hat retains 43 exactly
shared exported spans, and the vertical sloth retains its finer 700-cell paper
audit through export. All source masks are identical to the preceding browser
run. None of the acceptance rules or physical tolerances changed.

The [complete release record](routing-timeout.json) pins 103 current source files
and 1,048 release artifacts, plus the 117 controlled-probe artifacts. An
independent audit verifies their hashes, paired inputs, all required checks and
the recorded outcomes. The owned preview is running the verified build at
`http://127.0.0.1:5232/editor/mal/`; the served changed modules and page match the
build bytes. Nothing has been pushed or deployed.
