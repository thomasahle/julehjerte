# Pinterest feed

juleflet.dk publishes one gallery heart a day to Pinterest through an RSS feed
that Pinterest reads by itself.

**Feed URL to paste into Pinterest:** `https://juleflet.dk/pinterest.xml`

## Setting it up in Pinterest

1. Business account → **Settings → Bulk create Pins → Auto-publish** (Pinterest
   sometimes calls it "Connect RSS feed").
2. Paste `https://juleflet.dk/pinterest.xml`, choose the board (for example
   "Julehjerter – skabeloner") and save.
3. Pinterest polls the feed about once a day and makes one Pin for every item
   whose `guid` it has not seen, with the item's image, title, description and
   link. It never pins the same guid twice.

The feed is empty until the first release (07:00 on 21 October 2026). An empty
feed is valid RSS, but Pinterest may refuse to connect a feed with no items;
if it does, connect it on or after 21 October.

**Domain verification** is already done: `src/app.html` carries
`<meta name="p:domain_verify" content="bd35774ee7e38ab2fa8f0accbf454b6f" />`
on every page (commit 81e1bdfe). To replace the value, edit that line.

## How the feed works

- `src/lib/pinterest.ts` holds the schedule and writes the XML. It is pure and
  unit-tested (`src/lib/pinterest.test.ts`).
- `src/routes/pinterest.xml/+server.ts` is a prerendered endpoint, like the
  sitemap: the feed is written once per build, with the build's clock.
- `scripts/generate-heart-data.mjs` (run by `npm run prebuild`) draws a
  1000×1500 PNG per gallery heart at `static/og/pins/<id>.png` (gitignored,
  like the rest of `static/og`; layout in `scripts/social-cards.mjs` `pin()`,
  sizes and tagline in `src/lib/pinImage.ts`): the heart in its ribbon on the
  sky colour, its Danish name, "Gratis skabelon til flettet julehjerte" and
  "juleflet.dk".
- The deploy workflow (`.github/workflows/deploy.yml`) rebuilds the site every
  day at 06:17 UTC, with a second try at 09:43 UTC, after that day's release
  (07:00 Copenhagen time is 05:00 or 06:00 UTC), so a new item appears without
  any push. A scheduled run rebuilds the commit that is live, the newest one
  whose push run passed every job, not the tip of main, and skips the tests,
  which already passed for that commit; so a flaky test cannot cost the feed a
  day and an untested commit never reaches the site. Actions → Deploy to
  GitHub Pages → Run workflow does the same by hand ("Rebuild the live commit"
  ticked). GitHub may start scheduled runs hours late (the first one started
  5½ hours late), and disables schedules in a repository with no activity for
  60 days (re-enable under Actions).

### Schedule and order

- `PINTEREST_START_DATE = '2026-10-21'`. Heart number *i* (0-based) of
  `PINTEREST_ORDER` is released at **07:00 Europe/Copenhagen** on
  START_DATE + *i* days, across the summer/winter time changes.
- `PINTEREST_ORDER` is frozen in the source: the most visited hearts first
  (classic-3x3, juletrae, gaver, stjerne-ramme, jul, ramme within the first
  eight days), then every other gallery heart, spread so that no two
  consecutive days share a gallery category. It was made by
  `interleaveByCategory()` from the gallery index (`hearts.jsonc`, then
  `hearts.json`) as it was on 2026-10-20.
