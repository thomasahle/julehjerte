# One "Hent skabelon" dialog: print or laser, size, count, sheet

The heart page's primary button opens one dialog for everything about getting
the template out of the site, replacing the "Download PDF-skabelon ▾" split
button and the separate laser dialog (docs/redesign/LASER.md, whose geometry,
writers and sheet layout stay as they are). Owner's direction, 2026-10-17.

## Entry

`HeartActions.svelte`: the primary button is `btn btn-primary` with the
download icon and the label `getTemplate` ("Hent skabelon…" / "Get the
template…"); it opens the dialog (`onDownload` now means "open the dialog").
Remove the caret, the `DropdownMenu`, the `onLaser` prop and the strings
`moreDownloadOptions`, `pdfForPrinting`, `laserMenuItem`,
`downloadPdfTemplate` if nothing else uses them (the front page toolbar keeps
its own `printSelected` flow and strings; do not touch it or `downloadMultiPDF`).

## The dialog (`src/lib/components/detail/DownloadDialog.svelte`)

Through `Modal.svelte`, title `getTemplateTitle` ("Hent skabelon"). Two columns
at ≥ 900 px (settings left, preview right), one column below, as the laser
dialog does today. Settings, top to bottom:

1. **Til** (`downloadMode`): segmented **Printer** (`modePrinter`, hint
   `modePrinterHint` "PDF i rigtig størrelse. Print uden tilpasning til siden.")
   / **Laserskærer** (`modeLaser`, hint = the existing `laserFormatHint`).
   Default Printer.
2. **Bredde (mm)** — the existing width control and derived line (keys `pieceWidth`, `pieceDerived`;
   they were `laserWidth`/`laserDerived`),
   shared by both modes. Default 80, 40–200, step 1 (5 until QA round 3: any
   whole millimetre is a fine width). In Printer mode the derived
   line gives the strip width and the **folded** template's height
   (`templateHeight` scaled); in Laser mode the unfolded height, as now.
3. **Antal hjerter** — existing `laserHearts` and `laserPiecesNote` ("Et hjerte
   er to stykker."), both modes. *As built: laser mode only; the printer PDF
   always gets one heart per design (`hearts: 1`).* A heart is two pieces in both: the printer PDF
   therefore places **two folded templates per heart** (two identical ones
   when the lobes share a template, else left + right), each labelled as the
   PDF labels them today.
4. **Ark** — existing `laserSheet` control (A4 / A3 / Eget mål) for both modes.
   Printer mode: the PDF page is that size; A4 and A3 are jsPDF formats,
   custom is `[w, h]` in mm. When the pieces do not fit on one page, the PDF
   gets more pages (no limit); the note `pdfPages` "{n} sider" replaces the
   laser's "plads til {n}" line. Laser mode keeps its single sheet and its note.
5. **Laser mode only**: Filformat SVG / DXF (`laserFormat`) and "Rids falsen"
   (`laserScoreFold` + hint), as now (the scoring was removed in round 2,
   amendment 1). Printer mode only: checkbox
   `pdfShowPreviewImage` "Vis et lille billede af hjertet på skabelonen"
   (default on) for the thumbnail the PDF prints inside the ear today.
6. Preview (right column): the sheet, with the pieces as they will be placed —
   folded templates (outline, fold, cuts) in Printer mode, unfolded pieces in
   Laser mode — using the laser dialog's preview styling. Printer mode shows
   page 1 and says `pdfPreviewPage` "Side 1 af {n}" when there are more.
7. Buttons: ghost `cancel`, primary `downloadFile` "Hent {format}" where format
   is PDF, SVG or DXF. The legend line stays in Laser mode only.

### Amendments after the owner's testing (2026-10-17)

8. **Laser preview colours.** In Laser mode the preview draws in the file's
   colours — cut `#ff0000`, score `#0000ff` (display stroke 0.6 px, the score
   dashed) — so the legend "Rød = skær · Blå = rids" describes what is on
   screen. Printer mode's preview stays black and has no legend.
9. **One colour per laser sheet.** A heart's two pieces are cut from two paper
   colours, so a laser sheet holds pieces of **one lobe only**, one per heart
   ("Antal hjerter" = pieces on the sheet):
   - a heart whose lobes share a template (`lobesShareTemplate`): N identical
     pieces, with the note `laserSameNote` "Halvdelene er ens: skær arket én
     gang i hver papirfarve, eller læg to ark oven på hinanden.";
   - an asymmetric heart: a segmented control `laserPiece` "Stykke" with
     Venstre / Højre (`lobeLeft` / `lobeRight`), default Venstre, and the note
     `laserBothNote` "Hent begge halvdele – én fil pr. papirfarve."; the file is
     named `{heart id}-laser-{width}mm-{lobe}.{svg|dxf}` with the lobe's word in
     the page's language, slugged (`venstre`, `hoejre`, `left`, `right`). The
     lobe is remembered for the visit only (module state), not in storage.
   - `planLaserSheet` takes `{ widthMm, count, sheet, lobe }` and returns
     `piecesFit` / `piecesRequested`; `layoutSheet` is unchanged. The fit note
     `sheetFit` counts pieces: "Der er kun plads til {n} af {total} stykker på
     arket".
   The printer PDF is unchanged: two folded templates per heart, since a
   printed template is traced or cut with scissors, not fed to a laser.

Settings are remembered in `localStorage` under `juleflet:download`
(`{ mode, widthMm, hearts, sheet, format, previewImage }` since round 2; try/catch,
unknown values ignored). Read the old `juleflet:laser` once as a fallback and
then ignore it. (Since QA round 3, 2026-10-18:) they are written when a
download starts, PDF or laser, and at no other time: opening the dialog
stores nothing, and Annuller or Escape drops every change, so each opening
starts from the settings of the last download (or the defaults).

The number fields (width, laser count, custom sheet) follow what is typed at
once, clamped to their range (40–200 mm, 1–20, 50–2000 mm) and rounded to a
whole number, so the preview, the derived line and the button always show the
file the click gives; the typed text stays as it is until the field is left,
when it shows the value used. A field that holds no number is marked
(`aria-invalid`, red border) and disables the button; leaving it puts the last
good value back. (QA round 3; before, an out-of-range value was ignored until
the field was left, and the file came out at a size the preview never showed.)

## Printer PDF at a chosen size (`src/lib/pdf/template.ts`)

Add `generateTemplatesPDF(designs, options)` / `downloadTemplatesPDF(...)`
with `options: { widthMm, hearts, sheet: { widthMm, heightMm }, lang,
previewImage }`, reusing `drawLobeTemplate` (as built, `drawLobeTemplateAt`), the name + address labels, the
footer and `prerenderHeartImages` exactly as the existing pages do, but placing
the templates with the laser module's `layoutSheet` (`src/lib/laser/sheet.ts`,
5 mm gap and margin) on as many pages as needed. The piece box handed to
`layoutSheet` is the folded template's width × (height + the 9 mm header the
labels take) — in round 2 the template alone, the labels being inside it; the 9 mm header
is back since the owner's "no name in the ear" (below). Pull the page-planning maths into a pure function
(`planTemplatePages`) in `src/lib/pdf/plan.ts` with tests. Keep the existing
`generatePDF`/`generateMultiPDF`/`LayoutMode` code path intact for the front
page toolbar. (Since removed: `generateMultiPDF` and `LayoutMode` are gone, and
only the editor and the paint page still call `generatePDF`/`downloadPDF`.) `downloadTemplatesPDF` saves `{heart id}-{width}mm.pdf` (since the
QA round of 2026-10-17 the id, `heartFileStem`, as the laser files are named;
it was the display name's slug, so `circle` printed as `uret-v2-60mm.pdf`).

Analytics: a PDF download from the dialog calls the page's existing
`trackHeartDownload` once (unchanged); a laser download calls
`trackLaserDownload` as now. Nothing new.

## Docs and strings

Update DESIGN.md §4 (the buttons paragraph and the "Laser" paragraph become one
"Hent skabelon" paragraph) and add a line at the top of LASER.md saying the
dialog now lives in DOWNLOAD.md. Strings in both languages, English names the
keys, translations.test.ts must pass; rename laser-only keys that are now
shared (`laserWidth` → `pieceWidth`, `laserHearts` → `heartsCount`,
`laserSheet*` → `sheet*`, `laserPiecesNote` → `piecesNote`) so the names stay
honest.

## Tests

- `plan.test.ts`: page planning for 1, 3 and 12 hearts at 80 mm on A4 (counts
  per page, no overlap, pages needed), on A3, and for a custom small sheet.
- `DownloadDialog.test.ts` (rewrite of `LaserDialog.test.ts`): defaults; the
  derived line per mode; switching mode shows/hides the mode-only controls; the
  PDF path calls the generator with the chosen options (mock the dynamic
  import of `$lib/pdf/template`); the laser path still produces an SVG/DXF
  Blob and one `download_laser` event; settings round-trip through storage.
- Keep every existing test passing (`npm test`, ~3 min; do not touch
  `scripts/inverse`).
- Your own Playwright run (own Chromium, own port, `npm run build && npm run
  preview`): open classic-3x3, open the dialog, download a PDF at 60 mm × 3
  hearts (check the filename and that the PDF has the expected page count by
  reading `/Type /Page` occurrences or using pdf.js if present), switch to
  Laserskærer and download an SVG, check the preview changes between modes,
  at 1440 and 390. Screenshots into `docs/redesign/download-qa/` (gitignored).

## Constraints

DESIGN.md §8 applies: static prerendered site, both languages, `npm run check`,
`npm run lint`, `npm test`, `npm run build` green, commit on a branch
(this work was `front-simplify`; it is merged into `main`) in clear commits, **never push**, work only in this
worktree, no shared Playwright MCP tools, do not touch `static/inverse`,
`scripts/inverse`, `docs/inverse`, no new dependencies.

## Amendments, round 2 (owner's testing, 2026-10-17)

1. **No fold scoring.** Remove the "Rids falsen" option, its hint, the score
   colour and layer, and everything that drew the fold in the laser output and
   its preview: the laser file is cut lines only, red `#ff0000` hairlines in one
   `<g id="cut">` (SVG) / one `CUT` layer (DXF). The legend becomes one line,
   `laserLegend`: "Alle linjer skæres · 0,01 mm streg" / "Every line is cut ·
   0.01 mm stroke". Drop `scoreFold` from the stored settings (ignore it when
   reading old values) and from `planLaserSheet`/writer options; update
   LASER.md, DESIGN.md §4 and the tests. The printer PDF keeps its dashed fold
   line, which is a drawing instruction, not a laser operation.

