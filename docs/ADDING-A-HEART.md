# Adding a heart to the gallery

A gallery heart is one SVG and one id in `hearts.json` in the project root. The SVG
holds everything about the heart, its two descriptions included; `hearts.json` only
says which category it is in and where. Everything else is generated from those two.

1. **The SVG.** Draw the heart in the editor (`/editor/`) and save it with
   **Eksportér SVG**; the file carries the name, author, grid and weave parity the
   gallery reads. A design drawn elsewhere can be brought into the editor with
   **Importér SVG** first. (`scripts/svg-to-heart.mjs` converts an SVG into
   HeartDesign JSON for inspection; it does not write the gallery's SVG.) Save it as
   `static/hearts/<id>.svg`, where `<id>` is lower-case ASCII with hyphens
   (`boelgebrud`, `stjerne-ramme`) — it becomes the URL `/hjerte/<id>/`.

2. **The descriptions.** The exported file has two empty elements right after its
   `<title>`:

   ```xml
   <title>Bølgebrud</title>
   <desc xml:lang="da"></desc>
   <desc xml:lang="en"></desc>
   ```

   Write the Danish and the English paragraph into them by hand, in a text editor.
   They are XML, so write `&amp;` for `&` and `&lt;` for `<`. (A plain `<desc>`
   without `xml:lang`, if the file has one, is the old one-line summary; leave it.)

   **House style**, because the owner reads every one of them: two to four plain
   sentences, in both languages, saying

   - what the woven pattern shows,
   - how many strips each half has, and whether they are cut straight or curved,
   - whether the halves are mirror images (one template covers both) or differ
     (two templates),
   - the difficulty (the one the site computes — see `heart-meta.json` after step 4),
     and one practical cutting or weaving tip.

   Keep the first sentence short — it doubles as the page's meta description. Facts
   only: what the design shows and what its SVG records (name, author, grid,
   symmetry), no invented history or authorship. No exclamation marks; 150–600
   characters each. The English one is a translation of the Danish, not a copy of it.

3. **The id.** Add `"<id>"` to the right category's `hearts` list in `hearts.json`
   (project root), at the place it should appear in the gallery. The file holds only
   the categories and their ids:

   ```json
   { "categories": [ { "id": "klassiske", "hearts": ["classic-3x3", "ramme", …] }, … ] }
   ```

   The categories are `klassiske`, `stjerner`, `moenstre`, `figurer` and `hjerter`;
   a new category also needs translation keys in `src/lib/data/categories.ts`.

4. **Generate the data:** `npm run generate:heart-data`. This rewrites
   `src/lib/data/heart-designs.json`, `heart-meta.json`, `heart-cards.json` and
   `heart-descriptions.json` (and the social cards under `static/og/`, which git
   ignores). It stops with an error if the SVG lacks the Danish or the English text.

5. **Run the four checks:** `npm run check`, `npm run lint`, `npx vitest run`
   (`src/lib/data/hearts.test.ts` checks the id against its SVG and the category
   list; `heartSvgDescriptions.test.ts` checks both texts in the SVG and that
   `heart-descriptions.json` was regenerated; `heartDescriptions.test.ts` checks the
   length and the house rules) and `npm run build`.

6. **Preview:** `npx vite preview` and look at the front page and
   `/hjerte/<id>/` and `/en/hjerte/<id>/`.

7. **Commit** `static/hearts/<id>.svg`, `hearts.json` and the four generated JSON
   files together.
