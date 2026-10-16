# Generator robustness results

## Current coverage: tilted partitions inside layered frames

A final layered-frame fallback tilts the internal panel seams before clipping
and routing the motif, then restores its original coordinates before attaching
the frame. This can avoid grazing a small detail without distorting the visible
motif or its circular border. The existing successful layouts return before this
bounded two-angle fallback. Shared connections in the selected new construction
receive the same checked corner rounding used by the text checkerboard.

The Tabler paw now works in the layered frame with nine strips per sheet. Its
straight prototype had **three tips below 30° / four below 45°**; the selected
rounded construction has **one / one**. It retains the paw outline, medallion and
both complete outer bands, with coincident cuts and no cutouts. JSON and SVG
handoffs preserve the rendered weave and pass the editor's spacing checks.
The production output exactly matches the inspected prototype and passes the
separate paper-connectivity audit at resolution 1,400; the identical prototype
also passes at 2,800. At frame sizes 60, 70 and 80, the default motif scale
passes the same audit. The six smaller/larger motif-scale combinations in that
nine-case sweep remain refused (`tilted-size-material.json`). These discrete
checks do not certify physical tear strength.
Artifacts: `tilted-production-gallery-0.png`, `tilted-production-material.json`,
`shear-quality-material-hires.json` under `tmp/generator/`.

A fresh full-pipeline run of **all 51 layered-frame cases** gives **50 accepted /
one refused / zero invalid**, with no regressions (`tilted-layers.json`). The
crown remains refused. Combined coverage is **2,820 accepted / 330 refused / zero
invalid**, with **1,085 / 37** figures and the unchanged **1,735 / 293** text cases
(`tilted-current.json`). The other 3,099 records retain their previous results;
this is not a fresh run of all 3,150 cases. The paw is added to the expected corpus.

Tilted coffee-cup prototypes passed the geometry checks but remained uncertain
in the material audit, including at higher resolution, so that fallback was not
added to the oval frames. Additional ANNA checkerboard experiments have not yet
improved its eight narrow N-corner tips. The broader goal remains unfinished,
including the remaining refused combinations, other sizes and icon-catalog coverage.

Type checking, lint and the production build pass, with seven existing warnings
(`tilted-check.log`, `tilted-lint.log`, `tilted-build.log`). The single-worker full
unit run reports **1,116 passed / one timed out** in 756 seconds
(`tilted-tests.log`). All new tests pass. The remaining timeout is the existing
Kalam ANNA ordinary-repeat case: 21.99 seconds against its unchanged 20-second
limit. It passes alone in 8.05 seconds (`tilted-kalam-focused.log`); the full suite
is still not green. All **177 inverse-engine tests pass** separately in 86.74
seconds (`tilted-inverse.log`).

## Current coverage: align shared contacts across clipped panels

The last-resort text layout now reserves each internal panel seam for its agreed
shared-cut contact. Previously an extra invisible cut could attach at another
clipped outline vertex: each cell was valid alone, but stitching them produced
a branching cut. The restriction applies during route selection, counter
connections and notch relief. An optional division through wider gaps in the
letter's coordinates keeps the clipping and stitching lines aligned across
rows. Letter outlines and counters remain unchanged; counters use coincident
cuts, never cutouts.

The figure fallbacks add a vertical two-panel layout and move a two-panel seam
away from small outline details in fitted and layered frames. They run after
all established straight and curved constructions. Existing successful layouts
therefore return before these new choices are attempted.

Seven previously refused combinations now pass through the application generator:

| Input / frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|
| Cinzel BO / air | 8×8 | 0 / 0 |
| Cinzel BO / oval | 8×8 | 1 / 3 |
| Tabler bow / fitted | 4×4 | 0 / 2 |
| Snowflake / oval plain | 4×4 | 0 / 6 |
| Snowflake / oval rays | 4×4 | 0 / 10 |
| Snowflake / oval checks | 4×4 | 0 / 6 |
| Phosphor butterfly / layered | 8×8 | 1 / 2 |

Both JSON and SVG handoffs pass for all seven, including the editor's geometry
checks, no-cutout assertion and rendered-weave comparison. The heart and both
cutting sheets were rendered and inspected (`seam-production-gallery-{0..6}`;
the final cached outputs in `seam-final-gallery-{0..6}` are identical).
All seven pass the separate guarded rolling-disk connectivity audit at
resolution 1,400 (`seam-production-material.json`). This discrete model does
not certify physical tear resistance or the remaining fine tips.

The prototype produced a curved butterfly with fewer tips, but its material
check failed. The chosen straight construction passes at both 1,400 and 2,800.
Three oval coffee-cup prototypes remain uncertain at both resolutions and were
not added. Those are not accepted recoveries (`seam-prototype-material.json`,
`seam-refined-material.json`).

The final bounded fallback was scanned against all **338 previous refusals**;
it recovered these seven and refused the remaining 331 (`seam-fallback-audit.json`).
Seven full production generations and their handoffs were then checked. Combined
coverage is **2,819 accepted / 331 refused / zero invalid**: text **1,735 / 293**,
figures **1,084 / 38** (`seam-current.json`). The other 3,143 full-pipeline records
retain `nested-current.json` results; this was not a fresh run of all 3,150 cases.
All seven recoveries are pinned in the expected corpus. The broader goal is
unfinished, including other sizes and the rest of the icon catalog.

Curve fitting also reuses the same Bernstein coefficients within each fitting
pass, preserving arithmetic order. A bounded cache scoped to a generation request
reuses exactly identical outline fits across candidate layouts. Tolerance is
part of the key, returned controls are isolated from later edits, and no artwork
is retained between requests. All **132 paired fits are identical**; the final
comparison took 855 ms before and 597 ms after the coefficient change
(`seam-fit-comparison-final.log`). All seven final production designs also match
their pre-cache versions exactly. These are local measurements, not a browser
latency guarantee.

The full Cinzel BO/oval path remains slow: the focused end-to-end test measured
about 28 seconds before caching and 22 seconds with the retained changes, over
its 20-second limit. Its new unit regression therefore isolates the adaptive
panel construction and validates both exports; full-generation coverage is in
the offline production audit above. No existing test timeout was raised. The
latency problem remains open; the new fallback itself takes roughly one second,
with most time spent on preceding unsuccessful constructions.

Type checking, lint and the production build pass, with seven existing warnings
(`seam-check-final.log`, `seam-lint-final.log`, `seam-build-final.log`). The full
single-worker `npm test` run reports **1,113 passed / two timed out** in 750
seconds (`seam-tests.log`). All new regressions pass. The only failures are the
existing Kalam `A` and `ANNA` ordinary-repeat tests, at 20.04 and 21.89 seconds
against their unchanged 20-second limits. Both pass together in the focused
rerun (15.25 seconds of tests; `seam-kalam-focused.log`). The full suite is not
green, and its timing issue remains unresolved. All **177 inverse-engine tests
pass** separately (`seam-inverse.log`).

The old Cinzel curved retry has completed all 199 cases. Its sole recovery is
BO/diamond, which was already supported; it adds no new coverage. Its durations
include earlier process suspensions and are not latency measurements.

## Current coverage: reconnect nested counters in the layered frame

The layered frame has one additional fallback for nested contours. When a
straight chain cannot alternate with a contour's two external attachments, the
fallback opens its counters around either attachment. It keeps one complete
entry-to-exit path on each sheet, rejects branches and cycles, and checks shared
connections against every descendant outline. It ranks the valid connections
by cutting cost. Every visible contour and both outer bands remain unchanged;
counters still use coincident cuts on the two sheets, never cutouts.

This fallback runs after the existing layered layouts. It retains seven strips
per sheet. If its straight connections fail the final checks, it tries curved
approaches before the global straight-rerouting fallback. That order matters:
the bicycle's straight reroute passed spacing but introduced three tips below
45°, whereas retaining its curved connections gives zero. All accepted paths
still pass the complete converter and artwork-fidelity checks.

Four previously refused figures now pass in the layered frame:

| Figure | Paper strips | Tips below 30° / below 45° |
|---|---|---|
| Tabler cookie | 7×7 | 2 / 2 |
| Phosphor cat | 7×7 | 0 / 0 |
| Phosphor bicycle | 7×7 | 0 / 0 |
| Tabler gift | 7×7 | 0 / 0 |

Their production heart and both paper sheets were rendered and inspected in
`nested-production-gallery-{0,1,2,3}.png`, with matching SVGs. Both JSON and SVG
handoffs pass (`nested-production-metrics.json`). All four also pass the separate
guarded rolling-disk connectivity audit at resolution 1,400
(`nested-production-material.json`). That discrete model does not certify
physical tear resistance or small tips; the cookie's two narrow tips remain.

The fresh 51-case layered audit reports **48 accepted / three refused / zero
invalid**, with four recoveries and no acceptance regressions
(`nested-production-layers-final.json`). The remaining layered refusals are the
Phosphor butterfly, Phosphor crown and Tabler paw.

A direct comparison with the preceding generator confirms that **43 of the 44
previously accepted layered designs are byte-for-byte identical**
(`nested-existing-comparison.json`). The remaining palette uses the new nested
fallback before the old global retry. It stays on 7×7 strips and improves from
**4/6 to 2/2** tips below 30° / below 45°. Both versions pass the separate
1,400-resolution material audit (`nested-palette-material.json`), and their
heart and cutting sheets were inspected in `nested-palette-gallery-{0,1}.png`.

All four recoveries are pinned. Combined coverage is now **2,812 accepted / 338
refused / zero invalid**: text is unchanged at **1,733 / 295**, figures are
**1,079 / 43** (`nested-current.json`). Only the 51 layered cases were freshly
rerun; the rest retain `curve-export-current.json` results. The broader goal
remains unfinished, including other sizes and the rest of the icon catalog.

Type checking, lint and the production build pass, with seven existing type-check
warnings (`nested-check-final.log`, `nested-lint-final.log`, `nested-build.log`).
The full single-worker `npm test` run reports **1,104 passed / one timed out**
in 848 seconds (`nested-tests.log`). All four new frame regressions pass. The
only failure is the existing Kalam `ANNA` ordinary-repeat test at 21.58 seconds
against its unchanged 20-second limit. It passes alone in 7.96 seconds
(`nested-kalam-focused.log`). The full run is not green; its timing issue remains
unresolved, and no timeout was raised. All **177 inverse-engine tests pass**
separately in 92 seconds (`nested-inverse.log`). The old Cinzel diagnostic was
suspended during testing and has been resumed; its elapsed times include those
pauses and must not be interpreted as generation latency.

The earlier experiment that only counted the extra outer strips in local
clearance recovered none of the seven layered failures, even with curved
retries (`layer-width-curved-probe.json`). That change was not shipped. The
nested-contour fallback retains the existing clearance thresholds.

## Current quality: round only sharp shared joints in the finished cuts

The checkerboard quality pass now works on the already fitted paper paths.
It identifies a cubic shared by the two sheets, including reversed references,
and curves only an end that currently forms a tip below 45°. Both sheets receive
the same handle. All endpoints, visible curves, other handles, strip counts and
segment counts remain unchanged. There is no second outline fit or additional
layout search. The result must reduce the exported tip counts, remain inside the
overlap and pass the editor's full crossing/spacing check; otherwise the original
design is retained. This optional pass runs once on a selected checkerboard.

For Nunito `amy`, tips below 30° / below 45° improve from **3/12 to 3/3** on
the same 6×6 strips. For lowercase `anna`, they improve from **2/3 to 2/2**
on the same 4×4 strips. The pass moves nine and one shared connection ends,
respectively, on both sheets. Uppercase `ANNA` stays exactly unchanged at 0/8:
those remaining tips belong to visible letter outlines. The three comparisons
have zero weave differences at 600 pixels (`curve-export-paired.json`). Their
production heart and both cutting sheets were rendered and inspected in
`curve-export-final-gallery-{0,1,2}.png`, with matching SVGs, and both JSON/SVG
handoffs pass (`curve-export-final-metrics.json`).

