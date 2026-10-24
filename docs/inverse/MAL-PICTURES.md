# Mal: from a picture to a template — 2026-10-24

Mal (the editor's paint mode, `/editor/mal`) turns a picture into a heart. This
records what it does with a picture now, and how that was measured on every
picture we have: the 828 distinct hearts scraped from the web, the 44 web
photographs in `scripts/inverse/fixtures/web-photos`, and the 64 designs of
juleflet.dk drawn as pictures. Everything runs in the browser (the engine's
worker, HiGHS and ONNX Runtime as WebAssembly); Find snit takes at most a
minute.

## What happens to a picture

1. **A template is read as a template** (`src/lib/paint/templateImage.ts`, in a
   worker). About a quarter of the heart pictures people find are not woven
   hearts but their cut templates: two lobes drawn flat with the slits inside.
   The reader finds the lobes (a square with a half disc, any rotation), their
   squares, and the slit curves between the strips, and returns the site's own
   `HeartDesign`. A confident read becomes the found heart directly, with its
   weave as the mask; a note says where the drawn cuts come closer than Tegn
   allows. "Behandl som foto" goes on as for any picture.
2. **Finding the woven square** (`static/inverse/neural/photo-crop.js`,
   `heart-fit.js`). The existing locators run first. When they give up, the
   heart's silhouette (the square and its two lobes under an affine map) is
   fitted to the paper network's probability — the largest piece, holes
   filled — so a heart the photograph cuts off, turns, or surrounds with other
   things is still found. Every crop is then moved onto the square's own edges:
   at each point of the square's straight edges (and the lobes' half circles,
   where they really are half circles) the strongest colour edge across it,
   with the background or the lobe's colour on the outside, then the corners by
   robust Gauss–Newton. Kept only when each edge is pinned. On drawn hearts this
   takes the corners from 1–2% of a side off to about 0.1%, which is most of
   the difference between a picture and its design.
3. **The two papers** (`static/inverse/core/input.js`). In automatic colour
   mode a crop's papers are read off its lobes (each lobe is one paper), so a
   glued motif, a shadow or glare cannot take one of the two clusters. The
   crop's outermost millimetre takes the colours just inside it, pieces of
   either colour on the edge under 12 mm² and specks or holes inside under
   6 mm² are cleared: glare, dust and print are not detail a template can cut.
4. **Finding the cuts** (`static/inverse/core/engine.js`, `exact/`). The fitter
   runs first (half the minute). Only when its template fails does the exact
   search (HiGHS, the cuts laid exactly on the outline traced from the mask)
   try to rescue it, and its template is taken only when it passes. Find snit
   stops within a minute on every path.

## Results

Measured headless with Mal's own code path (`scripts/inverse/mal-pictures-benchmark.mjs`:
the template reader, the worker's neural crop, `prepare` with Mal's import
settings, the page's symmetry detection and fold, `design` with Mal's solve
settings, Mal's converter), on a 12-core Mac shared with other work, and against
`origin/main` (ef28db7f) run the same way. "Fidelity" is a template that passes
the geometry and paper checks but not the image-fidelity check (a detail of the
motif it could not keep, or over 3% from the mask): Mal shows it, with the note
that details are missing.

### The juleflet.dk designs as pictures

Each design drawn as Mal draws a mask (the woven heart and its lobes), once clean
and once as a phone snapshot (turned up to 9°, a warm cast, noise, JPEG). The
true design is known, so the woven result is scored against it.

| | main | now |
|---|---|---|
| The 64 library designs (128 pictures): pass | 127 | **128** |
| woven heart vs the true design, median | 4.22% | **0.65%** |
| within 1% of the design | 1 | **108** |
| seconds, median / max | 15.2 / 96.4 | 12.8 / 51.2 |
| The site's 80 gallery hearts (160 pictures): pass / fidelity / fail | 155 / 5 / 0 | 152 / 7 / 1 |
| woven heart vs the true design, median (within 1%) | 4.02% (2) | **0.64%** (122) |
| seconds, median / max | 12.7 / 66.6 | 12.8 / 41.7 |

Almost all of the difference is the crop: main's corners are 1–2% of a side
off, which costs a fine pattern 3–14% of its cells before any cut is fitted;
now they are 0.02–0.2% off. The gallery's text hearts (GOD JUL, TAK, MOR FAR,
JUL 2026) are where main "passes" more: every one is now closer to its design
(TAK 5.2% → 1.2%, GOD JUL 2.8% → 1.3%), but against an exact mask the fidelity
check now protects the letters' small pieces, which the fitter cannot keep, so
Mal shows them with its note. One snapshot's cream lobe is barely visible on
the beige background, and its crop stays 6% off.

