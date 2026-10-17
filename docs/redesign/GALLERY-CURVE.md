# Gallery along the hill line

The owner's decision (17 Oct 2026, from design variant "E" on the Claude
Design canvas): the front page's gallery moves up into the hero's snow, and
its first row of hearts and the category chips follow the curve of the hill.
The category headings go.

## What changes

1. **No visible category headings.** `CategorySection`'s `.cat-head` is no
   longer shown. Keep the `<h3>` as `sr-only` so the section still has a name
   for screen readers and the chip anchors still land on the section. Nothing
   else sits between sections: the gap between one category's last row and
   the next category's first row is the grid's own `row-gap` (28px). Nothing
   says "12 skabeloner" anywhere; the chips keep their counts. `MyHearts`
   (the "Mine hjerter" section) is not part of this change.

2. **The gallery starts on the hill line.** On the desktop layout (≥ 900px,
   where the landscape is absolutely positioned at the foot of the scene) the
   gallery column is pulled up so that its top edge sits at the *highest*
   point of the hill line inside the content column, `hillTop`. The hill line
   is the top edge of the landscape drawing's `snow-field` layer:

   ```
   M0 523 C267 481 476 493 681 533 C870 569 1025 612 1220 601
          C1457 593 1679 514 1909 508 C2033 502 2114 511 2172 519
   ```

   in the drawing's own units (viewBox 2172 × 724, see `$lib/landscape`).
   Page coordinates follow from the rendered rect of the landscape svg
   (`Scene.svelte` renders it as `.scene-land-svg`): `scale = rect.width /
   2172`, `y = rect.top + yUnits * scale`. The scroll hint at the foot of the
   the hero only shows below 900px, so nothing there is covered.)

   Reference numbers at 1440px wide (header 62px tall, landscape rect top at
   page y 243, 480px tall; content column x 120–1320): the hill line is at
   y 573 at x 234, 601 at x 477, 641 at x 720, 624 at x 963, 584 at x 1206;
   `hillTop` ≈ 573.

3. **Chips right-aligned, on the curve.** While the bar is *not* stuck, the
   chips are right-aligned in the column (the wordmark is hidden then anyway)
   and each chip is shifted down by `hillY(chipCenterX) + 4 - hillTop` using
   `transform: translateY(…)`, so the row steps along the hill without
   changing the bar's layout height. When the bar sticks, the shift goes to
   0 and the chips go back to the left next to the wordmark, as today, with
   a short transition (respect `prefers-reduced-motion`).

4. **The first row follows the curve.** The first category's first row of
   cards (the cards whose top is the grid's first row — at 1440 that is all
   four "Klassiske") starts right under the hill line: the first section's
   top margin is `6px - <bar height>` so the row's own top is `hillTop + 6`,
   and each card in that row gets `margin-top: hillY(cardCenterX) - hillTop`
   (the grid is `align-items: start`, so the row grows to the lowest card
   and the next row is not disturbed). A card whose centre lies under the
   chip row's horizontal span gets 54px more, so its ribbon starts below the
   chips. Ribbons keep their normal length; nothing else about the cards
   changes. Later rows and later categories flow normally.

   Expected at 1440: card tops at page y 579, 607, 647 and 684 (the fourth is
   under the chips).

5. **Narrow layout (< 900px)** is untouched: the landscape is an in-flow band
   there, the gallery follows it as today, no lifts, chips as today.

## How

- Geometry in a pure module, `src/lib/front/hillLine.ts`: the path above as
  a constant, a cubic-bezier evaluator, `hillY(xUnits)` (bisection on x is
  fine), and a helper that maps between page px and drawing units given the
  landscape's rect. Unit tests pin the reference numbers above (tolerance
  1px) and that the curve is continuous across segment joins.
- DOM glue in `Gallery.svelte` / `GalleryBar.svelte` / `CategorySection.svelte`
  (pass what you need as props): measure on mount and on resize (a
  `ResizeObserver` on the gallery wrap is enough), set the wrap's negative
  `margin-top`, the per-card `margin-top`s and the per-chip `--lift`. Find
  the landscape svg by a `data-` attribute you add in `Scene.svelte`, not by a
  scoped class. The page is prerendered: with no JavaScript the row is flat
  at `hillTop + 6`, which is acceptable.
