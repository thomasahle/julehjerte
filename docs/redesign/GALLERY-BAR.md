# The sticky gallery bar: wordmark, category chips with scroll-spy, selection

The gallery's sticky toolbar (`GalleryToolbar.svelte`, since removed; the bar
is `src/lib/components/front/GalleryBar.svelte`) used to carry the download controls and a step strip. The strip is gone and
the download controls only show while hearts are ticked, so the bar is empty
most of the time. It becomes a **gallery bar** that is useful while scrolling
55 hearts in five categories (owner's direction, 2026-10-17):

- the **Juleflet.dk wordmark** at the left, shown only once the bar is stuck
  (the page header with the same wordmark has scrolled away by then);
- **category chips** with scroll-spy;
- the existing **selection controls** at the right while hearts are ticked.

Rename the component to `GalleryBar.svelte` (and its test); update Gallery.svelte.

## Layout

Sticky `top: 0`, z-index 5, transparent until stuck, `--page` background when
stuck (keep the sentinel/`stuck` logic). One row, `display: flex; align-items:
center; gap: 12px`, padding 10px 0 (8px below 700):

1. `<a class="wordmark" href={href('home', lang)}>` "Juleflet.dk" — the header's
   wordmark style at 20px (16px below 700), `--deep`. Present in the DOM always
   (so nothing jumps), `opacity: 0` and `aria-hidden`/`tabindex="-1"` until
   `stuck`, then opacity 1 over 150 ms. Below 700 it is simply hidden until
   stuck too.
2. `<nav aria-label={t('galleryCategories', lang)}>` with one chip per category
   that has hearts, in gallery order, plus "Mine hjerter" (`myHearts`, existing
   key) only when the visitor has user hearts. A chip is
   `<a href="#{category id}" class="chip" aria-current={active ? 'true' : undefined}>`
   with the category's title (existing `categoryX` keys) and a muted count
   ("Mønstre 26"). Pills: 13px/600, padding 6px 12px, radius 999,
   `rgb(255 255 255 / .8)` background, 1px `--line`; active: `--deep`
   background, white text, no border; hover: `--cream2`. Keyboard focus ring
   3px `--blue`. The row is `overflow-x: auto` with hidden scrollbar and
   `scroll-snap-type: x proximity` so phones can swipe it; `flex: 1 1 auto;
   min-width: 0`.
3. The selection controls (split button, gear, "Vælg alle", "Fravælg alle"),
   unchanged, `margin-left: auto`, only while `selectedCount > 0`. Below 700
   they wrap to a second row (`flex-basis: 100%`).

The bar never collapses now; remove the `idle` display rule.

## Scroll-spy

Sections already carry the ids the chips link to (`klassiske`, `stjerner`,
`moenstre`, `figurer`, `hjerter`, `mine`). Give them `scroll-margin-top` equal
to the bar's height plus 8px (set a CSS variable `--gallery-bar-height` from a
`ResizeObserver` on the bar, so anchors land under the bar, not behind it).

Active chip: the last section whose top is at or above the bar's bottom edge
plus 1px, computed from the sections' `getBoundingClientRect()` on scroll
(passive listener, throttled with `requestAnimationFrame`) and on resize; when
the page is scrolled to the bottom, the last section is active; above the
first section nothing is active. Put the rule in a pure function
`activeSection(tops: number[], barBottom: number): number | -1` in
`src/lib/front/scrollSpy.ts` with tests. When the active chip changes, scroll
the chip row so the active chip is visible (`scrollIntoView({ inline:
'nearest', block: 'nearest' })` guarded for jsdom).

Clicking a chip is a plain anchor navigation (keyboard accessible, URL hash
updates); add `scroll-behavior: smooth` on `html` under
`@media (prefers-reduced-motion: no-preference)` if the site does not have it.

## Strings

`galleryCategories` ("Kategorier" / "Categories") for the nav label. English
names the keys; both languages; translations.test.ts must pass.

## Docs

Rewrite DESIGN.md §3's toolbar paragraph as "Gallery bar" with the above.

## Tests

- `scrollSpy.test.ts`: the pure rule for tops above/below the bar, the
  bottom-of-page case, the above-first-section case.
- `GalleryBar.test.ts` (jsdom, like the old GalleryToolbar.test.ts): one chip per
  category with its count; "Mine hjerter" only with user hearts; the wordmark
  hidden until stuck; `aria-current` follows the active index; the selection
  controls only while ticked.
- Keep every existing test passing (`npm test`, ~3 min; do not touch
  `scripts/inverse`).
- Your own Playwright run (own Chromium, own port, `npm run build && npm run
  preview`) at 1440 and 390: the bar is transparent over the hero snow and
  gets its background when stuck; the wordmark appears when stuck; scrolling
  to Mønstre makes its chip `aria-current`; clicking "Figurer" lands with the
  heading just under the bar, not behind it; at 390 the chip row scrolls
  sideways; ticking a heart shows the controls at the right. Screenshots into
  `docs/redesign/bar-qa/` (gitignored). No console errors.