2. **The printer preview shows the heart, not a green box.** The dialog's
   printer-mode preview draws a placeholder rectangle where the PDF prints the
   heart's picture. It must show the real heart: reuse the same rendering the
   PDF uses (`prerenderHeartImages`, a PNG data URL per design, async) and
   embed it in the preview SVG as an `<image href>` at the same place and
   size the PDF uses; while it renders, draw nothing there (no box). Keep the
   checkbox that turns the picture off, and then show none in the preview either.

3. **Name and address on the piece, not above it.** Move the two label lines
   the PDF prints above each template — the heart's name and its address
   (`templateAddress`, e.g. juleflet.dk/hjerte/jul) — INTO the rounded end of
   the template, centred, directly under the heart's picture and above the ear
   base where the cuts begin, so the words survive folding and cutting: the
   name at 8 pt, the address at 6 pt grey, as today, scaled with the template
   so they never collide with the picture or the first cut (compute the free
   band between the picture's bottom and the ear base and shrink the font to
   fit when a template is small; below 5 pt drop the address first). When the
   picture is turned off, the text moves up to where the picture was. Remove
   the 9 mm header the plan reserves (`planTemplatePages`), so the pieces pack
   tighter, and update `plan.test.ts`. The dialog's printer preview draws the
   same two lines in the same place (`preview.ts`).

