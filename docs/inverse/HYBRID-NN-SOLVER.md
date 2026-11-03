# A cut-proposal network and the exact solver for Mal

State on 2026-11-02. The network is on main and live (14531051, sampled rungs 0f5e7be7): a choice under
Avanceret, "Hurtigere søgning med et neuralt netværk", on unless turned off (the user's decision, 2026-11-02). Experiments are in
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

**The shipped model** (2026-11-02, `cuts-7bb72160.onnx`, syn1v): trained on generated hearts only, none of
the gallery's, and only on those whose templates keep the export's cutting rules (41% of the generator's
do not: section 3a). Every gallery and library heart and every photograph is test. Without a template the
export takes, the ladder hands back its nearest (section 5b), and the page never ends the search early on a
failing fitted answer. The bullets below are the earlier models' story and are kept for the record.

**What is established** (all measurements after the orientation fix, section 6). *Generalization* is
judged only on the held-out designs (section 3): there the network adds speed, not coverage, since today's
search alone solves the designs the ladder misses. The hard pictures solved without training on them
are tak and khatam (v3). davidsstjerne-circ and venus are solved by training on them (r7; venus also r4).
The 106 broad pictures mix seen and unseen ones.

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

**Decided 2026-11-02:** the network is on by default; it costs 9.5 MB on the first exact search.

## 2. Terms

- **Export-valid template:** a template the export's own checks accept (`validation.passed`,
  `templateChecksPassed`). "Exact" in this note means this.
- **Optimal hidden count:** proved only where the template's hidden count equals the count stage's lower
  bound (`cheapBounds`). For example, venus from oracle maps: 20 = 20. Otherwise a template is the best
  found, not proved best. **The bound is the outline's:** another tracing of the same picture (tips
  rounded, made symmetric) is another structure with its own bound, and can need far fewer hidden cuts
  (koelbuer: 16 = bound on an outline with tips rounded, 2 on the traced one). So "optimal" means optimal
  on that outline.
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

**syn1, shipped (2026-11-01, `cuts-c090b660.onnx`): trained on synthetic hearts only, every gallery heart
test.** The user's rule: no gallery heart (the site's gallery and the juleflet library) in training. syn1
is the ImageNet EfficientNet-B0 encoder trained three epochs on 42,788 synthetic pictures: the site's
generator designs (the old `g-` ones and 1,356 new `s-` ones in every figure style with the circle frame
at random frame sizes 50–80, motif scales and 2–9 strips), the generated motif, pattern and grid
pictures; none of the gallery templates, designer templates, variations of real pictures or fed-back
hard pictures. Measured through the browser's predictor (float16, within 0.029 of PyTorch) with the
production ladder, side by side with today's search:

| Test group (none seen in training) | Today's search | syn1 side by side |
|---|---|---|
| Library, 64 | 59 | **61** (khatam; **venus**, 20 = bound) |
| Gallery not in the library, 21 | 15 | **17** (tak; **god-jul**, 23 hidden) |
| Photographed hearts, 42 | 15 | 17 |
| All 127 | 89 | **95** |

Median where today's is exact: library 7.4 s against 10.1, the rest of the gallery 5.9 against 13.5,
photographs 9.9 against 14.8; never more hidden cuts than today's. venus and god-jul are solved without
having been seen: god-jul had resisted everything before, including the gallery template's cuts as the
ranking on the traced outline; it is found on an outline with tips rounded, in the ladder's second phase.
Against the gallery-trained models on the library: v3 60, r7 62 (its extra one, davidsstjerne-circ, from
training on it). syn1 replaces r7.

**syn3, not shipped (2026-11-02):** syn1 warm-started two epochs on every synthetic pack plus 2,082 new hard
designs (`gen-synth.mjs` HARD=1: dense boards and many small motifs from the upper half of each style's
strips, motif scales from 0.70, and 40% text hearts; 16,656 pictures with their turns), 59,444 synthetic
pictures in all. On the 127 test pictures: side by side 93 against syn1's 95 (library 60, losing venus;
photographs 16). The harder designs did not bring the jump the first synthetic data did; within two
pictures, so no clear gain either way.

