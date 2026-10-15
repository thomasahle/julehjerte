# Generator robustness results

## Current coverage: more attachment choices for difficult contours

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