Everything else in this file stands, including round 1.

### As built (round 2)

- **Scoring** is gone from the dialog, `$lib/download/settings` (an old stored
  `scoreFold` is ignored), `planLaserSheet`, both writers (`serializeLaserSvg`
  takes no `scoreFold`, `serializeLaserDxf(layout)` has one `CUT` layer) and the
  unfolded piece (`UnfoldedPiece.fold` removed: nothing drew it any more). The
  printer preview's dashed fold is now the class `fold`, not `score`.
- **The ear layout** is one pure function, `layoutEar` in
  `src/lib/pdf/earLayout.ts` (tests in `earLayout.test.ts`), reached through
  `templateEar(piece, { lang, picture, measure })` in `plan.ts`; the PDF passes
  jsPDF's exact text widths, the preview a Helvetica estimate (and draws its
  lines in Helvetica). The picture keeps its old size, `min(35 % of the width,
  25 % of the height)`, but sits as high in the ear as the curve allows
  instead of at a fifth of the height: at the old place it ended 2 mm above
  the ear base, which left no band for the text.
- **No name in the ear (owner, after round 2):** "the heart name should not be
  in the picture, only the url" — and then, clarified: the name must still be
  on the paper, just not on the piece. So the ear holds the picture and the
  bare `templateAddress(design, lang)` for every piece (no lobe word there), and the
  name is printed above each template again, as before round 2:
  `templateLabel(piece, lang)` ("Jul (Venstre)" / "Jul (Right)"; the bare name
  for a shared template), 8 pt black, centred over the rounded end with its
  baseline 4 mm into the restored `TEMPLATE_HEADER_MM` = 9 mm band
  (`planTemplatePages({ headerMm })`; a placement's `y` is the box's top, the
  template starts 9 mm lower). Page capacity is back to what the header
  allows: six 60 mm templates on A4 (nine without it), four 80 mm ones. The
  preview draws the same label (`text.label`). `NAME_PT` is gone from
  `earLayout.ts`; `EarLayout` has `address: EarLine | null` instead of
  `lines`, and `templateEar` no longer takes `lang` (it does again since the QA
  round of 2026-10-17: `templateAddress(design, lang)` gives an English PDF
  `juleflet.dk/en/hjerte/<id>`, the page its laser file links to; the longest
  id still gets the full 6 pt at 40 mm). The address is 6 pt grey,
  never larger, shrunk to the band under the picture and to the ear's width at
  its top, never under 5 pt: if the band cannot hold 5 pt the picture shrinks
  (only under about 32 mm wide; the narrow half of `amy-weave-1` at 40 mm is
  35 mm and gets about 5.3 pt). The classic heart's address is the full 6 pt
  at 40, 60 and 80 mm. With the picture off it is centred where the picture's
  middle was, moved lower only where the curve is too tight there even for
  5 pt. Tested for every gallery heart at 40 mm with jsPDF's widths. The laser
  export stays text-free; the front page's gallery PDF is unchanged.