**Expert iteration on synthetic hearts, tried (2026-11-02).** The loop the goal asks for, honestly: syn1's
production ladder (30 s) on 240 of the hard designs it never trained on (`synth2`), then the solver
labelling the ones it missed, then training on the solver's templates. syn1 found templates the export
takes for 119 (median 7.3 s). The other 121 got no label: with the generator's own template as the
ranking (oracle maps) the ladder found none on the first five, and today's search (60 s, its own start)
none on the first eight, running up to 600 s past its time. The reason: **59% of these generated
templates break our export's clearances on their own outline** (short-self, nonlocal and inter-slit,
`even/genvalid.mjs`): the generator never refuses. Of syn1's 121 misses, 94 are such designs, which may
have no template at all; on 48 others the solver found a template that keeps the rules where the
generator's does not. Across every synthetic design syn1 trained on, **41% of the templates break a
clearance** (1,346 of 3,299 `g-` designs, 552 of 1,356 `s-`): the network learned partly from cuts our
solver must reject. (syn3's extra data, the hard designs, was the worst for this, which may be why it did
not help.) Next: syn1's recipe without them (syn1v, below).

**syn1v: syn1's recipe without the templates our export rejects (2026-11-02).** The same packs, encoder and
three epochs, with every picture whose generated template breaks a clearance left out, turned and warped
copies too (`train.py --drop`: 15,184 of 42,788 pictures). On the 127 test pictures, back to back with syn1
per chunk of ten under the same load (both with PyTorch's maps): syn1v 91, syn1 87 (library 60 and 60,
gallery-only 15 and 11, photographs 16 and 16). Three more runs of each on the six pictures where they
differed:

| Picture | syn1 | syn1v |
|---|---|---|
| hermanngitter | 0 of 3 | 3 of 3 (10 s) |
| god-jul | 1 of 3 | 3 of 3 |
| hjerte-paa-hjerte | 0 of 3 | 2 of 3 |
| fire-stjerner, firkanthjerte | 2 of 3 each | 3 of 3 each |
| santa | 3 of 3 (50 s) | 0 of 3 |

So the gains on hermanngitter, god-jul and hjerte-paa-hjerte hold, and santa is lost (syn1 finds it only
at 50 s). Through the browser's path (each model's float16 ONNX in `neural/cuts.js`, two runs each):
hermanngitter exact both times against syn1's crossing near misses; god-jul both times against once;
hjerte-paa-hjerte a near miss keeping every cutting rule (the paper audit fails) where syn1 has nothing;
santa nothing where syn1's float16 maps give a near miss 0.083 mm short; fire-stjerner and firkanthjerte
alike. Where both find a template, syn1v is a little slower (median 8.6 s against 7.1) and has more hidden
cuts on 8 pictures, fewer on 4. Cleaner labels are the first data change since syn1 to beat it on unseen
pictures. The float16 export matches PyTorch within 0.008. **Shipped** as `cuts-7bb72160.onnx`, replacing
syn1.

**syn2, not shipped:** syn1 warm-started two epochs with 60% of the inputs roughened (blur and threshold,
smooth noise, pixelation, speckles; labels kept) and a tenth output, the clean picture, as the first step
towards outline hypotheses from the network. On the same 127 test pictures it does worse: side by side
92 against syn1's 95 (library 59 against 61, losing khatam and venus; photographs 16 against 17). The
roughening as done cost the cut maps on clean pictures and did not help the photographs. Next try: the
clean picture from a separate head or network, so the cut maps stay as they are, and its use measured by
how often its outline matches the true one on roughened synthetic hearts.

**clean1, a separate clean-picture model** (synthetic only, 80% roughened, from syn1's weights; the cut maps
untouched). On 400 held-out synthetic designs, roughened: the true structure (numbers of red and white
regions) comes back from the roughened input in 11%, from the clean picture at 0.5 in 21%, from one of
three thresholds in 32%; wrong pixels 6.4% → 2.8%. But used as the picture to search (today's search on
it, its template then checked against the painted mask, `even/cleancheck.mjs`): photographs 13 of 42
against 15 on the original (one gained, three lost; 16 with either), the six hard gallery hearts none. The
clean picture comes from 128 x 128 and moves too far from the painted mask: four templates found on it miss
the export's image-error limit against the original, one its regions check. So not as a whole new picture:
next would be local hypotheses (the painted mask with the clean picture's correction in one small region
at a time, so the image error stays small) or a clean picture at the mask's own resolution.

