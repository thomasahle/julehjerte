# A cut-proposal network and the exact solver for Mal

State on 2026-11-01. The network is on main and live (14531051, sampled rungs 0f5e7be7): a choice under
Avanceret, "Hurtigere søgning med et neuralt netværk", off unless asked for. Experiments are in
`tmp/e2e/nn/` and in an instrumented copy of the engine (`tmp/e2e/even/timed/core`).

## 1. Summary and decisions

**What it is.** A U-Net (EfficientNet-B0 encoder, 9.5 MB as float16 ONNX) reads the painted mask and
outputs maps of where cuts lie: visible cuts, which paper cuts them, junctions, switches, and hidden cuts
with their direction. Each candidate hidden segment of the exact model is scored from those maps. The
exact search then solves small models made of the best-scored candidates (the *ladder*: K = 10, 30, 100,
300, then 1000), and the solver decides the template.

In Mal's default mode the ladder runs in a worker of its own, beside today's exact search, and the first
export-valid template wins. A picture therefore never waits for the network, and today's search keeps its
whole time.

**What is established** (all measurements after the orientation fix, section 6):

- **Held-out gallery designs:** v3 finds an export-valid template on all 9 measurable designs it never
  saw, each faster than today's search (median about 6×). The hidden-cut count is the same, except
  lilje1 (8 against 7).
- **Unseen designs for r4:** on 9 further measurable designs that r4 never saw, r4 finds 8.
- **Hard pictures** (today's search finds no exact template in 1 or 3 minutes): tak and khatam (v3) and
  venus (r4) now get export-valid templates.
- **Where the gains come from:** the ablation attributes them to the ranking, not the network start.
- **Easy pictures:** on 52 gallery pictures today's search already solves, the network loses none and
  changes no hidden-cut count. Run before today's search, the ladder made the median faster
  (4.4 → 3.3 s) but some pictures slower (up to +7.5 s). The side-by-side worker removes that cost:
  in Chromium, network on against off was 6.8 against 6.3 s and 4.2 against 4.3 s on the two worst cases.
- **In Chromium:** tak is exact in 4.1 s with the network, and gets only the fitter's template after
  27.5 s without it.
- **Retrained models** (section 3a): GRPO v2 changes nothing measurable; round 5 is faster on clean
  designs but misses hermanngitter and venus. v3 stays shipped.
- **Diverse proposals** (section 4a): sampled rankings and a second model's ranking make the solvable hard
  pictures faster (khatam 36 → 8.8 s in production), but crack none of the unsolved seven.

**Still failing:** santa, balls, davidsstjerne-circ and the four text hearts (god-jul, jul-tern, mor-far,
hjerte-i-hjerte-i-hjerte). jul-2026 cannot start, as before. Their ladders fail up to K = 3000; whether
any template keeping our rules exists for them is unknown.

**Decided:** shipped behind the Avanceret switch (14531051, live); the 1/2/3-minute search time pushed;
no DINOv3 for now (ImageNet encoders are doing well and are free of the Hugging Face gate).

**Still yours:** make the network the default? It costs 9.5 MB on the first exact search.

## 2. Terms

- **Export-valid template:** a template the export's own checks accept (`validation.passed`,
  `templateChecksPassed`). "Exact" in this note means this.
- **Optimal hidden count:** proved only where the template's hidden count equals the count stage's lower
  bound (`cheapBounds`). For example, venus from oracle maps: 20 = 20. Otherwise a template is the best
  found, not proved best.
- **No template found:** the search ran out of time. Today's search never proves that none exists, and
  neither does the ladder.

## 3. Held-out benchmark, after the fix (ladder against today's exact search)

The ladder runs with the short candidates (under 3 mm) added, from the timed copy (`ladder.mjs`). "Today"
is the page's exact route on the same machine. Times include every rung up to the first export-valid one.

**Caveat (found 2026-11-01):** `ladder.mjs` reruns each rung in the context of today's search's winning
call (`ref.call`: its outline, symmetry, sheets). For 5star, david4 and fisk that is the outline with its
tips rounded, which today's search reaches only after the traced one fails. So these times are the
ladder's given the right outline, not the production ladder's: in production (the ladder alone, which
stopped at the traced outline) 5star, david4 and fisk found nothing and stayed at today's 36–42 s.
Section 5a gives production numbers.

