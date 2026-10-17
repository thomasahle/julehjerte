# "Hent til laserskærer" — laser-cutter export from the heart page

> **The dialog now lives in docs/redesign/DOWNLOAD.md**: one "Hent skabelon"
> dialog for the printer PDF and the laser file (`DownloadDialog.svelte`),
> which replaced the split button and `LaserDialog.svelte` described below. The
> geometry, the writers and the sheet layout here still stand, with two
> amendments from DOWNLOAD.md: a laser sheet holds **one lobe's pieces**, one
> per heart (`planLaserSheet(design, { widthMm, count, sheet, lobe })`), and the
> preview draws cut lines red and score lines blue, as the file does.

A visitor with a laser cutter (Glowforge, xTool, a LightBurn-driven machine)
wants one file that cuts a heart's pieces straight out of paper or card: the
**whole unfolded piece**, not the folded print template, with the strip cuts as
**continuous paths through the fold**, in real millimetres, with hairline
strokes and one colour/layer per operation. SVG is read by every laser program;
DXF is what xTool, LightBurn and CAD users prefer and Glowforge does not take.
Both are offered. PDF adds nothing over those two and is not.

## Geometry (`src/lib/laser/unfold.ts`, pure, unit-tested)

Start from `getTemplateData(design, lobe)` (`$lib/utils/templateSvg`): in the
template frame the piece is `templateWidth` wide, the rounded end ("ear") is a
semicircle of `earRadius` centred at `(templateWidth/2, earRadius)`, the body
runs from `y = earRadius` to the **fold at `y = templateHeight`**, and every
`cutPaths[i]` (absolute `M`/`L`/`C` commands) runs from the ear base
(`y ≈ earRadius`) to the fold (`y ≈ templateHeight`). Strip boundaries are
edge-to-edge by construction; snap each cut's first point to `y = earRadius`
and its last point to `y = templateHeight` when within 1e-6 of them, and
throw (`LaserExportError`) if a cut does not reach both — such a design cannot
be cut.

`unfoldPiece(design, lobe, widthMm)` returns, in **millimetres** (scale
`widthMm / templateWidth`), with the origin at the piece's top-left:

- `outline`: one closed path — ear arc, right side, mirrored ear arc, left side:
  `M 0 R  A R R 0 0 1 W R  L W (2H−R)  A R R 0 0 1 0 (2H−R)  Z`, with
  `W = widthMm`, `R` and `H = templateHeight` scaled (check the sweep flags draw
  the arcs outwards; the test asserts the arc midpoints at `y = 0` and `y = 2H`).
- `cuts`: one continuous open path per strip boundary: the cut as given, then
  its mirror across the fold (`y' = 2H − y`) **reversed** so the join at the
  fold has no duplicated point and no backtracking (reverse a cubic by reversing
  segment order and swapping `p1`/`p2` of each; an `L` stays an `L`). Every cut
  therefore runs from `y = R` to `y = 2H − R`.
- `fold`: the line `(0, H) → (W, H)`.
- `widthMm`, `heightMm = 2H`, `stripWidthMm` (= widthMm / the number of strips
  across the piece, i.e. `gridSize.y` for the left lobe and `gridSize.x` for the
  right — take it from the template data's overlap orientation, and test it on
  the classic 3×3 and on a non-square grid), `lobe`.

Keep numbers as numbers; formatting (3 decimals) happens in the writers.

## Sheet layout (`src/lib/laser/sheet.ts`, pure, unit-tested)