- **The picture** is rendered by `prerenderHeartImages`, moved to
  `src/lib/pdf/heartRenderer.ts` so the dialog can use it without loading
  jsPDF, at `templatePicturePixels(pieces, lang)` (300 dpi for the largest
  template, as the PDF). The preview embeds it once per design as an
  `<image>` inside a `<symbol>`, placed in each ear with `<use>`. While the
  width changes, the last picture of the same heart stays until the new one
  is ready (only its sharpness differs).
- `TemplatePiece` gained `earRadiusMm`. (`TEMPLATE_HEADER_MM` and `headerMm`
  were removed in round 2 and are back, for the name; see above.) The front page toolbar's gallery PDF
  (`generatePDF`/`generateMultiPDF`, its own fixed layouts) still prints its
  labels above the templates: it was left alone, as the first round asked.
  (Since SELECTION.md the front page uses this dialog and that path is gone;
  see "As built (several hearts)" below.)

### As built (several hearts, SELECTION.md)

- **The front page opens this dialog** for the ticked hearts, from the gallery
  bar's single "Hent skabeloner (n)" button (the chip row's first item,
  DESIGN.md §3). The dialog and the gallery
  hearts' geometry are imported on the click, so the front page's first load
  carries neither. `DownloadDialog` takes `designs: HeartDesign[]` (the heart
  page passes `[design]` with its `heartId`/`heartName`, and behaves exactly as
  before).
- **With several hearts** the title is `getTemplatesTitle` ("Hent skabeloner"
  / "Get templates") with the count in a red badge; the strip/height line is
  left out (the hearts have different strips); the printer plan lays every
  heart's templates out in order, heart by heart, and the preview shows page 1
  of n; the PDF is `downloadTemplatesPDF(designs, …)`, named by
  `templatesFilename`: `pdfMultiFilename` ("julehjerter-{n}-skabeloner.pdf" /
  "christmas-hearts-{n}-templates.pdf"). The laser sheet is
  `planLaserSheet(designs, …)`, which now takes one heart or several: copies of
  each heart's piece, heart by heart, `hearts: LaserHeart[]` on the plan, the
  lobe choice applying to every heart whose halves differ (shared ones are cut
  from `SHARED_TEMPLATE_LOBE`'s piece, the right one the PDF prints, since the
  QA round of 2026-10-17; it was the left), and offered only when at least one heart's
  halves differ. The file is `laserFileName(t('laserMultiFilename'), …)`:
  `julehjerter-{n}-laser-{width}mm[-{lobe}].svg|dxf`; its SVG title lists the
  hearts' names and its description points at the front page. (Since the QA
  round of 2026-10-17, `n` and the title count only the hearts with a piece on
  the sheet, `plan.heartsOnSheet`; when the sheet has no room for some,
  `sheetFit` is followed by `sheetLeftOut`, "Ikke med: {names}" / "Left out:
  {names}", naming `plan.heartsLeftOut`.)
- **Analytics:** the PDF sends `trackMultiDownload` (one `download_heart` per
  heart with a shared `download_id`, plus `download_multi_hearts`); the laser
  file sends `trackMultiLaserDownload`, one `download_laser` per heart with a
  shared `download_id` and `download_count`. One heart sends the single events
  as before.