| Design | Held out of | Today (exact search) | v3 ladder | r4 ladder | ensemble |
|---|---|---|---|---|---|
| 5star | v3, r4 | 37.7 s, 12 hidden | 6.5 s, 12 | 3.8 s, 12 | 4.9 s, 12 |
| amy-weave-1 | v3, r4 | 2.2 s, 0 hidden | 1.7 s, 0 | 1.5 s, 0 | 1.5 s, 0 |
| david4 | v3, r4 | 36.2 s, 17 hidden | 4.4 s, 17 | 16.7 s, 17 | 3.2 s, 17 |
| hermanngitter | v3, r4 | 27.4 s, 25 hidden | 6.6 s, 25 | none | none |
| hvirvel | v3, r4 | 17.3 s, 6 hidden | 2.0 s, 6 | 2.0 s, 6 | 2.0 s, 6 |
| kogle | v3, r4 | 30.1 s, 25 hidden | 6.3 s, 25 | 5.8 s, 25 | 6.0 s, 25 |
| lilje1 | v3, r4 | 46.9 s, 7 hidden | 4.3 s, 8 | 14.1 s, 8 | 11.0 s, 8 |
| lilje2 | v3, r4 | 17.3 s, 15 hidden | 2.9 s, 15 | 2.8 s, 15 | 2.8 s, 15 |
| roed-blomst | v3, r4 | 41 s, 7 hidden | 1.6 s, 7 | 2.4 s, 7 | 2.5 s, 7 |
| boelger | r4 only | 24.3 s, 16 hidden | 1.2 s, 16 | 1.2 s, 16 | 1.2 s, 16 |
| circle | r4 only | 27.6 s, 16 hidden | 2.1 s, 16 | none | 4.7 s, 16 |
| fisk | r4 only | 42.4 s, 4 hidden | none | 3.9 s, 4 | none |
| gitterhjerte | r4 only | 10.7 s, 16 hidden | 0.8 s, 16 | 0.8 s, 16 | 1.7 s, 16 |
| mor-og-barn | r4 only | 11.4 s, 5 hidden | 1 s, 5 | 1.1 s, 5 | 1.8 s, 5 |
| ni-hjerter-i-tern | r4 only | 16.1 s, 27 hidden | 2.3 s, 27 | 1.4 s, 27 | 1.5 s, 27 |
| permo-draaber | r4 only | 8.1 s, 9 hidden | 2.2 s, 9 | 3.3 s, 9 | 2.3 s, 9 |
| squares | r4 only | 8.9 s, 12 hidden | 1.1 s, 12 | 1.1 s, 12 | 1.1 s, 12 |
| stjerne-ramme | r4 only | 16.3 s, 4 hidden | 4.3 s, 4 | 4.6 s, 4 | 4.3 s, 4 |

**Denominators.** The benchmark has 21 designs: 11 held out of every model since v3 (the upper part) and
10 held out only from round 3 on (the lower part; v3 was trained on those). Three are missing from the
table, so only 18 can be compared:

- dagognat and triple-heart: today's search on them is not captured as a reference by `ladder.mjs`;
- fejlternet: its line is missing from these runs.

**Clean comparisons:**

| Model | Designs it never saw | Found | Faster than today | Median speed-up |
|---|---|---|---|---|
| v3 | upper 9 | 9 | 9 | 6.0× |
| r4 | upper 9 | 8 | 8 | 6.2× |
| r4 | lower 9 | 8 (fisk yes, circle no) | 8 | 10.9× |
| ensemble (average of v3, r3, r4 maps) | — | not better than v3 alone | | |
| GRPO v2 (from v3) | upper 9 | 9 | 9 | 5.8× |
| r5 | upper 9 | 8 (hermanngitter no) | 8 | 9.1× |
| r5 | lower 9 | 9 | 9 | 12.0× |
| r6 (v3 fine-tuned) | upper 9 | 7 (hermanngitter, kogle no) | 7 | 9.8× |

## 3a. The retrained models

- **GRPO v2** (80 steps from v3, maps the right way up, K 30 and 100, prompts with mixed outcomes
  favoured): within noise of v3 on every design. Its reward rose during training (solved share 45 → 49%),
  but that did not carry over to the held-out designs. The reward at this level (did the top K solve?) is
  too coarse to teach more than the supervised labels already do.