All **134 previously accepted checkerboards** pass the production audit again,
with **zero refusals, invalid output or regressions** (`curve-export-accepted.json`).
No new input is claimed as supported by this quality pass. Combined coverage
remains **2,808 accepted / 342 refused / zero invalid** from
`symmetric-frame-current.json`; the broader goal is still unfinished.

The production `amy` and unchanged `ANNA` pass the separate guarded rolling-disk
audit at resolution 1,400. For lowercase `anna`, the exact original and final
production output both remain uncertain at 1,400 (the same four conservative
core islands and zero possible-core islands on one sheet). **Both pass at
2,100 and 2,800**, with no detached core islands on either sheet. The reports
are `curve-export-final-material.json` and
`curve-export-lower-material-{1400,2100,2800}.json`. This discrete connectivity
model does not certify physical strength or tear resistance.

An earlier version curved all shared connections and refitted the whole
construction. Lowercase `anna` remained uncertain even at 2,800, whereas its
original passed, so that broader version was discarded. Early probes also used
case-only filenames (`anna` and `ANNA`) on a case-insensitive filesystem; the
uppercase files overwrote the lowercase witnesses. Those early lowercase
material-pass claims are invalid. The authoritative comparisons above use
distinct numeric or `lower` filenames, and the same resolution for both sides.

The nine focused geometry tests and the two end-to-end `amy`/`anna` regressions
pass. Type checking, lint and the production build pass, with seven existing
type-check warnings (`curve-export-{unit,focused,check,lint,build}.log`). The full
single-worker `npm test` run reports **1,099 passed / two timed out** in 865
seconds (`curve-export-tests.log`). The failures are the existing Kalam A/ANNA
ordinary-repeat tests, at 20.63 and 26.36 seconds against their unchanged
20-second limit. Both pass in the focused rerun (15.09 seconds combined;
`curve-export-kalam-focused.log`), and all **177 inverse-engine tests pass**
separately (`curve-export-inverse.log`). The full run is not green, and its
timing problem remains unresolved. No timeout was raised. The new checkerboard
regressions pass.

## Current coverage: separate cuts around every flat frame side

The diamond's outer routing now separates cuts on all four sides when several
cells connect to that side. Previously the two sides used by tall layouts
projected cuts directly along the frame, where they could overlap neighbouring
frame sections. Each quadrant now reflects into the same corner construction;
single-axis reflections reverse the angular order. A lone gate keeps its
existing direct projection. Letter outlines, counter connections, frame shape
and requested text remain unchanged.

The three-line `A\nB\nO` construction now passes with Nunito, Bree Serif,
Oswald, Kalam and Righteous, all on 5×5 paper strips. Both JSON/SVG handoffs pass,
and the heart plus both cutting sheets have been rendered and inspected in
`symmetric-frame-gallery-{0,1,2,3,4}.png` and the matching SVGs. Tip counts below
30° / below 45° are respectively 0/10, 0/5, 3/11, 2/5 and 0/9. This is a routing
repair, not a claim that all fine letter features have become easy to cut.
The same correction also recovers Cinzel B and BO in diamond, with 6×6 and
8×8 strips. Their JSON/SVG handoffs pass, and both cutting sheets have been
rendered and inspected in `symmetric-cinzel-gallery-{0,1}.png`. They have
respectively 0/4 and 0/8 tips below 30° / below 45°. All seven new designs pass
the separate guarded rolling-disk connectivity audit at resolution 1,400
(`symmetric-frame-material.json`). This discrete model is not a physical
strength or tear-resistance test and does not certify small tips.

The completed **204-case diamond text audit** reports **184 accepted / 20
refused / zero invalid**, with seven recoveries and no regressions
(`symmetric-frame-diamond-text.json`). Its Cinzel A-B duration includes the
audit's suspension during testing and must not be used as generation latency.

All **153 diamond figure combinations** were rerun: **150 accepted / three
refused / zero invalid**, with no status changes or regressions. Reports are
`symmetric-frame-diamond-{rays,check,plain}.json`. An additional **48 multiline
diamond cases** cover blank lines, accents, uneven line lengths and up to six
rows: **44 accepted / four refused / zero invalid**
(`symmetric-tall-extra.json`). The remaining four are Oswald's vertical Å/Ø/Æ,
and Cinzel's ANNA/BO/IDA, Å/Ø/Æ and six-row A/B/O/A/B/O. These extra cases are
outside the existing corpus and are not added to its coverage totals.

All seven recoveries are pinned, retaining every preceding success. The combined
3,150-case record is now **2,808 accepted / 342 refused / zero invalid**: text
is **1,733 / 295**, figures **1,075 / 47** (`symmetric-frame-current.json`).
This retains earlier results outside the 357 freshly audited diamond cases;
it is not a complete fresh rerun. The full goal remains unfinished, including
the remaining refusals, other sizes and the rest of the icon catalog.

### Topology-check runtime

Profiling Kalam A in ordinary repeat found 16% of samples directly in the local
graph walker, plus allocation and key-lookup costs (`kalam-runtime.cpuprofile`).
The walker now computes endpoint keys once for both sheets, builds adjacency
arrays in place, and records visited edges by index. It retains the same
rounded keys, endpoint proximity test, gate pairings, degree checks, edge order
and requirement to visit every selected edge.

A differential prototype compares every returned point by object identity,
including rejected graphs: **325,092 text candidates** and **68,458 figure
candidates** match exactly. The reports are `compact-route-differential.json`
and `compact-route-figure-differential.json.comparisons.json`. The latter covers
all 51 circle-rays figures with their complete handoffs: 50 accepted and one
unchanged refusal, with zero invalid output.

Two paired runs in alternating order give the following average generation
times, with identical final cuts and colour phase in each pair
(`compact-route-compare.json`):

| Case | Before | After |
|---|---:|---:|
| Kalam A, ordinary repeat | 8,478 ms | 7,847 ms |
| Kalam ANNA, ordinary repeat | 9,847 ms | 8,639 ms |
| Nunito amy, checkerboard | 9,074 ms | 8,621 ms |

These measurements ran alongside audits, so they do not establish browser
latency. Type checking, lint and the production build pass; the type check
retains seven existing warnings (`symmetric-frame-{check,lint,build}-final.log`).
The full unit run reports **1,098 passed / one timed out** in 768 seconds
(`symmetric-frame-tests.log`). Kalam A in ordinary repeat now passes in the
full run; Kalam ANNA still exceeds its unchanged 20-second limit at 22.14
seconds. The latter passes alone in 7.93 seconds
(`symmetric-frame-kalam-focused.log`). The full-suite timing issue is not
resolved, and that run must not be reported as green. All **177 inverse-engine
tests pass** separately (`symmetric-frame-inverse.log`). Both long text audits
were suspended during testing and resumed afterward; the diamond audit has
since finished. No timeout was raised.

Extending the mirrored routing to the nonflat frames' optional spread pass
recovered none of 47 previous figure refusals (`spread-sides-figures.json`).
That broader change remains a prototype.

## Current coverage: curved shared connections after straight layouts fail

Completed constructions can now retry with curved coincident cuts after all
established recipes fail. The handles approach the visible outline across its
tangent, using 20% of the connection's chord length. The original endpoints,
visible controls, paper paths, font and frame remain unchanged. Both papers
reference the same curve. Existing successful constructions return before this
pass, and duplicate rejected geometries are tried only once. A severe gap
between two unchanged visible outlines rejects the retry before curve fitting:
moving a shared cut cannot widen that gap. This keeps the existing excessively
thin-ring refusal fast without relaxing its acceptance criteria.

The original polygon intersection and severe-pinch prechecks describe straight
segments. Curved retries instead run the complete converter's checks on the
actual cubic paths, followed by the unchanged artwork-fidelity check. They do
not bypass final spacing, crossing or topology validation. No inverse solver is
involved.

Seven recoveries of `ABCDEFGHIJ` have been verified in the production generator:

| Font | Frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|---|
| Nunito | Diamond | 12×12 | 0 / 3 |
| Nunito | Hexagon | 12×12 | 0 / 7 |
| Bree Serif | Diamond | 12×12 | 0 / 1 |
| Bree Serif | Hexagon | 12×12 | 0 / 6 |
| Oswald | Hexagon | 12×12 | 1 / 7 |
| Righteous | Diamond | 12×12 | 0 / 1 |
| Righteous | Hexagon | 12×12 | 0 / 6 |

The production audit covers all 60 long-text combinations across six fonts and
ten frames: **49 accepted / 11 refused / zero invalid**, including both JSON/SVG
handoffs. It finds seven recoveries and no regressions
(`curved-cuts-ten-letters.json` and `curved-cuts-ten-letters-rest.json`).
The heart and both paper sheets are rendered in `curved-cuts-gallery-{0,1}.png`
and `curved-cuts-other-gallery-{0,1,2}.png`, plus
`curved-cuts-righteous-gallery-{0,1}.png`, with matching SVGs. All seven have
been visually inspected.

After adding the fixed-outline pinch precheck, all seven recoveries were run
again. Their cutting controls are identical to the inspected outputs, and both
handoffs still pass (`curved-cuts-final-verify.json`). All seven IDs are now
pinned without removing any of the existing 2,794 success IDs. The combined
matrix retains the other preceding results: **2,801 accepted / 349 refused /
zero invalid** (`curved-cuts-current.json`). Text is **1,726 accepted / 302
refused**; figures remain **1,075 accepted / 47 refused**. This is a combined
record, not a fresh rerun of all 3,150 cases after the precheck change. The full
goal remains unfinished, including other sizes and the remaining icon catalog.

The two Nunito production outputs have exactly the same controls as their
prototype witnesses. A separate guarded rolling-disk audit at the grid's
assumed minimum width passes the diamond at resolution 1,400. The hexagon
remains uncertain at resolutions 1,400 and 2,100: the possible paper core stays
connected, but the conservative core has small separated regions. This is not
a physical strength certificate. The reports are `curved-material-hires.json`
and `curved-material-hexagon-2100.json`. An earlier diagnostic had the editor's
reversed left paths unfolded in the wrong direction; its failure report must
not be used. The corrected probe orients both families toward the fold first.

Type checking, lint and the production build pass; type checking retains the
seven existing warnings. The full unit run reports **1,090 passed / two timed
out** (`curved-cuts-tests-recheck.log`, 780 seconds). Both failures are the
existing Kalam A/ANNA ordinary-repeat regressions. A focused single-worker run
passes both in 8.08 and 8.78 seconds, within their unchanged 20-second limits
(`curved-cuts-kalam-focused.log`). Four paired runs against the preceding commit
produce identical cuts and similar times: A takes 7.83–8.12 seconds before and
7.92–7.94 after; ANNA takes 8.83–9.04 before and 9.05–9.29 after
(`curved-kalam-compare.json`). This does not establish the cause of the
full-suite timing difference, and the full run must not be reported as green.
All **177 inverse-engine tests pass** in the separate run
(`curved-cuts-inverse.log`). The check/lint/build logs are
`curved-cuts-{check,lint,build}-final.log`.

### Additional investigations

- Curving the connections during local route selection recovered single Cinzel
  R in a circle, on a 5×5 grid. Its successful construction uses one column and
  three filled rows. The eight-case trial is `curved-local-probe.json`, with the
  selected construction saved in `curved-r-construction.json`. This variant is
  not in production: replaying all recipes this way was substantially slower.
  Directly trying one/two columns and three filled rows recovered none of 156
  existing nonrepeating Cinzel corpus refusals (`curved-grid-cinzel.json`). R is
  outside that corpus, so its improvement does not change those totals.
