# Generator robustness results

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
