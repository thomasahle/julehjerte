# "Tegn af fra skærmen" — tracing mode on the heart page

A visitor without a printer lays thin paper on a tablet or phone and traces the
cutting template (see `/julehjerter-uden-printer/`). Today the guide tells them
to open the PDF and use iPad's Guided Access so the picture does not move. This
feature builds the lightbox into the site: a full-screen white surface showing
one lobe's template, sized and placed by the visitor, then **locked** so touches
and paper on the screen do nothing until a deliberate two-second hold unlocks it.

A web page cannot switch the touchscreen off, only ignore it; system gestures
(swipe from the bottom edge, notifications) still work. The guide keeps its
Guided Access note as the fallback for that, and gets one sentence pointing to
this mode first.

## Entry points

1. `HeartActions.svelte`: a fourth button after Del — class `btn btn-outline`,
   label `traceFromScreen` ("Tegn af fra skærmen" / "Trace from the screen"),
   with a tablet icon (add `TabletIcon` to `src/lib/components/icons/index.ts`
   from lucide, like the others; if lucide is not a dependency, copy the small
   stroke icon as the existing ones were). Disabled until the design is loaded,
   like the PDF button. `onTrace` prop, wired on the heart page.
2. The guide: `noPrinterScreenHelpText` gets a new preceding paragraph
   (`noPrinterScreenHelpTrace`, with a link to the classic heart page via
   `heartHref('classic-3x3', lang)` using a `{link}`-style split or a separate
   `noPrinterScreenHelpTraceLink` key, matching how other linked sentences in
   `NoPrinterPage.svelte` are built): "Nemmest: åbn hjertet på juleflet.dk og
   tryk 'Tegn af fra skærmen'. Siden låser skabelonen, så den ikke flytter sig,
   mens du tegner." English equivalent. Keep the Guided Access paragraph and link.

## The mode (`src/lib/components/detail/TraceMode.svelte`)

Rendered by the heart page when `open` is true, as a `position: fixed; inset: 0`
layer above everything (z-index above the header), `role="dialog"`,
`aria-modal="true"`, labelled by a visually hidden heading `traceTitle`.
Background pure white, the template in pure black. No landscape, no sky.

Props: `design: HeartDesign`, `heartId`, `heartName`, `lang`, `open`, `onClose`.
Sends `trackHeartTrace(heartId, heartName)` once per opening (add
`trace_heart` to `src/lib/analytics.ts` with `heart_id`, `heart_name`).

### Template drawing

Reuse `getTemplateData(design, lobe)` (`$lib/utils/templateSvg`): `earPath`,
`cutPaths`, `templateWidth`, `templateHeight`, `earRadius`, exactly the lines
`TemplatePreview.svelte` draws (ear arc, two side edges, dashed fold line at
the bottom, the cut paths). Draw them black, `stroke-width` 2 CSS px regardless
of zoom (use `vector-effect: non-scaling-stroke` or divide by the scale), fold
line dashed. One `<svg>` sized to the viewport; the template is placed by a
single transform `translate(x, y) scale(s)` where `s` is CSS px per template
unit.

For a heart whose lobes need two templates (`lobesShareTemplate(design)` is
false) a segmented control Venstre / Højre (`templateLeft` / `templateRight`)
in the toolbar switches the lobe; both lobes share `x, y, s`, so they are traced
at the same size.

### Sizing and placement (before locking)

- One pointer drags (translate). Two pointers pinch (scale about the midpoint)
  — implement with Pointer Events (`pointerdown/move/up/cancel`, `setPointerCapture`),
  not touch events, so mouse and trackpad work too; wheel zooms on desktop.
- Toolbar (top, white with a `--line` bottom border; `safe-area-inset-top`
  respected): the lobe control when needed, a size slider, the readout, **Tilpas**
  (`traceFit`, FitIcon) that fits the template into 90% of the viewport and
  centres it, **Kalibrér** (`traceCalibrate`), and the primary **Lås skærmen**
  (`traceLock`). Below 600px the toolbar wraps to two rows; the slider takes
  the full width.
- The slider sets the template's *width* in millimetres, 30–200 mm, step 1,
  with the readout `traceWidthMm` ("Bredde {mm} mm" / "Width {mm} mm").
  Width in mm = `templateWidth * s / pxPerMm`. Default `pxPerMm = 96 / 25.4`
  (CSS px are not physical, so the readout says "ca." until calibrated).
- Everything is clamped so the template cannot be lost off-screen (keep at
  least 40 px of it visible) nor scaled below 30 mm / above 200 mm.
- On open: fit, then lobe left. The last used width in mm and the calibration
  are remembered in `localStorage` (`juleflet:trace`, JSON `{ pxPerMm, widthMm }`);
  both are settings the visitor asked for, no consent question. Reads are
  guarded with try/catch like the rest of the site.

