# The sticky gallery bar: wordmark, category chips with scroll-spy, selection

The gallery's sticky toolbar (`src/lib/components/front/GalleryToolbar.svelte`)
used to carry the download controls and a step strip. The strip is gone and
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
- `GalleryBar.test.ts` (jsdom, like GalleryToolbar.test.ts): one chip per
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