### The 64 designs as masks

The solver alone, on each design's exact mask: pass 57 → **60** (the exact
search rescues amy-pinecone, fisk and tulipan), one template 44 → 44, hidden
cuts where both pass 264 → 253, median 6.6 → 6.3 s.

### The web photographs (44 instances, 29 with a rough selection)

| | main | now |
|---|---|---|
| pass / fidelity / fail / no crop | 16 / 17 / 1 / 10 | **18** / 16 / 0 / 10 |
| woven heart vs the mask, median | 2.72% | **0.77%** |
| within 1% | 8 | **19** |
| seconds solving, median | 59.0 | **21.6** |

### Every scraped heart (828 distinct pictures)

The pictures collected from the web (`scripts/inverse/datasets/real-collect.py`;
1341 files, 828 after near-duplicates, sorted by kind in `real-review.json`).
Most "template-render" pictures are cut templates, which the reader takes; the
"other material" ones are cakes, crochet, beads and jewellery.

| kind | cases | read as a template | pass | fidelity | fail | no crop |
|---|---|---|---|---|---|---|
| photograph of a woven heart | 535 | 0 | **418** | 68 | 1 | 48 |
| template drawing | 188 | **119** | 20 | 16 | 0 | 33 |
| page with a template and a photo | 57 | **21** | 22 | 4 | 0 | 10 |
| other material (cake, crochet, beads, …) | 48 | 0 | 17 | 9 | 0 | 22 |
| all | 828 | 140 | 477 | 97 | 1 | 113 |

Woven heart vs the mask where a template was made: median 0.80% on photographs;
end to end (crop, preparation, search, conversion) median 24 s, 90% within 50 s,
the search itself at most 61 s. Main was run on an 80-case sample of the same
set (40 photographs, 20 template drawings, 10 of each other kind):

| the 80-case sample | main | now |
|---|---|---|
| photographs: pass / fidelity / fail / no crop | 28 / – / 5 / 7 | **36 / 4 / 0 / 0** |
| all 80: no crop | 35 | **10** |
| all 80: read as a template | – | 14 |
| photographs with a template both ways (33): median vs the mask | 1.19% | **0.81%** |
| search seconds, median / max | 13.4 / 119.6 | 24.6 / 49.5 |

(The 828-case run shared the machine with three other jobs, main's sample with
fewer; on the juleflet and web sets, run side by side, the new search was as
fast or faster.)

A pass is the engine's checks on what Mal read from the picture, not proof that
it read the right square: looking at 24 passing photographs drawn at random,
about 20 show the right square and 3–4 a doubtful one (a pale lobe, a heart
lying on its side). Every automatic crop is shown for the visitor to check.

On 68 photographs the template keeps every rule but loses a detail of the motif
(the eight stars beside a camel, a panda's eyes, the cow under a UFO, polka
dots of printed paper): there is no weavable way to keep them at this size, and
Mal says so. The one failure is a paper check.

### Templates read from pictures

The reader (`templateImage.ts`) on the site's own 80 templates drawn as pages
(the site's template SVG, a flettedehjerter.dk-style page, the one-template page
for lobe-sharing hearts; each also degraded): the heart's weave within 1% for
79 of 80 (kogle's scalloped first cut touches the side and is read as none). On
the 245 scraped template and mixed pages it reads 140 — 101 of the 102
flettedehjerter.dk pages, each agreeing with the woven preview printed on the
page — declines 88 that are not one template (sheets of several, magazine
pages, baskets), and gets 2 wrong, both above Mal's threshold of 0.5 (0.58 and
0.63: a dimension line drawn along a slit hid one cut; a slit stopping short
was dropped). No photograph or drawn heart
of the 755 tried reads as a template.

### In the browser

The production build (`npm run build`, `vite preview`), driven through Mal's own
dialog: starcircle.png 15.5 s in Chromium and 17.1 s in WebKit (0.2% from the
mask, the exact search's template); a template page read in 0.85 s, used, and
opened in Tegn. (Playwright's Firefox does not start on this machine.)

## Open

- A pale lobe on a pale background: the paper network barely sees it, and
  neither the colour locator nor the silhouette finds the square (most of the
  remaining "no crop" photographs).
- Fine motif detail (thin limbs, small stars, letters) the fitter cannot keep at
  this size: shown with Mal's note.
- The exact search rescues few photographs (its outline, traced from a noisy
  mask, is rarely a weavable structure in time); it rescues drawn ones.
- Templates: slits that stop inside the square or meet in T-junctions (the site
  cannot represent them), dimension lines drawn along a slit.
