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

| | 2026-10-25 | 2026-10-26 | 2026-10-26, later |
|---|---|---|---|
| juleflet pictures (128): pass | 128 | 128 | 128 |
| exact template first (and second) | 0 | 104 | 94 (16) |
| from the true design (mean) | 0.708% | 0.676% | 0.658% |
| solve median / 90% / slowest | 7.3 / 17.0 / 33.4 s | 8.4 / 40.0 / 40 s | 10.2 s median |
| 80 scraped photographs: pass / detail lost | 46 / 10 | 47 / 9 (8 exact) | 46 / 10 (8 exact, 4 second) |
| solve median | 21.4 s | 40.0 s | 30.0 s |
| 44 web photographs: pass / detail lost / no heart | 18 / 16 / 10 | 34 / 8 / 2 (7 exact) | 38 / 4 / 2 (5 exact, 3 second) |
| solve median | 28.0 s | 13.9 s | 14.0 s |

The photographs waited longer where the exact search fails: once the fitter's
template was in, the exact search had until 40 s. The last column has printed
papers read as below, tips that come back to themselves rounded, and the
fitter's passing template sent at 30 s while the exact search has drawn nothing
(both below); it was timed while other jobs loaded the machine, so its times
run long.

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
  neither the colour locator nor the silhouette finds the square (most of the
  remaining "no crop" photographs).
- Fine motif detail (thin limbs, small stars, letters) the fitter cannot keep at
  this size: shown with Mal's note. Nor the exact search, even from an empty
  start: on the gallery's text hearts it finds nothing passing; TAK's template
  is 0.08% from the mask but its slits come closer than a strip allows.
- The exact search takes few photographs (7 of 80, 4 of 44: its outline,
  traced from a noisy mask, is rarely a weavable structure in time); it takes
  three quarters of drawn ones. Of those it cannot start on, see above;
  13 more break the model's rules until the deadline, on noisy outlines.
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