### Calibration

**Kalibrér** swaps the template for a credit-card outline (85.6 × 53.98 mm,
rounded corners) with the text `traceCalibrateText` ("Læg et betalingskort på
skærmen, og træk i skyderen, til rammen passer til kortet." / English) and its
own slider; **Færdig** (`done`, reuse an existing key if there is one) stores
`pxPerMm = cardWidthPx / 85.6` and returns to the template at the same mm width.
After calibration the readout drops "ca." (`traceWidthMmExact`). A small
`traceCalibrated` note ("Kalibreret til denne skærm") stays in the toolbar.

### Locked

**Lås skærmen** →
- toolbar and any hint disappear; the template stays exactly where it is;
- a transparent layer covers the viewport (`touch-action: none`,
  `overscroll-behavior: none`, `user-select: none`) and `touchstart`,
  `touchmove`, `touchend`, `gesturestart`, `wheel`, `contextmenu`, `dblclick`
  on it call `preventDefault()` (`passive: false`); `html` gets class
  `tracing` with `overflow: hidden; overscroll-behavior: none`;
- `navigator.wakeLock?.request('screen')` in try/catch, re-requested on
  `visibilitychange` back to visible (the lock is released when the tab hides);
- `document.documentElement.requestFullscreen?.()` in try/catch, exited on
  unlock; browsers without it (iOS Safari) just stay as they are;
- the only control is **Lås op** (`traceUnlock`, LockOpen or the close icon)
  in the bottom-right corner (`safe-area-inset` aware), 56 px round, white on
  the dark `--deep` colour, with the hint `traceHoldToUnlock` ("Hold 2 sek. for
  at låse op") under it. It unlocks after a **2000 ms continuous hold**
  (`pointerdown` → `pointerup`/`pointercancel`/`pointerleave` cancels), drawing
  a progress ring (SVG circle, `stroke-dashoffset`) during the hold. A short tap
  does nothing. Escape unlocks on keyboards. An `aria-live="polite"` region
  announces `traceLockedAnnouncement` / `traceUnlockedAnnouncement`.
- The page's own scroll position is restored on unlock/close.

**Close** (`close`, existing key, CloseIcon) in the toolbar's left corner leaves
the mode when unlocked; it is not available while locked. `onClose` returns
focus to the button that opened the mode (the heart page handles that).

### Hints

Under the toolbar, one line `traceHint` ("Skru lysstyrken op, læg tyndt papir
på skærmen, og lås, før du tegner." / English), hidden once locked.

## Strings

Add to both `da` and `en` in `src/lib/i18n/translations.ts`, in a new group
"Heart page: tracing mode" placed after the detail-page group; keys named after
the English wording as the file's header says. `translations.test.ts` must pass.

## Tests

- `src/lib/utils/trace.ts` holds the pure logic and gets `trace.test.ts`:
  fit-to-viewport maths, clamping of translate/scale, mm ↔ px conversion,
  calibration from a card width, settings parse/serialise with bad input, and
  the hold timer as a small state machine (start, cancel, complete at 2000 ms).
- A component test (`TraceMode.test.ts`, Vitest + the existing DOM test setup
  if there is one; otherwise cover what the pure module can) for: opening sends
  one `trace_heart` event; locked state adds the `tracing` class and the
  overlay; a 500 ms hold does not unlock, a 2000 ms hold does; Escape unlocks.
- Your own Playwright run (see constraints) with an iPhone 13 device descriptor
  against `npm run build && npm run preview`: open a heart, enter the mode, lock,
  dispatch touch moves on the overlay and check `window.scrollY` and the
  template transform are unchanged, then hold the unlock button for 2.2 s and
  check the toolbar is back. Screenshot the three states at 390×844 and at
  1024×768 to `docs/redesign/trace-qa/` (not committed; `.gitignore` them).

## Constraints

- Everything in docs/redesign/DESIGN.md §8 applies: prerendered static site,
  both languages, keep every existing behaviour, `npm run check`,
  `npm run lint`, `npm test`, `npm run build` green before you finish,
  commit on this branch (`trace-mode`) with clear messages, **never push**,
  work only in this worktree.
- Use the design tokens and the `.btn` system from `src/app.css`; no new
  colours except pure black/white for the tracing surface itself.
- Do not use the shared Playwright MCP tools; drive your own Chromium from
  node (`~/Library/Caches/ms-playwright/chromium-1243/...`, see
  `node_modules/playwright`) on a port of your own.
- Do not touch `static/inverse`, `scripts/inverse`, `docs/inverse`
  (Codex's engine).
