# Compare grids after minimum-width preparation

Runtime commits `d5ab6a6` and `4142aa8` address a reproduced flower regression:
the fitter retained the right 3+3 slit hypothesis but spent almost all its
refinement time on 2+4. The latter looked better before enforcing strip width;
after that preparation, its grid error was 5.003%, versus 3.668% for 3+3.
The old order gave the two candidates 3.131 and 0.114 seconds, respectively.
The [original diagnostic](flower-budget-diagnostic.json) remains unchanged.

The main fitter now compares one existing alternative after the first
candidate's minimum-width preparation worsens its score. The alternative
must have no more total cuts and beat the prepared incumbent using the
existing image-error-plus-cut-count score. Both preparations are cached;
the original candidate stays queued. Reordering requires valid geometry,
the configured paper-core check, and preservation of any source colours
retained by the incumbent. Weighted, explicitly symmetric and feature-seeded
fits keep their existing scheduling. The overall deadline, original target,
final image/feature checks and matching-sheet allowance are unchanged.

## Fresh flower replay

Both hash-pinned photographic crops use their original ten-second settings.
An independent renderer checks the exported curves against the unchanged
classified masks. These are estimated photographic targets, not original
artwork or the author's cutting paths.

| Input | Previous error | Current error | Current cuts | Fit, validation and export |
| --- | ---: | ---: | --- | ---: |
| Native photograph | 0.450% | 0.450% | 3+3 | 6.925 s |
| Downsampled photograph | 1.332% | 0.615% | 3+3 | 8.926 s |

Both outputs pass geometry and paper checks. The current downsampled result
removes the old unwanted connections near the corners. Small contour defects
remain around the flower centre. The comparison uses a common paper palette;
its displayed difference counts are checked against the measured errors.

## Broader native checks

The 31 complete hard photographs retain all **25** previous accepted pairs.
All 25 also pass editable conversion, independent geometry, paper and source
feature checks. All 47 catalogue entries, including incomplete/excluded
entries, retain source bytes, crop coordinates and classified/fitting targets.
There are still six unsuccessful complete photographs.

Pass retention does not establish uniform error improvement. Among the 25
accepted pairs, eleven errors are identical, one decreases and thirteen
increase. The largest increase is the floral checker, from 1.929% to 2.281%.
It does not execute the new comparison. Visual review of six selected cases
also finds border deformations, rounded corners and small false openings in
otherwise accepted exports. These defects are not waived by the pass count.

The new comparison runs for three photographs in this full replay. It
prefers the candle's existing 1+1 candidate, preserving its 0.48375% error
while reducing fit/validation/export from 4.183 to 3.311 seconds. The bauble
alternative is rejected on score. The Viking alternative loses source colours
and is also rejected; preparing it still costs 0.353 seconds. The Viking's
final error increases by 0.068125 percentage points. An unsuccessful
comparison has a real cost under a fixed deadline.

All **22 regular Hunodan designs** pass the established release quality
checks and finish below ten seconds, with a maximum of **9.214 seconds**.
Twenty errors equal the immediately preceding release; two are slightly
higher (`hjhih-04`: 0.778% to 0.791%; `hjstr-03`: 0.561% to 0.626%). Thus this
full run does **not** meet the stricter unchanged-or-lower error goal.

Neither Hunodan case runs the new comparison. A separate unchanged-code
control and current-code pair reaches equal or lower errors in the current
version. One full-run clearance pass stops at 130 steps instead of 150.
This supports deadline sensitivity; it does not prove equal accuracy under
every load. The full 22-case measurements are retained, not replaced by the
isolated pair. The control engine's actual copied-source hashes are recorded
separately because its benchmark header inventories the working source tree.

## Rejected prototype and test-harness correction

The first prototype allowed a larger early alternative. It passed the flower
check but lost the gingerbread photograph: preparing a rejected 3+5 grid
cost 0.728 seconds, alongside slower initialization stages. That complete
24/31 replay is retained. The corrected policy restricts early alternatives
to the current cut complexity; larger grids keep their ordinary turns.
The next complete replay restores all 25 previous passes.

Repository QA also exposed an existing clipping test timeout. Its path-only
SVG renderer repeatedly scanned system fonts. Disabling font discovery
produces identical raster pixels for all twelve deterministic loop fixtures,
reducing their rendering time from 2.478 seconds to 0.004 seconds in the
controlled diagnostic. Commit `3461073` changes only that test helper;
no timeout, fixture, geometric assertion or application renderer changes.
The focused seven-test suite then passes in 0.259 seconds of test time.

## Validation status and artifacts

Type checking, lint and all 855 application tests pass after the font-scan
correction (one existing application test is skipped). Full inverse QA passes
the flower but finishes at **809/813**. The candle test required the old route
through an uncertain two-cut candidate; it now checks the same one-cut output
and independent error bound, plus explicit final geometry and paper validity.
That focused test passes. Dedicated uncertain-paper fixtures remain unchanged.

The three other failures concern the original, horizontal-shift and
vertical-shift near-miss photographs. Two skip feature initialization; the
third misses the sun-outline error bound. All seven focused near-miss tests
pass separately with their original criteria, and fresh unchanged/current
control replays pass the four photographic variants. Those repeats do not
replace the failed full suite.

The [deadline diagnostic](feature-deadline-diagnostic.json) reproduces a
specific scheduling cliff without changing the inputs. With a monotonic
clock advancing 1.5 times faster, both unchanged and current engines skip the
feature initializer and reject all four images. The ordinary fine grids have
exactly the same counts, phases, errors and 150 steps as the normal current
run. The new clearance comparison executes in none of them.

The initializer's 3.5-second availability threshold is evaluated **after**
clearance and polishing reserves. On a ten-second request, the decision must
therefore occur before roughly 2.7 seconds. When it misses that threshold,
the solver instead spends roughly five virtual seconds on unsuccessful MILP
recovery. Ordinary refinement then fails to recover the lost source region.
This identifies a real cutoff; the clock experiment is not an actual browser
latency measurement or a guarantee of identical results under every load.

Three offline prototypes preserve the original deadline and acceptance limits.
Reducing the initializer threshold recovers three of four under the 1.5x clock.
Deferring speculative MILP or allowing a close, physically valid near miss to
propose finer outline curves also yields three accepted pairs, but only two
meet the stricter sun-outline fixture check. None is promoted. The original
case and budget-sensitive local detail remain unresolved.

Build and browser validation have not run after these failures. The owned
preview remains on its previously checked build; this is not an all-green
release.

The [native evidence record](clearance-order-native.json) records 466 source
hashes from that benchmark run and pins 697 local artifacts, including the rejected prototype
and unchanged-code control. The local study is
`tmp/heart-learning/clearance-order-v2/`. It contains the
fresh flower exports and `comparison.png`, the complete photo and editable
reports, three inspected photo comparison sheets, the full Hunodan results,
the unchanged/current paired control and `hunodan-variance.json`, and both
QA attempts. The rejected larger-grid prototype is preserved in
`tmp/heart-learning/clearance-order-v1/`. Nothing is pushed or deployed.
