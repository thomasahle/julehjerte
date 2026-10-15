# Generator robustness results

## Current coverage: separate figure components and shared-cut detours

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
