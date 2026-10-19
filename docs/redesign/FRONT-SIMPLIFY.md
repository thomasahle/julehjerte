# Front page: the heart is the link, selection is for power users

Downloading several hearts in one PDF turned out not to be the common case; the
heart page with its own buttons is. The gallery therefore changes from
"click = select, Detaljer = open" to "click = open, tick = select".

## Card (`src/lib/components/HeartCard.svelte`, DESIGN.md §3 "Card")

- **The whole card is one link** to the heart's page: `<a class="card-link"
  href={heartHref(id, lang)}>` absolute `inset: 0`, z-index 1, radius 14,
  transparent, focus ring 3px `--blue`; accessible name = the heart's name
  (`aria-label={heart.name}`; the visible name under the heart stays plain
  text). It calls the existing `onClick` (the page's `trackHeartView`).
  Hover keeps the card's `scale(1.02)`.
- **The "Detaljer" pill is removed**, with its `details` string in both languages
  if nothing else uses it (translations.test.ts fails on unused keys).
- **A small checkbox selects the heart for the PDF**: a 24 px round control at
  the card's top-left (`top: 10px; left: 10px`, z-index 2, above the link), a
  real `<input type="checkbox">` visually styled (white, 1.5px `--line` border,
  red fill + white ✓ when checked) with a visually hidden `<label>` "Vælg til
  PDF: {name}" (existing key `selectForPdf`). It calls `onSelect`.
  Visibility: opacity 0; 1 on card hover, on `:focus-within`, when checked, and
  always under `@media (hover: none)` so phones can still select (there it is
  22 px and `rgb(255 255 255 / .9)` so it stays quiet over the ribbon).
- Selected look is unchanged: the red ring around the heart, the check badge,
  the red name.
- A user heart keeps its delete button (z-index 2, top-right as today).
- Keep `id`, `data-heart-id`, `data-heart-name`, `data-user` and the
  `HangingHeart` call exactly: the hero's inline bootstrap depends on them
  (`$lib/front/heroBootstrap`, tested).

## Toolbar (`src/lib/components/front/GalleryToolbar.svelte`)

> **Superseded** (2026-10-17): the toolbar was replaced by the gallery bar,
> `front/GalleryBar.svelte` (GALLERY-BAR.md); `GalleryToolbar.svelte` and its
> test no longer exist. Kept as the record of this step.

With nothing selected the toolbar shows only the three-step strip (the steps
keep their place at the right, `margin-left: auto`; below 1200 they take the
full line as now; below 700 the toolbar is then empty and must collapse to
nothing — no empty sticky bar). When `selectedCount > 0` the selection
controls appear at the left: the red split button "Hent skabeloner (n)" with
its PDF-layout gear, then ghost "Vælg alle" (hidden when `allSelected`) and
ghost "Fravælg alle". No `aria-disabled` state and no "Vælg hjerter først"
tooltip any more; delete `selectHeartsFirst` from both languages if unused.
Keep the sentinel/`stuck` background logic, the `pdfLayout` binding, and the
`generating` state.

The `?selected=` URL state, `keepKnown`/`parseSelected`/`toggleSelected`, the
multi-PDF download, `trackMultiDownload` and `trackHeartSelect` are unchanged.

## Spec and strings

- Update DESIGN.md §3 "Card" and the toolbar paragraph to describe the new
  behaviour (replace the old bullets; keep the rest).
- Strings: only removals and, if needed, a label tweak; English names the keys.

## Tests

- `HeartCard.test.ts` (new, Vitest + jsdom as `TraceMode.test.ts` does): the
  card renders one link to `heartHref(id, lang)` with the heart's name as its
  accessible name; the checkbox toggles `onSelect` and reflects `selected`;
  no "Detaljer" link; the delete button only for user hearts.
- `GalleryToolbar.test.ts` (new; since replaced by `GalleryBar.test.ts`): no download/select controls at count 0; all
  three at count 2; "Vælg alle" hidden when `allSelected`.
- `heroBootstrap.test.ts` and everything else must keep passing.
- Your own Playwright run (own Chromium, see constraints) on
  `npm run build && npm run preview`: at 1440 and 390, clicking a card's heart
  navigates to its page; hovering shows the checkbox (desktop) / it is visible
  at 390 (touch descriptor); ticking two hearts shows the toolbar controls and
  `?selected=` in the URL; "Fravælg alle" hides them again; no console errors.
  Screenshots into `docs/redesign/front-qa/` (gitignored).

## Constraints

docs/redesign/DESIGN.md §8 applies: static prerendered site, both languages,
`npm run check`, `npm run lint`, `npm test`, `npm run build` green, commit on
this branch (`front-simplify`), **never push**, work only in this worktree, no
shared Playwright MCP tools, do not touch `static/inverse`, `scripts/inverse`,
`docs/inverse`.