- The hero's `HeroBootstrap` swaps hero hearts while the page parses; it does
  not touch the gallery, so measuring after mount is fine.
- Keep the scroll-spy working: the bar's sentinel and `ANCHOR_GAP` logic are
  unchanged; the sections' `scroll-margin-top` stays.

## Verify

- `npm run check`, `npm run lint`, `npx vitest run`, `npm run build` green.
- A Playwright check (your own script against `vite preview`, not committed
  as a test unless it is stable) at 1440, 1200, 1024 and 390: measure the
  first row's card tops and the chip tops against `hillY` at their centres;
  scroll and confirm the bar sticks with the chips flat,
  then unsticks back onto the curve; `aria-current` still follows scroll.
- Screenshots at 1440, 1200, 1024 and 390 of the hero-to-gallery region, in
  `docs/redesign/gallery-curve-qa/` (gitignored like `download-qa/`), for the
  owner to look at. At 1200 and 1024 the content column hugs a 40px margin
  and the drawing's left fir reaches into the first column: say in your
  report how that looks, do not try to fix it without being asked.

## Amendment 1 (17 Oct 2026): the screen pushes them down, no snap

The owner tried the first build and does not want the chips to fly into the
stuck bar. Instead the top of the screen *pushes* each chip (and each
first-row heart) down the page as it reaches it, until they are all aligned,
and only then does the bar stick. Everything below is scroll-linked: it is
driven by `scrollY`, not by a transition, and must be updated on scroll
(passive listener + `requestAnimationFrame`, transforms only). Let

- `s` = `scrollY`, `H` = `hillTop` (page y of the gallery's top),
- `lift_i` the chip lifts from §3 (0 for the highest chip), `L = max lift_i`,
- `c_i` the page top of first-row card *i* as laid out (`H + 6 + drop_i`,
  with `drop_i` from §4), `D = max drop_i`.

**Chips.** The bar's box grows by `L`: height `50 + L`, chips laid out at its
bottom (`padding-top: 10px + L`), and `position: sticky; top: -L`, so the bar
sticks when exactly its bottom 50px are left on screen, as a normal bar.
Chip *i* carries `transform: translateY(y_i)` with

    y_i = clamp(s − H, lift_i, L) − L

At rest (`s ≤ H`) that is `lift_i − L`: the chip sits on the curve as now.
As `s` grows past `H + lift_i` the chip's screen y stays at 10px: the top of
the screen carries it down the page. At `s = H + L` every chip is at `y = 0`,
flat, and the bar sticks. The wordmark fades in at that moment as today.
Scrolling back up reverses it exactly. No transition on the transform.

*Amendment 2 (same day):* the chips stay right-aligned in the stuck bar too.
The screen pushes them straight down; they never slide sideways.

**First-row hearts.** The push line for cards is the stuck bar's bottom
edge, 50px from the top of the screen. Card *i* carries
`transform: translateY(t_i)` with

    t_i = clamp(s + 50 − c_i, 0, D − drop_i)

so a card is pinned at screen y 50 once the screen reaches it and is pushed
down the page until it is level with the lowest card (page y `H + 6 + D`),
after which the whole row scrolls normally. The row's layout height is
unchanged (the lowest card already defines it), so later rows are untouched.
The cards never enter the bar.

**Keep:** the per-card `drop_i` margins and chip `lift_i` from mount and
resize; the scroll-spy; click-through of the bar while unstuck (the taller
box overlaps more of the first row now); `prefers-reduced-motion` needs no
special case, since nothing animates on its own.

**Verify** with Playwright at 1440 and 1024: step `scrollY` from 0 to
`H + L + 100` in 10px steps and assert for every step that each chip's screen
y is `max(10 + lift_i − (s − H), 10)` while unstuck and 10 when stuck, and
each card's screen top is `max(c_i − s, 50)` until the cards align, within
1px; and that scrolling back to 0 restores the rest state. Screenshots at
`s = H − 40`, `H + L/2`, `H + L` and `H + D` into `gallery-curve-qa/push-*.png`.