- The global curved retry recovered none of the 47 previous figure refusals
  (`curved-retry-figures.json`). It recovered seven of 110 refused non-Cinzel
  text configurations (`curved-retry-text-other.json`), all included above.
  The 199-case Cinzel audit is still running in
  `curved-retry-text-cinzel.json`; its first 51 cases found no recoveries.
- A request-wide fitting-cache prototype is not enabled. In the paired probe
  it made Nunito's ten-letter hexagon slower (8.99 to 17.04 seconds), while
  Cinzel LOVE remained refused (44.80 to 40.75 seconds). The accepted output's
  maximum coordinate difference was 2.28e-13, with zero raster difference at
  600 pixels (`request-cache-compare.log`). These results do not establish a
  performance improvement.
- ANNA's remaining eight tips below 45° are joins between two visible outline
  edges (approximately 38°), rather than shared-cut junctions. Seven handle
  lengths from 5% to 35% preserve its 600-pixel weave exactly but leave all
  eight tips unchanged (`curve-angle-probe.json`). A separate local-routing
  prototype that prioritizes tip counts ahead of the existing cutting cost
  also finds no reduction (`tip-ranked-probe.json`). Neither experiment changes
  production's ANNA output or its exact 4×4 cyclic checkerboard. Forcing four
  connections on every letter also leaves at least eight tips, both with
  straight and curved shared connections (`four-port-checker-probe.json` and
  `four-port-curved-probe.json`); that extra construction is not enabled.
- The earlier Bree Serif M&M warning comes from discarded self-intersecting
  curved candidates, not out-of-range coordinates in the returned design.
  The final result is exactly the original design, with all controls in 0–100
  and zero raster difference (`smooth-bounds-report.json`).

## Current performance: reuse translated outline fits

The two repeating-text frames now reuse fitted outline sections within a single
geometry conversion. Matching includes the fitting tolerance and every control
point relative to the section's origin. A rounded lookup key only finds a
candidate; reuse requires every relative coordinate to agree within 1e-10 in
the 0–100 frame. The translated fit retains the original endpoints exactly.
Stored controls are independent copies, and the cache holds at most 256 entries
before the conversion ends. Other generator frames and paint conversions keep
the existing path.

The full topology, spacing and artwork checks still run. No construction order,
outline, shared-cut rule or fitting tolerance has changed. Profiling the previous
amy checkerboard found 7.11 seconds in 1,696 curve-fitting calls out of 12.63
seconds overall (`conversion-profile.json`), mainly in rejected conversions.

Paired runs of the production implementation and a copy with reuse disabled:

| Nunito checkerboard text | Before | After |
|---|---:|---:|
| ANNA | 1,597 ms | 1,048 ms |
| amy | 13,823 ms | 7,921 ms |
| William | 20,710 ms | 7,082 ms |

The broader comparison includes all six fonts, both repeating frames, a
multiline input, accents and counters: ten accepted outputs and two unchanged
refusals. Every accepted pair has identical finger/segment counts, zero raster
difference at 600 pixels, and maximum control-coordinate difference below
1.35e-10 editor pixels. These observations ran alongside audits; they are not
browser latency guarantees. The report is `fit-cache-compare.json`. Sofie's
strict 45-degree tip counter changed from five to four at floating-point
rounding scale; this is not a physical cutting improvement.

The current ANNA heart and both cutting sheets were rendered and inspected in
`fit-cache-gallery-0.png` with its corresponding SVG. Its exact 4×4 cyclic field,
eight tips below 45° and zero tips below 30° remain. Browser inventory returned
no browsers and the native-pipe startup failure. No physical weaving trial has
been performed.

All **396 repeating-text configurations** were freshly audited, including
JSON/SVG handoffs, artwork fidelity and the editor's spacing check. There are
**273 accepted / 123 refused / zero invalid**, with no status changes or
regressions. The reports are `fit-cache-repeat.json` and `fit-cache-checker.json`.
The combined matrix, retaining the unchanged nonrepeating and figure results,
is `fit-cache-current.json`: **2,794 accepted / 356 refused / zero invalid**.
The pinned success set is unchanged. The full goal remains unfinished.

All **1,087 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The final suite used `VITEST_MAX_WORKERS=2 npm test`; its log is
`fit-cache-tests-bounded.log`, alongside `fit-cache-{check-final,lint-final,build}.log`.
An earlier unrestricted rerun hit the existing handwritten-letter test's
20-second timeout during concurrent startup and was stopped. No test limit was
raised; the complete bounded run passes on the final source.

### Curved shared connections, not shipped

A prototype makes the shared cubic's endpoint tangent bisect the two outline
directions, with a handle length of 20% of the original connection's chord.
Both sheets use exactly the same curve. It keeps a change only after complete
conversion, spacing and fidelity checks and an improved tip count. The initial
per-construction trial adds work and can alter the later layout comparison;
it is not enabled in production. The comparison is `smooth-shared-probe.json`.
For amy it reduced tips below 45° from 12 to three, while the three tips below
30° remained and the 600-pixel woven preview was unchanged. The before/after
paper templates are `smooth-gallery-0.png`. Further work must check width and
cutting practicality, not merely the endpoint-angle score.

A second prototype applies this pass only to the final chosen construction,
retaining every earlier layout decision. Five paired probes preserve all their
visible pixels at 600 pixels. It reduces anna from three to two tips below 45°
and amy from 12 to three; ANNA, SØREN and Kalam ANNA remain unchanged. Needle-tip
counts do not improve. This is `smooth-final-probe.json`. A separate audit of
the 134 accepted checkerboards passes all 134, including both handoffs, with
zero regressions or invalid output (`smooth-final-checker.json`). The Bree Serif
M&M roundtrip logs a coordinate-range warning that needs investigation before
enabling the prototype. This experiment is not included in the production code
or its coverage totals.

## Current coverage: attach to individual stroke tips

The combined default-size matrix now has **2,794 accepted / 356 refused / zero
invalid accepted output**. Text is **1,719 accepted / 309 refused**; figures remain
**1,075 accepted / 47 refused**. The checkerboard is **134 accepted / 64 refused**,
and ordinary repeat is **139 accepted / 59 refused**.

The repeating-text constructors can now attach to local maxima of the outline's
projection toward a gate. The former support point picks only the furthest
stroke in that direction; a letter such as m needs access to its separate legs.
The alternate candidate set uses the same bounded routing budget, exact font
outlines and coincident cuts. It runs only after the established constructions
fail, and reuses clear earlier cells. Successful existing designs retain their
cuts. The complete sheet still passes the unchanged topology, artwork-fidelity
and editor-spacing checks.

Three production recoveries have been rendered with both paper templates:

| Font | Text | Frame | Paper strips | Tips below 30° / below 45° |
|---|---|---|---|---|
| Nunito | amy | Checkerboard | 6×6 | 3 / 12 |
| Bree Serif | jul | Ordinary repeat | 6×3 | 0 / 3 |
| Bree Serif | Sofie | Ordinary repeat | 10×5 | 0 / 5 |

The ordinary repeats retain the intended 3×3 and 5×5 cyclic letter fields;
their paper-strip counts differ from their numbers of letter cells. The renders
are `tmp/generator/stroke-tip-gallery-{0,1,2}.png` with corresponding SVGs. They
remain digital validations, with no physical weaving trial. Browser inventory
returned no browsers and the same native-pipe startup failure. Construction
times in one run alongside audits were 13 seconds for amy, 0.77 seconds for jul
and 0.90 seconds for Sofie. Difficult-case latency remains unresolved.

A separate stage profile of amy took 12.8 seconds: the two rejected two-port
layouts spent **3.30 and 3.17 seconds** in conversion/validation, while the
successful mixed layout's conversion took **0.89 seconds**. Routing accounts for
about 5.4 seconds; the edge audit and artwork checks are small here. The evidence
is `stroke-profile-detail.json`, with two further totals in `stroke-profile.json`.
This identifies rejected conversions as a useful next performance target; none
of their final validation checks has been weakened or skipped in this change.

All **396 repeating-text configurations** were freshly audited on the final
production source, including JSON/SVG handoffs, artwork fidelity and the editor's
spacing check. There are no regressions or invalid outputs. The reports are
`stroke-tip-checker-final.json` and `stroke-tip-repeat-final.json`; the combined
matrix is `stroke-tip-current.json`. Other frames retain their preceding results.
All 2,794 success IDs are pinned in `scripts/generator/expected.json`; none were
removed.

All **1,083 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The new complex amy regression uses the same 30-second allowance as the earlier
mixed-topology cases. The final suite log is `stroke-tip-tests-complete.log`,
alongside `stroke-tip-{check,lint,build}.log`.

The broad prototype audit of 247 other previously refused text cases finished
with 245 refusals and only the two Bree Serif repeat recoveries already included
above (`peak-text-probe.json`). It found no further accepted configurations.
The goal remains unfinished: 356 corpus configurations
still refuse, and most other sizes and the remaining searchable catalog are
unverified. These three recoveries do not imply universal support.

### Additional investigations, not shipped

- Using the actual editor scale for local checkerboard checks recovered none of
  eight difficult cases. Extending local routes along their actual grid
  continuations instead of the spoke tangent also recovered none of eight.
  These are `scaled-checker-probe.json` and `context-checker-probe.json`.
- Compound relief cuts in the mixed two-/four-port construction recovered none
  of eight probes (`compound-mixed-probe.json`).
- Independent exterior visibility routes cached per attachment, a larger
  attachment budget, and tighter visibility vertices did not recover the
  targeted refusals. Local stroke-tip candidates combined with exterior routes
  let amy complete its local construction but left a cut only **2.24 px** from a
  grid cut, below the **4.5 px** margin. Direct stroke-tip connections pass the
  complete checks; the exterior detours are not shipped. The full-sheet witness
  is `peak-full-witness.json`; `local-checker-witness.png` and
  `ranked-m3-witness.png` show the original shoulder bottlenecks.
- A broad prototype applying the new attachment choices to all constructions
  recovered none of the **47** previous figure refusals. The result is
  `peak-figure-probe.json`. Figure routing remains unchanged.
- Deeper component grids tried two/three columns and at least three/four rows,
  splitting the largest island either vertically or along its longer axis.
  The 56 combinations recovered none. Sixteen single-island cases initially
  hit the component-count guard and were rerun with that guard removed; they
  still failed local construction or the joined topology. These are
  `deeper-components-probe.json` and `deeper-single-components-probe.json`.

## Previous coverage: mixed two- and four-connection checkerboard letters

The combined default-size matrix now has **2,791 accepted / 359 refused / zero
invalid accepted output**, recovering five checkerboard configurations. Text is
**1,716 accepted / 312 refused**; figures remain **1,075 accepted / 47 refused**.
The checkerboard alone is **133 accepted / 65 refused / zero invalid**.

| Font | Text | Grid | Tips below 30° / below 45° |
|---|---|---|---|
| Nunito | Anna | 4×4 | 2 / 6 |
| Nunito | William | 14×14 | 63 / 175 |
| Oswald | GOD JUL | 6×6 | 12 / 24 |
| Kalam | ABCDEFGHIJ | 10×10 | 0 / 10 |
| Kalam | GOD JUL | 6×6 | 0 / 0 |

Each 2×2 letter group can now use a mixture of two- and four-port contour
constructions. Their connections interleave along the shared grid edges, with
paper-family assignments chosen from the compatible open-path pairings. Each
group still connects the same opposite boundary edges. The letter field, font,
checker colours and number of paper strips are unchanged. Counters still use
coincident cuts, never detached cutouts. Repeated local cells and failures are
cached; matching two-port geometry is reused from the earlier construction.

