# Adding a heart to the gallery

A gallery heart is one SVG and one id in `hearts.json` in the project root. The SVG
holds everything about the heart, its two descriptions included; `hearts.json` only
says which category it is in and where. Everything else is generated from those two.

1. **The SVG.** Either draw the heart in the editor (`/editor/`) and save it with
   **Eksportér SVG**, or draw it elsewhere (Inkscape) and convert it. Both write the
   gallery format: the name, author, date, grid and weave parity the gallery reads,
   and the two empty description elements of step 2. Save it as
   `static/hearts/<id>.svg`, where `<id>` is lower-case ASCII with hyphens
   (`boelgebrud`, `stjerne-ramme`) — it becomes the URL `/hjerte/<id>/`.

   **A drawing from Inkscape** goes through the editor's importer, either in the
   browser (**Importér SVG**, then look the heart over and **Eksportér SVG**) or in
   one command:

   ```sh
   node scripts/svg-to-heart.mjs drawing.svg --gallery <id> --name "Kugle" --author "Thomas Ahle"
   ```

   Both print the same one-line summary (grid size, cuts per half, outline edges
   dropped, subpaths joined, warnings); read it. The importer accepts:

   - the cuts as `<path>`, `<line>` or `<polyline>` elements, with any path commands
     (arcs, relative commands, `H`/`V`/`S`/`Q`/`T`/`Z`) and `transform`s on them and
     their groups;
   - a cut drawn as several subpaths or pieces whose ends meet (within 1 % of the
     square) — they are joined; a cut that still does not reach from side to side is
     named in the summary;
   - the overlap square's outline drawn or not: lines along the bounding box of the
     cuts are dropped and that box is the square; without them the viewBox is the
     square. Any size works (an 80 mm drawing is scaled to the editor's 0–100);
   - horizontal cuts become the left half, vertical ones the right half; a path that
     is neither is skipped and named in the summary.

   The script writes `--date` (default today) and refuses to overwrite an existing
   file without `--force`; without `--gallery` it prints the HeartDesign JSON instead.

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
