# Adding a heart to the gallery

A gallery heart is one SVG and one entry in `src/lib/data/hearts.json`. Everything
else is generated from those two.

1. **The SVG.** Draw the heart in the editor (`/editor/`) and save it with
   **Eksportér SVG**; the file carries the name, author, grid and weave parity the
   gallery reads. A design drawn elsewhere can be brought into the editor with
   **Importér SVG** first. (`scripts/svg-to-heart.mjs` converts an SVG into
   HeartDesign JSON for inspection; it does not write the gallery's SVG.) Save it as
   `static/hearts/<id>.svg`, where `<id>` is lower-case ASCII with hyphens
   (`boelgebrud`, `stjerne-ramme`) — it becomes the URL `/hjerte/<id>/`.

2. **The entry.** Add one object to the right category's `hearts` list in
   `src/lib/data/hearts.json`, at the place it should appear in the gallery:

   ```json
   {
     "id": "boelgebrud",
     "description": {
       "da": "…",
       "en": "…"
     }
   }
   ```

   The categories are `klassiske`, `stjerner`, `moenstre`, `figurer` and `hjerter`;
   a new category also needs translation keys in `src/lib/data/categories.ts`.

   The descriptions follow the house style: two to four plain sentences, in both
   languages, saying what the woven pattern shows, how many strips each half has and
   whether they are cut straight or curved, whether the halves are mirror images
   (one template) or differ (two), the difficulty, and one practical cutting tip.
   Keep the first sentence short — it doubles as the page's meta description. Facts
   only: what the design shows and what its SVG records, no invented history.
   No exclamation marks; 150–600 characters.

3. **Generate the data:** `npm run generate:heart-data`. This rewrites
   `src/lib/data/heart-designs.json`, `heart-meta.json` and `heart-cards.json`
   (and the social cards under `static/og/`, which git ignores).

4. **Run the four checks:** `npm run check`, `npm run lint`, `npx vitest run`
   (`src/lib/data/hearts.test.ts` checks the new entry against its SVG, both
   descriptions and the category list) and `npm run build`.

5. **Preview:** `npx vite preview` and look at the front page and
   `/hjerte/<id>/` and `/en/hjerte/<id>/`.

6. **Commit** `static/hearts/<id>.svg`, `src/lib/data/hearts.json` and the three
   generated JSON files together.