The new construction runs **after all existing recipes fail**. Moving it before
the wider two-port repair recovered the same five cases sooner, but a separate
comparison of the 20 earlier repair successes found five with worse tip counts,
including handwritten ANNA and Oswald A-B. That order was rejected. All 20
established quality measurements are restored in the final source, with three
new regression tests guarding representative cases. Five further regressions
cover the newly supported configurations and both editor handoffs.

All **198 checkerboard cases** were audited, then the 20 earlier repair successes
and five new cases were rerun after restoring the final recipe order. Every
accepted result passes JSON/SVG roundtrips, the editor's own spacing check and
the generator's artwork-fidelity check. There are no regressions. The merged
report is `tmp/generator/mixed-checker-merged.json`, backed by
`mixed-checker-final.json` and `mixed-restored-final.json`. The combined record
is `mixed-current.json`; other frames retain their preceding results. All 2,791
success IDs are pinned in `scripts/generator/expected.json`; none were removed.

All five finished hearts and both paper templates were rendered and inspected
in `tmp/generator/mixed-checker-gallery-0.png` through `-4.png`, with matching
SVGs. Hashes of their cuts match the final source's validation outputs. William
and the Oswald design remain intricate, as their tip counts show; no physical
weaving trial has been performed. Browser inventory again returned no available
browser and a native-pipe startup failure. Final construction times for these
cases are still several seconds, exceeding 20 seconds for William in a run
alongside tests. Difficult-case latency is not solved.

All **1,081 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are under `tmp/generator/mixed-checker-`, with `tests-final.log` for the
final full-suite run.

The full goal remains unfinished: 359 corpus configurations still refuse, and
most other sizes and the remaining searchable catalog are unverified. These
five recoveries do not imply universal support.

### Additional topology probes, not shipped

- Four connections in every cell produced valid open paths only when neighbouring
  contacts interleaved and the quadrants alternated their paper assignments.
  Using four connections everywhere still failed the targeted rejected glyphs;
  choosing the topology separately for each group recovered the five cases above.
- A six-port symbolic extension has 26 compatible group pairings, 15 involving
  six-port cells. Its eight tested difficult texts recovered none; local geometry
  still failed. The reports are `checker-sixport-symbolic.json` and
  `sixport-checker-probe.json`.
- Routing blocked shared spokes around the original glyph outlines inside their
  cell recovered none of five probes and added work. The bounded visibility-graph
  experiment is in `routed-spokes-probe.json` and is not in production.

## Previous quality: choose checkerboard connections per letter

The checkerboard now combines the best letter cells from its existing spacing
passes. The local score includes both paper paths where a connection meets a
grid line. This reuses cached geometry without another routing search. It skips
fitting unless the combined raw cuts improve, and keeps the earlier result unless
the complete exported template has fewer narrow tips and passes every validator.
An export with no tips below 45° returns without this additional pass.

- Nunito SØREN decreases from **40 to 30 tips below 45°**, with none below 30°.
- Lowercase Nunito anna decreases from **five to three tips below 45°**; its two
  tips below 30° remain. These are improvements, not claims of effortless cutting.
- Uppercase ANNA retains its 4×4 ANNA / NNAA / NAAN / AANN field and **eight tips
  below 45°**, none below 30°. The original unoptimized design had 34 and eight.
  JUL retains its broad connections, with no tips below 45°.
- Each letter outline, counter, colour arrangement and grid size is preserved.
  Counters still use coincident cuts rather than detached cutouts.

All **128 previously accepted checkerboard configurations** were freshly checked
across all six fonts: **128 accepted / zero refused / zero invalid**, including
JSON/SVG handoffs and the editor's spacing check. The report is
`tmp/generator/cell-quality-checker.json`. The 70 previous refusals do not enter
this new quality pass and were not rerun. The combined matrix remains **2,786
accepted / 364 refused / zero invalid accepted output**; results outside these
128 cases are retained from `wide-current.json`. Its updated combined record is
`cell-quality-current.json`. No expected success was removed.

The current generator's hearts and both cutting templates were rendered and
inspected in `cell-quality-gallery-0.png` (ANNA), `-1.png` (anna), and `-2.png`
(SØREN), with matching SVGs under `tmp/generator`. Browser inventory returned no
available browser and a native-pipe startup failure. There has been no physical
weaving trial. Single consecutive timing probes measured anna at 5.77→6.24 seconds
and SØREN at 9.89→11.48 seconds: the extra full-sheet fit still costs time when a
better combination is found. These measurements ran alongside regression checks
and are not latency guarantees. Difficult-case speed remains unresolved.

All **1,073 unit tests and 177 inverse tests** pass, together with type checking,
lint and the production build. Type checking reports seven existing warnings.
The 17 focused checkerboard/quality tests also pass on the final source. Logs
are `tmp/generator/cell-quality-{check,lint,build,tests,tests-focused}.log`.

The full goal remains unfinished: 364 corpus configurations still refuse, and
most other sizes and the remaining searchable catalog are unverified. This
change improves cutting quality for working layouts without weakening the
acceptance checks or claiming universal support.

### Additional figure probes, not shipped

- Sliding shared attachments along their original outline segment away from
  artificial seam endpoints removes the first coffee-cup pinch, but the complete
  cuts still fail spacing. None of 36 probes recovered a refused configuration.
- Swapping whole four-port cells between paper families tried 584 assignments
  across coffee, oval paw, sunburst paw and sunburst stars. Only the four original
  assignments compiled; the other 580 ended on the wrong paper edge. This is
  distinct from the earlier swaps of two-terminal islands within one cell.
- Constructing those four component layouts after a half-turn or reflection,
  then restoring the original artwork and sheet families, recovered none of 12
  probes. Their geometry problems remain. Reports are `slide-ports-probe.json`,
  `component-phase-probe.json`, and `component-symmetry-probe.json`.

## Previous coverage: wider component grids and a fitted envelope

The combined default-size matrix is **2,786 accepted / 364 refused / zero invalid
accepted output**. This batch recovers **16 figure combinations**. It freshly
checked all 1,122 figures, then repeated all 51 fitted-frame cases after adding
the common-envelope fallback. There are no regressions. The preceding full
3,150-case refresh and the 198-case checkerboard audit have also completed.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1075 | 47 | 0 |

The combined record is `tmp/generator/wide-current.json`. Fresh figure reports
are `wide-final-figure.json` and `wide-final-fitted.json`; the completed preceding
reports are `junction-current.json` and `quality-checker.json`. All 2,786 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed.

- Component grids now try two, three and four columns. They split the largest
  islands until each row is full and retain each piece's source island. Adjacent
  pieces of that island share a gate inside their filled seam. Every original
  outline and counter is retained, and artificial seams are stitched afterward.
- This recovers Tabler paw in circle, diamond, hexagon, rounded and scalloped
  frames, each in all three outer styles: **15 combinations**, all with 7×7 grids.
  The four toes occupy their own cells; the larger pad is divided beneath them.
  Its oval, sunburst, fitted, checked-tip and layered variants still refuse.
- A final fitted-frame recipe puts component-grid gates on the convex envelope
  of the complete motif. The outer cuts then project to the paper edges without
  adding a visible circular frame. Fidelity is checked over the **whole envelope**,
  including spaces between components. This recovers Tabler stars in the fitted
  template with a 5×5 grid. Existing successful recipes return before it.
- Six new regression cases cover the five paw frame shapes and the fitted stars,
  including JSON/SVG roundtrips and the editor's own cut-spacing checks.

The final generator's hearts and both cutting templates were rendered in
`tmp/generator/wide-final-hearts-and-cuts.png`. The paw/rays example has one tip
below 30° and two below 45°; the fitted stars have two below both thresholds.
A separate checked hexagon paw has one below 30° and nine below 45°. These are
still intricate paper cuts; there has been no physical weaving trial. Browser
inventory again returned no available app or browser.

All **1,072 unit tests and 177 inverse tests** pass, together with type
checking, lint and the production build. Type checking reports seven existing
warnings. Logs are `tmp/generator/wide-{check,lint,build,tests}.log`.

The goal remains unfinished: 364 default-size configurations still refuse,
most other sizes and the rest of the searchable catalog remain unverified, and
difficult-case latency remains unresolved. These recoveries are progress toward
the full goal, not a claim that the corpus or all combinations now work.

### Additional probes, not shipped

- Giving individual fitted components their own silhouette projections recovered
  none of 20 three-/four-column probes; those projections can cross another
  component. The common envelope recovered the stars in a subsequent 30-case probe.
- Uniform divisions, axis-aligned gap contacts and larger three-/four-row grids
  recovered no further failing figures. The larger grids encountered new local
  topology problems rather than clearing the oval paw's tight join.
- The coffee cup's three-column layout has a 0.087-unit pinch where a steam
  connection approaches an artificial division. Testing 49 division-fraction
  pairs still recovered none; it needs a different connection or decomposition.
  A separate 40-case probe that rejected shared attachments near seam endpoints
  recovered no additional failures and also rejected the valid wider paw route.
  That stricter local acceptance rule is not shipped.

## Previous coverage: fewer sharp checkerboard tips and complete sunburst grids

The checkerboard frame now considers one more connection spacing after finding
a valid design. It keeps a candidate only when the complete exported template
has fewer narrow tips and passes the unchanged topology, spacing and artwork
checks. It stops when no tips below 45° remain and skips curve fitting for worse
raw candidates. The additional search does not run for an already refused input.

- Nunito ANNA remains exactly 4×4, with ANNA / NNAA / NAAN / AANN. Its actual
  exported tips below 45° decrease from ten to **eight**, with none below 30°.
  The original unoptimized template had 34 below 45°, including eight below 30°.
- The direct SØREN probe improves from 55 to 40 tips below 45°, with none below
  30°. JUL retains its original broad connections; tighter candidates were worse
  or failed spacing. The original Oswald ANNA route is also retained.
- Failed sunburst figures can retry their four-port medallion using the complete
  five-strip grid. Its outer band adds two strips to each sheet. Earlier valid
  layouts return first, and full-sheet spacing checks remain unchanged. This
  recovers the authored gift and Phosphor paw, each with 5×5 grids and no cutouts.

All **51 sunburst configurations** were freshly checked: **47 accepted / four
refused / zero invalid output**, with two recoveries and no regressions. The
report is `tmp/generator/quality-sunburst.json`; the combined record with prior
results retained elsewhere is `quality-current.json`. The completed 198-case
checkerboard audit has 128 accepted / 70 refused / zero invalid output and no
regressions. The preceding full 3,150-case refresh also finished with no regressions. All 2,770 accepted IDs, including these two new
figure cases, are pinned in `scripts/generator/expected.json`.

The finished ANNA heart and both cutting templates before and after the change
were rendered and inspected in `tmp/generator/quality-text-before-after.png`.
The repaired figures are in `quality-sunburst-cuts.png`: gift has four cut tips
below 45° and none below 30°; paw has none below 45°. These are digital checks,
not physical weaving trials. Browser inventory again returned no available app
or browser, so a live interface check was unavailable.

Type checking, lint and the production build pass (seven existing type-check
warnings). All 1,066 unit tests pass: the full run passed 1,065, and the one
handwritten-cell cache test that timed out under concurrent audit load passed
its isolated rerun in 7.2 seconds. All 177 inverse tests pass. Logs
are `tmp/generator/quality-{check,lint,build,tests,retry,inverse}.log`.

The broader goal remains unfinished. At least 380 default-size matrix cases
remain refused, most other sizes and the rest of the searchable catalog remain
unverified, and difficult-case latency remains unresolved. The new sunburst
fallback takes about 1.1 seconds for gift and 13.2 seconds for paw in this run,
because it preserves all established recipes before retrying the complete grid.

