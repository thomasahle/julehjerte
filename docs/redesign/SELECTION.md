# Selecting several hearts on the front page

The owner's review of the selection state (17 Oct 2026, on the gallery-curve
build): ticking hearts is the power-user way to get several templates in one
go (FRONT-SIMPLIFY.md). The bar's selection controls change as follows.

## What changes

1. **One red button, left of the chips.** While hearts are ticked, the bar
   shows a single primary button, "Hent skabeloner" with the count badge,
   placed between the wordmark's room and the right-aligned chips, so the
   chips never move when it appears or goes. It is an opaque red pill the
   height of the chips (32px, `font-size` 13px, same vertical padding as a
   chip), so it fits the stuck bar's 49px without changing its height. The
   gear menu and the `pdfLayout` setting are gone, and so are "Vælg alle" and
   "Fravælg alle" (their translations too, unless something else uses them).

   Scroll behaviour: the button takes part in nothing. It sits in the bar's
   bottom row at rest (over the hero's snow, where the first row's ribbons
   may run behind it: it is opaque, so that reads as hearts hanging from
   behind a sign, and the chips' +54 clearance is NOT extended to it) and
   stays put when the bar sticks.

2. **The button opens the download dialog** (`DownloadDialog`, DOWNLOAD.md)
   for the selected hearts, instead of generating the gallery PDF directly.
   The dialog gains a multi-heart form: `designs: HeartDesign[]` (one entry
   keeps today's behaviour exactly). With several hearts: the title is
   "Hent skabeloner" / "Get templates" with the count; "Antal hjerter" means
   copies of each heart; the printer plan lays all pieces out in order on the
   sheets, the preview shows page 1 of n as it does today; the PDF's filename
   is the existing `pdfMultiFilename` ("julehjerter-{n}-skabeloner.pdf"); the
   laser export packs all the chosen hearts' pieces into one SVG/DXF, named
   `julehjerter-{n}-laser-{width}mm[-{lobe}].svg`. The laser lobe choice
   applies to every asymmetric heart in the set; symmetric ones ignore it as
   today. Analytics: `trackMultiDownload` for the PDF as before (one
   `download_heart` per heart with a shared `download_id`), and the laser
   event per heart with the same shared id.

   The old front-page PDF path (`generatePDF`/`generateMultiPDF` and the
   layout modes in `src/lib/pdf/template.ts`, `+page.svelte`'s `pdfLayout`,
   the `pdfLayout`/`pdfSettings` strings) is removed if nothing else uses it;
   check the trace mode and the detail page first. Its tests go with it.

3. **The tick badge sits in the ring.** The selection ring is drawn around
   the heart's own box (`.heart::before`, inset −9px). The tick badge (the
   `.pick` checkbox) must sit at the same spot inside that ring on every
   card: its top-left corner, 10px in from the ring's edges. Today it is
   anchored to the card, so it lands wherever the ribbon's length puts the
   heart. Anchor it to the heart box instead (HangingHeart can take a
   snippet, or HeartCard can position it from the hang's geometry); the hover
   and `:has(:focus-visible)` reveal rules keep working, and the badge stays
   above the ring and the link.

4. **Nothing else about selection changes:** the hover checkbox, the red
   name, the `?selected=` URL state, the 44px targets on touch.

## Verify

`npm run check`, `npm run lint`, `npx vitest run`, `npm run build` green;
unit tests for the dialog's multi-heart plan, filenames and laser packing;
a Playwright pass on `vite preview`: tick two hearts in two categories at
1440 (chips do not move, the button is 32px tall and sits left of them, the
bar's height is unchanged stuck and unstuck), open the dialog, check the
printer preview shows both hearts' templates and the PDF downloads with the
multi filename, switch to laser and download the SVG with both hearts'
pieces; at 390 the button still fits the bar's row (wrap or scroll as the
chips do, never cut off). Screenshots into `gallery-curve-qa/selection-*.png`.
