# Public source index

`/all/` and `/en/all/` list all published Juleflet hearts and the reviewed public
source records, independently of solver success or gallery selection. They are
not linked from the main navigation. Counts describe records, not unique motifs:
photographs, process pictures, template bundles and variant views can overlap.
Search and source/template filters cover the full index. The page renders at most
60 cards at a time; previous/next controls keep the browser's DOM bounded. Changing
any search/filter returns to page one, and page numbers clamp to the match count.

`build-index.mjs` reads the existing collection manifests locally and writes only
allowlisted public metadata to `src/lib/archive/external-records.json`. The browser
never receives `real-manifest.json`, local paths, split/training flags, Pinterest
account/board discovery activity or collection logs. The page embeds only images
already published on Juleflet; external photographs remain links to their sources.

The generated index retains reviewed paper-heart photo/document records with a
public source and image URL. Unrelated material, unreviewed/unknown images, other
materials and user uploads without public provenance are omitted. Resized copies
of the same source image merge, retaining their public source URLs and credits.
It does not merge merely similar motifs or claim to identify their original maker.

`source-merges.json` records explicit, reviewed same-source-image variants. Each
group retains one existing record ID and combines all public source/image links
and recorded credits. The generator rejects missing or repeated merge members.
Board membership, matching titles, perceptual hashes and training split groups
do not create archive merges. Pinterest permalinks can contain numeric or opaque
tokens; both are retained while account and board URLs remain excluded.

The [122-pin board archive audit](../../docs/inverse/datasets/conni-board-archive.json)
accounts for 87 relevant source files and 119 pin links. It adds 56 reference
records, enriches 18 existing records and consolidates seven earlier duplicate
cards, giving 1,175 external records. The generic PDF icon and two unrelated
ornaments are excluded. Scans, rendered designs and composites remain document
references without new verified template-pair claims; card titles do not assign
creators or publication dates. No collected image is copied into public assets.

`source-overrides.json` and `source-additions.json` are small reviewed public
metadata files. The October 19 additions were checked against
`docs/inverse/datasets/archive-permo.json` and `archive-additional.json`:

- 27 Hunodan records retain their existing image/template associations and gain
  the primary Permo history; five recovered “Circles in Hearts” records are added.
  Mortensen is credited for drawings and variations, not invention. Source page
  dates are explicitly distinguished from Wayback capture dates.
- All 12 Bibelselskabet template links enrich existing source records, including
  irregular constructions excluded from solver benchmarks. Bibelselskabet is
  identified as publisher, not an established individual designer.
- 33 Krümmel PDF bundles, PaperMatrix Heart #054 and the five-design Spejderliv
  collection are separately indexed. Bundle counts are not design counts.
- Six JulehjerteDesign templates and Haabet's two-sheet Isbjørn template retain
  both original and actual Wayback links. Template actions use the working
  captures; unavailable originals remain in provenance, so alternate copies
  do not appear to be additional cutting sheets. The credited designers are Carola
  Heesemann, Johan Rosenkilde and Peter Ole Kvint, as identified by their sources.
  Carola's Damernes julehjerte remains reference-only: its archived PDF failed,
  so the article is retained without claiming a recovered cutting template.
- A further [Haabet recovery](../../docs/inverse/datasets/archive-haabet-patterns-2.json)
  adds Peter Ole Kvint's Vintersol and 9 hjerter / Firkløver. The latter's detail
  page and figure index use different names for the same design. Vintersol's
  two small photographs remain views of one record. The signed template's 2001
  date and the later archive capture dates stay separate in the source manifest.

Template availability is explicit: printable Juleflet template, publicly preserved
original, verified source-template link, or reference only. Links discovered on
the same page remain separately labeled as unverified photo/template matches.
Preserving bytes locally does **not** automatically set `preservedTemplates`:
that field links only a deliberately published original. The first such original
is Spejderliv’s unchanged PDF, credited to Kim G. L. Pedersen under CC BY-NC-SA 4.0.
Private preservation inventory and integrity checks are maintained separately by
`verify-store.mjs`; they are not imported into the page.

After reviewing a source update:

```sh
node scripts/archive/build-index.mjs
node --test scripts/archive/build-index.test.mjs
node node_modules/vitest/vitest.mjs run --maxWorkers=1 \
  src/lib/archive/index.test.ts src/lib/pages/ArchivePage.test.ts \
  src/lib/i18n/routes.test.ts src/lib/i18n/translations.test.ts \
  src/routes/layout-head.test.ts
```

The normal application checks also cover the TypeScript, translations and page.
Run the normal static build to verify both archive routes and the original PDF.

Once a local server is running and a browser worker is available, the bounded
browser replay checks both languages, search, source/template filters, pagination,
390px layout, no third-party image requests and the saved PDF's content hash:

```sh
ARCHIVE_TEST_URL=http://localhost:4173 node scripts/archive/browser-qa.mjs
```

It uses its own Chromium at the repository's documented path. Override
`PLAYWRIGHT_MODULE` / `PLAYWRIGHT_CHROME` if needed. Screenshots are opt-in via
`ARCHIVE_QA_DIR` and limited to three viewport captures, not full-page images.