### Additional probes

Counting every outer band in all local panel, component and fitted routes
recovered the same two sunburst figures in a 65-refusal probe. A complete
102-case sunburst/layered probe had no regressions, but changed several existing
layered grids. That broader change is not shipped: the final implementation uses
only the four-port sunburst retry needed for the verified recoveries.

## Previous coverage: clipping touching contours

The combined default-size matrix has **2,768 accepted / 382 refused / zero invalid
accepted results**. The full refresh completed all **3,150 cases**: all 1,122
figure configurations and all 338 text configurations for each of Nunito,
Bree Serif, Oswald, Righteous, Kalam and Cinzel. There were four gains, no
regressions and no invalid accepted output.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1057 | 65 | 0 |

The combined record is `tmp/generator/junction-current.json`. Completed reports
are `junction-{figure,nunito,breeserif,oswald,righteous,kalam,cinzel}.json`. All 2,768 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed.

- Clipping can produce a shared vertex belonging to more than one closed
  contour. An even-degree junction now yields separate closed walks instead
  of an ambiguity error or one self-touching outline. Each original boundary
  edge is retained once, and the even-odd artwork stays the same. Unpaired and
  open boundaries remain errors.
- This recovers Phosphor butterfly in all three oval styles, with 5×5 grids,
  and Phosphor rabbit in the layered frame, with a 10×10 grid. Their complete
  generated paths and JSON/SVG/editor handoffs pass all existing checks.
- Three focused clipping tests cover touching islands, a counter touching its
  parent, and three islands meeting on the divider. They compare the clipped
  fill with the original on both sides of the divider and with reversed input
  contour order and direction. The eight-test panel suite passes.

Both finished hearts and both cutting templates for each were rendered and
inspected in `tmp/generator/junction-hearts-and-cuts.png`. Butterfly has no cut
tips below 45°; rabbit has two below 30° and ten below 45°, including its ears.
The cuts remain intricate, with no physical weaving trial. Browser inventory
again returned no app or browser, so a live interface check was unavailable.

All **1,064 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are `tmp/generator/junction-{tests,check,lint,build}.log`.

The goal remained unfinished after this batch: 382 matrix configurations were
still refused, most non-default sizes and the rest of
the searchable catalog remain unverified, and difficult-case latency is unresolved.

### Additional investigations, not shipped

- Treating every odd-degree clipping vertex as a divider endpoint fixes an
  isolated touching-square/triangle Boolean example without changing its fill.
  However, a separate completed probe of all 65 remaining figure refusals
  recovered none. This broader endpoint rule remains experimental.
- Adaptive letter-panel dividers placed between contour coordinates recovered
  none of 96 direct probes: Cinzel P, E, R and PIP in three frames, four layouts
  and two paddings. Moving whole figure components directly onto the fitted
  frame also recovered none of that frame's 11 refusals.
