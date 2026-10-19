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

> **Superseded** by amendments 3 and 4 below: the cards hang in per-column
> strands moved with `translate` (`--strand-k`), not per-card `margin-top`s,
> and the bar sets each chip's lift as its `translate`, not a `--lift`. Kept as
> the record of the first build.

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

## Amendment 3 (17 Oct 2026): whole columns hang from the hill

The owner tried amendment 1 and 2 and does not want the gap under the first
row: "the hearts below the first row should also start shifted up, so there
isn't this gap to close. Then they can all be pushed down together."

So the hill's offset is no longer a first-row thing but a *column* thing. Each
grid column of the gallery is a strand: every card in column *k*, in every
category, is shifted down by that column's drop, and the screen pushes the
whole strand down together until all strands are level. Layout stays flat;
only `translate` moves things.

- `k` = a card's index within its grid modulo the column count (all category
  grids share the same `grid-template-columns`, so the same count; read it
  once from the first grid's computed style, or from the distinct card lefts).
- `drop_k` = `hillY(columnCentreX_k) − hillTop`, plus 54 when the column's
  centre lies under the chips' span (as in §4; the +54 is per column now).
  `D = max drop_k`. The first row's top in layout, `rowTop`, stays `H + 6`.
- Every card in column *k* gets `translate: 0 y_k` with

      y_k = drop_k + clamp(s + bar − (rowTop + drop_k), 0, D − drop_k)

  one value per column per frame, set as CSS custom properties on the gallery
  (`--strand-0` … `--strand-n`) and read by the cards (`translate: 0
  var(--strand)`, each card carrying `--strand: var(--strand-k)`), so a scroll
  frame writes a handful of variables, not hundreds of styles. `bar` is the
  stuck bar's visible height as today. The `margin-top` drops on first-row
  cards go away.
- At rest the strands show the hill in every row: within a column, rows are
  always the grid's `row-gap` (28px) apart. Once the first row's top has
  passed the bar, all strands are level at `+D` and the whole gallery scrolls
  as a normal flat grid. Scrolling back up restores the strands.
- Since the strands end up `D` lower than their layout, the "Mine hjerter"
  section (full-width, not part of the strands) gets `D` more top margin, so
  the lowest strand at rest, and every strand when level, stays clear of it.
  Nothing else below needs room.
- Below 900px: no strands, as before.

Verify (Playwright, 1440 and 1024): at rest, for every category, consecutive
rows in the same column are 28px apart and the first row's tops match the
§4 numbers (minus nothing: `rowTop + drop_k`); stepping `scrollY` as in
amendment 1, every card's screen top is `max(rowTop + drop_k + rowIndex ×
rowPitch − s, bar + rowIndex × rowPitch)` until level, within 1px, where
`rowPitch` is the card height plus 28; after the push every card sits at its
layout position + D; scrolling back to 0 restores the rest state; "Mine
hjerter" never overlaps a card. Screenshots at rest and when level into
`gallery-curve-qa/strands-*.png`.

## Amendment 4 (18 Oct 2026): no flicker on load

The owner: "when reloading the page there seems to be a bit of flicker where
the vertical alignment of the chips and hearts happens." The prerendered page
painted the gallery flat at the stylesheet's estimate of the pull-up, and once
the app had hydrated, the measure above moved it into place: the strands
dropped by up to D (105px at 1440, 155px at 2560) and the chips stepped from
a flat row onto the curve. Now, on a reload at any desktop width, nothing that
has painted moves; below 900px nothing changed at all.

**An inline script lays the gallery out before it paints.**
`$lib/front/strandBootstrap` is plain source text in the style of
`heroBootstrap`, emitted by `Gallery.svelte` right before the gallery wrap,
where the hero's scene has been parsed and the gallery has not (the front
page's load hands it over as `strandScript`; in the browser the `{@html}`
block claims the prerendered `<script>`). At ≥ 900px it works out what the
measure will find:

- the width the page will have: `documentElement.clientWidth`, less a classic
  scrollbar's width (probed) if the page does not have one yet, since the
  gallery will give it one;
- the landscape's rect: `min(width, 2000)` wide at 2172 × 724, its bottom 1px
  below the scene's, whose bottom it reads from the DOM rather than repeating
  the header's and the hero's heights;
- `hillTop` over the content column (max-width 1280, 40px padding, centred)
  and the grid's columns (`auto-fill, minmax(204px, 1fr)`, 16px gap), with the
  hill maths of `$lib/front/hillLine` ported, mirror included;
- the chips' span, right-aligned at the column's right edge, from the chip
  labels and counts measured on a canvas (the site's font is a system stack,
  so a canvas measures what the page lays out), plus "Mine hjerter" when
  localStorage has hearts and the download button when `?selected=` names
  some;
- `drop_k` per column (+54 under the chips) and D.

It writes them on `<html>` under the names the gallery itself uses:
`--gallery-pull` (the wrap's margin-top), `--strand-0…n`, `--strand-room`,
`--gallery-bar-height` (49.6px, the one-row bar), and the classes
`strands-ready strands-<n>`. The prerendered CSS reads them: the wrap's
`margin-top: var(--gallery-pull, <old estimate>)`, and in `CategorySection`
`html.strands-<n> .cat-grid > :nth-child(<n>n + k+1)` gives each gallery card
`--strand: var(--strand-k)` until Svelte gives it its own. The first hydrated
measure writes the same numbers on the gallery, and its first strand push
removes the script's values from `<html>` (`clearStrandBootstrap`), so a
later resize never meets stale ones. `strandBootstrap.test.ts` runs the very
string in jsdom and checks it against `hillLine` at widths from 900 to 3200,
with a scrollbar, and with the extra chips.

**The chips wait, invisible.** Their lifts depend on laid-out text, so the
chip row (and the download button in it) is `visibility: hidden; opacity: 0`
on the desktop layout until the gallery has measured (`measured`, class
`placed` on the row), then fades in on the curve in 150ms (no fade with
reduced motion). Nothing about the bar's layout changes. Loaded scrolled
down, the row appears flat in the stuck bar. Without JavaScript, `html.no-js`
keeps the row visible, flat at the pull-up, as before; the gallery then uses
the stylesheet's estimate, as before.

**Measured** with Playwright against `vite preview`, sampling every animation
frame from document start until 2s after the chips were placed (Chromium on
Slow 4G with 4× CPU throttling; WebKit with its scripts held back 1.5s):
the first ten cards and the wrap moved 0px after first paint at 1024, 1200,
1440, 1920 and 2560 in both engines, also with a classic 15px scrollbar,
"Mine hjerter" and `?selected=`, and no frame showed a chip anywhere but on
the curve. The live site before this: cards moved 92–155px and the chips
showed flat for 50–70 frames. The pages at 390, 768 and 899px are
pixel-identical before and after.

**Left as is:** a visitor who scrolls before the app has hydrated sees the
strands at rest (the push needs the app) and they jump to their pushed place
on hydration; a selection or a "Mine hjerter" count that changes the chips'
span differently from the estimate (a `?selected=` naming hearts this browser
does not have) moves that column by 54px on hydration; if the app never
loads, the chips stay hidden on the desktop layout.
