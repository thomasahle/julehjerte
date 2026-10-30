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
   things is still found. The silhouette also replaces a colour crop that was
   kept only because nothing else passed, when the paper is not where that
   crop says and the silhouette lies over 10% of a side from it: on a
   Pinterest pin the page round the photograph took the colour locator to a
   square half off the heart (190% of a side off, now 4.7%; on 117 scraped
   photographs 3 crops changed, one for the better, two wrong either way).
   A heart photographed hanging from its strip has paper the silhouette
   cannot hold, so it is fitted a second time leaving out a band a quarter of
   a side wide and two sides long out of the cleft along the heart's axis, and
   that fit is taken when it covers the paper at least 0.03 closer (IoU): a
   heart on its side went from 0.896, under the 0.9 a silhouette needs, to
   0.985, and one whose strip ran out of the picture from a turned fit at 0.84
   to its square at 0.94. A wider or always-taken band let the fit hide other
   paper in it; with the margin, none of 56 photographs with reviewed corners
   moved, and on 117 scraped ones 4 crops changed, all for the better.
   Every crop is then moved onto the square's own edges:
   at each point of the square's straight edges (and the lobes' half circles,
   where they really are half circles) the strongest colour edge across it,
   with the background or the lobe's colour on the outside, then the corners by
   robust Gauss–Newton. Kept only when each edge is pinned. On drawn hearts this
   takes the corners from 1–2% of a side off to about 0.1%, which is most of
   the difference between a picture and its design. Whether the dialog says
   the corners were found or asks the visitor to check them comes from the
   silhouette, fitted on the paper probability alone: a crop within 3% of a
   side of it is found, one over 10% off is for checking (on 160 scraped
   photographs no crop within 3% was wrong; on 80 others, all 27 crops called
   found were right; found crops went from 32 to 59 of 137).
3. **The two papers** (`static/inverse/core/input.js`). In automatic colour
   mode a crop's papers are read off its lobes (each lobe is one paper), so a
   glued motif, a shadow or glare cannot take one of the two clusters. The
   crop's outermost millimetre takes the colours just inside it, pieces of
   either colour on the edge under 12 mm² and specks or holes inside under
   6 mm² are cleared: glare, dust and print are not detail a template can cut.
4. **Finding the cuts** (`static/inverse/core/engine.js`, `exact/`,
   `static/inverse/worker-controller.js`). The exact search (HiGHS, the cuts
   laid exactly on the outline traced from the mask) and the fitter run side by
   side in two workers. The exact search's template is taken whenever the
   export passes it, and the fitter's (with its final repairs: hidden cuts
   rounded, returns and paper) only when the exact search has none: its
   outline's cut ends cannot pair up across the square (most noisy
   photographs), or no template keeps the rules in its time. The live view
   draws the exact search's improving solutions, then the fitter's candidates
   once it has given up. Find snit stops within a minute on every path (see
   "The exact search first" below).

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

The solver alone, on each design's exact mask: pass 57 → **60**, one template
44 → 44, hidden cuts where both pass 264 → 253, median 6.6 → 6.3 s. (The
exact search's templates were taken for amy-pinecone, fisk and tulipan, but
the fitter's pass too: the rescue judged paper more strictly than the export.
With the export's own verdict the fitter's templates pass all 64 folded masks,
2026-10-25.)

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

A template fixes each half only up to turning it over. A page drawing both
halves as they sit in the heart (101 of the 119 read) says which side is up;
one template for both halves (15) or two drawn side by side (3) does not, and
for 11 of those the two readings weave differently. The dialog then offers
"Vend den ene halvdel om" next to the colour swap.

### In the browser