- **r5** (all packs including round 5's solved variations of real pictures, from ImageNet, 2 epochs):
  the best of the models on the clean designs taken together, 17 of 18 found, against r4's 16. It is
  faster than v3 on most designs (5star 3.9 against 6.5 s, kogle 4.1 against 6.3 s, roed-blomst 0.9
  against 1.6 s) and finds fisk, which v3 misses. But it misses hermanngitter (v3: 6.6 s), gives david4
  19 hidden cuts against 17, and on the hard pictures solves tak and khatam (65.6 s, second outline) but
  not venus.
- **r6** (2026-11-01; v3 fine-tuned one epoch at lr 5e-4 on every pack plus 143 newly solved
  variations, v3's own targets, the same designs held out): faster where it finds a template (5star
  3.3 s, lilje1 4.4 s), but 7 of the 9 upper designs, missing hermanngitter (as r5) and kogle. So
  neither from ImageNet (r5) nor from v3 (r6) has more data beaten v3 on the designs no model saw: each
  round moves a picture or two either way, within what 9 designs can tell apart.
- **Why v3 stays:** the side-by-side worker means a ladder miss costs nothing, so what counts is the set
  of pictures the ladder solves at all. r5 and v3 each solve pictures the other misses. Shipping both
  doubles the download; one model trained to match both (distillation) is the cheaper way to get both.

## 4. Hard pictures, after the fix

Today's search finds no exact template for any of these in 1 or in 3 minutes.

| Picture | Solved by | Result |
|---|---|---|
| tak | v3 | 10.8 s through K100: 13 hidden (lower bound 10), export validation passed (Chromium: 4.1 s side by side) |
| khatam (library) | v3 | 36 s through K100 on the second outline: 25 hidden, passed |
| venus | r4 | 29 s through K300: 20 hidden, passed. v3 does not get it |
| santa, balls, davidsstjerne-circ, god-jul, jul-tern, mor-far, hjerte-i-hjerte-i-hjerte | neither | with v3 or r4, 3 minutes, rungs to K3000, short candidates and the paper-map start |

**Ablation** (tak and khatam, v3, 60 s):

| Variant | tak | khatam |
|---|---|---|
| neither | none (44.9 s) | none (50.6 s) |
| network start only (default pruning) | none | none |
| ranking only | 14.0 s | 38.0 s |
| ranking and start | 13.3 s | 36.8 s |

The gains come from the ranking. The paper-map start adds nothing measurable.

## 4a. Diverse proposals on the hard pictures (2026-11-01)

Each rung tried eight top-K sets instead of one: v3's and r4's rankings, each plain and with three
sampled rankings (Gumbel noise of 0.15 on the scores, seeded). 3 minutes, rungs K = 30, 100, 300, 1000.

| Picture | Before | With the eight proposals |
|---|---|---|
| tak | v3, 10.8 s | 11.8 s through K100, v3 plain: 13 hidden |
| khatam | v3, 36 s (second outline) | 17.9 s through K100, v3 sample 1, first outline: 25 hidden |
| venus | r4, 29 s through K300 | 32.3 s through K100, r4 sample 1: 20 hidden = lower bound 20, so optimal |
| the unsolved seven | none | none |

In production (`prodcheck`, ladder alone, v3 plain plus two samples per rung): khatam exact in 8.8 s
through K100 sample 1. Production now runs two samples per rung in the side-by-side worker
(`LADDER_SAMPLES`, 0f5e7be7); beside today's search they cost it nothing.

**What the failures say.** Counting the solver's verdicts over all rungs (r5, three samples):

| Picture | No witness | Rules violated | Found, export fails |
|---|---|---|---|
| tak | 15 | 1 | (solved) |
| khatam | 16 | 2 | (solved) |
| venus | 20 | 8 | 0 |
| santa | 40 | 2 | 0 |
| god-jul | 32 | 7 | 1 |

"No witness" means the restricted model has no solution at all, or none within the rung's time; "rules
violated" means it had one, but the lazy rules (crossings, connectivity, geometry) cut it away until the
time ran out. So the rungs mostly fail for missing candidates, and the conflicts the solver adds lazily
are rarely there to learn from.

**Where the missing candidates are** (santa, K300, HiGHS `feasibilityRelaxation` with every row
violable at cost 1): the cheapest repair breaks 4 rows, all paper-flow rows at strip ends, for example
the bottom end at (1.77, 0) and the top end at (10.23, 12). A paper strip cannot be routed between
those ends with the K300 candidates. At K1000 the base model is solvable, and the lazy rules then do not
settle within 40 s. Santa thus fails in two ways: too few candidates at small K, and too many rules to
add lazily at large K. The relaxation fails (HiGHS status −1) on models of 1000 candidates or more.

**Oracle maps from the gallery's own templates** (god-jul and jul-tern; maps rasterized by `labels.py`
from the published heart's cuts, converted by `routes/theirs.mjs`): the ladder still fails on every rung
to K1000 (2 minutes; god-jul 9 rungs without witness and 3 with rules violated, jul-tern 10 with rules
violated). So on the text hearts even a perfect ranking does not give a template: the obstacle is the
exact model on the traced outline, not the network. (The converted templates themselves fail our
validator on edge parity, which may be the converter's doubled shared cuts; the cuts' places, which is
all the oracle maps use, are the published heart's.)

**davidsstjerne-circ with every candidate:** its first outline is not symmetric under its ties; on the
next (its turns), HiGHS proves the base model infeasible with all 16,626 columns (every straight
candidate, before any lazy rule), and the one after runs out of time at 39k columns and 284k rows. So
no ranking can solve it: on this outline and its positions, no template of straight hidden cuts keeps
the turn symmetry. A way out would change the representation (finer positions, curved candidates, or
less symmetry), not the network.

**balls with every candidate:** 77k columns and 977k rows (69k and 798k on the next outline); building
takes most of 2 minutes and HiGHS does not finish the root. So balls is the opposite case: too big
whole, without a witness when cut to K ≤ 3000.

**A finer grid through the ladder** (spacing 0.4 against 0.75; the ranking keeps each rung small, where
today's search could not afford it): no change on davidsstjerne-circ (under its symmetry, the outline
made symmetric, its turns, one mirror, and untied: every rung to K300 without a template within
0.1–1.2 s), santa or god-jul (rungs to K300 the same within a second at both spacings). Their rungs
fail as fast with the finer grid as without, so missing positions are not what stops them either.

**The mask smoothed** (santa, balls, god-jul; opened or closed by 1, 2, 3 pixels, 0.03–2.3% of the
pixels changed; `fewspots.py`, production ladder alone): none of the 18 variants gets a template. Making
the picture solvable would take edits at the spots that stop it, found from the model, not a smoothing
of the whole mask.

**Where davidsstjerne-circ breaks** (untied, every candidate, the debug copy): its LP relaxation is
infeasible too, so the obstacle is not combinatorial. HiGHS's `getIis` returns an empty set here, but a
feasibility relaxation of the LP (bounds hard, every row soft at 1) breaks 17–20 paper-flow rows each
time, at strip ends on all four sides and at two touch points near opposite corners ((1.485, 1.485),
(10.515, 10.515)): the strips cannot be routed through the traced structure as a whole. Tracing without
joined near-touchings does not change it. The CP-SAT run of 2026-10-22 on the designers' own vector
outlines found templates for all 64 library designs (59 passing every check), so what fails is the
outline traced from the mask, not the design. That is where the remaining library failures point:
the tracer, not the network or the search.

**Correction (2026-11-01, later): davidsstjerne-circ is a ranking problem after all.** Oracle maps
from the designer's own template (juleflet.dk's `heart-designs.json`, converted by
`routes/theirs-json.mjs`) lead the ladder to an export-valid template: 49 hidden cuts, at K300 in 5.8 s,
on the fifth outline it tries (65.6 s in all). What was proved above is narrower: no template under its
turns. Untied, the full model is too big to solve (39k columns, 284k rows) and v3's ranking misses the
cuts it needs, but the right 300 candidates solve it. The same check fails on santa (K300 and K1000 run
out of time on all three outlines) and balls (no template, then the candidates' build runs out of
time), and the gallery's templates fail on god-jul and jul-tern.

**So of the unsolved seven,** davidsstjerne-circ is within reach of a better ranking; on santa, balls,
god-jul and jul-tern even the designer's cuts do not lead to a template in 2–3 minutes.

## 5. Easy pictures: overhead, and the side-by-side worker

**Production engine, ladder before today's search (sequential), with and without the network**
(`prodcheck.mjs`, 52 gallery pictures neither held out nor hard):

- **Templates:** 52/52 export-valid either way; hidden counts identical on all 52.
- **Time:** median 4.4 s without the network and 3.3 s with it; the 95th percentile 20.1 s and 24.3 s.
  34 pictures were faster, 11 about the same and 7 slower.
- **Where the ladder failed** it cost its rungs' time: fire-stjerner 7.5 → 15.0 s, tragt 4.4 → 11.3 s.
- **42 of 52** found their template through the ladder.

**Side by side (commit 088e08ac).** In Mal's default mode the ladder runs alone in a third worker
(`ladderOnly`: the traced outline's ladder with a K1000 rung more, nothing after it). Today's exact search
runs beside it without maps and with its whole time, and the first export-valid template stands. In
Chromium, through the page's worker:

| Picture | Network off | Network on |
|---|---|---|
| tak | the fitter's template, 27.5 s (no exact one) | **exact, 4.1 s** (ladder) |
| fire-stjerner | exact, 6.3 s | exact, 6.8 s (today's search) |
| tragt | exact, 4.3 s | exact, 4.2 s (ladder) |

With the exact search alone (Avanceret) the ladder still runs before it, within a quarter of the time.

## 5a. Broad benchmark (2026-11-01)

The production engine in Node (`prodcheck.mjs`), with and without the network, on the 64 library masks
(`jf-maskmode`, without the photographed `-shot` ones) and 42 photographed web hearts (`web44-masks`).
In Node the ladder runs before today's search, as in the exact search alone: at most a quarter of the
time, no sampled rungs, no K1000. "Certified" counts templates whose hidden count equals the outline's
lower bound (the larger of the two runs' bounds; ladder runs before 05cf3f95 reported 0).

| | Library (64) | Web (42) |
|---|---|---|
| Exact, with / without the network | 59 / 59 | 15 / 15 |
| Gained, lost | none, none | none, none |
| Median time where both exact | **6.2 / 10.1 s** | 11.7 / 14.8 s |
| More than 2 s slower with the network | 8 | 4 |
| Hidden cuts where both exact | 56 same, 2 fewer, 1 more | 13 same, 1 fewer, 1 more |
| Certified optimal | 34 / 33 | 9 / 10 |

From about the 51st picture on (01:20), the runs with the network had 05cf3f95, whose bound in the
model made ladder rungs search the bound's count alone first and run out of time (fixed in 0a3cada0,
see below). Today's search covered those pictures, so the counts above stand, but the second half's
times with the network are pessimistic.

Not exact either way: balls, davidsstjerne-circ, khatam, santa and venus in the library; 27 of the web
hearts, which are photographs (photo clean-up was put off). khatam and venus need the sampled rungs or
K1000, which only the side-by-side ladder has, and in Node the ladder runs inline. The slower cases are
the inline ladder's time, which the side-by-side worker removes in the browser.

**The ladder worker, checked on the production path** (`prodcheck2.mjs`, ladder alone, 2026-11-01),
found three faults, now fixed:

1. *The bound in the model* (05cf3f95, fixed in 0a3cada0): rungs started at the outline's bound, so
   their empty start counted as at it, and the model searched that count alone first; khatam's K100
   rung ran out of time (8.6 s exact before, none after; 8.4 s and certified with the fix).
2. *The traced outline's 30 s:* the worker stopped there although nothing follows the ladder in it;
   it now has the whole search time (0a3cada0).
3. *No fallbacks:* a ladder without a template returned at once, so the outline made symmetric, the
   untied one and part of the symmetry were never tried with it. alhambra's outline is not symmetric
   enough for its mirror, and every rung stopped in 0.02 s. With the fallbacks: alhambra exact in
   4.6 s (today's search 16.3 s), amy-pinecone 3.8 s (9.8 s) (ec5a9cb3).

Still open: 5star. Its benchmark ladder (PyTorch maps) had a template at K300 in 3.2 s, while the
production ladder's K300 (the float16 ONNX maps) ends both stages within their gap with a penalty of 8,
so its 300 candidates differ in the cut that matters. Today's search beside it finds 5star in 37 s.

**The browser's side-by-side estimate** (today's search from `broad.jsonl` racing the ladder alone,
`broad-ladder.jsonl` with ec5a9cb3, prediction time added; `browsersum.py`; two cores assumed):

| | Today's search | Side by side |
|---|---|---|
| Exact templates (106) | 74 | **75** (khatam gained, none lost) |
| Median time where today is exact | 10.8 s | **4.2 s** (library 4.1 against 10.1 s; web 5.7 against 14.8 s) |
| The ladder first | | 42 of 74 |

The ladder alone finds 54 (48 before the fixes above). Where both are exact, its hidden counts match
today's on 46, are lower on 1 and higher on 6. Four of those it finds first: lilje1 8 against 7,
roserude 4 against 2, simple-5star 6 against 4, danish-tree-group-bottom 9 against 8. With the first
template standing, the page showed the worse one.

**The ladder worker over the rounded outlines too** (2026-11-01, later). The held-out benchmark had
replayed today's winning outline (section 3's caveat), which for 5star, david4 and fisk is the one with
tips rounded; the production ladder stopped at the traced one. The worker now builds the outlines
today's search goes on to (tips rounded near the tips that come back, everywhere, everywhere twice as
much) and runs the ladder over them in two phases: its cheap rungs (K10–K300, each with two samples,
2–4 s) on every outline first, then its long ones (K300 10 s, K1000 15 s). On the 106 broad pictures:

| | Before (ec5a9cb3) | Two phases |
|---|---|---|
| Ladder alone, exact | 54 | **75** (21 gained, none lost) |
| Side by side, exact | 75 | **77** (khatam and two photographed hearts more than today's 74) |
| Pictures today's search takes over 20 s for (24): under 20 s side by side | 8 | **19** |
| Total time over today's 74 exact pictures (today: 1210 s) | 870 s | **621 s** |
| Median where today is exact (today: 10.8 s) | 4.2 s | 5.3 s |

Where both are exact the ladder's hidden counts match today's on 59, are lower on 4 and higher on 9;
the race's hold (below) keeps today's where it has fewer. Examples, ladder alone: fisk 41.6 → 12.5 s,
david4 36.3 → 16.4 s, 5star 37.2 → 24.0 s, roserude 28.4 → 9.0 s with 2 = bound (today's has 2 at 28 s,
the earlier ladder 4).

**So the race now holds a ladder template above its bound** (bf4007e6): at its outline's lower bound
it ends today's search at once; above it, it is shown and held, and today's template stands unless it
has more hidden cuts; when today's finds none (or runs out of time), and on Stop, the ladder's stands.
In Chromium (the site's worker, `_dev/race.html`, not committed): khatam 25 = 25 at once in 8.4 s;
simple-5star ends with today's 4 = 4 at 9.6 s (it was the ladder's 6); lilje1 shows the ladder's 8 at
4.1 s and ends with it at 40.6 s, since today's 7 (42.8 s in Node) comes after the 40 s the page waits
once the fitter has answered. Network off, lilje1 gets only the fitter's template at 40.2 s.

The cost: of the 9 broad pictures where the ladder came first above its bound, 3 now end with fewer
hidden cuts (2, 2 and 1 fewer) and 6 end with the same template later (4 to 36 s; it is on screen
from the start, and Stop takes it).

**Carrying the incumbent between rungs** (a prototype in a copy of the production core, 5star): a
rung's best solution that still breaks rules becomes the next rung's start (its switches, papers and
chords; its chords kept as candidates). It works as a repair: the penalties fell 20 → 2 → 1 where
fresh rungs stayed at 2–10. But none reached 0, so no template, and 3 of the carried starts moved the
grid (their switches forced positions), which costs a rebuild of the candidates (K1000 17 s). Not
shipped; the rule left broken seems to need a cut outside the ranked candidates. This is the
neighbourhood-search step of section 9a in its simplest form.

**Repairing from the broken rows** (same prototype, 5star). A rung that ends breaking rules has
positive slacks on a few rows (lazy rules are soft, at a penalty), and each row names the chords in it
(mostly one). The next rung then adds candidates around those chords:
- every candidate of their kinds (face and edge sides): about 1,400 more, which swamps the model
  (penalties 4 at best);
- only those of the same kind whose two ends lie within 8 mm of a broken chord's: 100–430 more,
  penalties 2–8;
- with the incumbent carried as well: penalty 1 after one rung, but every carried rung after it fails
  within a second, because the carried switches move the grid while the candidates are reused from the
  old one (a rebuild costs up to 17 s).

None reaches a template on 5star. The broken rows do give a usable signal: a neighbourhood of a few
hundred candidates, not the thousands of a bigger rung. Doing it properly needs candidates that
survive a moved grid (rebuild only the touched edges), and that is the next step for the loop.

## 6. Coordinates and checks

- **The bug.** The tracer's reference frame has y running up (target.js `toReference`), while the maps
  have rows running down. Until the fix every ranking read the maps upside down, and the symmetric gallery
  designs hid it.
- **The fix** is in the production `rankScores`, the timed copy's ranking, the network start, and the GRPO
  geometry.
- **Tests:** a unit test of the ranking's orientation (exact-structure.test.mjs).
- **The whole chain checked with oracle maps.** Maps rasterized by the training labeller (`labels.py`)
  from a known valid template must lead the ladder back to that template:
  - lilje1: its cuts rank 1, 2, 3 with the fix and 351+ with the old reading;
  - venus (asymmetric): exact at K30 in 7.6 s, 20 hidden = its lower bound.

  So label space, the maps, routes and ranking agree, and there is no second transform. venus's earlier
  success with flipped maps was luck: v3's correct ranking does not contain a working template for it,
  while r4's does.
- **ONNX parity.** The browser predictor (`neural/cuts.js` on ONNX Runtime Web 1.19.2) matches PyTorch
  within 0.0005 at float32 and within 0.018 at float16.
- **The fallback is complete.** The ladder prunes a copy of the candidates. Today's search builds its own
  full set with its usual pruning. A rung that throws ends the ladder, never the search (commit 5af99576:
  venus's 420 positions had overrun a rung's build time and ended the whole search).

## 7. Production design (main)

| Part | What |
|---|---|
| `static/inverse/neural/cuts.js`, `cuts-bbd773ab.onnx` | v3, float16, checksum, loaded like the photo model; NOTICE.txt credits the Apache-2.0 encoder weights |
| `exact/candidates.js` `rankScores`, `ranked`, `keep` | candidate scores from the maps (hidden field along the route by direction, plus the switches at the ends), the top K plus every candidate under 3 mm |
| `exact/search.js` `rank`, `reuse`, `buildSeconds` | rank pruning on a copy; candidates built once per ladder; the build's own time |
| `exact/stage.js` `networkLadder`, `ladderOnly` | rungs (K, s) = (10, 2), (30, 2), (100, 3), (300, 4), plus (1000, 10) when alone, each also with two sampled rankings when alone; at most a quarter of the time before today's search, the whole search time alone (0a3cada0) |
| `exact/stage.js` `exactSearch`, alone | a ladder without a template takes today's fallbacks (outline made symmetric, untied, part of the symmetry), each with the ladder; plain rungs 3, 4, 6, 10, 15 s, sampled ones 2, 2, 3, 4, 10 s (ec5a9cb3) |
| `exact/search.js` bound | a rung's model keeps the bound its empty start caps (0); its report gives the outline's `cheapBounds`, so a ladder template at it shows as optimal (0a3cada0) |
| `engine.js` | `raw.cutMaps` to the traced outline's search; `raw.ladderOnly` |
| `worker-controller.js` | the maps from the mask (`cutModel`, Mal only; loads while the picture is prepared; waits at most 1.5 s); the ladder worker beside today's |
| `src/lib/inverse/engine.ts` | `cutModel` when Avanceret's network choice is on, unless "smoother cuts" alone |

**Tests:** exact 72, worker controller 24, compute worker and runtime 10, app 227; all passing.

## 8. Data and training

Distinct designs ("bases"; a design's warps and turns count once) and pictures per training pack:

| Pack | Pictures | Designs | Source |
|---|---|---|---|
| pack-gal | 6408 | 73 | gallery templates from today's engine (73 of 83 gallery pictures exact), warped and turned |
| pack-gen | 4800 | 600 | the site's generator: random motifs and words in its frames, turned |
| pack-gs | 833 | 105 | generated motif and Voronoi pictures solved by today's search, turned |
| pack-dn | 968 | 11 | new designs' designer templates, warped and turned |
| r1 | 3186 | 390 | generator designs 601–945, newly solved pictures, venus |
| r2 | 7040 | 880 | the second generator batch, solved pictures |
| r3 | 12185 | 1524 | the rest of that batch, solved pictures |
| r4 | 2849 | 2107 | template-first grids (hidden cuts by construction), solved variations of real pictures |
| r5 | 5572 | 140 | variations of real pictures solved since |
| **all** | **43841** | **5521** | |

- **v3** was trained on the first four packs: 789 designs, of which 10 gallery designs were held out, so
  779 in training. Best at epoch 3.
- **r4** was trained on all packs to r4, with the labels' union over each picture's symmetries, soft
  hidden-cut targets and gallery-like designs weighted up, with 20 designs held out.
- **Labels** are templates the export accepts, or warped near misses of them (clearance, turns), marked as
  such. The designer templates tolerate a converter artefact (each shared cut kept as two curves).
- **The test words** of the hard set (JUL, GOD, MOR, FAR, 2026) are kept out of the generator's words.

## 9. Open

- **The remaining hard pictures.** Is any template keeping our rules there at all? A proof needs an exact
  infeasibility certificate, which we lack. Possible next steps:
  - "exact except at a few spots" (changing the picture minimally);
  - a feedback ladder (section 9a);
  - one model distilled from v3, r4 and r5 (each solves hard pictures the others miss).
- **Stubs at crossings** in the tracer: amy-pattern's 0.08 mm case is unexplained.
- **Curved candidates:** clearly bent hidden runs are a minority (designers 11%, generator 6%), mildly
  curved ones common. Straight lines stay the first representation; one or two bent variants along the
  predicted direction would come later.
- **Reranker:** a candidate-conditioned reranker trained on whole-design splits.

## 9a. Next architecture: looping over the solver's answers

Today's ladder is open loop: the rung K300 is only a larger slice of the same fixed ranking, and a
failed rung's verdict is thrown away. The aim is a loop where the network's proposal goes to the solver,
the solver's answer comes back, and the proposal is revised. The same weights run more often for more
compute, and the exact solver stays the verifier, so the network's mistakes cost time, never
correctness.

In order, each step only if the previous one pays:

1. **Diverse proposals:** done (section 4a). It speeds up what already solves, and cracks nothing new.
2. **A hand-written feedback ladder:** after a failed rung, add candidates where the solver says the
   model breaks. That measures whether the feedback carries signal before anything learns from it.
   Tried on tak (2026-11-01; v3, rungs K30 ×3 then K100; plain ladder: exact at K100 in 10.8 s), two
   ways, both no better:
   - *Where strips break:* a feasibility relaxation with the strip ends hard and the flow through
     interior points soft names the points where a strip is cut off (tak: two slots, on edges 0 and
     19; 0.3–0.5 s). Adding the best-ranked candidates with an end near them: 200 within 12 mm lost the
     K100 solve; 30 within 6 mm and 10 within 4 mm left K30 failing and K100 solving as before.
   - *Column generation:* the LP relaxation over every candidate, those outside the failed set dearer by
     2, used only 2–25 outside candidates fractionally. Adding them (30 or 100) left the next K30
     failing in 0.1 s, and each probe cost about 10 s (building the full model, then the LP at its 5 s
     limit).
   So the relaxations are too weak to say which candidates are missing: the infeasibility comes from
   the integer structure (crossings, switches, which side the paper is on), not from a shortage the LP
   sees. A learned loop would need a stronger signal than these.
3. **A recurrent network over the candidate graph:** one node per candidate (its map evidence, length,
   kind, whether it is chosen, how often it was in a conflict), edges for crossings and shared ends, and
   the solver's state (verdict, violated rows, incumbent, bound). It is run T = 1, 2, 4, 8 times. Its
   training data are solver trajectories, which `server.mjs` produces once it reports the rows each
   proposal breaks. This is also where a GRPO reward becomes informative (fewer broken rows, a smaller
   gap to the bound), unlike the all-or-nothing reward of section 3a.
4. **Later:** neighbourhood search around an incumbent (reopen one face or kind, keep the rest), and a
   continuous refiner for curved cuts once the topology is fixed.

Raster diffusion over the maps would sharpen what the maps see. But the failures of section 4a are
combinatorial (candidates missing for a strip, lazy rules that do not settle), so a loop over the
solver's answers addresses them more directly.

## 10. History (before the orientation fix; not for judging the network)

These results were measured with the maps read upside down. They are kept only for history:

- the first model (62 designs) ladder on 4/7;
- v3 on 5–7/9, with venus once exact by luck;
- r3 and the first GRPO run (60 steps, no gain).

The steps that came out of that period still stand:

- labels from today's engine (the stale stubs);
- many distinct designs instead of variants of few;
- every candidate under 3 mm;
- candidates built once per ladder;
- the side-by-side worker.

Measured findings in order: docs/inverse/MAL-PICTURES.md (2026-10-31 section).