**Local hypotheses, tried** (`nn/localhyp.py`, `even/hypcheck.mjs`): for the 33 test pictures today's search
leaves without a template (27 photographs and the six hard gallery hearts), the regions where clean1's
picture and the painted mask disagree, kept where flipping one changes the numbers of red and white regions
(up to 1% of the square), the three largest one at a time and all together. 13 pictures had no such
region; the other 20 got 58 hypotheses. One solves: vissevasse-arranged-r3c3 (a photograph; its template
0.9% from the painted mask, limit 3%). On every other hypothesis today's search finds no template at all,
the hard gallery hearts included. So small structural corrections of the outline rarely make a picture
solvable; the hard ones need more than a near-touch or a neck changed.


**r7, shipped (2026-11-01, `cuts-c6cd1ff7.onnx`):** v3 fine-tuned (lr 2e-4, one epoch) on every pack, the
250 variations solved since r6, and the hard pictures' exact templates fed back (davidsstjerne-circ,
solved with the designer's cuts as the ranking; tak and khatam by v3; venus by r4; each warped 12 ways and
turned). Measured on the production ladder with each model's maps (not `ladder.mjs`):

| | v3 | r7 |
|---|---|---|
| 9 designs held out of both | 8 exact, median 7.5 s | 8 exact, median 8.1 s |
| 12 held out of r7 | 11 exact | 11 exact |
| hard, now in r7's training | tak, khatam | tak, khatam (5.4 against 11.9 s), **davidsstjerne-circ** (49), **venus** (20 = bound) |
| santa, balls, god-jul | none | none |

On the 106 broad pictures through the browser's predictor (the hold and the traced-bound rule counted;
**not a held-out set**: many of its pictures, or variations of them, are in the training data, so its
counts mix seen and unseen pictures; the held-out designs above are the clean test):
side by side 78 exact against v3's 77 and today's 74; the library 62 of 64 (davidsstjerne-circ and
venus gained; santa and balls left, which fail even with the designer's cuts), the photographed hearts
16 of 42 (gathering-hanging-trio-top lost, which v3's ladder had at 43 s); median 7.6 s against v3's
7.2 s and today's 10.8 s; never more hidden cuts than today's.

Per picture it moves both ways (hermanngitter 29.8 → 9.5 s, 5star 23.7 → 16.4 s, david4 15.7 → 43.0 s).
No held-out design is lost. **The two hard pictures are gained by training on them**: davidsstjerne-circ
and venus are now in r7's training, so solving them shows memory, not a better solver (and venus was
already in r4's training, through round 1's pack, so r4's venus was memory too). It helps whoever paints
those designs; it is no evidence of generalization. On the held-out designs r7 equals v3. Held-
out losses: hidden 0.479 against r6's 0.780, direction 0.243 against 0.301. The float16 export matches
PyTorch within 0.011 (float32 0.0005), and through the browser predictor davidsstjerne-circ is exact in
17.5 s and venus in 14.7 s.


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

**With the hold counted, and only the traced outline's bound trusted** (a7e871e9; `holdsum.py` on the
benchmark that records each ladder template's outline). Of the ladder's 75 templates, 42 are on the
traced outline, 4 on it made symmetric and 29 on outlines with tips rounded. Of those 29, where today's
search is exact too (26), 16 have its hidden count, 3 fewer and 7 more, some far more (origami 28
against 2, drageskael 16 against 0, koelbuer 16 against 2). So they wait for today's search:

| | Today's search | Side by side, held as in the page |
|---|---|---|
| Exact (106) | 74 | **77** |
| Median where today is exact | 10.8 s | 7.6 s |
| Total time over those 74 | 1210 s | 1085 s |
| Hidden cuts against today's | | fewer on 4, **more on none** |

Capping the hold at 5, 10 or 20 s would save 220–440 s but give 4–5 pictures more hidden cuts than
today's (the cases above), so the hold stays whole. The time the network saves is now mostly on the
traced outline (42 templates); a ladder that finds the traced outline's templates more often, or that
knows which outline to search, is where the remaining speed is.

**A ladder template within the traced outline's bound** (2026-11-01, the loop's first piece of solver
state passed on): the ladder worker reports the traced outline's lower bound (`tracedBound`), and a
template with no more hidden cuts than that, on whichever outline, ends today's search at once: no
template on the traced outline can have fewer, and that is where today's search ends unless it fails
there. On the 106 broad pictures it frees 16 of the 35 held templates (amy-rosette 8 at 12.4 s, where
today's has 12 at 44 s; stjernerogkors 0 at 13.6 s against 8; roserude 2 at 8.7 s against 28.4 s), none
of them beaten by today's search. Browser estimate: total 928 s against 1085 (today's alone 1210),
median 7.2 s against 7.6, still never more hidden cuts than today's. (The caveat: when today's search
fails on the traced outline and goes on to a rounded one, that outline's bound can be lower; in these
data it never was.)