- **"Antal hjerter" is laser only (owner, with SELECTION.md):** a printed
  template is cut as often as wanted, so the printer PDF holds exactly one
  template set per heart — the single-heart dialog included — and the field
  shows in laser mode only, where it is copies of each heart on the sheet
  (`piecesEachNote` under it when there are several). The stored `hearts`
  setting is the laser's.
- **Removed:** the front page's own PDF path — `generateMultiPDF`,
  `downloadMultiPDF`, the small/medium/large `LayoutMode`, the page's
  `pdfLayout` and `generating`, the bar's gear menu and select all/none, and
  the strings `pdfLayout`, `pdfSettings`, `layoutSmall/Medium/Large`,
  `selectAll`, `selectNone`. `generatePDF`/`downloadPDF` stay, fixed at nine
  templates to an A4 page: the editor and the paint mode still use them.
- Tests: `DownloadDialog.test.ts` (several hearts: title, plan order, PDF
  call and event, laser file name, contents and event, no lobe when all
  shared; printer has no count), `export.test.ts` (multi-heart plan, file
  names), `template.test.ts` (`templatesFilename`).


## Orientation marks (2026-10-19)

Owner: "For templates that are not symmetric, it's often helpful to know which
side should be up and down, e.g. by putting a little x, like
https://cs.au.dk/~gerth/julehjerter/ does." The idea is Gerth Stølting
Brodal's: in his generator one piece carries a small circled cross ⊗ and the
other a plain ×, and the weaver lays the two pieces so the crosses lie on top
of each other. Juleflet does the same (`$lib/utils/orientationMarks`).

- **Why one mark per piece is enough.** A folded piece fits its place in the
  heart two ways: as cut, or turned over (half a turn about its long axis,
  which swaps its layers and its long edges and so shows the template
  mirrored, `x → W − x`). Which face of the paper is out changes nothing else.
  So a piece whose template is its own mirror image can go in either way, and
  any other piece has one right way, fixed by one corner.
- **Where.** At the top of the heart, where the two rounded ends meet. In the
  editor's frame (drawn turned 45° clockwise) that is the overlap square's
  top-left corner, and `getTemplateData` maps it to `(0, R)` on both lobes'
  templates. The mark sits by the template's left side, just below the ear
  base (the ear holds the picture and the address down to its base), at the
  nearest spot clear of every cut: about 3 mm across, smaller (down to
  1.5 mm) only where a strip at the corner is narrow (`amy-weave-1` at
  40 mm). The left lobe's piece carries ⊗, the right's ×. Which piece goes
  left does not change the paper (a heart turned over has its pieces
  swapped); it decides which face is the front, and with ⊗ on the left the
  heart looks as on the site.
- **Shared templates.** The other lobe's own template is either the printed
  one (lobes mirrored across the diagonal) or the printed one turned over
  (the right lobe is the left turned 90°: `permo-kroge`, `hvirvel`, `kogle`,
  `origami`, `plus`, `plus3`, `sun`); then that lobe's mark is on the right side, `(W, R)`.
  The PDF prints the shared template twice, the first copy with ⊗ and the
  second with ×; a template shown once (heart page, tracing mode) carries
  both, or one ⊗ when they fall on the same corner; a laser piece carries
  its own lobe's mark above the fold and the other lobe's mirrored below it,
  which folding lays on the same corner.
- **When.** `needsOrientationMarks(design)`: some piece of the heart is not
  its own mirror image (Hausdorff distance of the sampled cuts over 2 % of the
  template's width). 41 of the 61 gallery hearts; the classic heart and the
  other symmetric ones get none and their sheets are unchanged. A heart with
  two different templates that are each symmetric (`drageskael`) gets none
  either: every way a piece can go in is right.
- **Drawn:** the printer PDF (0.2 mm black) and its preview, the editor's
  nine-up PDF, the tracing mode, the heart page's large template view (not
  its 104 px thumbnails), and the laser file as a separate non-cut layer
  (LASER.md). The guide has one sentence on it (`guideMarksNote`).
- **Tests:** `orientationMarks.test.ts` lists the marked hearts and checks,
  for every one, that a piece laid with its mark at the top of the rendered
  heart (svgWeave's frame turned 45°) has exactly the cuts of the woven lobe
  the site draws, and laid the other way does not; `plan.test.ts`,
  `template.test.ts`, `svg.test.ts`, `dxf.test.ts`, `unfold.test.ts` check
  each output.
