# Paint mode ("Mal") — spec

The editor gets a second mode. **Tegn** (draw) is the editor as it is today: strips as curves, symmetry, colours,
details, Gem, PDF. **Mal** (paint) is a two-colour *mask* of the woven square that the visitor paints on, fills from
a photo, or gets from an existing heart, and that the local inverse engine turns into strips ("Find snit"). A heart
can go back and forth: Find snit turns the mask into a heart, "Mal på hjertet" turns a heart into a mask.

Owner's decisions (2026-09-08, mockup https://claude.ai/code/artifact/cc56e263-9cfc-459d-9a6f-9ae00db680aa):

1. The mask is a **fixed high-resolution image** (400 × 400 cells of the woven square, the engine's resolution).
   No cell size setting, no visible grid. Brush radius: an integer slider from 1–40 cells, default 6 (updated by the owner, 2026-10-19);
   1–200 since 2026-10-26, as far as Udtvær reaches (the owner's request), on a slider that grows the size by ratio.
2. **Symmetry belongs to Find snit**, using the editor's own three rows (Inden i kurve, Inden i lap, Mellem
   lapper; Fra / Sym / Anti). Symmetries found in the mask are switched on and tagged "fundet".
3. **No search time setting.** Find snit runs until it has an answer or the visitor presses Afbryd.
4. Mal has **two panels only**: left = Importér billede, Ryd, tools; right = Find snit. Farver and Hjertedetaljer
   stay in Tegn. The tool panel chooses either paper colour or XOR, which swaps the paper colour underneath.
5. The mask is drawn **inside the heart**: the woven diamond carries the mask, the lobes show the paper colours,
   mirror lines are drawn in heart orientation.
6. **Import is a dialog**: file, corners (found automatically, draggable), colour interpretation, a preview of the
   mask as a heart, "Brug som maske".

Everything else in docs/redesign/DESIGN.md still applies (tokens, `.btn`, floating panels, breakpoints, i18n, tests).

## 1. Routes, chrome, navigation

- Draw: `/editor/` and `/en/editor/` (unchanged). Paint: `/editor/mal/` and `/en/editor/paint/`, registered in
  `$lib/i18n/routes.ts` as RouteKey `paint` (the language toggle, hreflang alternates and the sitemap all read that
  table). Pages live where the other differing-slug pages live: `src/routes/editor/mal/+page.svelte` and
  `src/routes/en/editor/paint/+page.svelte`, each a thin wrapper rendering `$lib/components/paint/PaintPage.svelte`
  with `lang`. Prerendered like every page; the engine is never touched at build or SSR time.
- `?import` on either route opens the import dialog at once (owner, 2026-10-24): /design's "Fra et billede" card
  links there (`paintImportHref`). The page drops the parameter from the address as it opens the dialog.
- `PageHeader` (variant `editor`) gains an optional `mode` prop: `{ current: 'draw' | 'paint' }`. When given it
  renders a segmented switch in the middle of the bar (grid `1fr auto 1fr`): "Tegn" with the pencil icon and "Mal"
  with the image icon (en: Draw / Paint), links to the two routes, `aria-current` on the active one. Both editor pages
  pass it. On phones (< 600px) the switch shows icons only.
- Switching mode is plain client-side navigation. State survives it because it lives in a module store (§3), not
  in page components.
- Top-bar actions in Mal: Hjælp, Hent PDF, Gem, EN pill — the same buttons as Tegn. Hent PDF and Gem act on
  the session's current heart (the last Find snit result, or the heart the visitor came from). While there is no
  heart yet they are disabled with a tooltip ("Find snit først").

## 2. UX of the paint page

Canvas (full-bleed, same `CanvasBackdrop` sky and landscape, same fit band between the floating panels):

- The heart as it will look: two lobes in the paper colours (left lobe = left colour, right lobe = right colour),
  the woven diamond carrying the mask (mask 0 = left colour, 1 = right colour), a faint outline of the diamond.
  Painting happens directly on the diamond. Outside the diamond the pointer does nothing.
- Mirror lines, dashed `--blue`, drawn in heart orientation for the symmetries that are on (see §5).
- Top-left pill: "Maske · 400 × 400 · to farver" plus a one-line hint. Below 900px the pill goes away.
- Wheel/pinch zoom and pan as in Tegn (the owner's request, 2026-10-26): Ctrl + wheel, a trackpad's pinch or a
  mouse wheel counting lines zoom about the pointer (0.5–20×); a trackpad's two-finger scroll pans; on a touch screen
  two fingers zoom and pan, and a second finger gives up the first one's stroke (taken back with nothing to redo,
  `history.takeBack`), the finger left behind painting nothing until both are lifted. "Tilpas visning" shows at the
  canvas's lower left while the heart is zoomed or moved. Zoom and pan are the layout's scale and centre and nothing
  else (`heartLayout.ts`), so drawing and pointers follow.
  Keep the canvas code ready for it (one transform matrix between screen and mask coordinates).

Left floating panel (same column width and style as Tegn's tool rail area, 300px; two panels since the symmetry
rows moved in, so on a short viewport the column stops centring itself — `justify-content: safe center` — and
scrolls from the top, with a fade over its bottom edge while there is more below it, because macOS draws nothing
of an overlay scrollbar until a gesture starts):

- Row of two buttons: `Importér billede` (outline, opens the dialog) and `Ryd` (ghost, goes back to the 5 × 5 board
  without asking; one undo step, so Fortryd brings the painting back).
- Panel "Værktøj": tools Pen, Fyld, Linje, Rektangel, Ellipse (key O, 2026-10-26: the ellipse inscribed in the
  rectangle the drag spans, along the strips as the rectangle is), Udtvær, Markér as 40px icon buttons (lucide:
  pencil, paint-bucket, minus (rotated 45°) or a simple line glyph, square, ellipse, square-dashed); a labelled brush-radius
  slider (1–200 cells, default 6; each step along it the same ratio, so a fine pen is as easy to set as a broad one;
  `[`/`]` a cell at a time while fine, a tenth of the size once broad) with its current value; "Maler med" offers the two paper swatches plus XOR.
  XOR inverts each covered cell once per gesture, including overlapping dabs and mirrored copies; pen, line,
  rectangle and fill support it. There is no eraser: with two papers, erasing is painting the other one (the white
  swatch, or X). The user had it removed on 2026-10-26. The mask remains binary. A noninteractive
  circular outline follows the brush over the diamond, at the current on-screen radius, and hides on leave,
  cancellation and touch release. Choosing XOR does not change the paper colours. Undo / redo (lucide undo-2 / redo-2) are two 40px icon buttons —
  the tools' own square (`.tool-btn`, not the site's `.btn-icon`: the two differ by a glyph size, a ground and a
  disabled opacity, and two nearly-identical squares in one panel is worse than one local name), with the words in
  the same `Tooltip` the tools wear and in `aria-label` — set at the right-hand end of the swatches' row rather than
  in a labelled row of their own, which the column has no line to spare for. They are a sibling of the "Maler med"
  field inside that row, not inside it: a label reading "Maler med" must not appear to head them. The keys are
  Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z as before. Markér adds **one** line of help under the grid while it is the tool in
  hand ("Træk en ramme; Enter lægger den fast, Esc fortryder."), because its gestures cannot be read off its
  glyph; the five lines it used to be — the handles, the turner, and the whole keyboard route — are in the Hjælp
  dialog, which is where there is room to read them. That one line describes a drag, which is the single route a
  keyboard visitor has not got, so the keyboard route rides on the drawing's own `aria-label` while Markér is in
  hand (`paintSelectionKeyboard`): the drawing is a tab stop for exactly that visitor, and the sentence costs the
  column no line at all.
- **Markér** (owner, 2026-09-08): drag a frame on the mask to lift a rectangle of cells; a dashed marquee with four
  corner handles and a turner above it. Dragging inside moves the cells (what they leave becomes paper 0), a corner
  scales — uniform, and free with Shift — and the turner turns about the centre by any angle. Enter or a click
  outside commits, Escape drops it, Delete/Backspace clears the selected cells. Resampling is nearest-neighbour at
  the mask's own cells, so a two-colour mask stays two-colour. The mask is not touched until a commit: undo takes one
  snapshot per commit, Escape has nothing to take back, and a patch put down where it was lifted takes no snapshot
  at all. A commit spreads under the active transforms like any other edit, but it lays down both colours at once
  (the vacated cells and the placed ones), so it cannot be spread by colour the way a stroke is: the commit marks
  every cell it wrote — cleared, or laid down — and `applySymmetricEdit` spreads those marks from a copy taken
  before any of it is written, the placed cells after the cleared ones so that the moved cells win at a mirror line.
  Reading the mask as it is written blanks the drawing outright when a patch is dropped on its own reflection.
  Without a pointer: the drawing is a tab stop while Markér is in hand, Enter marks the middle of the mask, the
  arrow keys move the patch, Shift and an arrow size it, and `,` / `.` turn it 15° at a time; a live region reports
  the patch as it is lifted, sized, put down and cleared. The geometry is `src/lib/paint/selection.ts`, pure and
  tested; the interaction is in `MaskCanvas`.