- [Weaving Paper into Star Patterns](https://archive.bridgesmathart.org/2020/bridges2020-427.pdf)
  discusses changing sheets at extra vertices, but its more complex examples
  cut one sheet into separate components. It therefore does not provide a direct
  replacement for this generator's open-strip, no-detached-piece requirement.

## Previous coverage: repair complete layouts and give bent text connections room

The current default-size matrix has **2,764 accepted / 386 refused / zero invalid
accepted results**. This batch freshly retested all 75 previous figure refusals:
**six now pass, 69 remain refused, and none produced invalid accepted output**.
The other 3,075 records retain their preceding audit results; this was not a
fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1053 | 69 | 0 |

The combined report is `tmp/generator/shared-current.json`; the fresh figure
report is `shared-final.json`. All 2,764 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed. Ordinary and checkerboard
repeat remain at 137/198 and 128/198.

- Complete figure layouts that fail spacing or crossing checks are retained
  while the other recipes run. If every recipe fails, the bounded shared-cut
  detours can repair these layouts too. Their visible contours, graph endpoints,
  selected frame and artwork remain fixed. Changed cuts are recompiled and pass
  all existing topology, spacing, fidelity and JSON/SVG/editor checks.
- This recovers Tabler stars in the checked-tip frame (6×6), Tabler palette in
  the layered frame (7×7), bicycle in the sunburst frame (5×5), and bicycle in
  all three scalloped styles (3×3). Already successful constructions return
  before these repairs; unchanged failed edges skip another fit.
- Framed text can combine bent connections with the air layout's wider cell
  padding. Outside the matrix, standalone Cinzel `P` now works in woven, circle,
  diamond, rounded and scalloped frames, all with 3×3 grids. Its earlier air
  success remains; hexagon and oval still refuse P. The counter remains part
  of the paper through coincident cuts.
- A direct probe of that wider text recipe covered all 165 previous non-repeating,
  non-air text refusals plus those seven P frames. It recovered the five P cases
  only. This does not establish support for arbitrary P-containing words, and
  these recipe probes are not fresh full-generator matrix records.

Five finished hearts and both templates for each were rendered and inspected in
`tmp/generator/shared-hearts-and-cuts.png`: stars, palette, the two new bicycle
frame families and P. The respective cut-tip counts below 30°/45° are 2/4, 4/6,
2/2, 2/2 and 0/0. These remain intricate cuts, with no physical weaving trial.
Browser inventory again returned no available app or browser, so there was no
live interface check.

All **1,057 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports seven existing warnings.
Logs are `tmp/generator/shared-{tests,check,lint,build}.log`.

The goal remains unfinished: 386 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
The newly accepted bicycle repairs still took roughly 5.8–7.4 seconds locally;
difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional probes, not shipped

- Routing shared cuts in four different orders while ignoring connections not
  yet routed did not add gains in paw, coffee, bicycle, butterfly or moon/stars.
  The paw's two middle connections still cross neighboring upper pads.
- Combining bent connections with filled-seam letter panels added no gains in
  120 direct probes: Cinzel P, E, R and PIP, three frames, five panel layouts and
  two paddings. These extra combinations are not production fallbacks.

## Previous coverage: separate figure components and shared-cut detours

The current default-size matrix has **2,758 accepted / 392 refused / zero invalid
accepted results**. This batch freshly tested 179 distinct figure configurations:
all 86 previous figure refusals, all checked-tip and sunburst figures, and all
previous bicycle successes. There are **11 gains and no regressions** in that
scope: 104 accepted, 75 refused. The other 2,971 records retain their preceding
audit results; this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1047 | 75 | 0 |

The combined report is `tmp/generator/components-current.json`. Fresh reports are
`components-final.json`, `bent-corner-final.json` and `bent-sunburst-final.json`;
the 90-case component report takes precedence where their scopes overlap.
All 2,758 accepted IDs are pinned in `scripts/generator/expected.json`; none were
removed. Ordinary and checkerboard repeat remain at 137/198 and 128/198.

- Separate figure islands can occupy individual cells in a two-column grid.
  Counters stay with their parent island. If the island count is odd, the largest
  is split into two cells and its artificial seam is stitched away. The original
  visible artwork is retained. This recovers the bicycle in the rays, checked
  and plain variants of the circle, hexagon and rounded frames, using 4×4 grids.
- Adjacent cells share gates near their outlines, avoiding intervening islands.
  Coincident A/B connections can detour around other cuts using a bounded
  visibility graph. Only shared connections move; endpoints and visible outlines
  stay fixed. Crossing, topology, spacing and artwork validation still apply to
  the complete sheets and their JSON/SVG/editor round trips.
- Bent outline approaches also recover Phosphor sailboat in the six-strip
  checked-tip frame and Tabler gift in the five-strip sunburst frame. All these
  constructions are final fallbacks, preserving earlier successful layouts.

A separate fresh audit tested all 51 checked-tip figures at three non-default
sizes. These 153 cases are outside the matrix above:

| Motif size | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|
| 45% | 48 | 3 | 0 |
| 55% | 48 | 3 | 0 |
| 85% | 47 | 4 | 0 |

The 45% bicycle is newly accepted; no earlier success was lost. Reports are
`tmp/generator/bent-corners-scale-{45,55,85}.json`. These checks do not cover all
slider values or non-default sizes in the other frames.

The bicycle, sailboat and gift hearts and both cutting templates for each were
rendered and inspected in `tmp/generator/component-hearts-and-cuts.png`. Their
cut-tip counts below 30°/45° are 1/1, 0/0 and 0/0, respectively. The cuts remain
intricate; there has been no physical cutting or weaving trial. Browser inventory
returned no available app or browser, so no live interface check was possible.

All **1,048 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/components-{tests,check,lint,build}.log`.
The newly recovered bicycle layouts took roughly 4.2–4.8 seconds in the local
production audit; this is still too slow for smooth iteration and is not a
browser latency measurement.

The goal remains unfinished: 392 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
Difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional investigations, not shipped

- Trying each root island as the contour-chain anchor did not recover the
  probed paw, coffee or bicycle cases. Changing the component routing to the
  practical or balanced variants added no gains over the ordinary route.
- The Tabler paw's nearly touching upper pads remain separated even when its
  original SVG is flattened at much finer tolerances. This is not simply a
  stored-coordinate rounding contact; the artwork was not merged or smoothed.
- Paw routes can be topologically valid yet fail spacing near a pad tip. Moving
  the gate alone trades that pinch for an intersection elsewhere. The current
  shared-cut detours recover the bicycle but still do not resolve the paw.

## Previous coverage: bent shared connections

The current default-size matrix has **2,747 accepted / 403 refused / zero invalid
accepted results**. This batch freshly tested 93 previously refused text cases:
all 63 ordinary-repeat refusals and all 30 non-repeating refusals outside Cinzel.
Two now pass, 91 remain refused, and none produced invalid accepted output. The
other 3,057 records retain their preceding audit results; this was not a fresh
full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1711 | 317 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1036 | 86 | 0 |

The combined report is `tmp/generator/bent-current.json`; the fresh reports are
`bent-final-repeat.json` and `bent-final-framed.json`. All 2,747 accepted IDs are
pinned in `scripts/generator/expected.json`; none were removed. Ordinary repeat
now accepts 137/198 configurations; checkerboard repeat remains at 128/198.

- Shared connections can approach a letter along its outward normal or corner
  bisector, with a short bend before returning to the cell gate. This avoids a
  grazing approach that leaves a narrow hook. The outline, counter and visible
  background remain unchanged. Bends are precomputed for the fixed attachment
  candidates, and the existing crossing, topology, fidelity and spacing checks
  still apply.
- These constructions run only after the established recipes fail. Repeated
  text reuses completed cells when a local cell fails. A failure after joining
  completed cells instead rebuilds their connections. The existing practical
  and balanced routing budgets are retained.
- Nunito `William` and `ÆØÅ` now work in the ordinary repeating frame, using
  14×7 and 6×3 strip grids. Their editor and SVG round trips pass independently.
  This does not change the checkerboard ANNA design or its 4×4 letter field.
- A separate probe outside the matrix recovers standalone Cinzel `P` in the air
  frame, using a 3×3 grid with its counter connected by coincident cuts. The seven
  other non-repeating frames still refuse P. Eight additional P-containing words
  or multiline inputs also remain refused, so this is not general P support.

All three finished hearts and both templates for each were rendered and inspected
in `tmp/generator/bent-hearts-and-cuts.png`. The repeated layouts remain intricate;
there has been no physical cutting or weaving trial. Browser inventory again
returned no available app or browser, so no live interface check was possible.

All **1,039 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/bent-{tests,check,lint,build}.log`.

The goal remains unfinished: 403 default-size matrix cases are refused, and the
rest of the searchable catalog and most non-default sizes remain unverified.
Difficult-case latency and the earlier browser slowdown remain unresolved.

### Additional probes, not shipped

- Applying bent connections throughout every recipe rather than as a fallback
  did not recover the 20 Cinzel/air refusals. An exploratory 95-case mixed text
  audit was stopped after 51 saved results once the production fallback audits
  superseded it; it is not a completed coverage report.
- Applying bends to the four remaining checked-tip figure failures recovered
  Phosphor sailboat, with no invalid accepted output in that four-case prototype.
  The figure routing API does not yet expose this option; this is a candidate
  for the next integration and regression audit, not part of the matrix above.

## Previous coverage: checked-tip routing and border space

The current default-size matrix has **2,745 accepted / 405 refused / zero invalid
accepted results**. This batch freshly tested all 51 figures in the checked-tip
frame: **47 accepted / four refused**, recovering 14 configurations with no
regressions. The other 3,099 records retain their preceding audit results; this
was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1709 | 319 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1036 | 86 | 0 |

The combined report is `tmp/generator/corner-current.json`; the fresh report is
`corner-final.json`. All 2,745 accepted default-size IDs are pinned in
`scripts/generator/expected.json`; none were removed. Both repeat-text results
remain unchanged at 135/198 and 128/198.

- The checked-tip frame now tries practical two-port routing after its old
  three-lane contour chain fails. Counters use coincident A/B bridges, and each
  lane still provides one open cut in each sheet. This recovers both gifts,
  cookie, moon and stars, the authored snowflake, cat, butterfly, rabbit, paw
  print, bicycle, smiley, Tabler butterfly and palette.
- Coffee additionally needs its steam curls in the side lanes. Connections
  approach each side lane's artwork near its own vertical extent, then continue
  outside the whole motif. They no longer run diagonally through the cup.
- At large motif sizes, fixed outside routes could cross the outer bands. Two
  final constructions fit those routes into the available border space. Band
  widths retain at least the grid clearance, and the bypass stays inside them.
  The motif size, selected frame and six-strip layout remain. Unchanged fallback
  constructions skip repeated curve fitting.

A separate fresh audit tested the same 51 figures at three non-default sizes:

| Motif size | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|
| 45% | 47 | 4 | 0 |
| 55% | 48 | 3 | 0 |
| 85% | 47 | 4 | 0 |

These 153 cases are outside the default-size matrix. Fitting the border recovered
41 of the 45 previously refused cases at 85%, with no loss of earlier successes
at any of these three sizes. The reports are `corner-scale-final-{45,55,85}.json`
in `tmp/generator`. This does not cover all slider values or the other frames at
non-default sizes.

Eight finished hearts and both paper templates for gift, coffee, bicycle and a
large gift were rendered and inspected. The artifacts are `corner-hearts.png`
and `corner-cuts.png` in `tmp/generator`. The cuts remain intricate; no physical
weaving trial has been performed.

All **1,036 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Type checking reports the seven existing
warnings. Logs are `tmp/generator/corner-{tests,check,lint,build}.log`. Browser
inventory still returns no available app or browser, so the live interface
check could not run.

The goal remains unfinished. At the default size the checked-tip frame still
refuses Tabler stars, sailboat, crown and Tabler paw. The combined matrix still
has 405 refusals, and the rest of the searchable catalog and most non-default
sizes are unverified. Browser latency remains unresolved.

### Additional investigations, not shipped

- Allowing even-degree shared-point vertices in clipping did not recover the
  tested coffee/circle-rays case. Rejecting collinear shared-cut overlaps,
  considering convex as well as concave relief corners, and independently
  placing whole-letter gates using filled scan intervals did not recover the
  separately tested Cinzel P, E or R.
- The saved divided R network has cycle rank 17. Exhausting all 131,072
  parity-preserving cycle assignments on those existing edges produced 15,616
  degree-valid graphs, but every one still connected an A path to the wrong
  paper edge. This witness requires different connections; changing sheet
  assignments or removing shared segments within that fixed network cannot
  repair it. The diagnostic is `cycle-space-probe.log` in `tmp/generator`.
- Flipping complete checked-tip lanes did not recover the five cases left by
  practical routing. Splitting the motif into three two-port panels did not
  recover the final four default-size refusals. Neither extra search is part of
  the production fallback.

## Previous implementation: reuse curve-fitting calculations

Curve fitting now evaluates each Bernstein basis once for both coordinates and
reuses derivative control points across the samples of each Newton pass. The
arithmetic order, fitting tolerance, candidate routes and validation rules remain
unchanged. The following source-level comparisons returned exactly equal full
design objects (or the same refusal), across three alternating before/after runs:

| Input | Frame | Median before | Median after | Result |
|---|---|---:|---:|---|
| Nunito ANNA | Checkerboard repeat | 1,128 ms | 1,087 ms | Identical design |
| Nunito JUL | Checkerboard repeat | 1,152 ms | 985 ms | Identical design |
| Kalam ANNA / BO, two lines | Hexagon | 4,224 ms | 3,964 ms | Identical design |
| Cinzel BO | Circle | 7,254 ms | 6,605 ms | Identical design |
| Oswald ÆØÅ | Air | 5,179 ms | 5,063 ms | Same refusal |

These are local Node observations, not browser latency guarantees. The report is
`tmp/generator/fitter-benchmark.json`. Separate comparisons of the gift/circle-rays
and Phosphor snowflake/rounded-check figures also returned identical full designs.
The current ANNA cutting template was rendered and inspected: its 4×4 field and
cut-tip counts remain unchanged at zero below 30° and ten below 45°. There has
been no physical weaving trial. Browser-control inventory still has no
available browser; the previously observed browser slowdown remains unresolved.

All **1,031 unit tests and 177 inverse tests** pass, as do type checking, lint and
the production build. Type checking still reports the seven existing warnings.
The logs are `tmp/generator/fitter-{tests,check,lint,build}.log`.

There are no additional accepted configurations from this batch. The latest
combined matrix remains **2,731 accepted / 419 refused / zero invalid accepted
results**, as recorded below; it was not freshly rerun for this arithmetic reuse.
The wider goal remains unfinished, including unsupported text, figures and
unverified catalog entries.

### Additional topology investigations, not shipped

- Parent-counter corner attachments and independent corner/ray choices for the
  two counter bridges did not recover the separately probed Cinzel P or R.
- Whole letters with six, eight or ten ports and coincident internal chords can
  produce open topology for P, E and R in some layouts, but those results still
  fail full-sheet spacing. A 30-case prototype audit of other refused framed
  texts added no accepted output. Its multiline strip-limit guard was overly
  restrictive, so this does not exhaust all proposed multiline variants.
- Cancelling closed edge cycles while retaining the visible outline did not
  repair the R witness or any of the 19 refused bicycle templates tested.
- Separating the R witness's degree-four junctions into adjacent, noncrossing
  connections removes the branches, but all 64 combinations still connect at
  least one path to the wrong paper edge. Four separation radii gave the same
  result; branch removal alone is insufficient. These experimental geometries
  are not accepted exports.

## Current coverage: divide the ink, retain the outer margin

The current 3,150-configuration matrix has **2,731 accepted / 419 refused / zero
invalid accepted results**. This batch freshly retested all 60 BO configurations
across six fonts and ten frames: **54 accepted / six refused**, with two gains
and no regressions. The other 3,090 records retain their preceding audit results;
this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1709 | 319 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/ink-current.json`; the fresh report is
`ink-final-bo.json` in the same directory. All 2,731 accepted IDs are pinned in
`scripts/generator/expected.json`; none were removed. Ordinary repeat and
checkerboard results remain 135/198 and 128/198.

- A final 2×5 panel layout places the internal seams over the letter's ink
  dimensions, excluding its cell padding. The outside gates and margin remain.
  Clipping and stitching use the same seam positions, and shared contacts still
  land inside solid intervals. This avoids spending the extra panels on empty
  margins. The layout is skipped if its grid would exceed the 20-strip limit.
- Cinzel BO now works in circle and scalloped frames, using 10×10 grids. The
  exact font contours and counters remain. The new recipe runs only after all
  earlier constructions fail; established successful routes remain available.
- An exploratory sweep of all 188 previously refused framed-text cases found
  these two gains. Wider practical routing over the other 186 cases added none,
  so that extra work is not part of the production fallback. The discarded
  experiments are recorded below to guide further work.

All **1,031 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Both finished hearts and both paper templates for
each new layout were inspected. The serif details remain intricate, and there
has been no physical weaving trial. Browser-control inventory still returns no
available browsers, so the final interface check could not run.

The goal remains unfinished: 419 matrix configurations are refused, including
186 non-repeating text cases (156 Cinzel, 14 Oswald, seven Bree Serif, and three
each in Nunito, Kalam and Righteous). Separate probes also found that Cinzel P
and R in the air frame remain refused; these single-letter inputs are outside
the 34-text matrix. The rest of the searchable icon catalog and non-default
figure scales remain unverified. Difficult-case latency and the earlier browser
slowdown are unresolved. No claim of universal support follows from this matrix.

### Exploratory results from this batch

- Changing the paper assignment of separate motif components, with direct use
  of existing contact points, did not recover the tested Tabler paw, Phosphor
  coffee, fitted butterfly or bicycle. The paw's upper pads have a tiny gap in
  the rounded source coordinates rather than one exact shared vertex. This is
  distinct from the bicycle's and butterfly's exact contour contacts.
- Empty figure panels with coincident elbow joins, larger uniform text grids,
  multiple relief chords ranked by narrow gaps, and smooth-turn attachment
  candidates did not recover the targeted failures. They were not shipped.
- A four-bridge counter prototype has valid topology: on a synthetic annulus,
  24 of 216 candidates had the prescribed open pairs, no crossing shared cuts
  and valid clearance. It did not recover Cinzel 2026, P or R in the tested
  layouts and is not in production. The next counter investigation should
  examine the actual failing bridges and their parent-outline attachment
  choices, rather than assuming that more bridges alone solve the pinch.
- The saved R/air/2×5 edge witness has degree-four joins after stitching: some
  contain two same-sheet outline edges plus two shared edges; others contain
  four shared edges. Trying the next filled interval on either seam axis did
  not repair this layout. This is a panel-topology problem, not a tolerance or
  floating-point rounding problem. The witness is in
  `tmp/generator/ink-witness-R.json`; the subsequent parent-attachment experiment
  is recorded above and did not recover P or R.

## Previous coverage: solid seams in divided letters

The current 3,150-configuration matrix has **2,729 accepted / 421 refused / zero
invalid accepted results**. This batch freshly retested all 120 B/BO configurations
across six fonts and ten frames: **109 accepted / 11 refused**, with six gains
and no regressions. The remaining 3,030 records retain their preceding audit
results; this was not a fresh full-matrix run.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1707 | 321 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/stem-current.json`. All 2,729 accepted IDs
are pinned in `scripts/generator/expected.json`; none were removed. The two fresh
reports are `stem-final-b.json` and `stem-final-bo.json` in the same directory.
The ordinary repeat and checkerboard results remain 135/198 and 128/198.

- Two final text layouts divide each letter into three horizontal panels, with
  either one or two columns. Internal connections move into the widest solid
  interval of the shared seam, avoiding counters. Neighbouring panels agree on
  the connection; the visible outline, selected font, frame and spacing checks
  remain unchanged. The one-column layout skips its full-sheet fit if no seam
  connection moved. These layouts run only after the earlier recipes fail.
- Cinzel B now works in woven, air, circle, rounded and scalloped frames; Cinzel
  BO also works in rounded. The results use 5×5, 6×6 and 8×8 grids. An exploratory
  run over all 194 previously refused non-repeating text configurations found
  these same six gains, but only the final production B/BO runs replace records
  in the combined report.
- Trial rays that miss a contour now return a missing result directly instead
  of throwing a routine exception. The public ray operation still throws on
  failure. Five compiled-worker comparisons returned byte-identical results
  before and after this change. Single-run Node timings were mixed; this is not
  a latency guarantee and did not resolve the browser slowdown.

All **1,029 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative finished-heart renders and
both paper templates for B/circle and BO/rounded were inspected. These preserve
the serif details and have no closed cutout loops, but remain intricate patterns.
The final interface check could not run because the browser-control inventory
returned no available browsers. The previous two-line Kalam check on the ray-only build
reached a valid result but still took about 141 seconds before thumbnail work
began, while Node took 4.37 seconds. These concurrent observations do not isolate
the cause; no browser settings were changed.

The goal remains unfinished: 421 tested configurations are still refused,
including 188 non-repeating text cases (158 Cinzel, 14 Oswald, seven Bree Serif,
and three each in Nunito, Kalam and Righteous). The rest of the searchable icon
catalog and non-default figure scales remain outside this matrix. Difficult
cases still take too long. Artwork fidelity, open cuts, clearance and JSON/SVG
handoffs are checked digitally; no physical weaving trial was performed.

## Previous coverage: adaptive contacts for framed letters

The current 3,150-configuration matrix has **2,723 accepted / 427 refused / zero
invalid accepted results**. This batch retested all 291 previously refused
non-repeating text configurations: **97 now pass and 194 remain refused**.
Previously accepted layouts, the two repeat frames and the figures retain their
preceding audit results; their successful construction paths are unchanged.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1701 | 327 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/text-gates-current.json`. All 2,723 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed. The latest
refusal retest is assembled from the 59-case probe, the saved 61-case remainder
prefix and three complete 57-case tail shards, with no duplicate or missing IDs.
The ordinary repeat and checkerboard results remain 135/198 and 128/198.

- A final framed-text construction moves opposite connections along the cell
  edges, by at most 20% of the cell width or height. The nine candidate position
  pairs keep the font outlines, counters and connection order. Only whole-letter
  cells use this operation; divided letters retain their shared seam contacts.
- The cache copies both the chosen cuts and the shifted contacts when a letter
  repeats. No full-sheet fit is repeated when all contacts retain their original
  positions. Wider attachment search is conditional on an actually crowded
  earlier search, and the full spacing and topology checks still apply.
- Kalam handwriting gains 81 framed configurations, including names, Danish
  letters and two- and three-line arrangements. Oswald gains nine, including
  `juleman`, `æøå` and `Åse`; Righteous gains seven. No other font is substituted.
  The new construction runs only after the established recipes fail.

All **1,022 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected. The handwritten ANNA hexagon has a
matching main preview and selected thumbnail and reaches the editor as a 6×6
weave without warnings. The two-line handwritten ANNA/BO hexagon also has a
matching preview/thumbnail and reaches the editor as a 7×7 weave without warnings.
The corpus checks artwork fidelity, open cuts, clearance
and both JSON/SVG handoffs. No physical weaving trial was performed.

The goal remains unfinished: 427 tested configurations are still refused,
including 194 non-repeating text cases (164 Cinzel, 14 Oswald, seven Bree Serif,
and three each in Nunito, Kalam and Righteous). The rest of the searchable icon
catalog and non-default figure scales remain outside this matrix. Difficult
cases still take too long; these audit timings are not latency benchmarks.
In the browser check, the two-line Kalam hexagon took roughly 109 seconds before
thumbnail generation began, despite a 21 ms font load and a visible page. The
same production worker bundle returned an accepted result in 4.78 seconds in
Node, close to its 4.51-second source audit. The cause of this browser slowdown
is unresolved; no browser throttling or settings were changed. These concurrent
single runs are diagnostic observations, not performance guarantees.

## Previous coverage: independent letter contacts and filled panel seams

The current 3,150-configuration matrix has **2,626 accepted / 524 refused / zero
invalid accepted results**, with no regressions. This batch freshly reran all
198 checkerboard text cases and all 1,122 figures. The other 1,830 text results
come from the preceding audit; their construction paths are unchanged.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1604 | 424 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1022 | 100 | 0 |

The combined record is `tmp/generator/cell-repair-current.json`. All 2,626 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed. This adds
20 checkerboard configurations and 21 figure configurations. Checkerboard repeat
now accepts 128/198 cases; ordinary repeat remains 135/198.

- Failed checkerboard cells try independent positions for their two connections.
  The first remains before its edge midpoint and the second after it, preserving
  connection order between adjacent letters. The bounded nine-pair search uses
  the existing clearance and open-cut tests. Completed cells are reused across
  ordinary, balanced and repair passes; unchanged full designs are not refitted.
  Recoveries include Nunito `jul` and `Hej!`, Bree Serif `Anna` and `M&M`, Oswald
  `William` and multiline text, and Kalam `ANNA` and accented initials.
- Two final figure panel layouts put shared connections in the widest filled
  interval of a seam. Phosphor moon and stars now works in diamond and oval,
  in all three styles, with 5×5 grids. The authored snowflake works in circle,
  diamond, hexagon, rounded and scalloped frames in all three styles, with
  8×8 grids. Both neighbours use the same connection; counters are not cut out.
- Existing successful designs retain their routes, fonts, motifs and selected
  frames. The earlier ANNA cut-tip improvement remains unchanged.

All **1,007 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected. Browser verification covered the
Kalam ANNA checkerboard's matching preview and selected thumbnail and 4×4 editor
handoff, plus the snowflake's matching preview/thumbnail and 8×8 editor handoff.
The corpus checks artwork fidelity, open cuts, clearance and JSON/SVG roundtrips.
No physical weaving trial was performed.

The goal remains unfinished: 524 tested configurations are still refused. The
rest of the searchable icon catalog and non-default figure scales also remain
outside this matrix. Difficult cases still take too long; the concurrent audit
is not a latency benchmark. Historical counts below describe earlier audits.

## Previous coverage: shifted panels and touching counters

The current 3,150-configuration matrix has **2,585 accepted / 565 refused / zero
invalid accepted results**, with no regressions. This batch freshly reran all
1,122 figures; its 2,028 text results come from the complete preceding audit.
Text construction rules are unchanged in this batch.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1584 | 444 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 1001 | 121 | 0 |

The combined record is `tmp/generator/contacts-current.json`; all 2,585 accepted
IDs are pinned in `scripts/generator/expected.json`. This batch adds 13 figure
combinations, following the preceding batch's 85 recoveries.

- A final three-panel layout shifts invisible dividers away from motif tips and
  into wider gaps between outline coordinates. Each shift stays within a quarter
  of a panel width. Phosphor sun now works in the fitted template and all three
  styles of diamond, hexagon and oval, using 5×5 grids.
- A counter that already meets its parent outline can use that junction as one
  connection, with an invisible A/B bridge on the other side of an external
  gate. The compiler still requires open paths and valid sheet degrees. This
  recovers Phosphor bicycle in all three oval styles, using 3×3 grids.
- Successful existing designs retain their routes. The additional figure
  recipes run only after those fail, and the counter fallback is skipped when
  the contour forest contains no counter contact. Visible outlines, counters,
  frame choices and clearance thresholds remain intact.

All **986 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Six representative renders were inspected.
Browser checks verified matching previews and selected thumbnails, plus the
bicycle's 3×3 and fitted sun's 5×5 editor handoffs without warnings. The corpus
checks artwork fidelity, open cuts, clearance and JSON/SVG roundtrips. No
physical weaving trial was performed.

The goal remains unfinished: 565 tested combinations are still refused. The
rest of the searchable icon catalog and non-default figure scales also remain
outside this matrix. Difficult cases still take too long; the concurrent audit
is not a latency benchmark. Historical counts below describe earlier audits.

## Previous coverage: more attachment choices for difficult contours

A fresh audit of all **3,150 configurations** finished with **2,572 accepted /
578 refused / zero invalid accepted results**, with no regressions. This adds
85 verified combinations without removing any previous acceptance pins.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1584 | 444 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 988 | 134 | 0 |

The combined record is `tmp/generator/balanced-current.json`. All 2,572 accepted
IDs are pinned in `scripts/generator/expected.json`. The repeat frame accepts
135/198 configurations; checkerboard repeat accepts 108/198.

- The final contour-routing fallback distributes its fixed 256-candidate budget
  across more outer attachments, considering at most four internal counter
  variants per attachment. Text retries only when the earlier pass actually
  considered more variants there. Visible artwork and minimum clearance stay
  unchanged; no solver or detached cutouts are introduced.
- Repeated text repairs only failed local cells and reuses completed cells.
  New successes include Kalam ANNA, OSCAR and mixed-line text, Bree Serif Anna,
  2026 and M&M, plus Righteous SØREN. A regression test verifies cache reuse.
- Other recovered text includes Bree Serif William and accented Danish words,
  Oswald ÆØÅ, numerous Kalam names and multiline arrangements, and Kalam B in
  the alternating checkerboard. The prior ANNA cut-tip optimization remains.
- Tabler gift now works in hexagon and oval frames in all three styles; Tabler
  palette works in all three scalloped styles. Only failed designs reach the
  bounded additional figure pass.

All **971 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Rendered inspection covered eight representative
recoveries. Browser verification covered the Kalam ANNA repeat preview and
matching thumbnail, its 8×4 editor handoff, and the Tabler gift hexagon preview
and matching selected thumbnail. These are digital geometry, fidelity and
JSON/SVG export checks, not physical weaving trials.

The goal remains unfinished: 578 tested combinations are refused, and the rest
of the searchable icon catalog and non-default scales remain outside this
matrix. Difficult cases still take too long; concurrent audit timings are not
used as latency claims. Historical totals below describe earlier audits.

## Previous coverage: compound relief cuts and divided medallions

The expanded matrix covers every bundled font in every text frame. Its current
status is **2,487 accepted / 663 refused / zero invalid accepted results**:

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts, ten frames | 2028 | 1508 | 520 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 979 | 143 | 0 |

This batch freshly retested all **1,632 non-repeating text configurations** and
all **51 layered figures**, with no regressions. The other configurations retain
the preceding expanded audit's results; their construction paths are unchanged.
The combined record is `tmp/generator/compound-current.json`. All 2,487 accepted
IDs are pinned in `scripts/generator/expected.json`; none were removed.

- A difficult letter can use two invisible relief chords when one leaves a
  narrow shoulder. The bounded final pass keeps the outline, counters and open
  strip pairings. This recovers Kalam `juleman` in air, diamond, hexagon, rounded
  and scalloped frames, plus `amy` in a circle. If joining a new route fails,
  the previous recipe remains available; it is rerun only if a chord changed.
- Layered medallions can divide their circle and motif into neighbouring panels.
  Outer attachments project onto each panel's own silhouette; shared attachments
  can use the widest filled interval instead of landing in a counter. Both outer
  bands remain complete. Angel, snow, Phosphor sun and Phosphor smiley now pass,
  using 8×8 or 10×10 grids.
- The earlier checkerboard optimization remains: Nunito ANNA has ten exported
  tips narrower than 45°, down from sixteen, with none narrower than 30°. Its
  4×4 cyclic letter field is unchanged. JUL retains its original connections
  because the alternative produces worse tips.

Isolated single-run checks changed Kalam `amy`/circle from a 4.02-second refusal
to a 3.38-second accepted result, and `juleman`/air from a 2.10-second refusal to
a 1.72-second accepted result. These samples are not latency guarantees; difficult
handwriting and serif cases still take too long. Corpus timing includes concurrent
batches and is not used for performance claims.

All **955 unit tests and 177 inverse tests** pass, along with type checking, lint
and the production build. Rendered inspection covered the ten repaired layouts;
browser verification covered matching previews/thumbnails, the handwritten
`amy` 5×5 editor handoff and the unchanged ANNA checkerboard selection. These
are digital geometry and export checks, not a physical weaving trial.

The goal remains unfinished. The 663 refusals, the rest of the searchable icon
catalog and non-default figure scales still need work. The historical results
below describe earlier, smaller audits and must not be read as current totals.

## Follow-up: touching contours, fitted panels and repeated letters

A fresh pass over the earlier **2,130 configurations** finished with no
regressions and no invalid accepted results:

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: earlier font/frame matrix, including checkerboard | 1008 | 768 | 240 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 975 | 147 | 0 |

The ordinary repeat frame accepts **126/198** configurations; the checkerboard
frame accepts **107/198**. Every accepted result passed artwork fidelity,
open-cut topology, spacing and both JSON and SVG handoffs.

This batch repairs 19 figure combinations and 15 repeated-text combinations.
It also verifies 79 additional checkerboard configurations from the previously
untested font cases. The acceptance list now pins **1,743** configurations,
113 more than the preceding batch.

- A shared starting vertex no longer makes a separate contour look like a
  hole. Containment uses bounds and a point off the parent's boundary. This
  recovers the Phosphor butterfly in 16 templates without changing its outline.
- The close-fitting template can divide the motif into panels and attach outer
  grid lines directly to each panel's silhouette. The authored gift uses a
  5×5 grid; the Phosphor paw and Tabler gift use 4×4 grids. No circle or cutout
  is introduced.
- Repeated letters can use the corner-routing and invisible-chord construction
  when the original cell fails. Completed cells are reused, and boundary
  candidates are checked using the retained paths after their caps are opened.
  Recovered examples include Nunito `Anna` and `SØREN`, Bree Serif `amy`,
  Oswald `William`, and several Kalam initials and words.
- Attachment order is reused, and rounded graph keys are cached within each
  cell. Two diagnostic comparisons retained identical construction results:
  Nunito `Anna` took 3.80→2.99 seconds, while the refused Cinzel `SØREN` took
  34.27→29.03 seconds. These individual measurements are not a latency guarantee;
  difficult handwriting and serif cases still take too long.

All **939 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Rendered inspection covered eight recovered
examples. Browser checks covered the repaired mixed-case repeat preview and
the gift's matching thumbnail, main preview and 5×5 editor handoff. No physical
weaving trial was performed.

The goal remains unfinished: **387 tested configurations are still refused**.
The harness previously tested five fonts in only four frames. It now covers
every font in every frame, adding **1,020 configurations not yet audited**.
The expanded target is 2,028 text configurations plus 1,122 figures. Earlier
matrix results must not be presented as proof of that expanded coverage.

## Follow-up: imported contours and alternative cut routes

The figure sweep now accepts **956 of 1,122 combinations**, with **166 refused,
zero invalid accepted results and no regressions** against the preceding
acceptance list. This combines a full sweep with a retest of its refusals after
repairing the three oval paw frames. It verifies 71 additional figure cases,
including rabbit, sun, coffee and butterfly frames.

Imported contours are split at exactly repeated vertices, and collapsed loops
are removed without moving their edges or changing their even-odd fill. A
locally valid route can still fail when joined to neighbouring cells; in that
case the figure generator retains the original attachment route as a bounded
fallback. Local construction failures do not trigger this redundant retry.

The cleaner-cut ranking introduced for checkerboard letters is also available
as a final framed-text construction. A focused retest of 194 previous text
refusals accepted 30 and refused 164, with no invalid accepted output. Of these,
26 were not already pinned, including Kalam `juleman`, Bree Serif `ÆØÅ` and
Nunito `æøå` in several frames. This was a refusal retest, not a new full text
sweep. A separate 2×2 checkerboard fallback spaces shared attachments farther
apart and recovers Nunito `Å` with its ring intact.

These runs add **98 verified configurations**, bringing the acceptance list to
**1,630**. Every accepted case passed artwork fidelity, clearance and JSON/SVG
handoff checks. Rendered inspection covered eight recovered text and figure
examples. These are digital checks; there has been no physical weaving trial.
Full text and checkerboard coverage remains unfinished, as do the 166 figure
refusals.

All **926 unit tests and 177 inverse tests** pass, along with type checking,
lint and the production build. Browser verification covered the recovered
rabbit preview and thumbnail, the accented checkerboard's 2×2 editor handoff,
and ANNA's unchanged alternating letter field.

## Focused follow-up: checkerboard text and practical cuts

The new `repeat-check` frame ("Gentag med tern") builds alternating backgrounds
from the actual cutting geometry. ANNA keeps its cyclic 4×4 letter field;
odd-length words repeat twice along each axis to make an even colour period.
The ordinary repeat frame remains a separate choice.

Counter connections can land at natural corners, and invisible chords can split
long pointed tongues between the two sheets. The bounded route comparison
penalizes hairpins and short sharp steps while preserving every visible outline.
If none of these alternatives fits, that letter keeps the original contour
construction. On Nunito ANNA, exported cut tips narrower than 45° fell from 34
to 16; all eight tips narrower than 30° were eliminated. This is a geometric
improvement, not a physical paper-strength measurement.

The final checkerboard sweep tested 33 Nunito texts plus ANNA in the other five
fonts: **27 accepted, 11 refused, zero invalid accepted results**. All 25
configurations that worked before cut optimization still work; Oswald ANNA and
Cinzel ANNA are newly accepted. Every accepted result passed both JSON and SVG
handoffs, raster comparison and editor spacing checks. These 27 cases join the
acceptance list, which now pins 1,532 configurations across the generators.

The focused follow-up also recovered 12 text configurations and two default
figure configurations (`ph-paw-print` and `tb-butterfly`) from the preceding
audit's refusals. These are pinned in `scripts/generator/expected.json` and
covered by export regression tests. Larger letter panels and visible
connections to disconnected components retain the selected font and motif.

All 900 unit tests and 177 inverse tests pass, as do type checking, lint and the
production build. Browser verification covered ANNA's new frame thumbnail,
matching main preview and 4×4 editor handoff with the improved cuts. The updated
intersection warning scan retains the exhaustive algorithm's results and order
while excluding distant segment pairs before testing them.

The full audit below predates this follow-up. Its aggregate counts have not been
replaced with estimates from the focused runs; full coverage remains unfinished.

## Preceding full audit

Offline audit completed 15 October 2026. Baseline: `7e5d5d7`. The generators are safer and cover more inputs after this change, but **they do not yet support every tested combination**. Refusals are listed separately from successful generations.

| Corpus | Configurations | Accepted | Refused | Invalid accepted output |
|---|---:|---:|---:|---:|
| Text: 34 inputs, six fonts | 810 | 608 | 202 | 0 |
| Figures: 51 motifs, 22 templates | 1122 | 883 | 239 | 0 |

All accepted results passed contour fidelity and cut validation, then JSON and SVG save/reload checks. There were **no regressions among previously accepted configurations**. These are digital checks; no physical weaving trial was performed.

## Comparison on the original 1,884 configurations

The extra `amy` and uneven multiline `A\nnnn` cases were added later and are excluded from this before/after comparison.

| Mode | Before | After | Newly accepted |
|---|---:|---:|---:|
| Text | 526/762 | 565/762 | 39 |
| Figure | 880/1122 | 883/1122 | 3 |

## What changed

- Sharp concave letter shoulders can use an invisible chord through the filled stroke. It preserves the complete outline, uses no cutouts, and must retain the four open path pairings. Boundary-cap routes are checked separately so a bridge cannot remove part of a letter.
- Difficult text gets an additional layout with more spacing and separate lanes along flat frame sides. The font and selected frame stay the same.
- Figure fallback constructions can distribute details over larger panel grids. The gift now works in all three oval templates, using a 6×6 grid.
- Exterior spokes are checked once per attachment, before trying counter bridges. Extra chord attempts are bounded; the air layout no longer repeats an identical failed construction.
- The seasonal catalog no longer labels an archery bow as a ribbon bow; it shows a gift in its place.
- The corpus distinguishes construction refusals, unexpected runtime errors, invalid accepted output, and regressions. It pins accepted configurations so future failures cannot disappear inside an aggregate pass count.

## Text coverage by font

Nunito uses all nine frames. The other fonts use woven, air and repeat. The ten-letter repeat limit excludes one input per font.

| Font | Accepted | Refused |
|---|---:|---:|
| nunito | 285/305 | 20 |
| breeserif | 83/101 | 18 |
| oswald | 84/101 | 17 |
| kalam | 26/101 | 75 |
| cinzel | 40/101 | 61 |
| righteous | 90/101 | 11 |

## Figure coverage

| Motif | Accepted templates |
|---|---:|
| star | 22/22 |
| tree | 22/22 |
| heart | 22/22 |
| angel | 21/22 |
| bell | 22/22 |
| gift | 19/22 |
| tb-candle | 22/22 |
| tb-christmas-tree | 22/22 |
| tb-bow | 21/22 |
| tb-star | 22/22 |
| tb-stars | 19/22 |
| tb-bell | 22/22 |
| tb-cookie | 20/22 |
| ph-snowflake | 22/22 |
| ph-tree-evergreen | 22/22 |
| ph-star-four | 22/22 |
| ph-music-notes | 22/22 |
| ph-moon-stars | 11/22 |
| circle | 22/22 |
| flower | 22/22 |
| snow | 0/22 |
| moon | 22/22 |
| house | 22/22 |
| diamond | 22/22 |
| ph-cat | 20/22 |
| ph-dog | 22/22 |
| ph-bird | 22/22 |
| ph-butterfly | 0/22 |
| ph-horse | 22/22 |
| ph-rabbit | 0/22 |
| ph-fish | 22/22 |
| ph-paw-print | 4/22 |
| ph-coffee | 1/22 |
| ph-bicycle | 0/22 |
| ph-sailboat | 17/22 |
| ph-flower-tulip | 22/22 |
| ph-crown | 20/22 |
| ph-sun | 0/22 |
| ph-leaf | 22/22 |
| ph-eyeglasses | 22/22 |
| ph-smiley | 20/22 |
| ph-anchor | 22/22 |
| ph-infinity | 22/22 |
| ph-puzzle-piece | 22/22 |
| tb-gift | 12/22 |
| tb-heart | 22/22 |
| tb-paw | 0/22 |
| tb-flower | 22/22 |
| tb-butterfly | 1/22 |
| tb-apple | 22/22 |
| tb-palette | 17/22 |

## Remaining limitations

- Repeated text still refuses some dotted/accented letters and mixed-case words, including Nunito `jul`, `Sofie`, `ÆØÅ` and `Anna`. The extra boundary components and their connections need a more general construction.
- Fine handwriting and serif strokes still fail spacing checks in many combinations. Some failed cases remain slow; measured times are diagnostics, not a latency guarantee.
- Some complex or thin figures remain unavailable, including the authored `snow`, `ph-butterfly`, `ph-rabbit`, `ph-bicycle`, `ph-sun` and `tb-paw` motifs. Other figures work in only some frames.
- Invalid constructions remain unavailable for export. Tests do not waive clearance, remove counters, replace fonts or redraw the source motif to raise the success rate.

## Reproduce

See [the harness instructions](README.md). Run `npm run test:generator:robustness` for the full matrix. Per-case results go to `tmp/generator/report.json`, with timings, failure reasons and strip counts. The ordinary test suite includes 35 focused generation/export regressions.

Browser verification covered the repaired Nunito `anna` repeat preview and its 8×4-strip editor handoff. The gift’s oval pattern and all 42 motifs accepted in the default circle-rays frame were inspected as rendered SVG contact sheets. This checks recognizability, not physical weaveability.