The production build (`npm run build`, `vite preview`), driven through Mal's own
dialog: starcircle.png 15.5 s in Chromium and 17.1 s in WebKit (0.2% from the
mask, the exact search's template); a template page read in 0.85 s, used, and
opened in Tegn. (Playwright's Firefox does not start on this machine.)

### Rerun after the 2026-10-25 changes

The same harness on this branch: the juleflet pictures 128/128 pass, median
0.63% from the true design (109 within 1%), solve 90th percentile 18 s and
slowest 31 s (were 23 s and 47 s: the exact search no longer runs on templates
the export passes); the web photographs and the 80-case scraped sample as on
the deployed commit (pass 18 and 46, medians 0.77% and 0.75% from the mask),
with crops shown as found 4 and 31 (were 2 and 17). The production build in
Chromium, WebKit and Firefox 158 (stock, through WebDriver BiDi):
starcircle.png 7-9 s at 0.2%, starstar.png 22-26 s.

## The exact search on pictures (2026-10-25)

What the exact search (HiGHS, cuts on the traced outline) does with a picture,
from experiments on the 64 designs' masks and 47 scraped photographs
(`tmp/e2e/topo/` harness: Mal's fitter and final repairs, then the exact search
from the fitter's template):

- **Precision was the tracer's.** The outline traced at 0.35 px runs along the
  pixels' staircase and lies 0.2–0.6% off the mask before any cut is placed; the
  exact search's templates were that far off too. A finer trace follows the
  staircase closer but is jagged (15–25% longer) and slows the search past its
  time. A found solution is now redrawn on the same outline with each edge moved
  onto the mask's sub-pixel edge (`exact/refine.js`), kept edge by edge while the
  editor's checks pass: on the six cases tried, 0.07–0.31% instead of 0.10–0.63%,
  as close as the fitter's.
- **Hidden cut, measured alike.** The fitter's and the exact search's own counts
  of hidden runs differ in kind (koelbuer: "0" against "16", but 57 mm against 61
  mm). Hidden cut is now the cut length the woven picture shows the same colour on
  both sides of, and the exact rescue ranks by it.
- **Symmetric ties on traced outlines.** A traced outline is only nearly
  symmetric, and the symmetric search failed on symmetric pictures (the folded
  masks of snowflake, alhambra and hvirvel, and photographs; permo-cirkler at a
  finer trace). Positions now close orbit by orbit and snap only onto symmetric
  corners; the ties hold on all of these.
- **The paper verdict.** The rescue's check audited paper on a coarser lattice
  than the export, and called templates failing that the export passes (all 13
  "rescue" cases measured, six of 18 photographs). It now uses the export's own
  verdict, so the exact search runs only for templates that really fail.
- **Photographs.** In 30% the traced outline's cut ends do not pair up across the
  square (a strip end or a corner piece at the border), and where the search
  starts, its templates on a photograph's outline break the cutting rules: the
  outline has necks and gaps narrower than a strip, which the fitter's smooth
  curves never follow. Taking the topology from the fitter's weave where they
  differ in small pieces, or a majority vote at 1 mm, makes a few more start
  (20 of 26), but of the 15 found only 4 pass, none better than the fitter's.
- **Where it is better.** On drawn pictures it often cuts far less hidden:
  alhambra 61 mm against the fitter's 318 at 0.23% against 0.25% from the mask;
  the photographs it was taking before, 113 against 720 mm and 45 against 278.
  Run on all 64 folded design masks next to the fitter (13 have a symmetry
  within each curve, which it cannot keep): of 50, it finds a template for 41,
  30 pass, and 17 rank above the fitter's (passing, regions, mask error in 0.5%
  steps, one template, hidden cut), with hidden cut 2574 → 1637 mm and the
  same one-template count. Capped at 16 s it keeps 16 of the 17 and adds about
  6 s a design. On the 47 photographs it ranks above the fitter's three times,
  for closeness alone (its hidden cut is 14 mm more), at about 11 s for each
  photograph it can start on; neither the start it takes nor how ragged the
  mask is tells drawings and photographs apart in advance.
  Through Mal's whole pipeline on the juleflet pictures, though (imported, so
  their masks are a little noisier than the designs' own), competing it was
  chosen once in the first 38 (16 have a symmetry within each curve; where it
  found a template it mostly hid more cut than the fitter's), at a solve
  median of 18.7 s instead of 7.7 s. `exactCompete` (capped at 16 s) is
  therefore on only for a mask painted in Mal, with no picture behind it: on
  "Prøv stjernen" its template is taken, 262 mm hidden against the fitter's 404
  at 0.1% from the mask, in 16 s.
- **What stopped it, and what still does.** Its start on 6 of 50 designs: the
  fitter's template reads onto the outline without the short hidden crossings
  between near-touching shapes, and the topological search finds none in 30
  s. HiGHS now searches from an empty start then (amy-flowering passes, and
  david4 at 0.16% from the mask with 466 mm hidden against the fitter's 1.26%
  and 960 mm). Its paper was judged differently from the export's (lattice
  only, an undecided lattice never refined, paper cut off whole giving the
  retry nothing to forbid); now as the export (ball passes at 0.025%). Its
  templates' self-returns at sharp tips (8 of 11 failing ones), which a retry
  on the outline with tips rounded by 0.5 mm passes for 3. A trace vertex of
  six curves (amy-pattern, stjernegitter), gone on the mask opened by a pixel.
  HiGHS overrunning its time at the root on a large model (amy-weave-1, 46 s
  for 26): its presolve spent 41 s in probing and four other rules, checking
  its time limit only between passes. They are now left out: amy-weave-1 takes
  2 s, and on the 47 designs the exact search starts on the same templates come
  out for 41, 34 pass instead of 33 (khatam), in 360 s instead of 552 (median
  4.9 s instead of 7.6, slowest 31.6 instead of 47.6).

## The exact search first (2026-10-25)

Mal ran two algorithms and kept one by a rank the visitor never saw: the
fitter's template stood whenever it passed, and the exact search competed only
on painted masks (and, through a bug, on most imports). Now the exact search's
template is taken whenever the export passes it (cutting rules, paper, the
picture's regions and its fidelity: `exportable` in `exact/stage.js`), and the
fitter's only when the exact search has none.

- **Touchings the trace opened.** A sampled checker corner, its pixels blending
  four colours, is traced as two corners 0.04-0.5 mm apart, and the exact
  search paid a hidden segment for each (the triangle at a plain crossing in
  5-3-heart). Corners of different boundaries, or far apart along one, within
  0.6 mm now meet (`joinNearTouchings` in `exact/target.js`); never both ends of
  a strip narrower than that, which would lay its sides on top of each other.
  On 111 masks 68 gain touchings and the lower bound on hidden segments drops
  for 57; on 47 photographs passing exact templates went from 8 to 10 and their
  hidden cut from 440 to 235 mm where both passed. 5-3-heart now has the
  minimum of 11 hidden segments.
- **Side by side.** The two run in two workers (`worker-controller.js`,
  `exactRoute` in `design`), each with its own time: the exact search on the
  traced outline until 30 s, then with its tips rounded by 0.5 mm until 50 s;
  the fitter its 45 s as before. The exact search's template is taken when it
  comes and the fitter's worker ended; the fitter's is taken once the exact
  search has none, or overruns its minute (its worker is then ended at 65 s:
  HiGHS's root does not keep its time limit). One after the other in one
  worker the fitter was left about 10 s on photographs that the exact search
  fails, and 8 of 80 lost a detail.
- **A smaller model.** Without the fitter's template to start from, HiGHS gets
  hidden segments between positions 3 units apart to their 2 nearest (1.5 and
  4 before). On 72 juleflet pictures it found the same templates in two thirds
  of the time and passed 42 instead of 36; HiGHS's root, which overruns its
  time limit, grows faster than the model (dagognat-shot: 65k rows 57 s, 34k
  rows 3 s; no HiGHS option shortens it). Where that leaves a symmetric outline
  no template at all (starcircle's transpose), the search goes again with 1.5
  and 4.
- **Symmetric within each curve** comes with both mirrors, whose ties already
  map each curve onto itself, so those pictures (a quarter of the juleflet ones)
  now have the exact search too. The export's symmetry report cannot pair the
  exact search's cuts ("no paired cuts"); Mal's converter restores the symmetry
  where it costs little, as before.
- Mal no longer runs the twelve synthetic cutting-error trials it never shows:
  on an exact template's many short curves they took up to 17 s.

| | deployed (f7d8a0f9) | exact first, side by side |
|---|---|---|
| juleflet pictures: pass | 128 / 128 | 128 / 128 |
| exact template | 0 | 98 |
| from the true design (mean) | 0.708% | 0.672% |
| from the mask (mean) | 0.485% | 0.335% |
| solve median / 90% / slowest | 7.3 / 17.0 / 33.4 s | 8.6 / 45.1 / 49.1 s |
| 80 scraped photographs: pass / detail lost | 46 / 10 | 46 / 10 (7 exact) |
| solve median | 21.4 s | 43.0 s |
| 44 web photographs: pass / detail lost | 18 / 16 | 18 / 16 (4 exact) |

On the 98 exact templates the woven heart is 0.606% from the true design
instead of 0.652%, 13 more than 0.2 points closer (david4-shot, squares,
fisk-kors-shot, stjerne-ramme) and 5 that much further (drageskael-shot,
lilje2, roserude, amy-pattern-shot, stjernegitter); hidden cut 9854 -> 8445 mm,
less on 24 and more on 28. The fitter's 30 are as before. Photographs wait
for the exact search to give up: 94 of the 98 exact templates came within 30 s
and all within 40 s, so stopping it there would cost none of them. Rounded tips
are visible (5star's points are blunt where the fitter's stay sharp): its tip
on the mirror is cut sharp only by a hidden segment leaving outwards along the
mirror, to the checker's touching, and hidden segments end on edges only.

## Where it stands (2026-10-26)

Mal's whole pipeline on the three sets, against the version deployed on
2026-10-25 (the fitter first, the exact search only as a rescue):

| | 2026-10-25 | 2026-10-26 | 2026-10-26, later | 2026-10-27 |
|---|---|---|---|---|
| juleflet pictures (128): pass | 128 | 128 | 128 | 128 |
| exact template first (and second) | 0 | 104 | 94 (16) | 92 (18) |
| from the true design (mean) | 0.708% | 0.676% | 0.658% | 0.657% |
| solve median / 90% / slowest | 7.3 / 17.0 / 33.4 s | 8.4 / 40.0 / 40 s | 10.2 s median | 8.6 / 20.0 / 40 s |
| 80 scraped photographs: pass / detail lost | 46 / 10 | 47 / 9 (8 exact) | 46 / 10 (8 exact, 4 second) | 46 / 10 (14 exact, 7 second) |
| solve median | 21.4 s | 40.0 s | 30.0 s | 21.9 s |
| 44 web photographs: pass / detail lost / no heart | 18 / 16 / 10 | 34 / 8 / 2 (7 exact) | 38 / 4 / 2 (5 exact, 3 second) | 38 / 4 / 2 (7 exact, 6 second) |
| solve median | 28.0 s | 13.9 s | 14.0 s | 17.9 s |

The photographs waited longer where the exact search fails: once the fitter's
template was in, the exact search had until 40 s. The last column has printed
papers read as below, tips that come back to themselves rounded, and the
fitter's passing template sent at 30 s while the exact search has drawn nothing
(both below); it was timed while other jobs loaded the machine, so its times
run long. The 2026-10-27 column adds the photographs whose sides end unevenly
or whose crop misses a corner, the start capped at 3 s and the 20 s limit
(below), all three sets run on a calm machine (the crop 3.4 s at the median;
under load it took 5.7 s, and the juleflet pictures showed 91 exact templates
first). With the traced outline's stage alone cut from 30 s to 20 s, run beside
it, 93 came first and 112 in all (92 and 110): three rounded templates came in
time, two traced ones (hvirvel's at 19.5 s) did not; it stays at 30 s.

## Tips, untied outlines and their symmetry (2026-10-26)

- A tip narrower than a cut's clearance (1.5 mm) is rounded off only within
  4 mm of where the traced template comes too close to itself, then everywhere
  if that fails, by a disc of 0.8 mm: 0.5 mm left the part 1-1.5 mm wide, where
  the slit still came too close to itself. On the juleflet pictures 104 take
  the exact template instead of 98, as close to the true designs (0.600% on
  the 95 taken both ways, 0.606% before); fisk-kors 1.67 -> 0.51%, lilje1
  1.76 -> 0.68%.
- An outline not symmetric enough for its symmetry's ties is searched untied
  (lilje2, stjernegitter). Mal's converter then makes the cuts symmetric; where
  that costs more than 1% of the mask (untied cuts that do not pair up,
  permo-kroge 1.9%) the exact template stays as found, the rows marked as not
  held, and the fitter's symmetric one is the alternative (permo-kroge 2.68 ->
  0.88% from its true design).

## Two templates to choose from (2026-10-26)

The exact search's template and the fitter's are better on different
pictures (on twelve compared by eye, the exact one clearly better on seven,
the fitter's on two: kogle's photograph and a lily the exact search could not
start on), and a price per hidden cut hardly changes the exact one (the same
on 9 of 12). So once the exact search's template is taken, the fitter's
passing template follows as a second choice ("Smoother cuts", beside "Exactly
as the picture"): at once when it was in first, else when the fitter finishes
(worker-controller.js `alternative`; a new request ends the fitter). The
visitor swaps between them; Open in Draw and the PDF take the one shown.

## Printed papers (2026-10-26)

Of the 44 web photographs, the 28 of printed papers (a pattern, motifs, the
papers' own white print) were Mal's worst: 4 passed, 16 lost a detail and 8
found no heart, where all 12 of two plain colours passed.

- **Their colours.** A photograph's two papers were its lobes' two colours, and
  every pixel went to the nearer, so a paper's white print went to whichever
  paper is paler. Now, when a lobe is printed (under 90% of 320 samples across
  it within 10 ΔE of their median: `printedLobes` in `core/input.js`), each
  paper is its lobe's whole colours, a density of those samples (a kernel of
  7 ΔE), and a pixel goes to the paper whose colours are likelier there, the log
  ratio averaged over 1.5 mm, and over 4.5 mm at a colour both papers have
  (one whose own log ratio is under 2.5: their shared print takes the paper
  around it). No plain picture is taken for printed: all 128 juleflet pictures
  keep their lobes' two colours. (A lobe was printed under 80% at first, the
  shared colours' ratio under 1: 90% and 2.5 pass 4 more web photographs, as
  the second table shows, and lose one scraped photograph, a pendant.)
- **Finding the heart in a selection.** In a selection the visitor drew, only
  the colour locator looked, which printed papers defeat. When it finds nothing
  the heart is now what differs from the selection's background (the colours
  holding 30% of its outer band; a place is heart beyond three times their own
  spread there), with the heart's silhouette fitted to that, for review
  (`backgroundBody`, `selectedSilhouette`). Eight of the ten selections that
  found nothing find the right heart.

| 44 web photographs | deployed | now | 90% and 2.5 |
|---|---|---|---|
| printed papers (28): pass / detail lost / no heart | 4 / 16 / 8 | 19 / 7 / 2 | 23 / 3 / 2 |
| two plain colours (12): pass | 12 | 12 | 12 |
| scenes (4): pass / detail lost / no heart | 2 / 0 / 2 | 3 / 1 / 0 | 3 / 1 / 0 |
| all: pass | 18 | 34 | 38 |

On the 80 scraped photographs 6 are taken for printed, their masks 1.57% ->
0.86% from their templates, and one more passes (47); nothing else changes.
With 90% and 2.5, 9 are taken for printed (a black-and-gold heart whose gold
shines among them, cut as before), their masks 1.14% -> 0.70% from their
templates, and 46 pass: a necklace pendant loses a detail.

## Tips that come back to themselves (2026-10-26)

The tulip's true design (tulipan) hides no cut, and the exact search finds that
on the true design's mask, but on its imported picture it took 4 hidden
segments. Six petal tips there are two pixels wide (one on the true mask, which
`withoutSlivers` drops), traced as little boxes: a slit along one turns by over
190 degrees within 1.5 mm of itself, which the cutting rules forbid (the return
rule), so the model changes papers there, and each change takes hidden
segments. With those tips rounded (the 0.8 mm disc of the tips narrower than
the clearance, within 4 mm of each) it takes none.

`returns` (exact/nogoods.js) finds where an outline comes back to itself, for
the model's rule and for the rounding (`returnTips`, stage.js). A traced
template with more hidden segments than the count's lower bound is searched for
again with those tips rounded, for as long as the first search took (10 s at
least), and taken with fewer; a traced template that fails has them rounded
along with the places it comes too close to itself.

On the 128 juleflet pictures the exact search finds a template the export
passes for 110 (104 before), 0.658% from the true designs on average (0.676%);
on the 91 exact both ways hidden cut 9129 -> 8542 mm. tulipan 4 -> 0 segments
(89 -> 19 mm), tulipan-shot 5 -> 4 (64 -> 20 mm), stjernerogkors 8 -> 0,
stjernegitter-shot 26 -> 14, juletrae 1 -> 0, roserude 9 -> 7 (0.68 -> 0.44%
from its true design).

## Waiting for the exact search (2026-10-26)

Once the fitter's template was in, the page waited for the exact search until
40 s, so a photograph the exact search fails on took 40 s (the median of the 80
scraped ones). A search that finds no template draws none (the live view shows
only drawings keeping every rule), so now a passing template of the fitter's
waits only until 30 s while the exact search has drawn nothing, then goes out
with "Still looking for a version exactly as the picture …"; the exact search
goes on to its minute, and its template, should it find one, comes as the
second choice (worker-controller.js `EXACT_UNDRAWN_SECONDS`). Once it has
drawn, the fitter's template waits until 40 s as before.

On the juleflet pictures 94 then show the exact template first and 16 second;
of those 16 the fitter's is the closer to the true design on 9. Exact templates
drawn late are mostly found on the rounded outline after the traced one failed.
(Timed while other jobs loaded the machine 8-45: the benchmark records when the
exact search first draws, and `tmp/e2e/topo/waitrule.mjs` replays the rule for
other limits: 20 s would show 91 first, 40 s 104.)

The 80 scraped photographs then take 30 s at the median (40 s before), the
same 46 passing, 8 with the exact template first and 4 more with it as the
second choice (8 and none); the 44 web photographs 14 s (15 s), 38 passing, 5
and 3 (7 and none). At 20 s the scraped median would be 20 s and the juleflet
pictures would show 91 exact templates first: 30 s keeps the exact template
first where it is drawn late, mostly on drawings, for 10 s on photographs.

With the start capped at 3 s (below), the exact search draws sooner, and on a
rerun 20 s, 25 s and 30 s showed as many exact templates first (91 juleflet
pictures, 14 scraped photographs, those 14 up from 11 with the cap); so the
limit is 20 s, and the scraped photographs take 22 s at the median.

## Photographs the exact search could not start on (2026-10-26)

Of the 66 scraped photographs found as hearts, the exact search could not
start on 24: 13 whose traced outline meets opposite sides of the square
unevenly, and 10 (six hearts) whose crop reaches past the picture, which the
exact search refused outright (it kept no weights).

- **Pixels the photograph does not show.** The six hearts miss 0-0.6% of
  their square (a corner past the picture's edge), the four instruction sheets
  7-18%. With at most 2% missing (`exactWeights`, engine.js) the outline is now
  traced with those pixels taken from the nearest shown one
  (`fillUnobserved`, raster.js), and the template judged on the shown ones.
- **Sides ending unevenly.** A slit of one paper runs from the top to the
  bottom, so a weavable outline meets them as often (and the left and right
  sides). A crop a little off the square shows a corner's strip on one side
  only, or a lobe's colour along a whole side, and then both pairs of sides
  disagree, which none of the fitter's border repairs (`oppositeBorderSeeds`
  for one pair, `cornerBorderSeeds` for small corner pieces) mends. Now, when
  the trace ends unevenly, each pair of sides is read from deeper inside, at
  the shallowest depths (1-8 mm) at which the tracer's own band finds as many
  colour changes on both (`pairedBorderReading`, border.js), when that changes
  at most the export's allowed error (3%) of the mask; the template is judged
  on the mask as it was.

On the 80 scraped photographs 5 more take the exact template first (03e90,
fe904, 8b555 among the six; 17e0c, 52652), the same 46 passing; their templates
lie 0.7-1.5% from their masks where the fitter's lay 0.3-1.0%, the difference
in the border band read anew, where the photograph's own edge is the one that
cannot be woven. No juleflet picture ends unevenly or misses pixels. Four of
the five are over 1%, where the panel says the heart is only close; so the
page shows a second template first when only the first is merely close
(`isMediocre`, paint/verdict.ts): their fitted templates, the exact one still
offered.

Tried and left out: where the traced search never keeps the model's rules
(13 photographs), an outline traced from the mask smoothed by 1 mm passes 4 of
them within 0.9% given 40 s alone, and by 2 mm 9 of them, but up to 2.8% off;
after the traced search's 30 s it found one in time.

## The start's time (2026-10-27)

The exact search first looks for a start (a grid witness, else a topological
one) for up to a quarter of its time, 6.5 s on a traced outline in Mal. On 160
traced outlines the grid's took 0.07 s at the median and 4 s at most, 19 of 24
topological ones under 1 s (five photographs 4.8-19 s), and 28 found none in
30 s, which then took the whole quarter for nothing. With at most 3 s for it
(`START_SECONDS`, stage.js), on those 28 and the one taking 5.5 s the search
found as many templates (9 of 29) in half the time (10.8 s for 21 at the
median); every other search runs as before.

## Finding the corners faster (2026-10-27)

On the live site a photograph's corners took 3-12 s (six photographs, the
first with the paper model's download). Most of it is the colour locator
(core/crop.js and locator/): up to seven colour models upright, then turned,
each fitting the heart's shape by Nelder-Mead; 0.7-31 s a photograph, 2.7 s at
the median of 40, while the paper model takes about a second.

- It runs in a worker of its own (`crop-worker.js`, worker-controller.js)
  beside the paper model, and the learned crop starts while it still works,
  since the selection asks for that crop whenever the colour crop falls short,
  which is mostly when it is slow. In this thread, where the colour answer is
  already in, nothing starts early. A worker that cannot start or fails runs it
  here as before. The worker starts when the import dialog opens, as the paper
  model's download does: a worker started from the busy engine worker only got
  going once that was done, so beside it gained little in the browser.
- Its arithmetic without arrays: the palettes' per-pixel loops, sorting as a
  typed copy (`trimMean`, `quantile`), the square close as two sliding passes,
  and turned fields with one set of weights for all ten channels. Every field
  is bit for bit the same (four palettes on 30 photographs, the turn on random
  fields), as is every answer on 40.

Node, 12 photographs, alternating: 115 s before, 68 s now, the same corners,
status and method for each. The live import dialog on six of them: 44 s before
(3.1-12.2 s each), 28 s now (2.8-6.8 s, the first with the paper model's
download).

The orientation search stops at a 2 s deadline between hypotheses, so a slower
or busier machine can try fewer of them; that was so before as well.

## Seams in a heart carried over from Tegn (2026-10-27)

Where a cut of each family runs along the same seam, the rasterizer drew the
sliver between the two drawn cuts as lines and dots of the other colour (Uret:
174 cells a cell wide at 400 px; rasterize.ts `SEAM_GAP` now leaves such pairs
of crossings out). Mal's exact search alone on the Tegn → Mal pictures of the
12 hearts that changed most: david4 0.55% -> 0.22% from its design, 5star
0.18% -> 0.14%, six the same (fiskeskael 0.39% -> 0.42%), four finding none
either way (circle, balls, kogle, davidsstjerne-circ), and venus losing its
template (0.36%, then the fitter's 0.69%): the line through its cross, the
artefact, lay where the designer's seam runs and the search cut along it. The
juleflet pictures, drawn and imported, never had it (venus takes the fitter's
there too). Uret's fitter template is no better (1.01% -> 1.05%): its holes
are at the junctions of the bands and the ring, which the exact search proves
need 16 hidden segments that cross there, while the designer routes them round
an inner circle through the middle, far-apart positions the search never
offers as a hidden segment. Its traced outline also broke the symmetry ties:
the corners of one junction come out 9 and of its mirror image 2 (corners in
exact/outline.js cluster greedily from one end), leaving two positions a tenth
apart with an image between them. An image within `MERGED` of a position now
takes the nearer (symmetry.js `positionMaps`; two taking one image still fail).
On the Tegn pictures of the seven hearts that went untied, the circle stays
tied and proves its 16 crossing segments, and lilje2 finds a template (0.74%
from its design, none before); on their 14 juleflet pictures balls now stays
tied, and every result is as before.

## Uret's exact template: long cuts, steady corners, no start under ties (2026-10-27)

Uret's own template, read on the traced outline of its Tegn picture
(`tmp/e2e/routes/theirs.mjs`, `diag.mjs`), has 16 hidden segments, each a
straight route the rules allow; four of them cross the inner disc, a face one
edge bounds, a quarter of the way round it. Given as the start, the search
finds a template keeping every rule in 16 s. It never offered those four: a
position keeps its 2-8 cheapest partners and its cheapest on each other edge
of its face, and the disc has no other edge. It now also keeps the cheapest
along its own edge in each band of distance doubling from 1 unit (candidates.js
`prune`).

That alone did not do: the inner circle traced with 42 corners, pixel steps
turning 30-50 degrees and back 0.06-0.09 units on, each a position with eight
images under the ties (128 positions on the coarse grid). A corner must now
keep its turn within 0.15 units either way, and reads alike from either end of
its edge (outline.js `corners`; on the reference solver's eight fixtures, the
corners of its own rule). Then a start that is not the template's still spreads
its switches where no template has them, each with its images: on the juleflet
picture 320 positions instead of 128, 74k rows, crossing cuts after 30 s. Under
ties the search therefore first takes the fine grid (0.75 apart, 4 partners)
from no start, for half its time, and keeps that template when the export would
take it; otherwise the coarse search from the start runs in the rest, and the
one breaking fewer of the model's rules is kept (stage.js `BARE_SHARE`).

Uret: its Tegn picture gets 16 hidden segments under all eight symmetries,
the fewest and shortest its grid has, in 4.9 s (no template before; in the browser,
Tegn → Mal → Find snit in 7 s, "0.0% different from the mask"); the juleflet
picture in 7.7 s; the photograph still none. The 130 juleflet pictures, the
exact search alone for 40 s: 89 templates the export takes instead of 86
(5-3-heart, amy-pattern, circle, flyvendegaes, jul and lilje1 gain one;
hjertekloever, jul-shot and origami take the fitter's now). On the 81 both
find, 0.147% from the mask at the median instead of 0.160%, 1% more hidden cut,
6.0 s instead of 5.5 s; overall 9.6 s instead of 8.6 s at the median, the
slowest change fisk-shot 12 s → 37 s and stjernegitter 15 s → 39 s.

Tried and not used: either change alone (the corners alone lose hjertekloever
and slow three asymmetric pictures to 37 s; the bands alone leave Uret's cuts
crossing); the steady corners only under ties (as many templates, different
ones); the start's switches on the symmetric grid (it puts 10 on one short
edge); no start on the coarse grid; corners projected onto curved edges, a
denser grid on the circle, cheapest partners in bands along other edges too.
Each of the grids solves one of the Uret pictures and loses another: a fixed
grid has the positions a cut needs or not, and pruning to the nearest partners
throws different ones away as it gets denser.

The earlier exact search in Python (`julehjerte-solver-initialization`,
2026-10-23) found Uret 14 hidden segments where its designer's template breaks
the turn and crossing rules, but on the design's own curves, read with
touchings at two of the eight junctions; the picture has none, and 16 is its
bound.

## The exact template's cuts as a designer draws them (2026-10-28)

Opened in Tegn, Uret's exact template had a node every pixel along its
outline (338 cubics a cut): the search's drawing on the mask's own edge
(refine.js) followed the pixels' staircase in a polyline, every leg a cubic,
and Mal's converter cannot simplify that without moving pixels, which its
fidelity check forbids (a smooth curve passes within a tenth of a pixel of so
many pixel centres that any refit flips a tenth of a percent of them).

The search now draws that edge in a few cubics (refine.js `smoothEdges`): the
mask's sub-pixel edge averaged along the outline over a Gaussian of at most 3
pixels (it waves with the staircase, 0.6 pixels at most on Uret's ring, 0.23
after), never across a corner, then fitted within 0.75 pixels by least squares,
split at the corners and switches and nowhere else unless the fit needs it.
At a corner both control points are free: a tangent estimated from its few
pixels was 8-16 degrees off and took three cubics where one fits. Each switch
and corner is a join, at its exact arc, so a run between two switches is whole
cubics and a hidden cut ends at a join. Under the ties' symmetry each orbit of
edges is fitted once, on its points averaged with their images', and drawn as
that fit's images; an edge that is its own image splits where its images do and
at the middle, on the axis where a switch lies across it (fitted one by one,
5star-shot's two sheets came out 0.2 mm apart and no longer had one template;
now 0.03 mm, nearer than the traced polyline's 0.07). The converter joins the
pieces of one cubic back exactly (simplifyCurves.ts `joinSplitCubics`): the
engine's cut graph splits a cut wherever the other sheet's crosses it.

Where the drawing with every edge smoothed breaks a rule, orbits are smoothed
one by one on the traced outline (boelgebrud: 27 cubics a cut; on the pixel
steps instead, 262), or where none passes so, on the pixel steps
(triple-heart-shot, whose narrow tip only those clear). The smooth drawing is
taken when it passes where the traced one does not, else when it keeps the
rest and lies at most half a percent further from the mask.

Uret: 12 cubics a cut instead of 338 (every arc one cubic, the inner ring's
quarters too), 0.21% from the mask instead of 0.0%, all eight symmetries kept.
The 130 juleflet pictures, the exact search alone for 40 s: 94 templates the
export takes instead of 89 (fisk-kors and its photograph, jul-shot, juletrae,
origami and permo-kroge gain one; drageskael-shot, at the deadline, passed
again on its own), 8.6 s at the median instead of 9.6 s; the smooth drawing
taken for 87 of them, at 0.31% from the mask at the median instead of 0.15%,
with 18-30 cubics a cut for most (puslespil 66, drageskael-shot 84, where the
fallback keeps traced edges). The templates that fail Tegn's own checks in
conversion are the 18 the export rejects anyway, as before.

Fejlternet (the gallery's): its picture is symmetric under both mirrors and
the diagonals, but its hidden cuts wheel round the middle square, the
designer's and every other template's, so under all eight ties the search
proves in seconds there is none, and Mal gave the fitter's rounded corners.
Where the requested symmetry's ties leave no template, the search now tries its
turns alone (stage.js `turnsOf`, a quarter turn here): 12 hidden segments, the
designer's count, 0.25% from the mask, in 16 s; its rows show as not held, as
a pinwheel has no mirror.

## The gallery's hearts through the whole exact route (2026-10-28)

All 83 gallery hearts as Tegn hands them to Mal, through the page's exact
route (the traced outline, then tips rounded): 69 get an exact template. Two
were bugs: flower's topological start put a position at an open edge's very
end, where the normal into its side had one leg to average, and the search
crashed (now 5 hidden segments); stjernegitter's rhombi meet in touchings
traced 0.06 pixels apart, joined by tiny curves either way round, and merged
into one point of eight curves, which no structure has: such closed slivers
now go (exact/target.js `withoutClosedSlivers`; of 213 masks only this one
has them; 15 hidden segments). The 14 left to the fitter: the five text
hearts, balls, davidsstjerne-circ, hjerte-i-hjerte-i-hjerte, khatam, venus,
santa, roed-blomst (the designer's template keeps only the diagonal mirror,
and on the traced outline its petals' notches come back on themselves; now
exact, below),
mor-og-barn and triple-heart (a wedge where the outline meets the square's
side at a shallow angle, which 0.8 mm of rounding does not clear).

Harder pictures (tmp/e2e/cubic/gen.mjs): thick drawings of planar cubic
graphs, Voronoi diagrams of random sites, plain and under the square's
symmetries. Of 80, 30 get an exact template (22 s at the median); 19 end
unevenly on opposite sides, which no template reproduces; a plain cross of two
bands has none under any of its symmetries, nor untied in 20 s.

## Part of the symmetry, and the fitter's template as a start (2026-10-28)

Rød blomst (roed-blomst) in Mal gave the fitter's template, with a white
square in each corner where the picture is red. Its mask has all eight of the
square's symmetries, and under them it has no template: the search proves so
in 20 s (3 s looking for a start, then the fine, coarse and middle grids
finding none). Its designer's template keeps one diagonal mirror, while the
fallback tried only its quarter turns (fejlternet's pinwheels), under which it
has none either. Now, after the turns, one mirror alone is searched (stage.js
`subgroupsOf`, the one making both papers alike first), each with a share of
the time left; under all eight, the two diagonals' templates turn into each
other, so one is enough. Searches on the outline with tips rounded keep to a
part that worked. Rød blomst: 7 hidden segments under its diagonal, 0.17% off
the mask, in 42 s, found on the outline with tips rounded (the turns use up
the traced outline's time). Giving the traced outline's fallbacks the rounded
outline's time as well found it there in 47 s, but lost permo-cirkler: its
template exists under all of its symmetry only once its tips are rounded. On
the 16 pictures where the full symmetry has none, two more get an exact
template (roed-blomst; permo-cirkler-shot now 0.31% from the mask, not 0.55%),
and none fewer.

On the page the fitter's template still goes out first, at 20 s (0.7%, its
corners), and the exact one came 42 s in as the second choice, shown only had
the first been merely close. An exact template now takes the place of the
fitter's it follows unless it is merely close itself: the fitter's only stood
in for it. And it is held to the rows its part of the symmetry carries (engine
`held`, the group its ties generate in the app's names; paint/symmetry.ts
`rowsWithin`): Rød blomst's to "de to lapper spejlet", where the converter,
held to all three rows, had dropped every one. The panel names the rows kept.
The engine's own symmetry report still says none: its control points pair up
cut for cut, and the exact template's cuts are split into different numbers
of curves (28 and 29).

The fitter's template as the exact search's start, in the fitter's worker once
the fitter is done: of the 28 gallery and juleflet pictures left to the
fitter, it saved one in what was left of the minute, and none even with 50 s.
On 21 of them the fitter's template is no start of its own: its reading has no
completion, or strays a third of the way from the traced outline. Where it is
one, HiGHS does not repair its rule breaks in time. Not used.

## The outline made symmetric (2026-10-28)

A symmetric mask is traced into an outline only roughly symmetric: the tracer
fits each curve from one end, and a corner on one side is sampled a pixel off
its image on the other. Under the ties, positions on one side then find no
image on the other ("not a bijection on the positions", balls,
davidsstjerne-circ), or a curve none (amy-flowering, alhambra-shot), and the
search ran untied: its cuts broke the rules there, or took more hidden
segments than the symmetric ones (amy-flowering 32, not 12). Now such an
outline is first made symmetric (exact/target.js `symmetricLines`):

- its chains between junctions, each matched with its image under every
  element within 0.2 units, and each orbit's mean taken on its first chain's
  own vertices (each the mean of its nearest points on the others carried
  back), so a corner stays one corner and sharp;
- a chain an element maps onto itself made exactly so: its half up to the
  mirror's axis and that half's image, or a ring's arc between two crossings
  of axes unfolded mirror by mirror, or one turn of it turned round;
- corners nearly touching joined with all their images or not at all
  (`joinNearTouchings` with `symmetry`): of two pairs as near, the first took a
  corner from the other's image;
- a vertex two curves pass through, a junction.

Averaging along arc length, the first version, cut every corner a little off
its image into two (a star's points; a notch on a diagonal) and lost the
position where the mirror crosses it (positions.js now keeps a mirror's
fixed point off a corner beside the axis). Made symmetric always, on the 109
juleflet and gallery pictures with ties, it found as many templates but
other ones where the traced outline held the ties already (hermanngitter-shot's
failing the paper, hvirvel's of 12 hidden segments where 8). So it comes only
when the traced outline is not symmetric enough (stage.js `even`): 98 of the
109 exact as before, the same median distance from the mask, 773 hidden
segments where 863, a median of 11.8 s where 13.3; alhambra-shot 25 hidden
segments to 8, amy-pinecone 36 to 8, amy-flowering 32 to 12, glaskuppel-shot
24 to 16, kogle in 18 s where 50.

Balls and davidsstjerne-circ keep their ties now, and have no template under
them (balls' under all eight, davidsstjerne-circ's under its diagonal and half
turn), nor one found under part of them in the time: the fitter's still.
Balls' designer keeps all eight; from its template the model still breaks two
rules (a slit 2.4 mm from the square's side, turns of 177 degrees).
Davidsstjerne-circ's designer keeps the diagonal alone, and its template on
the traced outline breaks 27 of the rules even untied.

Where the tips rounded by 0.8 mm fail too, the outline rounded everywhere by
twice as much gets what time is left (engine.js, `rounded: 'wider'`): of the 26
juleflet and gallery pictures left to the fitter, mor-og-barn now has an exact
template, 0.52% from its mask in 32 s (0.8 mm left its chin and the child's
nose closer than a slit may come), and dagognat-shot one 2.0% from it, which
the page shows only after a fitted one 1% or more off.

Triple-heart's slit came too close to itself where its outline meets the
square's side at a shallow angle: the border band, read 1 mm in, squared the
outline there again after the rounding (2 mm of rounding passed, 2.2% from
the mask). A rounded outline now has its band read first (exact/raster.js):
triple-heart exact, 0.24% from its mask in 14 s, and mor-og-barn 0.35% with 5
hidden segments where 0.52% with 9. Of the 28 pictures taking a rounded
outline before, the same templates (roserude in 26 s, not 11).

## Where the hard pictures stand (2026-10-29)

The generated Voronoi pictures ending evenly (tmp/e2e/cubic/fair, 108): 60
exact where 50 on 10-28, none lost; those exact both times in a median of
5.4 s where 8.4, as close to their masks. The gains are mostly two mirrors
(d2), where the traced outline missed its ties. Turned four ways (c4, 6 of
18) the app asks only for the half turn, and tied to all four turns these
fare no better: three have none, the rest break a rule (two cuts of one paper
crossing beside a junction of three bands).

Of the 23 juleflet and gallery pictures still left to the fitter, given the
traced outline 50 s alone, venus (0.20%, its first template passing the
paper) and god-jul pass; the paper retried into the rounded outline's time
does not (venus's retry breaks a rule). The rest break one rule or a few,
each its own way (tak: a hidden cut ending at a touching of two checks, the
cuts through it 0.8 mm apart).

## Legs and nodes in Tegn (2026-10-29)

An exact template opened in Tegn had, on 30 of the 72 gallery hearts with
one, a leg at the end of its cuts: where a curve meets the square's side, the
border band (read 1 mm in) leaves a stub straight onto the side, and the cut
followed it with a hook and a millimetre-long cubic (282 of the 1218 cut
ends). The same stub made a smooth drawing come too close to itself there, so
the template kept its traced drawing, a node every pixel (permo-draaber 98
cubics a cut, boelger 88, ni-hjerter-i-tern 54). The smooth drawing now drops
a corner within 1.7 mm of an end on the side and draws the edge straight on to
that end from 0.5 mm before it (refine.js `SIDE_LEG`); the search's outline
and so its templates stay as they were. And a smooth drawing is taken with
up to a quarter more hidden cut as the weave shows it (a step at least): it is
the same solution, whose cuts beside a junction run closer when smooth
(amy-pinecone 9 steps to 11 and 0.86% from its mask to 0.52%).

On the 83 gallery masks: the same templates, kinked ends 282 to 67 (on 9
hearts, not 30), pieces under 1% of the square 2118 to 771, 20% fewer cubics
and none with more (boelger 10.5 a cut, ni-hjerter-i-tern 16, permo-draaber
14). On the 143 juleflet and gallery pictures, as many exact (one, then the
other, of two near the minute's end missing in a run with two at a time,
each exact alone: roed-blomst takes 41 s). Rounding the outline itself near
the sides, tried first, cost hermanngitter and fisk-shot their templates.

Rounding widths tried for the 24 pictures left to the fitter, the traced
outline's search alone (25 s each; the engine rounds by 3 pixels, 6 for the
last way): 2 pixels passes khatam (0.7%, 0.6% for its photograph), 4 pixels
hanefod-shot (1.0%), dagognat (1.3%) and permo-kroge-shot (0.6%); balls,
davidsstjerne-circ, santa, venus and the text hearts pass at none. They need
5 to 20 s each past the 40 to 50 s the stages before them use: given 30 s more
for the exact search alone, one pixel more and one less in turn took only
dagognat (1.3%) and permo-kroge-shot, which flips between runs, for 30 s more
on every picture that still fails. Not used.

## The designers' hidden cuts, and the coarse grid after the fine one (2026-10-29)

Hidden stretches measured by the weave itself (both sides of a cut the same
colour, 3 mm or more) on the gallery's exact templates and on the designers'
own, converted to cut geometry alike (tmp/e2e/even/hidden.mjs): of 72 the same
count on 61, more on 10 (boelger, ball, glaskuppel, ramme, squares, fisk,
roed-blomst, ...). Ramme's designer has none, where ours bridged the four
inner corners of the frame with hidden chords: under ties the fine grid from no
start (0.75/4, tried first) proves 4 its best, and the coarse grids (3/2, 1.5/4)
find 0. A template with more hidden segments than the lower bound now has the
coarse search too, in the time left, the better kept by the export's own rank
(stage.js `COARSE_AFTER_BARE`). On the 143 pictures: none lost or worse, hidden
segments down on five (ball 8 to 4, drageskael-shot 16 to 8, g-fejlternet 16 to
12, juletrae-shot and permo-kroge-shot to none), ramme's template 22 cubics a
cut to 9; but 15% more time (circle 6.7 s to 28 s, amy-pattern 14 s to 40 s,
with the same templates): the coarse search usually only confirms the fine one.
Capped at 10 s it saved little (its set-up and both stages remain) and lost
drageskael-shot's gain.

Also measured for hidden cut (nothing changed): without symmetry the coarse
(3/2) and finer (1.5/4) grids from a topological start give the same hidden
count on 33 pictures but boelgebrud-shot's (8 to 7, still breaking a rule); and
the outline rounded by 3 pixels instead of the traced one gives less hidden
cut on 2 of 41 passing pictures (circle 16 to 8 segments, simple-5star-shot
220 to 133 mm), more on 26 and the same on 13, so choosing the better of the
two would pay twice the time for two pictures.

## Near misses repaired as the export repairs them (2026-10-29)

The export repairs a template's short returns (repairFinal: cuts that come
back within 1.5 mm of themselves moved apart, 0.4 to 3.3 s) only after the
exact stage has accepted it, and the stage judged a template by what it was as
found: a template whose one broken rule was such a return went to the fitter
(hanefod-shot, khatam, triple-heart). Now, when every stage has failed, the
rejected templates whose only issue is a short return (the two nearest their
mask) are repaired, 4 s each, and the first to pass the export taken
(engine.js `returnRepaired`, a last resort: first, it took the traced
outline's 8 hidden segments for stjernerogkors' 0 from the rounded one's).
Of the 24 pictures that ended on the fitter's template, hanefod-shot,
khatam-shot and g-khatam are exact (0.43%, 0.16% and 0.22% from their masks,
the fitter's for khatam 0.7 to 1.5%), at 49 to 54 s; none lost on 143. Khatam
(without its crop-shot) has more than a return broken, tak crossing slits,
which repair does not mend. The paper's repair (repairFinalPaper) does not
apply the same way: venus' template, keeping every cutting rule, fails the
paper check's floating-core test on the lattice, and that repair looks only at
the polygon offsets (its own audit says "pass", it returns the template
unchanged in 0.6 s however long it is given), so it cannot mend it; the
search's own paper loop (narrow paper around the doubted spots forbidden, three
tries; six gave the same template, the loop ending on its time or on no spot
left to forbid) is the only repair there. Without its symmetry ties venus
does not pass either (g-venus, venus and venus-shot each end with a cutting
rule broken, the inter-slit clearance, where tied one fails the paper), so
searching untied and correcting the symmetry afterwards would not rescue it. Stjernerogkors and drageskael-shot flip between
0 and 8 or 8 and 16 hidden segments between runs of the same code (HiGHS
time limits), which is why comparisons here are repeated alone.

The traced outline's budget for the exact search alone (30 s of 50) at 42
instead: on the 50 pictures that end on the fitter's template or pass only
with the outline rounded, 27 exact where 30, none gained (god-jul's traced
search passes the cutting rules and paper at 42 s alone, 0.56% from its mask,
but its template loses a region of the lettering, which the export refuses) and boelgebrud-shot, david4 and circle-shot lost to their rounded
outlines' time. Kept at 30 s.

Tak (the lettering, 12 hidden segments, 31585 rows) ends with two hidden cuts
of one paper crossing (edges 49 and 127), which the model's lazy check knows
(it covers hidden against hidden) and has paid for elastically; 60 s gives 10
rounds and 150 s 15, each of about 10 s adding one more embedding row (13 of
them) and no clean alternative. The background there is a face with several
holes (the letters), the same shape as the Voronoi near miss, whose conflicts
the model finds one a round; every set up front, or a direct encoding of faces
with holes, would be the next step. Tried the first: every pair of chords in a
face with holes that cannot be drawn together as a row up front (931 rows for
faces up to 400 candidates in 0.2 s, 2048 for the 728 of tak's background in
5.5 s): the lazy embedding rows fell from 8 to 4 in 60 s, and tak still ended
with the crossing; the sets left are 5 chords in a face of 4 cycles (28 of
them in 80 s), which cannot be listed (728 to the fifth). Only an encoding of
such faces in the model (as the annuli of one hole have theirs) would do. Dropping
the chords between two different holes of such a face (the ones whose winding
looked like the trouble) changed nothing on the Voronoi near misses and made
tak worse (22 hidden segments, the same crossing): their conflict sets are of
chords from the outer boundary too. The encoding that works (exact/model.js, the `multi` option of
ExactModel). The alternation of segments from the outer
boundary to different holes, walked along the boundary as an automaton: when
hole z appears again, each hole that appeared since z's last appearance is
closed; a few variables per position and pair of holes, rows that only force
them up from the used segments, so the smallest are the true ones (the start's
values are filled in too). With it, the sets that mix a segment between two
tokens of one cycle (which splits the face, each other cycle on one side, a
bit for which) and segments joining cycles are tied to that bit, summed per
segment and cycle (big-M) instead of a row for each pair: on the Voronoi
near miss (tmp/e2e/cubic fair k6 w30 seed 47) no lazy embedding rows at all, 3
rounds, a passing template in 18 to 20 s, 0.16% from its mask (without: 24
rounds, over 60 s, one rule broken; fixture voronoi-holes-mask.json and its
test, which fails without the option). Now on by itself for small models (ExactModel `multi: 'auto'`, true forces,
false disables): at most 10 000 rows when the rows would be added (the near miss's
is 6 000). Measured on a quiet machine, load 6: of the gallery's pictures with
such a face, squares, david4, permo-cirkler and davidsstjerne-circ (with their
crop-shots) are unchanged within a few seconds (a loaded machine had made
david4 look like a gain); on the 108 generated pictures ending evenly, 60 exact
before and 61 now: gained f-none-k6-w30-s47 (0.16%), f-mx-k3-w30-s1 (0.12%),
f-c2-k5-w20-s3 (0.57%) and f-mx-k5-w30-s5 (1.0%); lost f-c4-k3-w20-s3 and
f-mx-k5-w30-s2, whose templates were 2.4% and 2.2% from their masks, the
search with the rows ending on one 3.2% that the export refuses (a third,
f-tr-k5-w30-s11, is the fitter either way); time 770 s to 786 s over the 57
exact both. Earlier, always on and without the size limit: the added
variables slow the big faces (hermanngitter-shot 28 to 43 s, khatam-shot's
model doubles to 41k columns and finds nothing; origami-shot's loss was
noise), 6 pictures lost for 1 gained of the 143; as a retry after a failed
traced search with four or more lazy embedding rows, it takes the rounded
stage's time and loses dagognat-shot, david4, g-khatam, khatam-shot and
lilje2-shot to gain none of them (the gain is on the generated pictures); and
tak, with 728 candidates in its face, still returns nothing with it (35k rows,
no first solution in 90 s). A face-size cap on the extra variables (1500) is
in, as is the 10 000-row limit above: the larger models are left as they were.
A check that the rows do not exclude a valid solution on a big face: tak's
designer's own template as the start, with the rows forced on (92 951 rows,
21 483 columns): as feasible as without (the template breaks one of our
rules, penalty 1, either way; nothing the rows add), so tak's silence with
them is the search not finding a first solution in the time, not the rows. Nor
is it the start: with the topological search for a start witness given 10 or 20
s instead of 3, tak still has none ("ran out of time") and ends the same.
The start search is a SAT problem in JavaScript (exact/topology.js) with the
same one-conflict-at-a-time loop for faces with holes: on tak it goes through
about 3000 lazy iterations in 30 s (sets of 2: 508, 3: 1163, 4: 1047, 5: 282)
and never returns a witness, at any number of switch slots, in 90 s (the near
miss takes 1.8 s). The exact model's rules for such faces as clauses up
front (two segments within one cycle whose ends alternate; the automaton
around every cycle; the sides of every other cycle for a segment within one;
the order of every three segments between two cycles, its orientation set
by the exact embeddability test, for pairs of at most 90) bring the lazy
sets down to 170 in 90 s, and a witness appears for the first time: at 73 s
with 4 slots, 41 segments where the bound is 10, which is no use to a start
given 3 s. The conflicts left are mixed sets of 3 to 5 segments across
several cycles; not kept (the patch is not in the repository).

What the conflicts are, found by
printing the sets (face of 3 cycles, 69/22/28 tokens): every set is four
segments from the outer boundary to two different holes whose outer ends
alternate hole 1, hole 2, hole 1, hole 2 around the boundary (positions 24,
49, 61, 70), which cannot be drawn. Two encodings tried for faces with holes:
the annulus rows for every pair of the face's cycles (sound: any two cycles
bound an annulus), embedding cuts 5 to 2 on tak and 30 to 24 on the Voronoi
near miss; a bit per same-cycle segment and other hole for which side it lies
on, with rows tying the segments that join cycles (15k rows instead of 6.5k),
embedding cuts 23: neither reaches the alternation, which a pair of segments
to one hole makes as a separator. Listing the alternating fours explicitly is
out of reach (over 200 000 for each of the two faces); what is left is an
encoding aggregating them (a region label per gap of the outer boundary and
which holes may share a region), not built. Ending a round at the
first improving solution that breaks a row not yet in the model gave 33 rounds
instead of 26 on the Voronoi near miss, tak 10 instead of 9, both with the
same violation left: a new conflict only exposes the next. Nor
do the rounds get quicker with HiGHS's options: tak's runs take 0.8 to 11.7 s,
7 to 11 s with presolve off, the same with the heuristic effort at 0.01.

## Rough masks traced from the mask opened (2026-10-30)

A mask with wobbling edges makes the exact model grow with every wobble (the
tracer keeps each as a corner): at 40% of the boundary pixels flipped the
median search takes 36 s where 10 s clean, with the mask error from 0.4% to
1.45%. Roughness, the boundary length over the boundary length after opening
by a pixel, is 1.00 to 1.05 for all 143 clean gallery and juleflet masks (the
highest hjertekloever's 1.046), 1.00 to 1.20 at 20% jitter and 1.14 to 1.47 at
40%; 1.00 to 1.59 for 56 photographs' masks, median 1.01, four at 1.10 or more
and none exact today. A mask at 1.10 or more is now traced from it opened by a
pixel (2 pixels from 1.30), the first traced stage's way (engine.js
`maskRoughness`); clean masks are untouched, so no existing result changes.
On the 80 jittered masks: at 20% exact 31 to 34 (none lost, time 612 to 576
s); at 40% 22 to 24 (gained alhambra, dagognat, firkloever-hjerte,
fiskeskael, hermanngitter; lost amy-weave-2, blomster-hjerte, cirkelhjerte,
whose templates were 2.6%, 1.3% and 2.9% from their masks) and the time down
31% (609 to 420 s), the median error 1.33% to 1.27%. The same rounding on the 21
photographs that fail on noisy outlines: 2 pass (1 or 2 pixels), so their
trouble is not pixel noise. The four rough photographs stay with the fitter.

## Painted too thick or too thin (2026-10-30)

27 gallery masks (of 40 grown or shrunk; the rest are not in the 143 compared
with) with every coloured area grown, or shrunk, by 3 pixels (0.75 mm), folded to
their symmetry (tmp/e2e/even/thick.mjs): of the 24 exact clean, 23 stay exact
each way (lost: lilje1 grown, permo-kroge shrunk), the time unchanged (11 to
11 s, 11.6 to 13 s), the median mask error lower (0.43% to 0.25%, no wobble).
The hidden cut is not: median 4 segments clean, 16 grown and 16 shrunk (alhambra
11 to 25, amy-pattern 4 to 36, amy-weave-2 0 to 49, stjerne-ramme 4 to 68, tragt
0 to 81), the same grown as shrunk because for balanced pictures shrinking one
colour is growing the other. Not the search: these designs hold together at
touching corners, and 3 pixels more or less turn each touching into a bridge or
a gap, a different picture needing more hidden cut. Painting that much too
thick or thin costs quality before it costs the template, as wobble does.

## Painted edges (2026-10-29)

A mask painted by hand has wobbling edges. 40 gallery masks with 20% of their
boundary pixels flipped (seeded), then folded to their symmetry as the page
does (tmp/e2e/even/jitter.mjs): of the 24 that are exact clean, 22 stay exact;
hermanngitter and lilje1, both slow clean, lose their template. The mask error
rises (ball 0.44% to 0.86%, amy-weave-2 0.30% to 1.4%: the template cannot
follow every flipped pixel), and hidden cut grows where a wobble forces a
cut across a narrow neck (flyvendegaes 5 to 24 segments, ball 4 to 16,
snowflake 5 to 9); ten others keep their count. So painting a mask that is a
little rough costs quality before it costs the template. Rounding the wobbling
outline first (1 to 3 pixels) does not recover the clean count: hidden cut fell
on some (juletrae 45 to 14 mm) and rose on others (ball, amy-pattern). The
extra hidden cut is the route falling back: flyvendegaes' traced search ends
at 11 segments by 19 s but breaks the inter-slit clearance at two places
(penalty 2, as the near misses above), so the rounded outline's 24 stand.

## Time spent after the template (2026-10-29)

Where a search succeeds, HiGHS takes 80% of its time (the lazy rules' checks
and the paper audit under 5%), and its options change nothing: heuristic
effort 0.3 to 0.9, no symmetry detection, presolve off, a gap of 0.3 or 0.5
gave the same times to 0.2 s on 25 pictures, because what ends a search is its
stage's budget. The length stage kept polishing a passing template's cut
length to its deadline (kogle: found at 8 s, polished 11 s to the same
length). It now stops once the length has not got shorter for a tenth of the
stage (model.js `LENGTH_PATIENCE`, the count stage's being a quarter); on 25
slower pictures the templates, lengths and hidden cuts were the same, kogle
and kogle-shot 6 to 7 s sooner, and on the 143 pictures quick ones took
less (permo-draaber 10 s to 6, ramme 8 to 3, plus3 7 to 3, permo-kroge 24 to
10) with none lost. What holds the 30 to 42 s ones (fisk-shot, jul) is the
count stage, which runs to its budget where the minimal hidden count is not
proven; its patience at a tenth instead of a quarter changed nothing on the 25
(545.0 s in all, 544.9 s): there the first solution keeping every rule comes
late, and until it does the patience does not apply. Jul's count stage is five
rounds of 1.6, 4.3, 4.5, 6.0 and 8.4 s, each adding one or two "geometry" rows
(slits too close, which depend on the papers chosen), the first solution
keeping every rule at 25 s of the 27; fisk-shot has none in its 28 s. Ending a
round at the first improving solution that breaks a new row did not shorten
them (26.1 s against 26.9 s on jul): the time goes into finding the next
improving solution from the incumbent, not into proving the last optimal.

## Why the searches that fail do (2026-10-29)

Of 12 pictures left to the fitter, run for 25 s with the lazy rules counted:
2 to 6 rounds each, on models of 17k to 157k rows, about 10 s a round (balls:
157k rows, 3536 connectivity cuts): HiGHS does not settle a model that size in
the time, which no cut makes faster. The exception is a generated Voronoi
picture (f-none-k6-w30-s47: 3079 columns, 4 hidden segments, 6009 rows) that
ends one rule short (two hidden cuts crossing in a band) after 22 rounds in
37 s and 42 in 117 s: every round finds one more set of 4 chords a face of 3
boundary cycles cannot hold (67 of them, from 212 candidates there, the exact
check `embeddable`), the model's lazy rows for faces with holes (annuli have
variables of their own, faces of 3 cycles none). Adding, with each set, every
variant with one chord swapped for another candidate that also does not embed
(exactly checked, up to 400) made rounds 4 s dearer on 2003 rows and the
result no better. A direct encoding of such faces would help only those, and
none of the gallery's.

## Photographs, 2026-10-29

Of 56 real photographs' masks (tmp/e2e/dev-masks-all) the exact search takes
21 first, in 15.7 s at the median and 0.47% from the mask. The 35 left to the
fitter: 13 end unevenly on opposite sides (the sides' colour changes differ,
2 against 3 on the top and bottom of real-20d44f, and reading them deeper
changes more than the export allows), 19 find no template passing the rules on
a noisy outline or none in the time, and 3 have no outline to trace or reach
the sides. The outline smoothed by 1 mm (given 30 s alone) passes 4 of the 19
(three about 1% from the mask, one 3.7%), none unsmoothed: not used, for 3 of
56 photographs at the fitter's distance and the time on every other one.

## Details lost on photographs (2026-10-25)

The 68 photographs whose template keeps every rule but loses a region of the
motif (`tmp/e2e/fid/`): 303 regions lost in 58 of them, a median of two each,
mostly small, median 11 mm² (a dot of about 3.5 mm), with a core 2-3 mm wide
(174), 3-5 mm (64) or under a strip's 2 mm (64); 215 of them gone entirely, 39
kept but opened to the background. They are not too thin to cut: they are dots
and eyes a template could keep as islands, with hidden cuts out to them, and the
fitter weighs them by their share of the square's cells, a fifth of a percent
each. Its feature start does find templates keeping them (16-fold weight), but
they lose to fewer slits on error, and its routing recovery gets a second or two.

Time is what helps: the fitter alone on 12 of them passed 1 at 30 s, 2 at 45 s
and 5 at 60 s. The minute leaves it 45 s, so it now gets three quarters of it
instead of half (the exact rescue, which rarely runs, takes what it leaves): on
all 68, 13 pass instead of 9, 270 regions are lost instead of 303, 15 lose none
instead of 10, at the same median time and the slowest within the minute (60.9 s
instead of 72.5 s). Putting the lost regions back as discs on the fitter's own
weave and laying the exact search's cuts on that keeps one more star on the
camel, but takes 20-28 s more and fails on other photographs; not used.

## Open

- A pale lobe on a pale background: the paper network barely sees it, and
  neither the colour locator nor the silhouette finds the square. Of the 10
  scraped photographs with no heart found, though, most are no woven paper
  heart (printed templates, drawings, crochet, glitter, garlands of small
  hearts a selection would find).
- Fine motif detail (thin limbs, small stars, letters) the fitter cannot keep at
  this size: shown with Mal's note. Nor the exact search, even from an empty
  start: on the gallery's text hearts it finds nothing passing; TAK's template
  is 0.08% from the mask but its slits come closer than a strip allows.
- The exact search takes few photographs (14 of 80 first and 7 more second,
  7 and 6 of 44: its outline, traced from a noisy mask, is rarely a weavable
  structure in time); it takes three quarters of drawn ones. 13 scraped ones
  break the model's rules until the deadline, on noisy outlines (a smoothed
  trace helps given the time alone, above), and printed papers often still end
  unevenly where reading their sides deeper would change more than the error
  allowed.
- The exact search's hard designs: balls, venus, khatam, santa, dagognat and
  davidsstjerne-circ get the fitter's template (passing, 0.7-1.5% from the
  mask), and the circle's photograph, whose cuts come too close (above).
- The exact template's smooth drawing where its every-edge version breaks a
  rule: which edges, rather than orbits added one by one for two seconds
  (puslespil keeps 66 cubics a cut); a pinwheel's turns as Tegn's Drejet rows
  (fejlternet's show as not held); tiny legs where a cut meets the square's
  side.
- A graph for the exact search fitted to the mask before it runs (the user's
  suggestion, 2026-10-27): steady corners and long cuts along one edge are in
  (above). Still open: positions added where the model's rules break
  instead of a fixed grid, and a heart's own seams as candidates when it comes
  from Tegn (venus).
- Templates: slits that stop inside the square or meet in T-junctions (the site
  cannot represent them), dimension lines drawn along a slit.
- A selected heart among touching neighbours (two of the web scenes): the
  background colour cannot part them. Counting only the band's largest colour
  as background finds a heart there, but the union with its neighbours; so it
  stays unfound.
- Fewer hidden cuts or shorter ones: the exact search takes the fewest hidden
  segments, then the shortest of those, so where the fitter's template places
  them differently it can hide more cut in all (kogle-shot 561 mm against 249;
  28 of the 98 exact templates hid more, 24 less). A second search on the
  finer grid from its template finds the same. (Tulipan's 89 mm against 32
  were its tips: above.)

### Stray specks (2026-10-30)

Six stray discs (radius 2 to 4 px, opposite colour, folded to the picture's symmetry) painted into the 24 gallery masks that are exact when clean: 16 stayed exact, 8 lost their template (hvirvel, lilje1, nemt-hjerte, plus, simple-5star, permo-kroge, puslespil, snowflake), the worst painting error measured. An opening by 1 or 2 px cannot remove them. Now regions of 3 to n²/2500 pixels (64 at 400²) that do not touch the square's edge are taken into their surroundings before tracing (`withoutSpecks`, raster.js; 1 and 2 pixels are checker corners and stay); the roughness rule reads the despeckled mask, and the traced target's source image is the despeckled mask (otherwise the export's feature audit demands the specks back). Result: 24 of 24 exact, median 6.3 s against 11.3 s (clean baseline, other machine load), hidden 3.5 against 4. Only santa (a genuine 44-pixel region) is a clean mask this changes, and it fails either way. Specks touching an edge are not islands and are not removed.

Edge bumps (same day, tools `tmp/e2e/even/specks.mjs` with `EDGE=1`): six discs of radius 2 to 4 px centred on region edges (bumps and notches, folded to symmetry) in the same 24 masks: 24 of 24 stay exact, median 7.0 s, mask error 0.0025, hidden 3.5 (the clean baseline came from an earlier build, so read it as no loss, not as a gain). Islands needed the despeckle; bumps do not.

All three together (20% edge jitter, then 2 px thickening, then six specks, folded to symmetry, same 24 masks): 22 of 24 stay exact, median 18.6 s against 11.3, mask error 0.0065 against 0.0042, hidden 16 against 4. Lost: lilje1 and permo-kroge, the two the thickness test alone loses (touching corners that change topology), so the errors do not compound beyond it. What is left is quality (hidden cut), not the exact template.

Correction on lilje1 (grown by 3 px; why.mjs): not a topology change. The count and length stages both end on the deadline (45 s) with a template of hidden 31 against a bound of 0 that breaks the clearance rules; lilje1 is borderline on time even clean (46.6 s with specks, exact). The loss under thickness is the time limit, so a faster solver for this model size is the lever, not the touching-corner handling.

HiGHS `mip_heuristic_effort` 0 and 0.3 (default 0.05) on grown lilje1: identical (hidden 31, deadline both stages). The report's start line says the topological search (topology.js, the JS SAT) ran out of time, so the time goes there, before HiGHS gets a start; the lever is the start search (the same one that fails on tak), not the MIP's options.

Start search on grown lilje1, instrumented: clean lilje1 starts from the grid search (start "grid", no SAT); grown, the grid search finds nothing and the SAT start (topology.js, 2 extra switch slots, E=16) gets 3 s per call (START_SECONDS, capped by seconds/4 to 1.7 to 6.5 s here) and finds no witness; given 12, 40 or even 60 s it still finds none, so a longer allowance is no fix. The two start methods both fail on the thickened outline; what differs from the clean one is not found yet (candidates: the extra pixels of corner touching change the traced structure, or a witness needs more than 2 slots and the loop never gets past `extra = 2` before its time).

Grown lilje1, hypotheses tested. More switch slots in the SAT start (6 or 12 from the start, 40 s each): no witness, so slots are not the limit. Growth by 1 px: exact, but only with tips rounded (mask error 1.0%, hidden 15 against 5 clean); by 2 px: fails like 3 px. The pattern is a threshold, which fits the other reading: thickening squeezes the gaps between the coloured regions below what a cut can follow (clearance rules), so the grown picture has no weave to find and the fitter's answer is the right one. Both starts failing, and rounding rescuing only the mildest growth, agree. Not a defect to fix; a gap-width warning in the page would be the useful change if wanted.

Shrunk permo-kroge, the other thickness loss: the same threshold. Shrunk 1 px: exact (rounded, mask error 0.8%, hidden 13); 2 and 3 px: no template the export passes (3 px: best template breaks maximum_turn and short_self_clearance, the strips too thin for a cut to turn in). So both thickness losses are pictures whose strips or gaps become too narrow, not search failures; tolerance is about 1 px (0.2 mm at 400 px per 80 mm) before rounding is needed and 2 px before the picture stops being weavable.

Tak's start search with randomised SAT (initial phases and activities from a seeded generator, seeds 1 to 6): no change. Two and four extra switch slots per edge are proved unsatisfiable in under 0.1 s each (the lazy rules close them at once), and the eight-slot search, 40 s on each of four seeds, finds no witness; the heavy-tailed luck that restarts exploit is not there, the problem is the size of the face-with-holes encoding, as the clause-port notes above say. Reverted. The fitter's template cannot seed the start either: its curves lie on the mask, not on the traced outline's edges (readTemplate needs the latter).

Venus' paper failure, traced: the first solve takes the whole budget (count and length stages on patience) and ends with 0.2 s left, so the paper retry loop (search.js) never runs; the in-solve paper audit is the lighter lattice test, and the export's is the final test (lattice plus polygon offsets). Making the in-solve audit use the final test (paperSpots `final`) runs it 3 to 4 times in 25 s (2.5 s each) and each time doubts the same 400 spots per paper (the cap; x 1.6 to 6.7, y 0 to 9.8 of the 12 grid: most of one paper, not a few places) with the same 42 narrow-paper rows, which do not exclude the solution, so the solver comes back with a drawing with the same detached paper. Forcing the fallback nogood (this solution's hidden segments or papers near the spots) when the spots repeat adds one row (43) and changes nothing within the time. A detached paper over most of a paper is no narrow-paper geometry the rows can name; a nogood for it would need the audit's own reason (which cell is cut off, by which hidden segments), and an audit of 2.5 s a call leaves four tries. Reverted; not fixable by rows of the present kind.

Regression run of main after the despeckle (ca3549e4), 62 gallery masks through the page's whole exact route: 58 exact against 56 in the stored baseline (khatam and dagognat now pass, none lost), median 4.9 s against 12.3 s (quieter machine), mask error 0.0026 against 0.0039, hidden 4 against 5. One picture hides more: stjernegitter 8 to 15 segments, a HiGHS time-limit flip of the kind noted for stjernerogkors, not repeated here.

Stjernegitter's 8 to 15 hidden segments checked (full route alone, the core of each commit extracted with git archive and run through full.mjs with CORE): 36 up to b9422039, 15 from dc7c5aa6 (the tiny curves between two touchings dropped) through ca3549e4 and today's main, deterministic over three runs (5.8 s). The baseline's 8 comes from no commit tried, so it was a one-off of that run, not a regression: main hides fewer segments here than it did before dc7c5aa6.

Why stjernegitter is searched untied (its mask is exactly symmetric under transpose and antitranspose, 0 of 160000 pixels differ, yet the search report says "antiTranspose maps edge 38 onto no edge (off by 1.578)", and the evened retry ends the same): edge 38 is the petal loop through (60.72, 39.28) (traced frame, 100 wide), its image the loop through (39.28, 60.72). At the image the small centre star's loop touches the petal exactly (two micro-curves of 0.01 and 0.5 units: curves 59 to 62 and 123 to 126), a degree-4 junction at (4.71, 4.71) in the reference frame; at (60.72, 39.28) the same pixel corner is traced as a notch (curves 120, 121 a pixel step) 0.31 units (about 1.2 px) from the petal, so nothing joins there (joinNearTouchings) and the petal loop stays whole where its image is split in two edges. Asking the ties for the transpose instead gives "vertex of degree 6" at the contact. So the tracer is not symmetric under the transposition at a pixel-corner contact; the mask is. The hidden count of the untied template, 15, is at its own bound (count "at bound"), so what a tied outline would buy here is unknown (the baseline's 8 is not reproducible). A fix would trace such contacts alike on both sides (raster.js/prepareMaskTrace), or join them by orbit when either side joins; not tried.

Stjernegitter fixed (the cause above): the corner test of joinNearTouchings (a vertex counts as a corner where its boundary turns by at least `turn` within the window) had turn 0.8 radian, just above a 45 degree corner (0.785): a petal fitted from one end turned 0.78 on one side of the mirror and 0.79 on the other, so one contact joined and the other did not. Turn 0.7: stjernegitter is searched tied (antiTranspose, rotate180) with 0 hidden segments instead of 15, mask error 0.0044 against 0.0042, 5.2 s against 5.9. Over all 83 gallery masks (full route): exact 73 before and after, none changed status, median time 6.1 to 6.4 s, mask error 0.0024 both, hidden 4 both; only stjernegitter differs (15 to 0). Turn 0.6 and 0.5 gave the same for stjernegitter. Test added to exact-structure.test.mjs (a corner of 0.78 radian touching another joins; fails at 0.8).

Symmetry fallbacks after the turn fix (scan with why.mjs, every mask once): of the 83 gallery masks only fejlternet and roed-blomst search under a subgroup (both known designs keeping only part of their symmetry); of the 128 juleflet library masks (tmp/e2e/jf-maskmode) 118 are exact and only venus-shot is searched untied ("antiTranspose maps edge 11 onto no edge", hidden 21 at its bound 21, 45 s; venus itself is the paper-audit case above). So no other picture carries a tracer asymmetry of the stjernegitter kind.

Venus-shot checked: its mask is exactly symmetric under the transpose (0 of 160000 pixels differ; not under the other mirror) and its outline, built with the symmetry's orbit joins, holds antiTranspose (reference name) with 44 edges. The first search builds the structure without ties (stage.js: `symmetry: even ? symmetry : []`), says "not symmetric enough", and the evened retry, whose outline is symmetric, finds no template in its time (rules violated, inter_slit_clearance, as venus), so the untied search follows. Not a tracer asymmetry of the stjernegitter kind: the same venus problem (no template passing the rules inside the time), seen through the symmetry fallback chain.

The corner-turn change (0.8 to 0.7) over the 128 juleflet library masks, the commit before against main, same script: exact 118 both, no status changed, median 12.7 to 11.9 s, mask error 0.0037 both, hidden 5 both. Hidden segments change in nine: fewer in seven (origami-shot 28 to 10, stjernegitter 8 to 2, hanefod 2 to 0, hanefod-shot 5 to 2, lilje1-shot 12 to 10, origami 8 to 6, stjernegitter-shot 16 to 14), more in two (permo-kroge-shot 0 to 1, stjernerogkors 0 to 8: the picture that flips between 0 and 8 on identical code, a HiGHS time-limit flip). Mask error worse by more than 0.002: none.

Near-touch distance swept (NEAR_TOUCH_MM, raster.js; 128 library masks, the turn-0.7 main as baseline, EXP_TOUCH factor on the 0.6 mm): 0.75x (0.45 mm): exact 118 to 116, hidden in all 810 to 1010, slower; 1.5x (0.9 mm): exact 118 (fisk-shot lost, dagognat gained), hidden 820 to 607, median 11.4 to 9.9 s; 2x (1.2 mm): exact 118 (same two), hidden 548, median 9.6 s, mask error up by 0.0005 or more on nine pictures (lilje1 0.0040 to 0.0052: its petals, the gaps the old comment names, begin to close); 3x (1.8 mm): hidden 543, exact 116 (dagognat-shot and fisk-shot lost), error up on 14. Gallery (83): 2x hidden 424 to 349, 0.9 mm hidden 424 to 358, exact 73 both, median 6.4 to 4.7 s at 0.9 mm; only amy-pinecone's mask error rises by more than 0.001 at 0.9 mm (0.60% to 0.89%, its hidden 12 to 0 at 2x). Taken: 0.9 mm, most of the gain with the smaller drift in the pictures; the checker corners joined are those of the sampled picture, and a gap that wide (0.9 mm) is narrower than a cut needs anyway.

Tip rounding swept (TIP_ROUNDING_MM, engine.js, 0.8 mm; 128 library masks, main with the 0.9 mm near-touch as baseline: exact 118, hidden 610, median 9.9 s): 0.5 mm: exact 115 (boelgebrud-shot, circle-shot, dagognat, david4 lost, fisk-shot gained), hidden among the common 572 to 558, median 9.6 to 9.9 s; 1.2 mm: exact 116 (ball-shot, permo-kroge-shot, dagognat lost, fisk-shot gained), hidden 586 to 570, 9.7 to 11.0 s. Neither beats 0.8 (exact count lower, hidden within a few segments, gains and losses on the same borderline pictures: dagognat, fisk-shot and stjernerogkors move with every change of the run); kept.

Corner turn swept below 0.7 (joinNearTouchings `turn`; 128 library masks, main with the 0.9 mm near-touch as baseline: exact 118, hidden 610, 9.9 s): 0.5: exact 119 (fisk-shot gained), hidden 610 to 582, 9.9 to 10.6 s; 0.6: exact 116 (dagognat-shot and hermanngitter lost), hidden 576 to 557, 9.8 to 12.8 s. Not monotone, so partly noise. Gallery at 0.5: khatam lost (73 to 72 exact), median 4.7 to 7.7 s, fejlternet 12 to 16 hidden: rejected. 0.7 stays.

Corner window swept (joinNearTouchings `window`, max(distance, 0.15) reference units; 128 library masks, baseline exact 118, hidden 610, 9.9 s): 0.10: exact 115 (circle-shot, origami-shot, fisk lost), 11.9 s; 0.25: exact 118, hidden 610 to 610 (five pictures move both ways), 12.9 s. Neither helps; kept.

Length patience swept (LENGTH_PATIENCE, model.js, 0.1; 128 library masks, baseline exact 118, hidden 610, 9.9 s): 0.05: exact 111 (seven lost: circle-shot, origami-shot, permo-cirkler-shot, puslespil-shot, amy-rosette, origami, permo-cirkler), median 17.4 s; 0.2: exact 115 (circle-shot, dagognat-shot, david4 lost), hidden 568 to 565, 11.6 s. Both worse; 0.1 stays. (Run-to-run noise on the borderline pictures near the 45 s limit is a few pictures either way: dagognat, fisk-shot, circle-shot, david4 appear in several sweeps.)

Time is not the lever for the model-size failures: hjerte-i-hjerte-i-hjerte, god-jul, jul-tern and mor-far given 240 s (the whole budget and the traced stage raised to 200 s) all still end with the fitter (rules violated, 224 to 229 s). Hjerte-i-hjerte-i-hjerte's report: grid start, count bound 23 = hidden 23, 2 rounds, 86 geometry cuts, 9400 columns, 27744 rows, startFeasible with 86 elastic rows violated and one uncuttable piece, penalty 103 at 29 s and the same 103 at 228 s (gap 0.9997): HiGHS never repairs the start, so more time buys nothing; the elastic start is either infeasible under the margins or beyond what the MIP finds, and which is not known. The search already runs at the 'tight' margins (outline.js rules: the validator's own, 0.005 against 0.055 for 'default'), so the margins cannot be relaxed further to test infeasibility; telling infeasible from hard needs the start repaired by another route (a CP-SAT solve of the same rows, as the board search used), not tried.

Is hjerte-i-hjerte-i-hjerte infeasible or only too hard for HiGHS? Its final model dumped (11637 columns, 39022 rows, all coefficients +-1, 11464 binary columns and 173 integer slacks; tools tmp/e2e/even/cpsat.py, pbsat.mjs, a temporary dump at the end of ExactModel.solve): OR-tools CP-SAT with every slack fixed at 0 (no rule broken) finds a feasible assignment, status OPTIMAL, in 23.5 s on 4 workers, where HiGHS's penalty stays at 103 through 228 s. So the picture has a template under these rules (as of the lazy rows known at that round; further geometry rows would be added in later rounds) and HiGHS is what fails: the model-size failures are solver failures, not infeasible pictures. The repo's own CDCL (sat.js) on the same rows, encoded as clauses (direct for rows whose k+1 subsets are at most 400, totalizers for the 1251 others): 172k variables, 2.5M clauses, 100k conflicts in 200 s (500 a second), no answer; with totalizers throughout (286k variables) 66k conflicts in 150 s. A faster pseudo-Boolean/SAT route for the start (what CP-SAT's presolve and workers give) is what these pictures need: CP-SAT does not run in the page (no wasm build in the site); candidates are a stronger JS CDCL (preprocessing, cardinality propagators instead of clauses), a CP-SAT worker outside the page, or HiGHS given CP-SAT's solution as the start. Not built.

The repo's CDCL (exact/sat.js) made fast enough to solve a dumped model-size failure. Profile on hjerte-i-hjerte-i-hjerte's model: 89% of the time in propagate, 500 conflicts a second on 172k variables and 2.5M clauses (the cardinality rows as clauses and totalizers). Two changes: watches hold a blocker literal beside each clause (2.6 times the conflicts a second on the same encoding), and at-most-k / at-least-k rows are native constraints (addAtMost, addAtLeast: counters, reasons explained when the analysis asks, counts undone on backtracking; the model keeps its 11464 variables and 44500 constraints, no clauses). With both the feasibility problem (all slacks 0) is solved in 92.5 s, 662k conflicts (7200 a second); CP-SAT with four workers takes 23.5 s, HiGHS never. Checked against brute force on random clauses and counts, incrementally and under assumptions (6000 rounds once, 300 in the test; the first version of addAtMost failed it on repeated and complementary literals), and the existing exact tests. Not yet used by the exact search: that needs the model's rows handed to this solver for the start (the lazy geometry rows added as constraints in rounds), and 92 s is beyond the page's 50 s search; branching and restart settings are the next lever.

Tuning the CDCL on hjerte-i-hjerte-i-hjerte's dumped model (150 s each, feasibility with slacks 0): default (restart base 100, decay 0.95): solved in 94.5 s (662k conflicts); learnt-clause limit 20000 solved in 126 s; restart base 30 and 300, decay 0.9 and 0.99, and the exact search's own start values as initial phases: no answer in 150 s (800k to 900k conflicts each). The run-to-run luck on such a model is large; none of these settings beats the defaults, so they stay. What would: a stronger branching rule or preprocessing (CP-SAT: 23.5 s on four workers), or a portfolio of seeds across workers. The solver change itself (blockers, native counts) is live (deploy of 6e20aa1b succeeded) and used by topology.js only through clauses, which it speeds 2.6 times.

Seed portfolio on hjerte-i-hjerte-i-hjerte's dumped model (random initial activities, seeds 1 to 8, 90 s each): one solves (seed 4, 58.8 s, 495k conflicts), seven do not (560k to 663k conflicts); with the default (no seed) 94 s. So the luck is real but thin: four parallel workers would solve inside 60 s with probability around 40%, not enough to count on. The solver needs a better branching rule or preprocessing (CP-SAT: 23.5 s), not more seeds.

Failed-literal probing before the solve (tmp/e2e/even/pbnative.mjs PROBE=3: each variable assumed true and false, propagated, the failing side fixed): 524 variables fixed in round 0, 27 in round 1, 1 in round 2, 2311 of 11464 assigned at level 0 after 1 s; the solve then takes 115.7 s (827k conflicts) against 94 s unprobed, inside the luck seen across seeds (59 s to over 90 s). Cheap preprocessing does not move this model; CP-SAT's 23.5 s on four workers comes from its portfolio (LP, large-neighbourhood search) as much as its presolve. The CDCL route for the model-size failures stops here: it works (92 s) but is not inside the page's 50 s, and no tried setting, seed, phase hint or probing changes that.

Large-neighbourhood repair from the exact search's start (tmp/e2e/even/lns.mjs on hjerte-i-hjerte-i-hjerte's dumped model: free the variables within a breadth-first reach of a violated row, up to 200 and then 1.7 times more on each failure up to 2841 of 11464, everything else fixed at the start's values, the sub-problem's rows solved with the CDCL, 3 s each): 11652 sub-problems in 120 s, every one unsatisfiable at once, none improved the start (173 rows violated at the start, 173 at the end; the violated rows are small, sizes 1 to 5, mostly at-most rows broken by one; the model has one row of 1714 variables and the next largest 60). A quarter of the model free and still no repair: the start differs from any feasible assignment in many places at once, so local repair from it cannot work, and the repair has to come from the global search (CP-SAT 23.5 s, the CDCL 59 to 116 s). Closed.

Correction to the CDCL probe of the other failing pictures (dumped final models, all columns that are not binary read as slacks at 0 and all coefficients read as +-1): that is valid only for models whose coefficients are +-1. Of the nine dumped models, three are: hjerte-i-hjerte-i-hjerte (94 s), santa (0.1 s, 446 conflicts) and balls (0.5 s, 309 conflicts; 219731 constraints), where any solution is a true solution (rows enforced exactly with the other columns at 0). The six others (god-jul, jul-tern, mor-far, jul-2026, davidsstjerne-circ, venus) carry the big-M rows of the multi-hole faces (coefficients 12 to 294), so the quick answers I first took from them (0.2 to 18 s) were answers to a different, relaxed model and prove nothing.

The CDCL as the exact model's start (prototype, reverted): in ExactModel.solve, when the start breaks rows and the model is made of +-1 counts, the CDCL solves the rows with the other columns at 0 and its assignment becomes HiGHS's start (cdcl.js, model.js; 0.12 s on santa, 0.41 s on balls, startFeasible true). It does not finish the job: the lazily checked rules (connectivity and cycles; tak's and god-jul's 222 'connect' cuts) are then broken by it (start penalty 5 on santa, 40 on balls) and HiGHS does not work them off in time. Run as the lazy loop itself (CDCL solve, ask the model's violations, add the broken rows as counts, solve again, incrementally): santa 2623 rounds in 120 s with 527k conflicts, still 2 rows broken at the end; the first 30 rounds took 6 s. Each round cuts off one assignment's few violated rows, as tak's start search does (about 3000 lazy iterations in 30 s). The lazy rules are the obstacle there, not the solver. What it would take: connectivity as a propagator in the solver (a paper region unreachable from the border is a conflict found by search from the border, with its cut as the explanation: the way SAT solvers treat reachability) instead of rows added a round at a time. Not built; the models with multi-hole faces (big-M rows, six of the nine) need that and a counting version of those rows besides.

Theories inside the CDCL for the lazy rules (prototype on santa's model, reverted): which rows the lazy loop adds in 60 s of CDCL on santa: 3544 'cycle', 802 'connect', 180 'embedding', none of 'path' or 'geometry'. Two theories checked as each literal is assigned (Sat.theory: assign(literal, trail place) -> conflict literals, undo(trail length) on backtracking): (1) loops, each paper's graph (points, the pieces it cuts, the segments used) as a union-find with rollback; an item joining two points already joined closes a loop, the conflict being the loop's items negated; (2) embedding, the chords true in a face tested with the model's embeddable() as each is selected, a failing set shrunk to a minimal one. With (1) the 'cycle' and 'connect' rows vanish (the lazy rows left: 1204 'embedding' in 60 s); with (1) and (2) only 15 to 52 'geometry' rows remain in 40 to 60 s. But the first solve takes 22.6 s and 140k conflicts (6200 conflicts a second) where the same rows without the theories were solved in 0.1 s (ignoring the loops), and the second round (the geometry rows added) did not finish in 17 s: forbidding loops and bad embeddings during the search is the hard part of the problem, and it is hard for this CDCL (the lazy loop's 2600 rounds of 20 ms were also not enough). So connectivity as a propagator is correct but does not by itself bring santa inside the page's 50 s; what is left to try is a stronger search over the same theories (a branching order from the border inwards, so loops form late, or learning clauses over the segments' tokens rather than their literals), not more theory.

The theories again, separately (local branch claude/cdcl-theories-proto, commit 9d2be711; it reached main by a slip of a push from the side branch and was reverted there at once, so main's code is as before: cdcl.js, Sat.theory, model.js cycleItems/embedItems/borderBoost; run with EXP_CDCL=seconds EXP_THEORY=1|2 on a picture's mask through tmp/e2e/even/rep.mjs). Santa, the CDCL as the lazy loop's solver, 50 to 60 s each: loop theory alone (EXP_THEORY=1): the first solve takes 0.5 s and 6256 conflicts, the following rounds 3 ms each (no cycle or connect rows ever again), and the rest of the time goes to 'embedding' rows, one or two a round: 1204 rows in 60 s without finishing. Both theories (EXP_THEORY=2): first solve 11 to 25 s and 84k to 181k conflicts, then geometry rounds of 5 to 30 s, whatever the branching order (the border edges' labels first or last: 25 s and 11 s for the first solve, no pattern); a memo of the embedding test lifts the conflict rate from 6200 to 7200 a second but not the conflict count, so the embedding theory makes the search itself harder, not only slower. Taking several minimal bad sets out of each failing face per round (EXP_MORE=12): 2024 embedding rows in 60 s (against 1204), still not finished. So the loops are cheap to forbid during the search and the multi-hole faces' embedding is the obstacle: it is what the model's multi rows (alternation automaton, big-M) exist for, and those have coefficients up to 294 that the counting solver cannot take. Next step on this line: encode a face's alternation as a native constraint in the solver (pure literals, no big-M), not as lazy rows and not as a per-assignment embeddability test. Not built.

What the embedding conflicts are (santa, loop theory on, the lazy loop's first 1043 'embedding' rows in 30 s, printed from violations()): all in one face, face 1, with three boundary cycles of 204, 30 and 26 tokens (an outer boundary and two holes; the 204/29/26 variant is the same face after a token joins); minimal bad sets of 4 chords (798) or 3 (245), among 120 to 146 chords true in that face when it fails. The 4-sets are the alternation (outer end, hole 1, outer end, hole 2 around the boundary) found earlier on tak; the 3-sets are of the same kind with a shared end. Listing every such set up front is out of the question (hundreds of candidate chords between 260 tokens: the number of crossing triples and quadruples is in the millions), so a face with holes needs a structural encoding in the solver (the model's multi rows are one, with big-M and aggregation columns up to 294), or the embedding test as a theory (which made the first solve 11 to 25 s, 84k to 181k conflicts, above). Every failing picture whose faces have holes (tak, santa, the text hearts: the model's multi='auto' counts a face with holes as 'multi') meets this one face type.

Santa's exact model solved by the counting CDCL, lazy rules included (local branch claude/cdcl-theories-proto, commit after 9d2be711; main's code is unchanged; run: EXP_MULTI_BITS=1e8 EXP_MULTI_ROWS=1e8 EXP_THEORY=1 EXP_MORE=12 EXP_CDCL=200 node tmp/e2e/even/rep.mjs tmp/e2e/gallery/masks/santa.mask.json). The multi-hole faces' big-M rows are implications and convert exactly to clauses: a row of unit terms and a few big-coefficient terms, taken for each of the 2^k assignments of the big terms, says the unit terms are all 0 (a clause per unit literal, guarded by the assignment) or nothing; 2200 such rows become 120k ternary and 4-literal clauses on santa (the alternation automaton and the other multi rows are already +-1 counts). With the loop theory (union-find with rollback, cdcl.js) and the multi rows forced on (model.js multi='auto' is off above 10000 rows, and the bit limit MULTI_HOLE_BITS 1500 would keep a face this large out): the first solve takes 1 s, the lazy rows left are 395 'geometry' and 208 'embedding' over 103 rounds, and the loop ENDS with a start keeping every rule: 84 to 94 s (found: true). Time: solve 83.3 s, the lazy checks 1.1 s, so it is all search; the search runs 7000 conflicts a second. Line profile of the solve: clause watch scanning 39% (the converted clauses; guard literals have watch lists of 300 to 400), counts' scan 8%, enqueue 7%, the loop theory 4%; counts held in typed arrays: +5% only. A grouped 'guard implies none of these' constraint in place of the clauses would take the clause share to a small part (about 1.4 times faster); the budget (50 s) needs about 2 times. Not built. The route is now known to work end to end on a picture with a multi-hole face; what is missing is speed and the hookup (the start into HiGHS, which then optimises the count and length from a start that keeps every rule).

Santa end to end with the counting CDCL as the start (prototype branch, EXP_SEC=420 EXP_TRACED=400 so that the budget is not the limit; 605 s in all): the first model gets its start from the CDCL in 85 s (450k conflicts, 103 rounds), the next stage's model (another grid) does not within its 200 s (761k conflicts, 381 geometry and 247 embedding rows added, no end), and the search ends as the fitter's answer with the closest template santa has had: penalty 1, the only issue 'paper' (the paper audit's lazy rows are not in the CDCL's loop), 25 hidden segments against the bound of 0 (the count stage ran out of time), mask error 0.55%. So the start was not the only obstacle: the paper audit and the count stage's optimisation come after it, and the page's 50 s is a tenth of what this path takes. Closed for now as a route to a passing santa; the findings (loops are cheap to forbid, the multi rows convert to clauses exactly, the first full start 85 to 94 s) stand on the local branch claude/cdcl-theories-proto.

Inverted colours: the 40 gallery masks with the two colours swapped (tmp/e2e/even/inv, each pixel 1 - v): 35 exact both ways, no picture changes status, hidden segments 165 both ways with no picture differing, mask error 0.0028 both, median 5.4 against 5.6 s. The search is indifferent to which colour is which.

Fisk-shot is not a time loss: its start is topology-built and keeps the static rows (startFeasible true, 28 lazy rules broken, penalty 61), HiGHS works the penalty down to 1 (short_self_clearance, 4 hidden segments against the bound of 2) in 9 rounds and 49 s and stops. The counting CDCL (prototype branch) with every slack at 0 answers UNSAT in 0.11 s (1139 conflicts): no assignment keeps every soft rule of this model either, so penalty 1 is the model's own minimum and the template cannot pass whatever the time; the picture needs its outline changed (a tip rounding the search does not try there, or a different outline), not a faster search. The same quick UNSAT test is a way to tell the genuine failures of the borderline pictures (dagognat, circle-shot, david4) from the time losses.

The quick unsatisfiability test (the counting CDCL, all slacks 0, loop theory, on the prototype branch; each model of the search's stages once; 25 s each) sorts the library's failures: circle-shot (4 models), david4 (3) and fisk (2): every model unsatisfiable within 3 to 3400 conflicts, so no template keeping every rule exists at any of their grids and more time would not help (circle-shot and david4 have not been seen to need less than their outline changed: a rounding or another trace). Davidsstjerne-circ-shot (3 of 4 models unsatisfiable, the fourth ran 377 lazy rounds to the 25 s limit) and venus-shot (4 of 5 unsatisfiable, the fourth 254k conflicts to the limit) have one hard model each; balls-shot one model at the limit and one unsatisfiable; santa-shot and khatam only loops still running (182 to 188 and 75 to 83 rounds in 25 s, answers true every round, no end); dagognat's loop stops early (a lazy row with non-unit terms). So the failures split: those where every grid is infeasible (changing the outline is what remains: the search already tries two roundings), and those where one hard model decides, where the counting solver's speed is the lever (santa-shot, khatam, venus-shot's fourth model, davidsstjerne-circ-shot's fourth).

RETRACTION of the two notes above on unsatisfiability (fisk-shot "the model has no assignment keeping every rule" and the library survey that called circle-shot, david4 and fisk genuine failures): the counting CDCL fixes every column that is not binary at 0, which is only right for slacks. These models also carry continuous position columns (model.js line 235, 0 to 2*len, in rows with big-M; 46 to 264 of them in the models that answered unsatisfiable, counted as 'foreign' columns in the prototype), so 'unsatisfiable' there only says there is no assignment with those columns at 0, not that the model has none. They are not proofs. And the runs contradict them: circle-shot (46.7 s), david4 (36.2 s) and fisk (42.5 s) all end exact, with and without wider roundings (3 and 4 times the radius added as last ways: no change at all). What stands: a start the CDCL finds is a true start (it is checked against every row of the model with the columns at 0, as model.broken does: santa, hjerte-i-hjerte-i-hjerte); an answer 'unsatisfiable' is a proof only for a model without foreign columns, and none of the surveyed ones is such. The real reading of circle-shot, david4 and fisk is a time loss: they spend most of the budget on stages that fail (the traced outline, the coarse grids) before the rounded outline that passes, ending at 36 to 47 s of 50, so any early, sound way of knowing a stage is hopeless would turn the borderline pictures into comfortable passes. Not built.

Traced-stage time swept (ALONE_TRACED_SECONDS, engine.js, 30 s of the 50 s search; 128 library masks, baseline exact 118, hidden 610, 9.9 s): 20 s: exact 117 (khatam-shot lost), hidden 585 to 600 on the common set (koelbuer 2 to 16 and koelbuer-shot 0 to 16 worse, dagognat-shot 9 to 2 and amy-rosette 12 to 8 better), 11.7 s; 40 s: exact 113 (circle-shot, permo-kroge-shot, dagognat, david4, fisk lost: the pictures that need the rounded outline, which gets the 10 s left), hidden 569 to 564, 11.1 s. 30 s stays: shorter costs a picture and moves hidden cut both ways, longer costs five.

Estimate for running the traced and the rounded outlines side by side in two exact workers (library, 128 masks; the rounded outline alone = EXP_TRACED=0.05 so the traced stage ends at once; the current main sequential run as the other): sequential 118 exact, rounded-only 114, either passes 118: a pair would find no picture the sequential search does not (rounded-only passes nothing the sequential run fails; it fails circle, dagognat, permo-draaber and stjerne-ramme, which pass on the traced outline). What a pair buys is time: the median among the pictures passing both ways 9.8 s sequential, 11.8 s rounded-only (so the traced outline is the faster for most); but for the 21 pictures that take over 30 s sequentially the rounded outline is far quicker on most: amy-rosette-shot 30 to 5 s, boelgebrud-shot 36 to 7, drageskael 33 to 6, flyvendegaes 34 to 9, permo-kroge-shot 42 to 13, lilje1-shot 35 to 13, origami-shot 36 to 15, snowflake-shot 35 to 10, ball-shot 34 to 23, circle-shot 45 to 27, fisk-kors 48 to 27 (a few are no faster: dagognat-shot 47 to 46, khatam-shot 54 to 55, 5star 37 to 43). With the first exportable of the two taken (the traced one preferred when both are in by then), 118 pictures would come in the time of the faster outline: the same exact count, but 21 pictures at 15 to 30 s instead of 33 to 54, which matters on a machine slower than this one (a picture at 45 s here is a loss at 1.2 times slower). The cost is a third heavy worker beside the fitter and a larger worker-controller state machine (static/inverse/worker-controller.js: exactCompute, trailing, held; its tests). Not built; a decision on whether the margin is worth the third worker.

A predictor for which outline is faster: the number of tips that come back to themselves on the traced outline (stage.js returnTips, which exactTemplate already computes; 113 library pictures passing both the sequential and the rounded-only run). No returning tips (63 pictures): the traced outline is faster by more than 3 s on 37 and slower on 8 (median 6.3 s against 13.2 s rounded-only). One or two tips (20): rounded faster on 11, slower on 2 (15.4 against 10.1 s). Three or more (30): rounded faster on 16, slower on 3 (16.4 against 11.8 s). So pictures with tips are the ones that pay for the traced stage first. A policy modelled on the measured runs (tips: the rounded outline first for 30 s, then the traced for the rest; no tips: as now): exact 117 to 115 (khatam-shot and dagognat lost: they need the long traced search), median 9.9 to 8.0 s, pictures over 30 s 20 to 7. A time gain bought with two pictures; not built (the model assumes the stages' times are independent of their order, which they need not be). If the page's time is the thing to win, the two-worker design above reaches the same times without losing a picture.

Multi-hole row limit swept (MULTI_AUTO_ROWS, model.js, 10000 rows; 128 library masks; the baseline exact 118, hidden 610): run under heavy machine load from other sessions (load average 40 or more, memory swapped), so only the exact counts count, the times do not; the 20000 run was stopped for memory at 123 of 128. 20000 rows: exact 115 to 110 on the 123 (circle-shot, hermanngitter, hermanngitter-shot, 5star, fisk lost), hidden 519 to 513; 5000 rows: exact 118 to 117 (circle-shot, a picture that ends at 46 s anyway), hidden 594 to 603. Neither beats 10000; kept. A quiet-machine rerun was queued and withdrawn when another process took 23 GB.

Baseline of main retaken when swap allowed (tmp/e2e/even/quietbase.sh: started at load 6, one process at a time; the load rose to 10 to 13 during the library, so the library's times are partly loaded): gallery 73 of 83 exact as before, hidden 358 as before, median 5.1 s (4.7 s before), no picture changed status. Library 117 of 128 (fisk 'exact' to 'fitter', the borderline picture that also moved in the sweeps), hidden 606 to 599, median 14.0 s against 9.9 s (the load). The pictures ending within 10 s of the 50 s search: gallery khatam (53 s) and roed-blomst (42 s); library circle-shot 46, dagognat-shot 47, david4-shot 42, khatam-shot 54, lilje2-shot 44, permo-kroge-shot 40, dagognat 50, fisk-kors 49, hermanngitter 48, lilje1 48, triple-heart 48. That is 13 pictures of 211 a few seconds from losing the exact template on a slower machine (or a busier one: 117 against 118 here), the margin the two-worker design and the tip-first order were estimated to buy. Anything new for these pictures is a time win, not a new template.

When the templates of the pictures near the 50 s limit come (tmp/e2e/even/full2.mjs, the benchmark runner with the progress callback timing the first drawing that keeps every rule; one process, load 8 to 11): of the 13, only six emit drawing events in this runner (the rest print none, which is missing data, not a missing template). Early template, then polishing until the deadline: lilje1 first drawn at 4.6 s (finished 48.5 s), lilje2-shot 11.9 s (46.3), david4-shot 14.6 s (38.7), hermanngitter 24.1 s (28.2). Late: permo-kroge-shot 42.3 s (44.0) and roed-blomst 40.1 s (42.5). circle-shot went to the fitter in this run (load). So a finish time of 46 to 50 s is mostly the length stage using its budget, not a late template: lilje1 would still return a (less polished) template on a machine ten times slower; the pictures at real risk on a slower machine are the ones whose first drawing is late, of which permo-kroge-shot and roed-blomst are known, and the six with no events are not known. Measuring all 211 pictures' first-drawing time (settings with progressGeometry on) would give the real list; not done.

First-drawing time of every picture (tmp/e2e/even/firstdraw.sh with full2.mjs, progressGeometry on, one process; started at load 6, the load rose to 36 during the gallery's second half and 13 during the library's first, so late times may be a little inflated): 211 pictures, 191 exact, 179 of them with a drawing event. First drawing before 10 s: 148; 10 to 20 s: 10; 20 to 30 s: 5; 30 to 40 s: 13; 40 s or later: 3. The 16 at 30 s or more, with their finish: snowflake-shot 30.8 (35.7), lilje1-shot 31.0 (34.5), drageskael 31.4 (32.8), flyvendegaes 31.6 (35.5), origami 32.0 (36.1), david4 32.8 (35.5), amy-rosette-shot 34.2 (35.1), 5star 34.3 (38.5), origami-shot 34.3 (35.8), boelgebrud-shot 35.0 (38.7), amy-flowering-shot 35.3 (36.8), permo-kroge-shot 36.1 (38.1), roed-blomst 39.7 (42.3), circle-shot 41.1 (46.2), amy-rosette 43.4 (44.6), dagognat-shot 45.0 (47.2). Twelve more exact pictures emit no drawing event (fisk, khatam, fiskeskael, permo-kroge, fisk-kors-shot, jul-shot, khatam-shot, triple-heart-shot, dagognat, fisk-kors, permo-kroge, triple-heart): their first template is probably late too. The structure: nearly all the 30 to 40 s ones draw just after the 30 s the traced stage is given (engine.js ALONE_TRACED_SECONDS), i.e. they are the rounded-outline pictures, whose rounded stage starts only when the traced one has run out (and which take 5 to 15 s once it does: the rounded-only run above). About 28 of 191 exact pictures (15%) have a first template at 30 s or later or none seen; for them a slower machine costs the template, for the 148 that draw before 10 s it costs nothing but polish. Earlier estimates agree: a shorter traced stage (20 s) costs one picture and changes hidden cut both ways, a longer one costs five; so the stage cannot simply be cut, it would have to stop when no drawing has come by some time (a first-drawing deadline for the traced stage: draws before 10 s for 148 of 191 means a deadline near 12 to 15 s would keep nearly all of them). The search takes a fixed deadline (stage.js exactSearch(deadline)); a first-drawing cutoff would need the search to be told to end as soon as it has no drawing at that time. Not built.

First-drawing cutoff built and swept (patch kept at tmp/e2e/even/first-drawing-cutoff.patch, not on main): the traced search ends when no template keeping every rule has been drawn by T seconds (a `watch` object threaded engine.js to stage.js to search.js to model.js: it interrupts the MIP and zeroes the search's time left; it also had to be passed through the evened, untied and subgroup retries or those ignored it). Drageskael: 33 s to 21 s with the same template. Swept at T = 15 and 10 against the quiet baseline (load 7): gallery unchanged at both (73 exact, hidden 358). Library, T = 15: exact 117 to 115 (david4-shot, dagognat, david4 lost; fisk gained), pictures over 40 s 11 to 5, 13 pictures faster by more than 10 s, median 13.6 to 9.8 s, but hidden cut on the common set 562 to 606 (origami-shot 8 to 26 and origami 2 to 28: their traced template came later and hid less). T = 10: exact 116 (dagognat, david4 lost, fisk gained), over 40 s 6, 19 faster, hidden 579 to 623. So it buys time with pictures: the ones whose traced template arrives after the cutoff (david4, dagognat) and quality (origami). Not shipped. A cutoff that only applies when a rounded outline is available to fall back on is what is left to try, and the pictures lost show it does not hold for those two.

Can the return-tip count gate the first-drawing cutoff? Tips on the traced outline of the pictures the T = 15 cutoff hurt: david4-shot 0, origami 0, origami-shot 0 (quality loss), david4 1, dagognat 3 (lost); of the 13 it made faster by more than 10 s, 11 have 1 or more tips (permo-kroge-shot 12, stjernerogkors 16, triple-heart 8, snowflake-shot 6, roserude 5, ...) and two have none (jul, jul-shot). A cutoff applied only with 2 or more tips would keep 8 of the 13 speed-ups, spare david4, david4-shot and the origamis, and still lose dagognat (3 tips). Too thin a separation to ship on (one loss, a fifth of the gains lost, a threshold fitted to the sweep itself); the data do not call for more.

Hjerte-i-hjerte-i-hjerte end to end with the counting CDCL as the start (prototype branch, EXP_ALWAYS so that it runs when the grid start keeps the static rules and breaks only lazy ones, which is this picture's case; EXP_SEC=500; 664 s in all): the first model's start comes from the CDCL in 51 s (451k conflicts, 11 lazy rounds, 203 geometry rows, loops theory on), the later stages' models do not within their 200 s (912k and 995k conflicts, one proved unsatisfiable in 0.05 s but see the retraction about position columns), and the search ends with the fitter: 'no witness', the only issue left short_self_clearance, mask error 0.08%. (A first run without EXP_ALWAYS never started the CDCL and gave the old HiGHS result, penalty 103: that run proves nothing about the route.) So on the one ±1-only model of the failures too, a start keeping every rule is found in about a minute, and the search still does not produce a template within 11 times the page's budget: the stages after the start (other grids, the count and length optimisation) are the obstacle as much as the start was. Closed for good as a route to a passing template for the model-size failures with the present search; it would need the optimisation stages reworked for the counting solver (a count/length search over assignments), i.e. a different exact engine.

A set from outside the gallery and the library (tmp/e2e/web44-masks, 42 masks of web pictures, main, load 7, one process): 15 exact, 27 fitter; median 16.1 s, hidden 7, mask error 0.63% on the exact ones (gallery: 0.25%; these are rougher scraped pictures). Of the 27: 20 cannot start (0.1 to 0.3 s: "The outline ends unevenly on opposite sides", the cut ends on opposite sides of the square cannot pair; the names say they are not woven-heart designs: danish-tree-*, gathering-striped-scene-*, vissevasse-scattered-*, bibel-*, so the exact search not applying is right), and 7 ran the whole budget and failed: danish-silver-white (46.5 s), gathering-hanging-trio-top (44.3), vissevasse-arranged-r2c1 (47.1), r2c2 (35.0), r3c2 (47.1), r3c3 (47.1), r3c4 (47.7). Five of these seven are cells of one 'vissevasse-arranged' sheet (r2 to r3), so one design family fails. Not looked into yet: the next candidates for a hard case that is a real heart rather than a model-size problem.

Vissevasse-arranged-r3c3 (one of the seven web pictures that ran and failed), diagnosed: the same model-size failure as the library's. Grid start, count bound 12 = hidden 12, 2 rounds in 11.6 s, 10722 columns, 44192 rows, 52 lazy rules broken at the start (penalty 59, one uncuttable piece), HiGHS stuck there to the 47 s deadline, the fitter's answer taken (mask error 1.5%). The counting CDCL (prototype branch, all slacks 0, loop theory) finds a start keeping every rule for the model of one stage in 21.4 s (78 lazy rounds, 183k conflicts), so the picture has one, as hjerte-i-hjerte-i-hjerte and santa do (the other stages' models gave no answer within their time, or in 0.05 to 0.1 s, a result with the position-column caveat above). So the web set's seven failures are most likely instances of the one open problem, not of a new one; the vissevasse sheet is a further case for any future exact engine on the counting solver, and a measure of it: 5 of 42 web pictures.

The web set's other two failures diagnosed: danish-silver-white is a small model (4754 columns, 14404 rows) with a topology start and 4 as the count bound, 8 hidden found, penalty 3 left after 6 rounds (56 geometry, 12 cycle, 98 connect rows; issues self_intersection, nonlocal_self_clearance, short_self_clearance): HiGHS stalls at penalty 3 on a model it should manage, so it is not the model-size class but a near miss: the closest case to a rounding or repair that might pass (mask error 1.4% as the fitter's). Gathering-hanging-trio-top is the model-size class with no start at all (15292 columns, 62217 rows, the SAT start search out of time, start penalty 405, 'no witness'). So of the seven: five model-size (vissevasse), one no-start model-size (trio-top), one near miss (danish-silver-white). Danish-silver-white is the one to look at next, with rounding ways or the paper/clearance repair.