`layoutSheet(pieces, { sheet: { widthMm, heightMm }, gapMm = 5, marginMm = 5 })`
places pieces top-left to bottom-right in rows (no rotation), returns their
offsets and how many fit. The caller asks for one piece per heart, all of one
lobe — the two halves are cut from two paper colours, so a sheet is one colour
(DOWNLOAD.md, amendment 9); when `lobesShareTemplate` it is the left piece
whichever lobe is chosen. If not all fit, the dialog says so ("Der er kun plads
til {n} af {total} stykker på arket") and exports what fits — one sheet per
file, no multi-page.

## Writers (`src/lib/laser/svg.ts`, `src/lib/laser/dxf.ts`, unit-tested)

SVG: `<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm"
viewBox="0 0 {W} {H}">` so one user unit is one millimetre; `<title>` with the
heart's name and `<desc>` with the juleflet.dk URL and the width; one
`<g id="cut" fill="none" stroke="#ff0000" stroke-width="0.01">` holding every
outline and cut `<path>`, and, when the fold score is on, one
`<g id="score" fill="none" stroke="#0000ff" stroke-width="0.01">` with the fold
lines. No fills, no text, no transforms (bake offsets into the coordinates),
numbers to 3 decimals, nothing duplicated.

DXF: version **R12** (`$ACADVER` = `AC1009`), `$INSUNITS` 4 (ignored by R12
readers, read by newer ones), `$EXTMIN`/`$EXTMAX`; a LAYER table with `CUT`
(colour 1) and `SCORE` (colour 5); ENTITIES only of kinds R12 programs read:
the outline as **one closed `POLYLINE`** (flag 1) whose two ear arcs are
vertices with **bulge 1** (a semicircle) and the straight sides bulge 0 — four
vertices, exact arcs, no SPLINE; each straight cut as a two-vertex `POLYLINE`;
each curved cut **flattened** to a `POLYLINE` by adaptive subdivision of its
cubics to within 0.05 mm (`src/lib/laser/flatten.ts`, tested against a known
curve); the fold as a `LINE` on `SCORE`. DXF y points up: write
`y_dxf = sheetHeight − y`. Use `SEQEND` after each polyline's vertices.

Both writers take the laid-out sheet and the "score fold" flag.

## The dialog (`src/lib/components/detail/LaserDialog.svelte`)

Entry: the heart page's primary button becomes a split button like the
toolbar's — "Download PDF-skabelon" still downloads the PDF on click, and its
caret opens a `DropdownMenu` with "PDF til print (A4)" and "Til laserskærer…"
(`laserMenuItem`), which opens the dialog. `HeartActions` gains an `onLaser`
prop; the heart page owns `laserOpen`.

The dialog renders through `Modal.svelte` (title `laserTitle` "Hent til
laserskærer"), with:

1. Format: a two-option segmented control SVG / DXF (`toggle-group` from
   `$lib/components/ui`), default SVG, with one line under it
   (`laserFormatHint`): "SVG læses af alle laserprogrammer. DXF til xTool,
   LightBurn og CAD." / English.
2. Width: a number input `laserWidth` "Bredde (mm)", 40–200, step 5, default 80,
   remembered in `localStorage` key `juleflet:laser` (try/catch) together with
   the format; under it a derived line `laserDerived`: "Stribebredde {strip} mm
   · højde {height} mm" so the strips can be judged against a laser's limits.
3. Hearts: `laserHearts` "Antal hjerter" 1–20, default 1, with the note
   `laserPiecesNote` "Et hjerte er to stykker." and the sheet line
   `laserSheetFit` "Der er plads til {n} på arket" when fewer fit.
4. Sheet: segmented A4 / A3 / `laserCustom` "Eget mål" revealing two number
   inputs (mm). Default A4 (210 × 297, portrait).
5. Score the fold: checkbox `laserScoreFold` "Rids falsen (blå linje)", default
   off, with hint `laserScoreHint` "Slå til for karton; papir folder fint uden."
6. A live preview: the laid-out sheet as an inline SVG (reuse the SVG writer
   with display strokes: cut 0.6 px black, score dashed `--muted`), at most
   320 px tall, so the visitor sees the unfolded pieces before downloading.
7. Buttons: primary `laserDownload` "Hent {format}" and ghost `cancel` (reuse an
   existing cancel key if one exists). The download creates a Blob
   (`image/svg+xml` or `application/dxf`), an object URL, an `<a download>`
   named `{heart id}-laser-{width}mm.{svg|dxf}`, and revokes the URL after a
   second. On error show `laserFailed` in red inside the dialog.
8. A one-line legend `laserLegend` "Rød = skær · Blå = rids · 0,01 mm streg".

Analytics: `trackLaserDownload(heartId, heartName, format, widthMm)` →
event `download_laser` with `heart_id`, `heart_name`, `format`, `width_mm`
(add to `src/lib/analytics.ts`).

Strings: new group "Heart page: laser export" in both languages after the
tracing-mode group; English names the keys; translations.test.ts must pass.

Docs: add a short "Laser" paragraph to DESIGN.md §4 after the buttons.

## Tests

- `unfold.test.ts`: on classic-3x3 and jul (asymmetric) and a design with
  curved cuts: outline closes and its arc midpoints sit at `y = 0` and
  `y = 2H`; each cut starts at `y = R`, ends at `y = 2H − R`, passes through
  `y = H` once, and its second half is the exact mirror of the first; strip
  width; a design whose cut does not reach the fold throws.
- `flatten.test.ts`: a cubic flattened at 0.05 mm stays within 0.05 mm of the
  true curve (sample 100 points) and uses few points for a straight segment.
- `sheet.test.ts`: fit counts for A4 at 80 mm; leftovers reported; margins and
  gaps respected (no overlap).
- `svg.test.ts` / `dxf.test.ts`: parse the output (DOMParser for SVG; a tiny
  group-code reader for DXF) and check units, layers/groups, entity counts,
  the bulge values, y-flip, and that no path is emitted twice.
- `LaserDialog.test.ts` (jsdom, as `TraceMode.test.ts`): defaults, derived
  line, fit note, the download producing a Blob of the chosen type, one
  `download_laser` event.
- Your own Playwright run (own Chromium; `npm run build && npm run preview`):
  open classic-3x3, open the menu, open the dialog, switch format and width,
  download both formats (capture the download, check the SVG's `width="…mm"`
  and the DXF's `AC1009`), screenshot the dialog at 1440 and 390 into
  `docs/redesign/laser-qa/` (gitignored). Then import-sanity: open the SVG in
  Chromium and screenshot it; confirm visually that cuts run through the fold.

## Constraints

DESIGN.md §8 applies: prerendered static site, both languages, `npm run
check`, `npm run lint`, `npm test`, `npm run build` green, commit on this
branch (`laser-export`), **never push**, work only in this worktree, no shared
Playwright MCP tools, do not touch `static/inverse`, `scripts/inverse`,
`docs/inverse`. No new dependencies: the writers are plain string builders.