## Constraints

DESIGN.md §8 applies: static prerendered site, both languages, `npm run check`,
`npm run lint`, `npm test`, `npm run build` green, commit on this branch
(`gallery-bar`) in clear commits, **never push**, work only in this worktree,
no shared Playwright MCP tools, no new dependencies, do not touch
`static/inverse`, `scripts/inverse`, `docs/inverse`.

## As built: difficulty filter (18 Oct 2026)

A QA tester playing a teacher could not gather six easy hearts: only five are
"Let", spread over three categories. The bar now filters the gallery by
difficulty.

- **Toggles.** "Let", "Mellem", "Svær", "Ekspert" ("Easy", "Medium", "Hard",
  "Expert"; the existing `difficulty*` keys), one per level some gallery heart
  has, each a chip with the cards' four difficulty dots (6px, decorative)
  before its word. They are `<button aria-pressed>` in a
  `role="group"` labelled "Sværhedsgrad" / "Difficulty" (`difficulty`), placed
  in the chip row after the download button and before the category chips,
  8px further from the categories than the chips are from each other.
  Multi-select; none chosen shows all. Chosen: the download button's red fill,
  white dots and text (the current category chip stays `--deep`: what is being
  read, not what is picked). Focus ring 3px `--blue` as on the chips.
- **On the hill.** Each toggle is an item of the row (`[data-hill-chip]`, the
  attribute the gallery's measure and the bar's push now read instead of the
  row's children): its own lift, pushed with the chips, and counted in the
  chips' span, so at 1440 three columns now get the +54 (strands 0.2, 83,
  122.8, 105.7, 65.3; D 122.8, L 74.2). Below 900 they lead the scrolling chip
  row; back on the hero the row scrolls back to its start so they are in sight.
- **Room.** The row would not fit the column with everything at full width,
  so on the desktop layout the toggles drop their dots below 1200px and
  whenever the download button is shown. Even so the row overflows from 900
  to about 975px, and with a selection up to about 1150px; it then scrolls
  (the button sticky at its start), and snapping is off on the desktop
  layout because its snap positions kept the row from scrolling back to 0.
- **Filtering.** Cards of other levels get `display: none` (kept in the page:
  a prerendered heart's SVG cannot be drawn again), so the grid closes up; the
  strands count the cards on show (`strand = shown index % columns`). A
  category left empty is hidden, and the first category on show takes the
  first one's place on the hill (`first`). Its chip stays, dimmed
  (`opacity .45`), `aria-disabled`, out of the tab order, never current, and
  its click does nothing. The chips count the hearts on show ("Stjerner 3").
  The scroll-spy looks at the sections on show only. "Mine hjerter" is not
  filtered. A filter change re-runs the gallery's measure (its effect depends
  on the filter), so the pull-up, lifts, span and strands are re-measured.
- **State.** `?level=let,mellem` (Danish words in both languages, easiest
  first), written with the selection's `goto(…, { replaceState })`, so no
  page view; Back from a heart's page returns to that URL. The choice is also
  kept in sessionStorage (`juleflet-level`), which applies when the URL has no
  `level` (the header's "Skabeloner", a breadcrumb), and the URL is brought in
  line. A filter that would hide what the page is entered at (a breadcrumb's
  `/#moenstre`, `#heart-<id>`) is dropped, and a hero heart whose card it
  hides clears it before going there. Pure logic in `$lib/front/levelFilter`.
- **First paint.** The inline strand script reads the same filter (URL, then
  sessionStorage, same anchor rule) and writes a `<style data-level-bootstrap>`:
  the other levels' cards and the emptied sections hidden, the first category
  on show given the first one's margin, and on the desktop layout the strands
  with `:nth-child(Nn + k of [data-level=…])`. It estimates the chips' span with
  the toggles and the filtered counts. The gallery removes the style once the
  page has applied the filter. With `?level=let`, `?level=ekspert` and none,
  from 900 to 1920 in Chromium and WebKit, the cards, strands and sections
  before hydration (app scripts blocked) equal those after.

Verified with Playwright against `vite preview` (Chromium and WebKit, 1440,
1024 and 390): the stepped push/strand probe of GALLERY-CURVE.md amendment 3
with the filter on and off, 0 chip or card mismatches and 0 scroll-spy
mismatches; "Let" shows exactly the five easy hearts with counts 1, 3, 0, 0,
1; reload, Back from a heart page and the header link keep it; "Let" +
"Ekspert" shows 16; clearing restores all 56; the bar's visible height stays
49.6px. Screenshots in `bar-qa/level-*.png`.