- Because it is frozen, editing the gallery never moves a heart to another
  day: a heart removed from `hearts.jsonc` leaves its day empty, and a heart
  added to it is released after the last listed heart, in gallery order. To
  place a new heart elsewhere, insert it in `PINTEREST_ORDER` only at a
  position after today's (inserting before today would shift released days).
  The five text hearts of 2026-10-22 went in so, at days 12, 25, 45, 57 and 70,
  each between hearts of other categories, before the new year; JUL i tern
  took day 70 from 2026 the same evening, before either was out. When Khatam,
  Stjernegitter and Stjerner og kors moved to Mønstre the same day, three swaps
  of hearts not yet out (days 62/63, 68/69 and 65/72) kept every day's
  neighbours of another category. Ni hjerter i tern went in on 2026-10-27 at
  day 30 (2026-11-20), between Sun and Sildeben, so that it is out before
  Christmas rather than after Hjerte på hjerte, which is also in Hjerter.
  Fire stjerner went in the same day at day 34 (2026-11-24), between
  Puslespil and Permo-sol, so that it is out before Christmas and away from
  the other Mønstre hearts. Hjerte i hjerte i hjerte followed at day 47
  (2026-12-07), between Drageskæl and MOR & FAR, for the same reasons.
  Kogle left the gallery on 2026-10-27, the morning its own day (6) was out.
  It stays in `PINTEREST_ORDER`, so every later heart keeps its day, and its
  pin now leads to a page that no longer exists: delete that pin on Pinterest.
  Two old classics went in on 2026-10-28: Kompasrose (Illustreret
  Familie-Journal, 1922) at day 27 (2026-11-17), between Alhambra and Engel,
  and Hans H. Koch's Andreaskors (Børnenes Magasin, 1916) at day 41
  (2026-12-01), between Julemand and Hanefod, so both are out before Christmas
  and away from their own categories.
- The feed holds the released items only (nothing future-dated), newest first,
  at most 30 (`PINTEREST_MAX_ITEMS`). When every heart is out, the feed stops
  growing: it does not cycle.

### An item

- `title`: Danish name + " – flettet julehjerte".
- `description`: the heart's Danish paragraph as plain text (`[text](url)`
  links reduced to their words), cut at a sentence end so it fits Pinterest's
  500 characters together with the last line "Hent skabelonen gratis på
  juleflet.dk".
- `link`: `https://juleflet.dk/hjerte/<id>/?ref=pinterest`; the `ref` lands in
  GA4 as the `ref_tag` dimension.
- `guid`: `https://juleflet.dk/hjerte/<id>/#pin-1` (`isPermaLink="false"`),
  stable forever, so Pinterest never re-pins a heart.
- `pubDate`: the release time.
- The image, twice: `<enclosure type="image/png" length=…>` and
  `<media:content medium="image">`, both `https://juleflet.dk/og/pins/<id>.png`.

## Checking it

- Live: open https://juleflet.dk/pinterest.xml.
- Locally, as a given day's build will write it, with a fake clock:

  ```sh
  PINTEREST_NOW=2026-10-27T07:30:00+01:00 npm run build
  cat build/pinterest.xml
  python3 -c "import xml.etree.ElementTree as E; print(len(E.parse('build/pinterest.xml').getroot().findall('channel/item')))"
  ```

  `PINTEREST_NOW` takes anything JavaScript's `Date` parses; without it the
  build uses the real time. Never set it in CI.
- The images: `static/og/pins/<id>.png` after `npm run generate:heart-data`.
- Tests: `npx vitest run src/lib/pinterest.test.ts src/routes/pinterest.xml`.

## Pausing, moving, stopping

- **Quickest pause:** in Pinterest, turn the feed off under Auto-publish.
  Nothing on the site changes; turn it back on to resume (items released in
  the meantime are pinned then, several at once).
- **Postpone or pause from the site:** move `PINTEREST_START_DATE` later. Every
  release time moves with it; items whose new time is in the future leave the
  feed. Hearts already pinned keep their guids, so they are not pinned again
  when their (new) day comes round, but those days then add nothing. To resume
  exactly where it stopped, choose the start date so that the first unpinned
  heart's index lands on the resume day: START_DATE = resume day − index.
- **Do not empty `PINTEREST_ORDER`** to pause: hearts not in the order are
  appended after it, so with an empty order every heart would be scheduled from
  the start date and released at once.
- The daily run only rebuilds the live commit; without it, new items appear
  only on the next push (any push after 07:00 also brings that day's item).

## A second round later (e.g. English)

Pinterest pins a guid once, so a second round needs new guids. Add a round
with its own start date after the last heart of round 1 (61 hearts → from
2026-12-21), its own guid suffix (`#pin-2`, the `PINTEREST_ROUND` constant),
and its own texts: for English, `heartName(meta, 'en')`, the `en` description,
`heartPath(id, 'en')` and an English pin image (e.g. `static/og/pins/en/<id>.png`
with the English tagline). Keep round 1's items computable so the feed's
recent items stay consistent while round 2 starts.

## Related

The photo pins in `docs/pinterest/` (pins.json, publishing-copy.csv) are a
separate, manual set made from photographed hearts with UTM-tagged links; the
feed does not use them.