- Panel "Symmetri" (owner, 2026-09-08 — moved out of Find snit): the three symmetry rows (the shared component, §6)
  with the "fundet" tags, and nothing else. The explanation "Fundet i masken og slået til; alt du maler, spejles
  med." is the panel heading's `title` and a bullet in Hjælp: it is worth reading once and never again, and at 300px
  it cost the column two lines on every visit. The rows keep their label above their control, and the segments keep
  their words beside their icons (owner, 2026-09-08). They live here rather than with the search because they are
  live while painting: a row switched on mirrors every stroke from that moment, so they belong beside the brush they
  change. Find snit still reads them from the session.
  All three panels in the column stand down — every control inside really disabled, which is what a screen reader
  reads — while the found heart is on screen, because there is no mask under the pointer then; "Tilbage til masken"
  brings them back.
- **Udtvær, Tern, the brush head and a selection that stays** (the owner's request, 2026-10-25), for hearts like Hvirvel and
  Glaskuppel, which are a plain board turned or swelled:
  - *Brush head*: small buttons in the brush label's row (no row of their own), shown with the size slider only for
    the tools that paint with the brush (pen, line, Udtvær; `BRUSH_TOOLS`), named by how they look on the
    drawing (`src/lib/paint/brushHead.ts`): round; square along the strips (the mask's axes, so a diamond on
    screen); square upright on screen (added 2026-10-26, a diamond on the mask); flat, a nib a quarter as thick as
    it is long lying from lower left to upper right, for thick and thin strokes (added 2026-10-26). Every head
    holds the disc of the radius; the pen, the line (whose preview is the hull of the head at both ends) and
    Udtvær (whose hold fades to the head's rim, the nib turned in images whose symmetry swaps the axes) take it.
  - *Udtvær* (lucide pointer, key U) moves the paper rather than painting it: **Skub** drags it along with the
    pointer, **Hvirvl** turns it about the brush and **Bul** swells it out, both for as long as the pointer is held;
    Alt turns the other way or draws in. Its three modes are one row under the tools, shown only while it is the
    tool in hand. It has its own radius (8–200 cells, default 80, `[`/`]` in steps of 5), because a hvirvel turns most
    of the square at once. It follows the brush head (a square hold fades to a square rim) and has a **Styrke**
    slider of its own under the modes, 10–100 %, default 30 % (2026-10-26, the owner's request and choice): at 100 % a push
    carries the paper under the brush's centre all the way with the pointer and a held turn or swell goes at its
    full pace; lower, the paper lags behind and a turn creeps. A stroke never resamples its own output: it keeps the mask it started from and a field
    of where each cell's paper comes from, reads bilinearly and cuts at one half (`src/lib/paint/smudge.ts`), so
    the mask stays two papers and edges do not wear into steps. Under symmetry the dab is made at every image of
    the brush in one summed step, so a symmetric mask stays exactly symmetric with nothing copied afterwards.
  - *Tern* (lucide grid-3x3) sits at the far end of the Værktøj heading: a menu of 3 × 3 to 9 × 9, laying a plain
    woven heart's board (corner squares the left paper, as a classic 3 × 3), over the whole mask or inside the
    selection. One undo step, so no confirm. An even board is not its own mirror image within a lobe, so those
    sizes are disabled, with the reason as their title, while Kurverne i hver lap is Spejlet.
  - *A selection that stays*: Markér's frame, once put down (Enter, a click outside, or another tool), stays on
    screen and holds every tool inside it — pen, line, rectangle, fill (walled in by it), Udtvær and Tern
    — until Esc or the panel's "Fravælg" beside a one-line "Du maler kun i markeringen." Under symmetry its images
    hold too, since the paint lands there as well. Esc on a patch not yet moved removes the selection; on a moved
    one it puts the cells back and keeps the selection. With Markér in hand an unturned selection shows its
    handles again and is taken up where it is grabbed; a new frame replaces it, a click that frames nothing is
    Fravælg. Ryd and an import remove it. The tools paint as always and what a gesture wrote outside is put back
    from the mask it began with (`keepOutside`), so each tool, its XOR and its mirrored copies keep inside alike.
- Keyboard: P pen, F fill, L line, R rectangle, U smudge, M select, X swaps the painting colour, `[`/`]`
  brush size, Esc removes a put-down selection.
  A floating Markér patch owns Enter, Escape and Delete, but only where the canvas has the keyboard: Enter on a
  control the visitor has tabbed to presses the control, and pressing one by key puts the patch down first.

Below 900px the columns stack under the heart in the order they read: Værktøj, Symmetri, Kanten, Find snit.

**The default column fits a desktop window** (owner, 2026-09-08). Three panels at their first-drawn heights did
not: 1006px against the 880 a 1440 × 950 window leaves, so Kanten hung below the edge on a screen nobody would call
small. It is 726px now — Kanten collapsed to its one row (§11), Fortryd and Gentag folded into the swatches' row
(and out of the "Maler med" field, which took another 6px off), and the Markér, Symmetri and Kanten explanations
moved to `title` and Hjælp — which leaves Kanten's bottom at 865px, 85px clear of a 950px viewport. Nothing was
removed to get there, and nothing was moved to a `title` alone: a `title` on a
heading is mouse-only, so every sentence that left the column has a bullet in the Hjælp dialog to be found on
purpose, on a phone and from the keyboard.

The column still scrolls inside itself where it has to: a short window (1440 × 700 leaves 630, so the same 726px
overflows by about 95), and Kanten expanded under Fri, which adds 213px. It is centred while it fits and starts at
the top when it does not, and a fade over whichever edge it runs past says there is more that way — macOS draws
nothing of an overlay scrollbar until a gesture starts, so a panel out of sight would otherwise not be there as far
as anyone can tell. The fade is measured by a `ResizeObserver` over the column **and every panel in it**: the column
itself is pinned top and bottom, so its own box never changes height and it can only report the viewport; the panels
are what grow and shrink. It used to name each content change by hand (`void tool; void toolsStandby; void
session.frame.mode`), and that list went stale the first time a panel learned a new height.

Choosing Fri scrolls Kanten's own bottom into view (`scrollIntoView({ block: 'nearest' })` in `FramePanel`).
Measured at 1440 × 950 without it, the revealed Størrelse slider landed under the bottom fade and the Fri hint
wholly outside the column's box, with nothing scrolled: the visitor asks for exactly those three controls and two of
them arrive where they cannot be read. `nearest` scrolls the least that puts the panel on screen and does nothing
when it is already there, so a tall window is untouched and the narrow layout — where the page scrolls rather than
the column — is served by the same line.

Right floating panel (340px, collapsible with the same "Skjul panel" control as Tegn):

- Panel "Find snit": one sentence about the search ("Computeren leder efter de snit, der væver netop dit mønster."),
  the primary button `Find snit`, a disclosure "Avanceret" with the engine settings that matter to a hobbyist: Skabelon (Begge slags,
  the default: the exact search and the fitter side by side, the second offered as a choice; Præcis efter billedet: the exact search
  alone, saying so when it finds none; Blødere snit: the fitter alone), Papirets bredde (mm, default 100), Mindste strimmelbredde (mm, 2),
  Foretræk samme skabelon til begge sider (checkbox, on by default independently of the symmetry rows), and a "Nulstil" link. Nothing else.
  The checkbox is a preference with an absolute one-percentage-point mask-error allowance, not a command to fold
  the mask. Import, symmetry changes and undo/redo preserve an explicit choice; Reset restores it to on.
  The explanatory text states the allowance in both languages. Requested symmetry still takes precedence in
  the solver: transpose requires matching templates, while other enforced transforms retain their existing route.
- **While searching, the panel says what the search is trying** (owner, 2026-09-09; built, §12 for the rest). It was
  a scissors glyph, a counter and one phrase for up to three minutes, while the engine underneath was announcing
  every strip-count pair it had scored and reporting a fresh error every forty refinement steps. The face is now:
  - the **stage in plain words** (scissors glyph, `role="status"`), with the numbers under it as one line —
    "12 s · 4 + 4 strimler · buddets afvigelse ca. 1,3 % og faldende". Each part is left out when there is nothing
    true to say: a search that has not chosen its counts prints no counts. The trend is read off the last two
    checkpoints of the *same* attempt and is "stabil" under `TREND_EPSILON` (1e-3), which is one unit of the last
    digit the panel prints; a jump between two attempts is not a trend and is reported as none. The threshold was
    1e-4 for one round and measured wrong on Uret v2: the word alternated between faldende, stigende and stabil
    once a second under a number that stayed at 0,8 % throughout — three claims a second, none of which the
    visitor could check.
  - **the live percentage is not the answer's percentage, and does not pretend to be** (2026-09-09). It is
    `refineCurves`'s own `mismatch(renderCurves(…), prob)`: the candidate under the gradient against the
    symmetry-averaged target at the fitting resolution (256 cells at most), over every cell, before simplification
    and before our symmetry correction. The answer's "forskel fra masken" is measured on the converted heart about
    to be drawn. Measured on Uret v2 the panel held 0,8 % for the last six seconds and the answer then said 1,6 %.
    So the line says "buddets afvigelse ca." / "the candidate about … % off" rather than "afvigelse", and the
    number **goes** the moment the fitter leaves refinement: `directSharing` and `directPolishing` improve the
    answer and report no error at all, so the last checkpoint's number would otherwise stand — under a stage line
    saying something else was happening — until the answer contradicted it. The counts stay, because those really
    are the winner's, and the running mark in the attempts list is cleared at the same moment: `fit.js` breaks out
    of its loop on a candidate that passes, so nothing ever announces the winner as finished.
  - the **attempts**: every counts pair the fitter announced, one row each — the pair, the last error the
    *refiner* measured for it, and a dot for done / running / waiting with the running row in `--cream2`. A pair
    that has not been reached says "ikke prøvet" / "not tried", not "venter": the count search announces every pair
    it scored and `gridFinalists` hands the refiner three of them, so most of a long list is never queued for
    anything — the star announces eight and leaves five of them there. The word says what is known and promises
    nothing about what the fitter will do next. Its seed error is not printed either: that one measures an
    unrefined uniform grid at 64 cells a side, a third quantity again, so the row carries no number until the
    refiner has measured one. A pair is one row however many times the engine scored it (the count search scores
    each at both phases). Nothing is invented: a pair the engine has not mentioned is not in the list.
  - the **MILP route's own three numbers** instead of a list, because it counts rounds rather than attempts:
    "Løser … runde 2 · afstand til bedst mulige 3 % · 1 gyldig kandidat". The route is decided by the stages seen:
    'model'/'solving' before any `direct*` means the MILP, and once the fitter has spoken the route stays the
    fitter's — feature recovery builds a graph and solves a model *inside* the direct fit, and reading that as a
    change of route would put the wrong face on the panel mid-search.
  - the elapsed-time bar and `Afbryd`, as before. `role="status"` is on the stage line and nowhere else: it changes
    a handful of times a search and is news, while the seconds, the error and the attempts change several times a
    second and would be read over each other for the whole wait.
  - **the candidate's cuts over the mask**, fed by §12 (a) and (c): cyan left, orange right, black halo, the
    editor's own `LOBE_OUTLINE_COLORS`, as an additive pass in `MaskCanvas` after everything else it draws.
  - **"Brug det bedste nu"**, dormant until §12 (b) lands. The panel draws it only when
    `ENGINE_GRACEFUL_STOP` is true **and** it has been given an `onUseBest`, so flipping the flag on its own
    cannot put a primary button beside Afbryd that does nothing.

  The plumbing: `client.ts` passes the whole progress event, `EngineProgress` in `engine.ts` types the shapes
  `core/` sends, and `$lib/paint/searchProgress.reduceProgress` folds the stream into one `SearchProgress` the panel
  reads. The reducer is checked against `src/lib/paint/fixtures/starProgress.json` — every progress event of one
  real search for the star's cuts, re-recordable with `CAPTURE_PROGRESS=1 npx vitest run
  src/lib/paint/searchProgress.test.ts`, which runs the engine's own `design()`. Every stage on that recorded path
  has a sentence, and the test asserts that replaying it never falls back to "Arbejder …", which is what makes a
  stage added in `core/` fail here rather than go quiet on screen. The fixture cannot cover the whole set on its
  own: it was captured with no symmetry, and `directMatching` — `preferMatchingSolution`, which runs whenever
  "Foretræk samme skabelon til begge sider" is on, the default preference — takes the disabled early return
  there. It has its own sentence and its own test.

  **What "Prøv stjernen" actually shows** (measured on the built site, 2026-09-09). With the settings the mask
  arrives with — the symmetries found in it, one template for both sides — the star is answered in about two and a
  half seconds by the traced route, so the face is ten stage sentences, the seconds, and eight "ikke prøvet" rows
  that stay that way: the count search announces its seeds and `gridFinalists` never gets to refine one. The
  fixture is the other half of the picture, captured with no symmetry, where the fitter did the work and three of
  the eight seeds were refined under a falling deviation. So the deviation line and the running row are real but
  are not what the star shows on a default visit, and neither are the MILP's three numbers: `automatic.js`
  announces the count search *before* it chooses a route, so `directInitializing` has already settled `route` on
  the fitter by the time 'model' and 'solving' arrive. Both are worth a look the next time the route heuristic is.

  The mask stays editable-looking but pointer input is ignored until done.
- After success: "Skabelonen er fundet" with the numbers (n + m snit, minimum clearance in mm, difference from the
  mask in %), and the buttons `Åbn i Tegn` (primary) and `Tilbage til masken` (outline). The difference is measured
  on the heart we are about to show — `maskMismatch` of `rasterizeDesign(design, mask.size)` against the original
  session mask at its own resolution. Downsampling binary edges can exaggerate this error. It is not taken from
  the engine's `report.imageError.mismatchFraction`, which describes the solution
  before simplifying and before `enforce` (§4) moved it. The canvas shows the found
  heart rendered by our own `PaperHeartSVG` (not the engine's preview), and a small card with the mask. That card is
  one button, labelled "Tilbage til masken" like the panel's — it used to carry a "Ret masken" link of its own beside
  it, which read as two different steps and is one — and the mask in it is drawn on `--sky`, as the detail page's
  heart thumbnails are, because on white a white lobe disappears. Hent PDF and Gem in the top bar now work on
  this heart.
- **A mediocre result says so** (owner, 2026-09-08). A percentage is a number, not a verdict: 0,4 % and 1,7 % read
  alike to anyone who has not woven one of these. Above `MEDIOCRE_MISMATCH` (1 %, one named constant in
  `FindCutsPanel.svelte`) the panel adds one plain line under the numbers — "Mønsteret er tæt på, men ikke helt:
  ret masken, slå en symmetri fra, eller prøv Find snit igen." — and a third, ghost button `Find snit igen` on its
  own line under the other two, which runs the same search from the mask again. Under 1 % nothing changes. The
  threshold is judged on the motif where there is one and on the whole square where there is not, exactly as the
  summary line is: a large, accurately woven band dilutes an error in the middle (MOTIF-BORDER.md's three-cell house
  is 1,89 % over the square and 4,60 % in its centre). 1 % is where the difference stops being arithmetic: one cell
  in a hundred of a 400-cell square is a seam you can see in the woven paper, and that is the moment to be told
  rather than to find out on the table. There is no engine number behind it — `ENFORCE_COST_LIMIT` (0.03) bounds how
  far our own symmetry correction may move a design (§11), not how far the found heart may sit from the mask, and
  says nothing about this. The verdict is read off the number the panel prints and not off the raw fraction: the
  summary rounds to one decimal, so 0,996 % and 1,004 % are both "1,0%" on screen and must be given the same
  verdict.
- **"Find snit igen" is the last of the three remedies, not the first** (2026-09-09). The two before it change what
  the search is looking for; the button hands the engine the same question over. It does not hand back a
  bit-identical answer — measured in round 6 on Uret v2's photograph imported whole (`static/hearts/photos/
  circle.jpg`, 400 × 400, all symmetry rows Fra, Kanten Fast), two searches in one page from the one mask asked the
  worker the same `solve` message apart from its serial `id` and came back with different `cut_geometry.json`
  (48 253 against 48 241 bytes). But the difference is the last decimal of a number nobody can weave: both runs
  printed "4 + 4 snit · mindst 3,1 mm mellem snittene", and the difference from the mask moved between 2,6 % and
  2,7 % over three runs. There is no seed to vary — the search is a time-budgeted solve, so what moves is which
  incumbent the clock stops it on, and that is not something a visitor pressing the button is choosing. So the line
  names the mask and the symmetry first and the button last: it spends the whole search to hand back the same heart
  to two decimal places, unless something under it has moved. The button stays because the owner asked for it, and
  it goes back to the mask before it starts, so nobody watches a progress bar under the heart they were just told
  was not good enough. Two things are **open** — the owner's call: giving the re-run something real to vary (a
  seed, a nudged starting point, a longer budget) is an engine question, and a mask whose difference sits within a
  decimal of 1 % can be told "close, but not right" on one run and nothing on the next, since the threshold is read
  off a printed number that itself moves.
- After failure: a notice in the panel: what happened (timed out / no weavable pattern / engine could not load) and
  what to try (paint with fewer thin details, switch off a symmetry, try again), plus `Prøv igen`.

Starting state: the heart with a plain 5 × 5 board, never an empty mask (the owner's choice, 2026-10-26: "always
default to a 5x5 grid. Don't start with an empty canvas"); Ryd goes back to it too (`defaultMask` in
`src/lib/paint/tools.ts`). While the board is untouched Ryd is disabled and a reload has nothing to lose. Nothing
is drawn over the board: the card that sat beside it ("Mal med musen eller fingeren – eller importér et billede"
with `Importér billede` and "Prøv stjernen") was removed (the owner, 2026-10-27: "let's get rid of this box"), and
with it "Prøv stjernen"; `Importér billede` stays at the top of the tool column. Find snit works on
the board itself (it is a heart), and stands down only for a mask of one paper.

Import dialog (`ImportImageDialog`, built on the site `Modal`, `column` layout, ~860px):

- Step 1: a drop zone / file picker (PNG, JPEG, WebP, SVG; ≤ 12 MB; the same decoding as the old generate page:
  `createImageBitmap` → canvas → RGBA). SVG goes to the engine as text like before.
- Step 2 (photos): the image with the four numbered corners the engine proposed (`detect-crops`), draggable; buttons
  `Find igen` and `Sæt selv` (click four corners in order, top corner first, as the engine expects); a status line
  (fundet automatisk / usikker, tjek hjørnerne / ingen fundet, sæt dem selv). Square images may use "Hele billedet".
- Step 3: colour interpretation segmented control: Automatisk / Rød-hvidt foto / Vælg selv (two colour inputs),
  mapping to the engine's `mode` auto / red-white-mixture / swatches; "Byt farverne" checkbox (engine `invert`).
- Live preview "Sådan bliver masken": the prepared mask drawn as a heart (same renderer as the canvas, 200px), and a
  line naming the symmetries found (§5). The preview re-runs `prepare` (debounced) when corners or colours change.
  **While the corners are moving it shows the crop instead**: the photograph rectified through the four corners with
  the locator's own `rectifyMotif` (`src/lib/paint/rectify.ts`, loaded by URL and cached, one `requestAnimationFrame`
  per pointer move, size 200) and drawn in the same heart by `drawHeartPhoto` — the lobes keep the paper colours, the
  woven square carries the photo in colour. The engine is left alone for the whole drag and asked once on release,
  and its two-colour mask then replaces the crop. Corners that fold over keep the last good frame beside the existing
  "uden knæk" message. This is what the old generator page did (`d0150f8`, "Render source pixels with the same
  half-pixel convention as preprocessing"), and the half-pixel offset — the dialog counts pixel edges, the locator
  pixel centres — is the whole of the conversion.
- Footer: `Annuller`, `Brug som maske` (primary). Using replaces the session mask without asking (one undo step), sets
  the suggested symmetries, closes the dialog.

Tegn additions:

- "Handlinger" gets `Mal på hjertet` (outline, first in the list): rasterises the current heart into the session
  mask (§4) and navigates to the paint route without asking: the mask it replaces is put on Mal's undo history,
  so Fortryd there brings it back. The header's Mal tab does the same (2026-10-26), except that a heart still as
  Find snit found it leaves Mal as it was.
- The top-bar mode switch (§1).

## 3. State: the editor session

`src/lib/editor/session.svelte.ts` — one module-level rune store shared by both modes, browser only:

```ts
export type PaintSession = {
  mask: Mask | null;                // the mask being painted (400 × 400)
  maskDirty: boolean;               // strokes since it was created/imported/rasterised
  symmetry: SymmetrySettings;       // the three rows, as in Tegn
  found: SymmetrySettings | null;   // what detection suggested (for the "fundet" tags)
  result: PaintResult | null;       // last successful Find snit
  status: 'idle' | 'importing' | 'searching' | 'done' | 'failed';
  error: PaintError | null;
  sourceName: string | null;        // "stjerne.png" or null
};
export type PaintResult = { design: HeartDesign; report: { cuts: [number, number]; clearanceMm: number; mismatch: number; identical: boolean } };
export type SymmetrySettings = { curve: SymmetryMode; lobe: SymmetryMode; lobes: SymmetryMode };  // 'off' | 'sym' | 'anti'
export const session: PaintSession;                 // $state; mask and result are $state.raw (see below)
export function setSymmetry(s: SymmetrySettings): void;     // switches the rows and folds the mask to match (§4)
export function handoffToDraw(design: HeartDesign): void;   // stores the design for the draw page to pick up
export function takeHandoff(): HeartDesign | null;  // draw page calls this on mount (source `session`)
```

The draw page today reads its input from the URL (`getEditorUrlInput`). Add one more source: when the paint page
navigates to `/editor/?from=session` the page takes the handoff design, treats it as a new unsaved heart (name from
the source: "Stjerne fra billede" / "Heart from image"), and the draft mechanism carries on as for any new heart. The
session's `mask` is kept, so the visitor can come back to it.

Persistence: the mask is not written to localStorage in this version (160 KB per save is more than the draft should
carry); a reload loses it. Say so nowhere — it simply behaves like an unsaved drawing. Keep the door open: the store
has one `serialize()`/`restore()` pair, unused for now.

Reactivity: `mask` and `result` are held with `$state.raw`, so what is reactive is replacing them, not writing into
them. A deep `$state` proxy around the mask costs about fourteen times the time in the tools' innermost loops, and it
would not have made a stroke reactive anyway (`Uint8Array` is never proxied). Painting is therefore invisible to
`$derived`/`$effect` by design; the canvas repaints the box each tool returns (§8), and anything else that must know a
mask changed goes through `setMask`.

## 4. Modules and contracts

All pure logic is plain TypeScript under `src/lib/paint/` with vitest coverage; no DOM, no canvas. UI under
`src/lib/components/paint/`. Engine bridge under `src/lib/inverse/` next to the existing `client.ts`.

```ts
// src/lib/paint/mask.ts
export const MASK_SIZE = 400;
export type Mask = { size: number; data: Uint8Array };          // row-major, y*size+x, values 0 | 1
export type Box = { x0: number; y0: number; x1: number; y1: number };   // half-open, so the empty box exists
export function createMask(fill?: 0 | 1, size?: number): Mask;  // `size` for the rasteriser and the tests
export function cloneMask(m: Mask): Mask;
export function isEmpty(m: Mask): boolean;
export function get(m: Mask, x: number, y: number): 0 | 1;      // 0 outside, so tools need no bounds checks
export function resample(data: Uint8Array, from: number, to: number): Uint8Array;   // nearest neighbour
export function maskMismatch(a: Uint8Array, b: Uint8Array): number;   // share of differing cells, 0–1
export function emptyBox(): Box;                                // with isEmptyBox, unionBox, clampBox
export function packMask(m: Mask): string;                      // with unpackMask; only backs session.serialize

// src/lib/paint/tools.ts — every op mutates in place and returns the changed bounding box (for repaint)
export type Brush = { radius: number; value: 0 | 1 };
export function stampCircle(m: Mask, x: number, y: number, brush: Brush): Box;
export function stroke(m: Mask, from: Vec, to: Vec, brush: Brush): Box;   // circles along the segment, no gaps
export function line(m: Mask, from: Vec, to: Vec, brush: Brush): Box;     // same as stroke; the UI previews it
export function rect(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box;
export function floodFill(m: Mask, x: number, y: number, value: 0 | 1): Box;   // 4-connected, iterative
export function applySymmetric(m: Mask, box: Box, transforms: Transform[], value: 0 | 1): Box; // spreads the brush colour under each transform
export function applySymmetricEdit(m: Mask, box: Box, marks: Uint8Array, transforms: Transform[]): Box; // spreads an edit of both colours (Markér), from a copy

// src/lib/paint/selection.ts — Markér, as geometry: a rectangle of cells lifted off the mask and put back somewhere else
export type Placement = { cx: number; cy: number; width: number; height: number; angle: number };
export type Selection = { source: CellRect; cells: Uint8Array; placement: Placement };
export function lift(m: Mask, r: CellRect): Selection | null;   // copies the cells; the mask is left alone
export function moveBy(p: Placement, dx: number, dy: number): Placement;
export function scaleTo(p: Placement, handle: Handle, point: Vec, uniform: boolean): Placement;  // opposite corner anchored
export function rotateTo(p: Placement, point: Vec): Placement;  // about the centre, from the turner
export function resizeBy(p: Placement, du: number, dv: number): Placement;   // Shift and an arrow key, about the centre
export function turnBy(p: Placement, radians: number): Placement;           // the turn keys
export function middleRect(m: Mask): CellRect;                  // where a keyboard selection starts
export function isUnmoved(sel: Selection): boolean;             // a commit that would write back what it took
export function stamp(m: Mask, sel: Selection, marks?: Uint8Array): Box;    // nearest neighbour, mapped backwards so a turn leaves no holes
export function commit(m: Mask, sel: Selection): Edit;          // vacate the source to 0, then stamp; the marks are for applySymmetricEdit

// src/lib/paint/symmetry.ts
export type Transform = 'transpose' | 'antiTranspose' | 'mirrorX' | 'mirrorY' | 'rotate180';
export function transformsFor(s: SymmetrySettings): Transform[];        // §5 table
export function detectSymmetry(m: Mask, tolerance = 0.03): SymmetrySettings;  // §5 rules
export function symmetrize(m: Mask, transforms: Transform[]): void;    // majority/first-wins fold, used before solving

// src/lib/paint/rasterize.ts — heart -> mask, pure (flatten Béziers, even-odd scanline fill)
export function rasterizeDesign(design: HeartDesign, size = MASK_SIZE): Mask;

// src/lib/paint/history.ts — undo/redo as full snapshots capped at 40 (a 160 KB mask × 40 = 6.4 MB, fine)

// src/lib/paint/rectify.ts — the import dialog's live crop (§2): the photograph through the four corners
export const RECTIFIED_SIZE = 200;
export type RectifiedPhoto = { size: number; data: Uint8ClampedArray };   // shaped like Mask: a side and row-major data
export function rectifyQuad(quad: readonly Point[]): number[][];          // pixel edges -> the locator's pixel centres
export function rectifyPhoto(image: SourcePixels, quad: readonly Point[], size?): Promise<RectifiedPhoto>;
// src/lib/paint/drawHeart.ts — the same heart with the crop in the woven square instead of a mask
export function drawHeartPhoto(ctx, photo: RectifiedPhoto, colors: HeartColors, size: number): void;

// src/lib/inverse/toHeartDesign.ts — engine cut geometry -> our heart
export type CutGeometryOptions = { name: string; author?: string; colors?: HeartColors; enforce?: SymmetrySettings; tolerance?: number };
export function cutGeometryToDesign(json: string | CutGeometry, opts: CutGeometryOptions): HeartDesign;
// the same conversion, plus the symmetry rows the geometry could actually be held to (see the converter notes)
export function convertCutGeometry(json: string | CutGeometry, opts: CutGeometryOptions): { design: HeartDesign; honoured: SymmetrySettings };
// src/lib/inverse/simplifyCurves.ts — fit a chain of cubics with fewer cubics within `tolerance` (0–100 units)
// src/lib/inverse/engine.ts — thin async API over InverseWorker used by the UI:
export function prepareMask(mask: Mask, colors: HeartColors, onStage: (s: string) => void): Promise<PreparedArtwork>;
export function prepareImage(input: ArtworkInput, settings: ImportSettings, onStage): Promise<PreparedArtwork>;
export function findCuts(settings: FindSettings, onStage): Promise<DesignResult>;   // after a prepare
export function detectCorners(input: PixelsInput, roi?: number[]): Promise<DetectedCrops>;
export function cancel(): void;
```

`applySymmetric` takes the brush colour as a fourth argument — 0 for the left paper — and spreads exactly that colour from
the cells of `box` to their images, rather than copying the box wholesale. A copy is wrong at a mirror line, where the
box lands on its own image and the copy reads cells it has just written; a snapshot-based copy that ignores the colour
degenerates to a swap there; and folding by majority gives the two papers the same answer where they need
opposite ones. Spreading one colour is order-free and idempotent. In return it needs the mask to have been symmetric
before the edit: `box` is the rectangle a tool changed, not the cells it wrote, so older paint of the brush colour
lying inside it spreads too. **Switching a row on therefore goes through `setSymmetry` in the session store, which
folds the mask with `symmetrize` first**, and `setMask` folds an arriving mask the same way (detection answers
"symmetric" only within its tolerance).

### Engine facts the bridge relies on

- Worker: `static/inverse/worker-bootstrap.js` (classic) → `worker.js` (module) → `core/engine.js`; HiGHS WASM
  (3.5 MB) loads inside the worker on first solve. `InverseWorker` in `client.ts` owns the lifecycle; one request at
  a time; `stop()` terminates the worker (that is how Afbryd works).
- `prepare` input: `{type:'pixels', rgba, imageWidth, imageHeight, quad?}` — no `quad` means the whole square image
  is the woven square. For the mask we send a 400 × 400 RGBA image with the two paper colours and
  `mode: 'swatches', swatches: [right, left]` (or `threshold` on a pure black/white rendering — pick one and TEST that a
  mask sent in comes back unchanged from `prepared.mask`, including which value is which colour).
- Settings we pass (from the old page, minus what the owner removed): `{...AUTOMATIC_PRESET, width: 100, minWidth: 2,
  cutError: 0.25, timeLimit: 600, preferMatchingSheets, matchingErrorAllowance: 0.01, earlyStop: false,
  removeSpecks: 0, fillHoles: 0, minRadius: 0.8, kerf: 0, printShrinkPercent: 0.2, materialResolution: 360,
  trials: 12, requireMaterialCore: true, paperColors: [right, left], resolution: 400}`. "Foretræk samme skabelon til begge
  sider" goes over as `preferMatchingSheets`, defaulting to true. **Not `identicalSheets`**: that key is
  not in `core/settings.js`'s `DEFAULTS`, so `settings(raw)` drops it before a solve ever sees it — it is read off
  the raw object by `prepare` alone. `settings()` is the list of keys the engine accepts, and a key that is not on
  it disappears in silence; `engine.test.ts` puts the whole settings object through it for exactly that reason.
- `prepared.mask`: `Uint8Array` of `prepared.resolution²`, value 0 = left colour, 1 = right colour (this is the
  convention the old page used when drawing it). Resample to 400 if the engine chose a smaller resolution.
- `DesignResult.files['cut_geometry.json']` is the solution (schema `heartcurves-2`): `square_width_mm` (100),
  `phase` (0/1), `curves[id] = {control_points: [[x,y]×4] in mm, visible_boundary}`, `A_overlap_paths` and
  `B_overlap_paths`: arrays of cuts, each cut an ordered list of `{curve, reverse}`. Every cut runs from one edge of the
  square to the opposite edge: A cuts from y=0 to y=w (x varies), B cuts from x=0 to x=w (y varies). Verified on
  `static/inverse/examples/star.saved.json` and `jul.saved.json`. `report` carries `slits {left,right}`,
  `validation.minimumInterSlitDistanceLower`, `imageError.mismatchFraction`, `solver.matchingPreference.identical`.
- Engine frame: the left (white, paper B) lobe hangs on the edge x=0, the right (red, paper A) lobe on the edge y=0;
  the preview draws it with `matrix(1 1 -1 1 0 0)`, so (0,0) is the heart's top cleft and (w,w) the bottom tip.

### Our heart's frame (see `$lib/utils/heartDesign.ts`, `$lib/utils/overlapRect.ts`, `$lib/rendering/svgWeave.ts`)

- Internal pixel frame: 600 × 600, overlap rect = gridSize × 75 centred at (300,300). JSON/raw fingers use 0–100
  inside the overlap rect; `normalizeHeartDesign` converts them. **Build the converter's output as raw JSON fingers
  (0–100 `pathData`) and run it through `normalizeHeartDesign`** — never construct pixel-frame fingers by hand.
- Left-lobe fingers are horizontal paths (position = y, running between x=0 and x=100); right-lobe fingers are
  vertical (position = x). The two outer boundaries of each lobe are fingers too (`ensureOuterBoundaries` adds them;
  `serializeHeartDesign` drops them), and `gridSize = {x: rightFingers − 1, y: leftFingers − 1}`, max 12 per axis.
- Therefore: engine A cuts (vertical) → our **right** lobe; engine B cuts (horizontal) → our **left** lobe;
  coordinates scale by 100 / `square_width_mm`, no mirroring expected — but **prove it** (below).
- `weaveParity` (0 = top-left cell has the left lobe on top) has to be derived from the engine's `phase` and the path
  counts (the engine's own preview uses `phase ^ (A.length % 2) ^ (B.length % 2)`). Derive it, then verify by
  rasterising both parities and picking the one that matches the engine's `sampleWeave`; keep the analytic rule as
  the primary and the comparison as a test.

### Converter requirements and tests (`src/lib/inverse/toHeartDesign.test.ts`)

1. Load `star.saved.json` and `jul.saved.json` (import from `static/inverse/examples/`), convert, and compare our
   `rasterizeDesign(design, 200)` with the engine's `sampleWeave(solution, 200)` (import `loadSolutionJSON` from
   `static/inverse/core/graph.js` and `sampleWeave` from `core/validate.js` — they are plain ESM). Mismatch must be
   under 1.5% for both. JUL is asymmetric, so a mirrored or transposed frame fails this test loudly.
2. Simplification: each engine cut is a chain of 13–31 cubics; the converter fits it with as few cubics as possible
   within `tolerance` (default **0.25** of the 0–100 range, i.e. 0.25 mm at 100 mm) using least-squares cubic
   fitting with subdivision (Schneider). Test: after simplification the mismatch in test 1 grows by at most
   **0.7 points**, and the average number of segments per cut is **≤ 12** for the star, from 20.9 unfitted.

   The three numbers were 0.6, 0.5 points and ≤ 4 when this was written; all three were measured and corrected
   (2026-09-08). Refitting costs mismatch in proportion to the tolerance — about 3 points of the woven square per
   unit — so at 0.6 the star drifts 2.140% and jul 2.025%, over test 1's own 1.5% bar; 0.25 costs 0.67 and 0.46
   points and keeps both well under it, and the half-point contract holds at 0.15 (a test pins that too). The
   segment count cannot reach 4: the star's eight cuts turn through 67 corners of more than 25°, a corner always
   costs its own cubic, and even an absurd 4 mm tolerance leaves about nine per cut. 11.75 is the default's answer.
3. Cuts with more than 13 per family are rejected with a typed error (our grid max is 12 strips), and so are cuts that
   do not run edge to edge (a `CutGeometryError` with a message key the UI can translate).
4. `enforce`: when a symmetry row is Sym/Anti, the corresponding fingers are made exactly symmetric using the
   mappings exported from `$lib/utils/symmetry.ts` — the detector's own functions, not copies of them (one lobe's
   fingers copied from the other under the mapping for Mellem lapper; each finger mirrored/point-reflected in place
   for the two others), so the draw page's own detection (`detectSymmetryModes`) reports them on. Test on the star
   with all three rows Sym.

   Enforcing is a *correction*, not a projection: it assumes the solve nearly holds the symmetry already, which is
   what the symmetrised mask and `identicalSheets` buy. On a solve that does not hold it, forcing the cuts moves
   the picture — 11–19% of the woven area per row on the saved examples, 17–24% for all three — and that is
   unavoidable, because a weave can be symmetric as a picture while its cuts are not. Tests pin those bounds, and
   check that the correction costs under 0.5 points on a solve that does hold the symmetry.

   Mellem lapper needs the two families to have equally many cuts, and the engine may answer otherwise. The
   converter then drops the row rather than deform the heart, and says so: `convertCutGeometry` returns
   `{ design, honoured }`, and the panel sets its toggles from `honoured` (`cutGeometryToDesign` is the same call
   without it). Test on a family with one cut removed.
5. Node types: mark every joint between fitted cubics `smooth`, endpoints `corner`.

### Rasteriser requirements and tests (`src/lib/paint/rasterize.test.ts`)

- `rasterizeDesign` draws exactly what `computeWeaveData` draws: base 0, then the even-odd union of all strips
  (`rightOnTopStrips` + `leftOnTopStrips`) as 1, in the overlap rect mapped to [0,size)². Flatten Béziers adaptively
  (max 0.25 cell error), fill with an even-odd scanline at pixel centres.
- The flattening adapts per cubic rather than by recursive subdivision: the deviation of an n-piece uniform
  flattening is at most 3·D/(4n²) for D the larger second difference of the control points, so the piece count
  follows in closed form and needs no recursion, no depth guard and no array per curve. Both lanes wrote a
  rasteriser, independently, and the two agree to 0.01% of the square once either is run to convergence, so the
  choice was made on cost: this one is allocation-free and bounded, and it is the more faithful of the two on the
  converted engine hearts (0.04 of the star's, 0.04 of jul's cells against its own converged self, where the
  recursive fit drifts 0.10 and 0.09).
- Tests: `classic-3x3` from `src/lib/data/heart-designs.json` gives a checkerboard (assert the cell values);
  `stjerne` round-trips through `cutGeometryToDesign` ∘ engine? (no engine in tests — instead assert that
  rasterising the gallery `jul` and the converted `jul.saved.json` agree within 3%). The orientation is pinned
  besides: jul disagrees with all five of its symmetry images, and named cells are checked against the image each
  transform sends them to, so a mirrored, transposed or wrong-parity frame fails rather than passing quietly.

### Mask ops tests (`src/lib/paint/tools.test.ts`, `symmetry.test.ts`)

- stroke leaves no gaps at any speed (two far points → connected set), flood fill stops at the diamond edge (the
  mask is the square; the diamond is just how it is shown), rect clamps, symmetric painting produces exactly
  transformed copies, `detectSymmetry` finds transpose on a hand-built symmetric mask and nothing on noise,
  tolerance behaves (3% noise still detected, 10% not).

## 5. Symmetry: the mask, the engine and the draw page

In the square frame (x to the right, y down, both 0..1), the draw page's rows map to mask transforms:

| Row (draw page)          | Mode | Mask transform(s)                     | Heart-orientation mirror line   |
|--------------------------|------|---------------------------------------|---------------------------------|
| Mellem lapper            | Sym  | transpose (x↔y)                       | vertical centre line            |
| Mellem lapper            | Anti | antiTranspose (x→1−y, y→1−x)          | horizontal centre line          |
| Inden i lap              | Sym  | mirrorX **and** mirrorY               | both diagonals of the diamond   |
| Inden i lap              | Anti | rotate180                             | (point symmetry, draw a dot? no: draw nothing) |
| Inden i kurve            | Sym  | mirrorX **and** mirrorY (same as lobe Sym) | both diagonals              |
| Inden i kurve            | Anti | — (per-cut point symmetry; no mask transform) | nothing                 |

Why: a left-lobe cut runs along x, so mirroring it across its own lobe's centre line is `mirrorY` and reflecting it
across its chord bisector is `mirrorX`; for the right lobe the roles swap. The rows apply to both lobes at once, so
the mask needs both mirrors. `transformsFor()` returns the union (deduplicated) of the transforms of every row that
is on. Painting: every stroke's changed box is copied under each transform (`applySymmetric`), and the compositions
are closed automatically because each copy is itself copied (apply transforms in a fixed order, then copy the union
once more — or simply apply the full closure of the generated group; keep it simple and tested).

Detection (`detectSymmetry`): agreement ratio of the mask with each transformed copy; a transform "holds" when the
disagreeing fraction is ≤ tolerance (3%). That fraction is counted **against the ink** — the cells of the minority
colour — not against the whole square: over the square, any mask with under about 1.5% ink agrees with all five of its
images whatever is drawn on it, so every row would come back "fundet" and `symmetrize` would then fold the visitor's
motif away before the engine saw it. At half coverage the two readings are the same number, so a photograph is judged
as before. A mask with no ink at all reports nothing. Rules: transpose → Mellem lapper Sym; else
antiTranspose → Mellem lapper Anti; mirrorX ∧ mirrorY → Inden i lap Sym and Inden i kurve Sym; else rotate180 → Inden
i lap Anti. Everything else off. Run it after import and after "Mal på hjertet"; the result becomes both
`session.symmetry` and `session.found`.

Solving with symmetry on: `symmetrize` the mask under the active transforms first (so the target itself is
symmetric), pass the independent `preferMatchingSheets` preference (see §4 for why it is not
`identicalSheets`), and give the converter `enforce: session.symmetry` so the resulting fingers
are exact. Inden i
kurve Anti cannot be expressed on the mask; it is passed to the converter only, so it is the one row that always
reaches a solve that was never asked to hold it — see the note on what enforcing costs in §4. The rows the panel
shows afterwards are the converter's `honoured`, not what was asked for.

## 6. Shared symmetry rows

The three segmented rows (label · Fra/Sym/Anti) now appear in two places. Extract them from `PaperHeart.svelte`
into `$lib/components/editor/SymmetryRows.svelte` with props `{ value: SymmetrySettings; onChange; found?:
SymmetrySettings | null; disabled?: Partial<Record<keyof SymmetrySettings, boolean>>; lang }`, rendering the same
markup and classes both places (the "fundet" tag is a small `--gold` pill after the label, only when `found` marks
that row). Tegn keeps its behaviour (including the "requires equal grid size" disabling). The icon set chosen for
these rows (Family A, see the Symmetri-ikoner artifact) is a separate task and must slot into this component later.

## 7. i18n

All strings in `src/lib/i18n/translations.ts`, both languages, key prefix `paint` (e.g. `paintModeDraw` "Tegn" /
"Draw", `paintModePaint` "Mal" / "Paint", `paintImportImage`, `paintClear`, `paintTools`, `paintPen`,
`paintFill`, `paintLine`, `paintRect`, `paintBrush`, `paintBrushRadius`, `paintsWith`, `paintsWithXor`, `paintFindCuts`,
`paintFindCutsHint`, `paintAdvanced`, `paintSearching`, `paintStage*`, `paintCancel`, `paintFound`,
`paintFoundSummary` with `{left}`, `{right}`, `{clearance}`, `{mismatch}`, `paintOpenInDraw`, `paintBackToMask`,
`paintFailedTimeout`, `paintFailedNoSolution`, `paintFailedEngine`, `paintTryAgain`, `paintMaskPill`, `paintOnHeart` "Mal på hjertet", dialog keys `paintImportTitle`, `paintDrop`,
`paintFormats`, `paintCorners*`, `paintColours*`, `paintUseAsMask`, `paintFoundSymmetry`, and the
tooltips for the disabled top-bar buttons). The old `src/lib/inverse/messages.ts` is deleted with the old page (§9);
copy over only the phrases that are still shown. `translations.test.ts` fails on unused keys, so add keys as you use
them.

## 8. Accessibility and performance

- The canvas is one `<canvas>` with `role="img"` and an `aria-label` describing the mask; the tools are real
  buttons with `aria-pressed`; the dialog is the site `Modal` (focus trap, Escape, return focus).
- Pointer events with `setPointerCapture`; touch works (no page scroll while painting on the diamond: `touch-action:
  none` on the canvas). Coalesced pointer events (`getCoalescedEvents`) for smooth strokes.
- Repaint only the changed box (the mask lives in an offscreen canvas as an ImageData; the on-screen canvas draws
  lobes + the rotated offscreen canvas each frame with `requestAnimationFrame`, one frame per pointer batch).
- The mask is drawn smooth (2026-10-26, the owner's request: "no antialiasing ... makes the drawings sometimes
  ugly"): the offscreen picture has as many pixels a cell as the screen shows, up to 3, and each paper's edge is the
  curve where the cells, read bilinearly between their centres, cross one half (Udtvær's edge), with a rim about a
  pixel wide mixing the two papers (`src/lib/paint/smoothRaster.ts`). Only the picture: every cell's centre is in its
  own paper, the mask stays two papers, and Find snit reads the same cells. A full redraw takes about 18 ms. A
  floating Markér patch (`smoothCells`), the XOR preview and the import dialog's mask are drawn the same way. Zoomed
  in past what that picture holds, the cells on screen (a fifth more each side) are drawn again at the screen's
  pixels a cell, up to 1.5 million pixels, 120 ms after the view settles; strokes update both pictures.
- A stroke fills the shape the head sweeps along the segment in one pass, not a dab per cell, so the 200-cell pen
  costs one pass over its box.
- With the header's colourful mode on, the heart takes the shuffle's first pair (the colourful button's first cell;
  `shownColors` in `$lib/stores/colorMode`): a canvas cannot read the mode's CSS variables, so this is how each
  press deals it a new pair, as it does the gallery's hearts. The XOR swatch shows the two papers on show.
- The paint page must not load the engine or its WASM until Find snit or an import is used, and the
  draw page's bundle must not grow because of Mal (dynamic import of the paint modules from the draw page's "Mal på
  hjertet" action is fine; the paint page itself may import them statically).
- Prefers-reduced-motion: no animated progress bar sweep, a plain determinate/indeterminate bar.

The XOR/slider regression suite includes `scripts/paint/brush-browser-test.mjs`.
Run it against `PAINT_TEST_URL` with the repository's own Playwright/Chromium
environment variables. It checks a retraced stroke across both paper colours,
separate-stroke inversion, undo/redo, slider keyboard input, on-screen ring size,
both languages and mobile layout. Pixel comparisons exclude antialiased edges
that can change when Chromium switches canvas backends after readback; the unit
tests separately require exact binary-mask restoration.

## 9. Retiring the old generator page

Once Mal works end to end: delete `src/routes/[[lang=lang]]/generate/`, `src/lib/inverse/messages.ts`,
`ArtworkComparison.svelte`, `SvgPreview.svelte` and their tests, the sitemap entries, and every translation key that
only they used. Keep `client.ts`, `presets.js`, `static/inverse/**` (engine, examples, licences, notices; the
attribution link "Motorens licenser" moves into the Avanceret disclosure), `scripts/inverse/**` and `docs/inverse/**`
as they are. Update docs/inverse/README.md's first paragraph to say where the engine is used now.

## 10. Out of scope (this version)

Mask persistence across reloads, per-heart colour editing in Mal, the hero button on
the front page, the symmetry icons (separate task), format 2 of the heart model.

## 11. Decisions taken after round one (2026-09-08)

**Enforcing symmetry has a cost limit.** `convertCutGeometry` takes `enforceCostLimit` (default 0.03): it converts
with and without `enforce`, rasterises both at 200, and if the two differ by more than the limit it returns the
unenforced design with every row of `honoured` set to `'off'` and `symmetryCost` reporting the measured share. The
panel then shows the rows from `honoured` and a one-line notice ("Symmetrien kunne ikke holdes helt; hjertet vises
som motoren fandt det"). Below the limit the corrected design is returned as before. Rationale: enforcing is a
correction for a solve that nearly holds the symmetry; on one that does not, it deforms the heart by 11–24 %.

**The engine will hold symmetry itself.** A separate lane (branch `paint-engine-symmetry`) adds
`settings.symmetry = { mirrorX?, mirrorY?, transpose?, antiTranspose?, rotate180?: boolean; withinCurve?: 'off' |
'sym' | 'anti' }` to the engine: the fitter's target becomes the mean of the mask over the symmetry group ("both
mirrorings in the loss") and the control points are tied under the group, so the answer is exactly symmetric. The
bridge maps the three rows to it exactly as docs/inverse/SYMMETRY.md's table says — Mellem lapper Sym →
transpose, Anti → antiTranspose; Inden i lap Sym → mirrorX + mirrorY, Anti → rotate180; Inden i kurve Sym →
mirrorX + mirrorY + withinCurve 'sym' (the mask was painted mirrored, so the fitter must be told both), Anti →
withinCurve 'anti' — in one function `engineSymmetry(rows)` in `src/lib/inverse/engine.ts`. The engine lane has
landed on redesign (afe0ba2), so `ENGINE_SYMMETRY` is true from the round-two merge on. Two consequences for the
UI: with a mirror requested the engine only tries even strip counts for the mirrored family (an odd mirrored family
weaves the colour-swapped picture), so a failure under symmetry should suggest switching the row off; and
`report.symmetry.honoured` says which requested transforms the exported cuts actually satisfy — show the rows from
it, and the notice when it differs from the request, exactly as with the converter's `honoured`. `symmetrize` on
the mask and `enforce` in the converter stay as the safety net for the MILP route and for `withinCurve` Anti.

**Free borders use explicit image weights.** The protected motif retains its painted colours with weight 1;
the surrounding band retains its original colours for comparison but has weight 0 during fitting. The same
objective now controls initialization, candidate selection, symmetry, refinement, matching and final checks
(docs/inverse/WEIGHTED-IMAGE.md). Intermediate weights are supported in the engine, but a soft-border UI is not
exposed yet. Geometry and paper constraints still apply everywhere, including the free border.

- The band outside a protected shape has a segmented control "Kanten: Fast / Fri" in a panel of its own in Mal's
  left column, under Værktøj and Symmetri. *Fast* = as painted, which is what a heart made without thinking about
  the frame still is. **Under Fast the panel is that row and nothing else** (owner, 2026-09-08): the shape buttons,
  the Størrelse slider and the hint say what would happen to a motif nobody has asked to protect, and they appear
  when Fri is chosen. Only the panel's height changes — the frame keeps the shape and the size it had, so Fri brings
  them back exactly as they were — and the sentence a Fast panel used to carry ("Hele firkanten væves, som du har
  malet den.") is the heading's `title` **and** a bullet in Hjælp, because a `title` never fires on touch or on
  keyboard focus and Kanten is otherwise two words with nothing to explain them. Choosing Fri scrolls the panel's
  bottom into view, since the three controls it reveals otherwise land below the column's bottom edge (§2).
  *Fri* = the search fills the band itself; the band's colours are ignored.
  The three shape buttons darken to `--green-hover` under the pointer while chosen, like every other chosen control
  in the column; they were exempt from hover with `:not(.active)` until 2026-09-08, which left the one button the
  visitor was pointing at as the only one that answered to nothing. The third state
  *Må rettes* — the engine keeps the cells but may change the ones it must, at a cost (loss weight about 0.25 plus
  a penalty on changed cells; Codex's "repair the border") — is **not shown at all** rather than shown disabled:
  an option nobody can pick is a promise, and this one has no date on it.
- The protected shape is chosen as it appears in the heart: Rude (the band along the woven square's edges, i.e. an
  inset square in mask coordinates), Cirkel, Sekskant (flat top and bottom as seen in the heart, i.e. turned −45°
  in mask coordinates). Its size is set two ways: a "Størrelse" slider in the panel and four drag handles on the
  outline where the heart's up/right/down/left axes meet it; the shape stays centred. One number for all three
  shapes — the span of the shape's bounding box **in the square's own axes**, 30–84 %, default 64 %, which is
  Codex's 18 % inset whichever shape is chosen.
- Drawing: free cells are hatched on a light ground that covers the mask's own colours there, and the protected
  shape has a dashed outline with the four handles on it. Painting in the band still works — the cells exist, they
  are simply not part of what the search is asked for. Fast draws nothing. Soft cells (colours kept under a
  lighter hatch) and the third, hatched "Maler med" swatch for painting free cells by hand need a per-cell weight
  editor; the engine already accepts those weights.
- Model: the frame is a setting beside the mask, `session.frame = { mode, shape, size }`, not a layer inside it —
  the band's cells are ordinary cells and the frame only says how the search should read them. The weight layer
  the soft state needs (fixed 1, soft, free 0; a third colour value would lose the soft state's colours) replaces
  `frameWeights`, not this. `symmetrize` and `detectSymmetry` take an optional region, so the rows are judged and
  folded on the protected motif alone while the band is free; painting still mirrors everything.
- Paint sends the binary mask directly, with `frameWeights(mask, frame)` beside it in the same pixel coordinates.
  It does not classify the drawing's colours again or substitute another target. The mask arrives already folded
  under the selected rows inside the protected region; weights and weighted colour are averaged together when
  fitting requested symmetries, so ignored border colours cannot contaminate protected edge cells.
- The engine can use a centred checker as an initialization proposal, along with uniform and image-informed
  grids. Every proposal is ranked against the original weighted drawing, so neither checker colour nor checker
  count is a required part of the answer. The former advanced "Rammens felter" control has been removed.
  `substituteCheckerBand` and `solveTargetMask` remain only to reproduce the historical checker benchmarks.
- **Ryd and an import are one undo step each** (2026-10-26, the owner: "we need to have undo/redo"):
  they record the mask as it was before replacing it, as a stroke does, rather than ending the history. Since
  Fortryd brings the painting back, neither asks first (2026-10-27, the owner), nor does "Mal på hjertet".
  Fortryd and Gentag are labelled buttons on a row of their own under the paper swatches, where a visitor who
  has just lost a painting finds them, and Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y work as everywhere on the
  site.
- Changing "Kanten" **is an edit**, not only a setting: the region the rows fold over moves with the shape, so a
  change folds band paint away or stops folding motif paint. Mal records one undo step per gesture
  (`recordFrameFold`; the Størrelse slider and the canvas handle both say when a gesture begins, so a drag is one
  step and not sixty) and, like a change of rows, does not mark the mask dirty — the fold is the visitor's own
  instruction, not an edit they have yet to notice.
- The result panel reports disagreement **inside the protected motif first**, followed by the share of free-border
  cells changed. Both compare the actual editable heart with the original drawing. The whole-original difference
  is also retained in the session report and worker report, but permitted border changes are not presented as a
  fitting failure. "Vis det beskyttede motiv" lays the protected outline over the found heart.
- The "Kanten" panel lives in Mal only, not in the import dialog: it applies to painted and imported masks
  alike. After a photo import the panel may default to Må rettes, once that state exists. The dialog does not
  detect symmetry itself, though: it is handed the page's `detectOn`, so an imported mask's rows are judged on the
  protected motif exactly as a painted one's are — a crop's corners are the untrustworthy part, and the reason the
  band exists, so they must not decide the rows that are about to fold the picture.


**Session store as landed.** `session` is a class instance: `mask` and `result` are `$state.raw` (replace, never
mutate for reactivity; the canvas repaints by box), the small fields plain `$state`. Callers use `setMask(mask,
{sourceName, symmetry, found})` (folds the mask to the rows), `setSymmetry(rows)` (switches and folds),
`markMaskDirty()`, `clearMask()`, `handoffToDraw(design)` / `takeHandoff()`.

**Known flake.** `src/lib/inverse/simplifyCurves.test.ts` has one test that exceeds vitest's 5 s default under a
parallel full run (11.8 s) and passes alone (3.4 s): give it an explicit timeout or make its sweep cheaper.

**Live search is the stage after the engine symmetry lands** (owner, 2026-09-08, mockup board "mens der søges").
The engine's progress events already carry the stage, the cut counts being tried with their errors, the
refinement step, the current mismatch and the validity checks; the UI shows them: a plain-words stage line
("Tilpasser kurverne … 12 s · 4 + 4 strimler · afvigelse 1,3 % og faldende"), a list of the attempts with their
errors (done / running / waiting), and the elapsed-time bar. Displayed strip counts add one to each cut count.
Refinement checkpoints now attach the candidate's `heartcurves-2` geometry at most four times a second, so the
canvas draws its cuts over the mask in cyan and orange with a black halo. Conversion uses `cutGeometryToDesign`
with a coarse tolerance and no enforcement. The graceful stop message ("Brug det bedste nu") now returns the
best retained validated candidate through normal validation and export. The result includes valid alternatives
(counts, error, geometry); a UI for choosing those alternatives remains future work. The MILP route shows its
rounds and gap and attaches an incumbent when one is
validated.


## 12. Engine hooks for the live search

The geometry hooks in (a) and (c) are implemented. Paint requests them through `progressGeometry: true`;
other engine callers retain the default false. The graceful stop in (b) is implemented and enabled during a solve.

The paint bridge already carries whatever the engine sends. `client.ts` hands the whole progress event to its
listener, `EngineProgress` in `src/lib/inverse/engine.ts` types every shape `core/` is known to send with every
field optional, and unknown fields are tolerated — so an engine that starts attaching a field needs no change here
to be *received*. What follows is what has to be attached.

### (a) The current candidate's geometry on a refinement checkpoint

**Implemented.** Under the solve setting `progressGeometry: true` (default false, validated by `core/settings.js`
like every other setting, silently dropped by an engine that does not know it), each refinement checkpoint's
progress event carries

```js
{ stage: 'directRefining', counts: [a, b], step, error, score, paper, issues,
  geometry: { /* the heartcurves-2 solution of the candidate at this checkpoint */ } }
```

— the same JSON as `files['cut_geometry.json']` in the result, either as the object or as its serialised string.
The engine throttles it to **at most four a second** across the whole solve, dropping the intermediate ones rather
than queueing them: a checkpoint is every forty gradient steps, which on a fast machine is far more often than
that, and the serialisation is the expensive part. Nothing else about the event changes.

**`geometry` is also a validity flag.** `refineCurves` keeps `check.passed` — a boolean — in its stored checkpoint
history. Published snapshots replace that field in a copy of the event, keeping geometry out of saved histories.
The two are told apart **by type and by nothing else**: a boolean is the validity flag, an
object or a string is a solution. `candidateGeometry(event)` in `src/lib/paint/searchProgress.ts` is the one place
that decides, and it is tested both ways. So the engine may keep sending the boolean when `progressGeometry` is off
and start sending the solution when it is on, under the same name, without a version negotiation.

**What the UI does with it.** `PaintPage` lifts it out of the event, converts it with `cutGeometryToDesign` at
`tolerance: 1.0` and no `enforce` — a picture redrawn four times a second, not the heart anyone will cut — and hands
the result to `MaskCanvas` as `candidate`. The canvas draws its cuts over the mask in the editor's own colours
(cyan left, orange right, black halo, `LOBE_OUTLINE_COLORS`) as one additive pass after everything else, so the
visitor watches the cuts settle onto their drawing. The conversion is throttled again on our side to four a second
with the latest winning (`createGeometryThrottle`), because worker messages can arrive together after the main
thread has been busy. A candidate mid-refinement need not be a *legal* heart — cuts
may cross, a family may be short — so the conversion is wrapped: a throw leaves the last good candidate on screen
and says nothing. The candidate is dropped the moment the search ends, however it ends.

**Not wanted.** Geometry on `directInitializing` (a grid seed is not a heart anyone would recognise), on
`directClearance`, or on the bare `{stage}` events. Only the checkpoints, only under the setting.

### (b) A graceful stop

**Contract.** A new worker message

```js
worker.postMessage({ id, action: 'stop' })
```

for the request in flight. The controller answers on the **normal result channel** —
`{ id, type: 'result', result }`, with files, comparison and report built from the best **validated** checkpoint
it has retained. The public worker stays alive with its prepared artwork. CPU-bound work runs in a private
compute worker: Stop terminates that worker immediately, discarding any incomplete checkpoint. This avoids
waiting for a synchronous Bézier iteration or native HiGHS call to read the message. Retained checkpoints are
independently rechecked against the original source, geometry, paper and requested symmetry. The selected pair
receives the usual shared-cut and primitive cleanup, with the original checkpoint available if cleanup fails.
The report carries two additions:

- `report.stoppedEarly = true`, so the answer can be labelled as one the visitor cut short. (The field already
  exists on some paths with this meaning; this makes it true here too.)
- `report.alternatives = [{ counts: [a, b], error, checkpointError?, geometry }]` — retained, independently
  validated snapshots with duplicates removed, selected candidate first. If cleanup changes it, both the final
  pair and its original checkpoint remain available. Counts are slits, before the UI adds one for strips.
  `geometry` is the candidate's own `heartcurves-2` solution. `error` is forward-sampled disagreement against
  the original prepared source, including validity and free-border weights. `checkpointError` preserves the
  checkpoint's possibly lower-resolution score separately; it need not equal the original-source score.

Private checkpoint packets are retained independently of the four-per-second UI geometry throttle, including
validated initializers and polishing checkpoints which are not drawn as live previews. No candidate is accepted
merely because it appeared on the canvas. Matching sheets are preferred within the configured one percentage
point allowance; image disagreement still appears as a warning when high. Geometry, paper and requested
symmetry remain mandatory.

If there is **no** validated candidate yet, `stop` answers with the engine's ordinary "no weavable pattern" error
rather than inventing one; the page already tells that story.

**What the UI does with it.** `ENGINE_GRACEFUL_STOP` in `src/lib/inverse/engine.ts` is `true` and the panel's
"Brug det bedste nu" button is drawn only when it is true **and** the panel has an `onUseBest` — both halves, so
that flipping the flag alone cannot produce a button that does nothing. Paint supplies the handler only after
preparation, while a solve is in flight. Pressing it disables the button and shows "Gør det bedste resultat klar …";
`Afbryd` remains available. Afbryd (Cancel in English) rejects immediately, asks the controller to shut down its
private worker, then terminates the controller after acknowledgment or a one-second fallback. Late responses
cannot replace the mask or a subsequent search. The kept result goes through the same `convertValidatedCutGeometry`
and the same success face as a completed search, labelled as stopped early and retaining any fidelity warnings.
The UI does not yet offer an alternative-candidate chooser.

### (c) An incumbent from the MILP route

**Implemented.** When the MILP route has a validated incumbent, its `solving` events carry it:

```js
{ stage: 'solving', round, remaining|nodes, gap, validatedIncumbent: true,
  geometry: { /* heartcurves-2 of the incumbent */ } }
```

Same rule as (a): only under `progressGeometry`, only when the incumbent is validated, at most four a second, and
told from a boolean by its type. The incumbent changes rarely, so no extra throttle is needed beyond that cap.

**What the UI does with it.** The same as (a) — the incumbent's cuts are drawn over the mask — with no new code:
`candidateGeometry` reads the field off any event, whatever its stage. Today the MILP face shows the round, the
gap and whether an incumbent exists (`validatedIncumbent`), which is already sent; this makes the incumbent
visible rather than only counted. The engine emits a solving event immediately after validation too, so a first
valid incumbent can be shown even when it ends that MILP search without another round.

### What the UI must not be asked to do

- **No new request/response round trip per candidate.** One request is in flight at a time by the engine's own
  rule (`InverseWorker.request` rejects a second), and Find snit is queued behind the import dialog's prepares. A
  candidate has to ride on the progress channel.
- **No unthrottled stream.** The conversion is a full `cutGeometryToDesign`; four a second is what the canvas can
  redraw over a 400 × 400 mask without the page dropping frames, and the ceiling belongs in the engine as well as
  here so that the message channel is not the bottleneck either.
- **No change to the existing event fields.** `counts`, `error`, `step`, `round`, `gap` and `validatedIncumbent`
  are what the panel's numbers are made of and what `starProgress.json` records; renaming one silently empties a
  line of the panel. If one has to change, the fixture is re-recorded (`CAPTURE_PROGRESS=1`) and the reducer's
  tests will say what moved.