**Measured in Chromium** (2026-11-01; the site's worker on Mal's inputs, `_dev/race.html`, not committed;
12 pictures chosen to cover each case, not a sample). Time to the first exact template, as the result or
as the later alternative:

| Picture | Network on | Network off |
|---|---|---|
| khatam | 8.4 s (25 = bound) | none |
| lilje1 | 40.4 s (8) | none (the fitter's only) |
| amy-rosette | 12.6 s (8 = bound) | 44.1 s (12) |
| roserude | 8.8 s | 25.9 s |
| kogle | 9.1 s | 28.1 s |
| koelbuer | 7.6 s | 12.2 s |
| 5star | 24.0 s (alternative, the ladder's; e9650f7e) | 37.2 s (alternative) |
| fisk | 40.5 s | 41.7 s |
| david4 | 36.4 s | 36.1 s |
| origami | 27.6 s (4) | 28.5 s (4) |
| hermanngitter | 27.3 s | 26.6 s |
| simple-5star | 10.1 s | 9.3 s |

12 exact against 10, median 18 s against 28 s where both are exact, never more hidden cuts. The run
also showed the ladder ended when the fitter's passing answer goes out at 20 s while today's search has
drawn nothing (5star, hermanngitter); since e9650f7e it goes on and its template is the alternative as
in the race (5star's at 24.0 s, today's at 37 s).

A schedule with the traced outline's both phases first (half the time), then the rounded outlines, finds
more templates on the traced outline (54 against 46) but fewer in all (72 against 75), and side by side
76 exact against 77 at the same median: the two-phase schedule stays.

**So the race now holds a ladder template above its bound** (bf4007e6; a7e871e9: only the traced
outline's bound counts, see Terms): at the traced outline's lower bound, found without a fallback, it ends
today's search at once; above it, it is shown and held, and today's template stands unless it
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

## 5b. Never empty-handed: the best template, not only a passing one (2026-11-01)

The user's rule: never reject a template outright for missing a limit (santa's designer template comes
1.476 mm close to itself where 1.5 mm is asked); find the best available. Until now the exact search's
templates were kept only when the export passed them, and "exact search alone" ended in an error
otherwise. Now (`core/result-rank.js`) a finished result is ranked by: passing every check; the number of
kinds of failure that are not clearances (crossings, lost regions, the paper, the image limit); the
clearances' total shortfall in mm; the share of the picture wrong. The engine keeps the exact search's best
failing template (`nearMiss`): alone it is the answer, with the export's warnings; beside the fitter, the
better of the two stands, in the sequential route and in the race (the controller holds a near miss and
compares when it settles; a passing template from the ladder still ends the race).

What it returns on the hard pictures (today's search alone): santa 8 hidden cuts, jul-tern 18 (= bound),
hjerte-i-hjerte-i-hjerte 24 (= bound), davidsstjerne-circ 45, where before there was nothing; mor-far
still none. But these templates are far from passing: santa's has 6 crossing slits and clearances short
by 2.5 mm, jul-tern's 3 self-intersections and clearances short by up to 1.4 mm. So on these pictures the
search on the traced outline finds nothing near the designer's solution; the ranking keeps such a template
behind any better one, and it is shown with its problems marked.

With the designer's cuts as the ranking, through today's whole ladder and 3 minutes: balls exact (44 hidden,
on an outline made symmetric under part of its symmetry); davidsstjerne-circ exact (49); santa, jul-tern,
mor-far, hjerte-i-hjerte-i-hjerte and god-jul none. Designer templates against our rules (the converter's
doubled shared cuts set aside): santa 0.02 mm short of 1.5, mor-far about 0.05 mm, balls about 0.2 mm,
davidsstjerne-circ about 0.27 mm; jul-tern's and hjerte-i-hjerte-i-hjerte's keep every rule.

**The ladder's near misses (2026-11-02).** The ladder still threw away every rung whose template the
export would not take, so the ladder worker answered nothing on 17 of the 127 test pictures where it got
going, and today's near miss was all the race could hold. Now it keeps the rung that breaks the model's
rules least, assesses it once the ladder ends without a template (assessing every rung took 5 of
jul-tern's 50 s), and takes the template nearest what the export takes (`assess`'s `near`: kinds of
failure besides clearances, then the clearances' shortfall in mm, then the mask error), across the
outlines. The engine finishes it as a near miss; the controller holds it beside today's near miss and
never as a template (a near miss with fewer hidden cuts must not beat a passing template, nor be offered
as the alternative after a passing fitted answer). On the 17 (syn1, ladder alone, 50 s):

| Outcome | Pictures |
|---|---|
| passes (timing; it failed in the earlier run) | fisk-kors |
| clearances short by hairs | santa (one, 0.083 mm; 14 hidden cuts, 1.3% off the picture), vissevasse r3c2 (three, ≤ 0.082 mm), r3c3 (0.096 and 0.011 mm) |
| clearances short by more | vissevasse r4c1 (six, up to 0.8 mm), mor-far (22, up to 0.6 mm; in a second run three, up to 0.068 mm) |
| every cutting rule kept, off the picture | jul-tern (4.9%), jul-2026 (8%), vissevasse r3c4 (3.4%): the solver leaves bits of outline uncut, at a penalty |
| crossing slits | hermanngitter |
| still nothing | balls, davidsstjerne-circ, hjerte-i-hjerte-i-hjerte, hjerte-paa-hjerte, roed-blomst, vissevasse r2c1, r2c2 |

On the last seven every rung ends without any solution ("no witness", rung logs in
`tmp/e2e/nn/hair01.jsonl`), so there is nothing to rank; today's search, which starts from a witness,
still gives the race its near miss there.

**Graded clearance rows (not shipped).** The lazy geometry rows charge the same penalty for a clearance
missed by 0.001 mm as for a crossing. A prototype (`tmp/e2e/even/proto`, `HAIR_MM=0.1`) charged pairs
within 0.1 mm of the limit 200 instead of 1000, returns included, so a rung would rather keep a hair miss
than a crossing. On 11 of the pictures above: santa the same 0.083 mm; mor-far three short by
≤ 0.068 mm, as a second run without the grading has too (the first had 22 by ≤ 0.6 mm: run-to-run
variance); the seven still without a witness. The grading only acts once a rung has a solution, and the hard pictures' rungs
mostly have none.

**Photographs that never started (2026-11-02).** 20 of the 42 photographs ended at once, their traced
outline ending unevenly on opposite sides (the crop off the heart's square: strip ends counted T0 B3,
T1 B6 and so on). The engine reads such an outline paired (`border.js` `pairedBorderReading`, changing at
most the export's 3% of the picture), but only when the unopened trace said so: a mask rough enough to
be traced opened by a pixel never had its reason recorded, so danish-tree-dots and
gathering-hanging-trio-middle never got the paired reading that traces them. Fixed (`engine.js`
`firstTrace`); no other picture of the 127 traces differently. Both now come back with near misses (one
inter-slit clearance 1.9 mm short; every cutting rule kept but a feature lost, 1.4% off the picture).
The other 18 need more than 3% of the picture changed to pair, mostly crops with no strip end on a whole
side: the photo locator's crop, not the search.

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
| `static/inverse/neural/cuts.js`, `cuts-7bb72160.onnx` | syn1v (trained on synthetic designs only, no gallery heart, without the generated templates our export rejects: section 3a), float16, checksum, loaded like the photo model; NOTICE.txt credits the Apache-2.0 encoder weights |
| `exact/candidates.js` `rankScores`, `ranked`, `keep` | candidate scores from the maps (hidden field along the route by direction, plus the switches at the ends), the top K plus every candidate under 3 mm |
| `exact/search.js` `rank`, `reuse`, `buildSeconds` | rank pruning on a copy; candidates built once per ladder; the build's own time |
| `exact/stage.js` `networkLadder`, `ladderOnly` | rungs (K, s) = (10, 2), (30, 2), (100, 3), (300, 4), plus (1000, 10) when alone, each also with two sampled rankings when alone; at most a quarter of the time before today's search, the whole search time alone (0a3cada0) |
| `exact/stage.js` `exactSearch`, alone | a ladder without a template takes today's fallbacks (outline made symmetric, untied, part of the symmetry), each with the ladder; plain rungs 3, 4, 6, 10, 15 s, sampled ones 2, 2, 3, 4, 10 s (ec5a9cb3) |
| `exact/search.js` bound | a rung's model keeps the bound its empty start caps (0); its report gives the outline's `cheapBounds`, so a ladder template at it shows as optimal (0a3cada0) |
| `exact/stage.js` `networkLadder` `nearest`, `assess` `near`, `closer` | without a template the export takes, the ladder's nearest one (section 5b), across outlines |
| `core/result-rank.js` | the best finished result when none passes: never empty-handed (section 5b) |
| `engine.js` | `raw.cutMaps` to the traced outline's search; `raw.ladderOnly`; a near miss finished and marked `nearMiss` |
| `worker-controller.js` | the maps from the mask (`cutModel`, Mal only; loads while the picture is prepared; waits at most 1.5 s); the ladder worker beside today's; near misses held and ranked, never taken as templates |
| `src/lib/inverse/engine.ts` | `cutModel` when Avanceret's network choice is on (the default), unless "smoother cuts" alone |

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

State on 2026-11-02 (syn1v; the 127 test pictures, ladder alone):
- **Seven pictures with no answer from the ladder** (balls, davidsstjerne-circ, hjerte-i-hjerte-i-hjerte,
  hjerte-paa-hjerte, roed-blomst, two photographs): no rung there has any solution at all, so nothing to
  rank, and graded clearance rows do not help. hjerte-i-hjerte-i-hjerte's designer template, read onto our
  traced outline, breaks 20 rules (crossings, turns, clearances to 0.3 mm): the designer's cuts are not on
  our outline. That needs visible cuts allowed off the traced outline within a budget, the user's decision.
- **18 photographs end at once:** the outline traced from their mask ends unevenly on opposite sides.
  Looked at one by one, 10 have no usable picture: the crop is tilted, catches the wrong object (a bauble
  instead of the heart) or the colours are split wrongly on patterned paper. The other 8 are nearly right
  but carry slivers of the heart's lobes or the background along an edge. Read as deep as the paired reading
  goes (8% of the side) with no limit on the change, only one of those 8 ends evenly, changing 3.9% of
  the picture against the export's 3%. The photo step's crop, not the search; the import dialog lets the
  visitor drag the corners.
- **A clearance tolerance: decided 2026-11-02, 0.1 mm.** The export's verdict and the exact search's
  acceptance read a final validation through `verdict` (`validate.js`): a clearance missed by at most
  `CLEARANCE_TOLERANCE_MM` passes and is listed under `tolerated`. Repairs, the smoothing of an exact
  template onto the mask and the rounding of hidden cuts still aim for the whole clearance. santa with
  syn1's ladder: its 0.083 mm miss now passes the geometry, which brings it to the paper check, which it
  fails (a disconnected core), so it stays a near miss; syn1v's ladder draws nothing there.
- **Solver labels for the dropped designs (expert iteration 2): no gain, not shipped.** syn1v's ladder
  (30 s each) on 200 generated pictures whose own template breaks the export found 77 templates (39%);
  each warped four ways and turned eight (3,080 pictures), syn1v fine-tuned one epoch on them with its own
  data (lr 2e-4, `ei2-rest.sh`). Back to back through the browser's float16 path on the 127 test pictures:
  ei2 91, syn1v 93 (library 60/61, gallery-only 14/15, photographs 17/17); ei2 loses tak and venus and
  gains none; median 9.0 against 8.6 s.
- **Visible cuts off the traced outline: approved 2026-11-02; the outer strip shipped, the rest open.**
  The pictures no search solves are designs whose own templates break our rules on the picture as
  painted. Read onto our traced outline (`even/fromtemplate.mjs`), the designer templates break: balls
  only the outer strip (its circles 2.14 and 2.25 mm from the paper's edge, against 2.5);
  davidsstjerne-circ two cuts 2.46 mm apart (2.5), a return at 1.43 mm (1.5) and turns;
  hjerte-i-hjerte-i-hjerte cuts 1.92 mm apart and returns down to 1.20 mm, turns and crossings. The
  designers accepted what our export does not, so a template keeping our rules needs the picture moved
  a little.
  - **The outer strip (shipped).** `outerStripBand` (`border.js`) pulls a shape back from a side it dips
    within the outer strip's width of without reaching it (cuts ending on the side, at any angle, are
    left alone), to 0.5 mm past that width: at 0.1 and 0.3 mm past it the paper audit's lattice leaves
    the outer strips' cores uncertain. `rasterOutline`'s `outerStrip` traces it, null when nothing moves
    or more than the export's 3% would. The ladder gets it as one more outline; today's search tries it
    with half its remaining time when the traced outline has no template, and the outlines with tips
    rounded after it are moved too. balls: 0.76% of the picture moved, a template passing every check
    in four runs of four (24 s, ladder alone). Of the 127 test pictures 20 have such a dip (balls,
    jul-tern and 18 photographs); on those, with it off and on (`nudge/ab.sh`): ladder alone 7 → 8
    (balls), today's search 7 → 7, none lost. The other 107 trace no such outline.
  - Seen on the way: a run's template on balls' moved outline can run into the 0.09 mm cusps where its
    small circles nearly touch the big ones ((29.4, 30.4) and mirrors), turning 177° (`even/turns.mjs`);
    other runs route around them.
  - **Still open:** cuts too close together inside the picture (davidsstjerne-circ,
    hjerte-i-hjerte-i-hjerte). Neither search draws anything there, not even a template breaking rules,
    so there is no near miss to say where to move the picture; the designer templates' readings do
    (`even/designspots.mjs`).
    They say (2026-11-03): davidsstjerne-circ's two inter-slit misses are 0.04 mm (now tolerated); the
    rest are turns of 177–180° and returns down to 1.08 mm at four places such as (37.5, 6.1) and
    (25.4, 44.5); hjerte-i-hjerte-i-hjerte's at (42.75, 6.5) and (88.5, 56–60), and one pair of cuts
    1.92 mm apart near (55.6, 60.5). These are not wedges in the traced picture: its narrowest
    junction is 39° on davidsstjerne-circ and 86° on hjerte-i-hjerte-i-hjerte (`even/wedges.mjs`), and
    the engine finds no tips there (`even/tipcheck.mjs`); reading onto our outline makes the turns
    sharper. But the designer templates miss our rules on their own geometry too
    (`even/ownverdict.mjs`, the converter's doubled shared cuts aside): davidsstjerne-circ turns 150.1°
    (limit 150) at (19.8, 19.8) and its mirror, cuts 0.53 mm closer than allowed, self-necks 0.48 mm;
    hjerte-i-hjerte-i-hjerte turns 153.5° and has self-necks 0.19 mm short. Woven, each reproduces its
    gallery mask (0.26% and 0.04% off, `even/weavevsmask.mjs`), so mask and template are the same
    picture: its designer did not keep our rules either, and a template keeping them may need the
    picture moved. Neither search draws anything there, even with the symmetry off.
    Why (2026-11-03, a filter relaxing one section of the model's rows at a time before the first
    solve, 8 s each, in a copy of the engine: `tmp/e2e/even/filt`, `SECTION_FILTER=1`):
    davidsstjerne-circ's model on its traced outline, its symmetry tied (antiTranspose and rotate180,
    though the outline is not quite symmetric under the first), is proven infeasible, and stays so with
    any one section relaxed but the ties: the symmetric search cannot succeed there. Without the ties
    the solver draws, but only drawings breaking many rules (as the designer's cuts do on our outline,
    penalty 27). hjerte-i-hjerte-i-hjerte has no symmetry: its model is not proven infeasible, the
    solver just finds no point keeping its hard rows (80 s), and with the flows or the crossings
    relaxed it finds one at once. One exists: the designer's cuts read onto our outline keep every
    hard row (penalty 20 from the lazily checked rules). There a better start would help, not looser
    rules; whether any start leads to a template keeping every rule is not known.
    santa is the third such heart: its designer template turns over 150° three times, crosses itself
    once and has self-necks 0.40 mm short on its own geometry (`even/ownverdict.mjs`); today's search
    draws only cuts that cross (its paper falls apart), syn1v's ladder nothing, syn1's a template whose
    clearance now passes but whose paper core is cut off. Six drawn test pictures have no template from
    either search (the 2026-11-02 ladder run, today's search on 2026-11-03, balls' moved outline): these
    three, and three text hearts, jul-2026, jul-tern and mor-far, whose templates keep every cutting and
    paper rule but lose a region of the picture (the features check; jul-2026 8% off). There the search
    is short, not the rules: jul-tern's designer template keeps our rules with the 0.1 mm tolerance.
    The other misses are 24 of the 42 photographs.
    jul-tern: the designer's cuts on our outline miss the model's own clearances by 0.001 mm (2.504
    against 2.505, 1.499 against 1.5), so the model counts them broken though the export's verdict
    takes them. With the model's clearances lowered by half the verdict's tolerance (0.05 mm, in a copy
    of the engine) they keep every rule at 25 hidden segments: a template exists. Neither search finds
    it: today's settles at the count's bound, 18, where every drawing breaks rules (3 minutes too).
    Lowered on all 127 test pictures (`nudge/tol.sh`): ladder 94 → 92 (venus,
    vissevasse-arranged-r3c2 lost, a return's clearance gone after smoothing), today's search 89 → 89,
    either 97 → 95: not shipped. A search that trades segments for rules beyond the count's bound is
    what jul-tern needs, and a floor on the count is not it: raised by 4 or 7 segments (the start, at the
    bound, dropped) the solver finds no drawing at all, aligned or not. It needs a start above the
    bound, as hjerte-i-hjerte-i-hjerte needs one at all.

- **How often the answer is proven best** (syn1v's ladder alone, the 127 test pictures, 2026-11-02): of
  its 93 templates passing every check, 75 have exactly as many hidden segments as the lower bound on
  the outline they were found on (`cheapBounds`), so none on that outline has fewer: library 52 of 61,
  rest of the gallery 13 of 15, photographs 10 of 17. 64 meet the traced outline's own bound. The other
  18 stop above it (lilje2 34 against 15, origami 28 against 4, koelbuer 16 against 2, alhambra 3
  against 2). With 3 minutes instead of one they stay as they are (16 of 18 the same, `nudge/gap180.jsonl`):
  the ladder returns at its first rung with a template, in 2 to 30 s, so time is not what stops them.
  The count's bound (`cheapBounds`) is loose: flower's template has 1 hidden segment against a bound of
  0, and the solver proves 1 the least. The solver's own gap is the proof (today's search alone, the 127
  test pictures, `ATTEMPTS=1`, `nudge/today-gaps.jsonl`): of its 89 templates passing every check, 71 are
  proven optimal (gap 0) among straight hidden cuts on the outline searched (library 49 of 59, rest of
  the gallery 11 of 15, photographs 11 of 15) and 5 more within 1%; the rest stop far from a proof
  (origami, flyvendegaes, dagognat, amy-rosette and jul with their bounds near 0).

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
   **Started 2026-11-01** (the user's choice). Step 1, the data: `nn/loop/collect.mjs` runs the ladder's
   rungs (K10–K300, 6 s each, in the context of today's winning search) on 200 solved training pictures
   and records every candidate's features (score, rank, length, kind, ends) and whether it matches a
   reference cut, and per rung the chosen set, the incumbent, the candidates in broken rows and, for a
   rung without a witness, where the feasibility relaxation says strips break. Most rungs end without a
   witness, so the relaxation's break points are often the only answer. Step 2, the signal: does a
   re-ranker that sees a failed rung's answer put the reference cuts higher among the candidates the rung
   did not use than the network's fixed order does (`nn/loop/loopsignal.py`, designs split into train and
   test)? Only if it does: step 3, a small graph network over the candidates (conflicts and shared ends
   as edges) re-ranking between rungs in plain JS, trained on these trajectories and then on rewards
   from the solver; and which outline to search becomes one of its choices.
   **First results (2026-11-01, 130 pictures collected, 87 with reference cuts):**
   - *The solver's answers carry no signal.* After a failed rung, ranking the candidates it did not use
     by v3's order puts 0.28 / 0.53 / 0.76 of the reference cuts among the first 20 / 70 / 200 added; a
     re-ranker without the answer 0.30 / 0.59 / 0.75; with the incumbent, the broken rows, the break
     points or all of them, 0.28–0.29 / 0.57–0.59 / 0.75–0.76 (five splits, spread 0.02–0.05). Most
     failed rungs say only "no witness", and the rest adds nothing measurable.
   - *A set-aware re-ranker improves recall offline but not the ladder.* From the candidate set alone
     (rank within its kind, how many better-scored candidates share an end, kind and face sizes), a
     small MLP puts 0.75 against 0.66 of the reference cuts in the first 100 and 0.93 against 0.88 in
     the first 300 (held-out designs, five splits), and its JS port matches to 1e-5. In the production
     ladder on the 106 broad pictures, though, the ladder alone finds 73 templates against 75, side by
     side 76 against 77, at a median 8.4 against 7.6 s: it demotes near-copies of a cut, which are the
     alternative positions a valid template often needs. Not shipped.
   - *So candidate-level labels (does it match the reference?) are the wrong target:* what the solver
     needs is a set that contains some complete valid template. The next version of the loop should
     learn from set-level outcomes (did this set solve?), for example choosing among sampled sets, and
     from which outline to search, where the signal is known to be strong (29 of the ladder's 75
     templates are on outlines with tips rounded).
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
