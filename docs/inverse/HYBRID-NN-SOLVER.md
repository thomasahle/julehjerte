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
| `static/inverse/neural/cuts.js`, `cuts-4362d1d3.onnx` | 0.7 syn1v + 0.3 its fine-tune on the strips, motifs and board designs with `--sym-min` (weights averaged; trained on synthetic designs only, no gallery heart, without the generated templates our export rejects), float16, checksum, loaded like the photo model; NOTICE.txt credits the Apache-2.0 encoder weights |
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
    The ladder's nearest drawing as today's start (`exactStart` given it as the template, in the copy):
    jul-tern, jul-2026 and mor-far as without it (18 segments rules broken; a region lost; none).
    In production `exactSearch` is always given no template, so `exactStart`'s reading and repair of
    one go unused; a better source of starts than the ladder's broken drawings is still to be found.

- **What a visitor gets** (2026-11-03): counting the fitter, which runs beside the exact search and
  whose passing template goes out when the exact search has none, 123 of the 127 test pictures get a
  template passing every check: 97 an exact one (either search), 26 more a fitted one
  (`FITTER_ONLY=1`, `nudge/fitter-misses.jsonl`) — among them davidsstjerne-circ,
  hjerte-i-hjerte-i-hjerte, santa, jul-tern, mor-far and 21 of the photographs. The four without one
  all lose a region of the picture (the features check; cuts and paper pass): jul-2026 and three
  photographs, two of them cropped or split wrongly by the photo step (danish-red-gold,
  danish-tree-group-top) and gathering-hanging-trio-middle. Where the notes below say a heart has no
  template, they mean no exact one.
  jul-2026 has one all the same: the designer's cuts read onto our traced outline break only a
  clearance by 0.025 mm (2.480 against 2.505), which the verdict tolerates (13 hidden segments; woven,
  the designer template is 0.08% from the mask). As on jul-tern, the model's own clearances count that
  hair as broken (penalty 1) and the searches end far from it; what the text hearts need is a search
  that reaches such templates, not looser rules.
  Where the designer's cuts rank among syn1v's proposals (read onto our outline; `even/refrank.mjs` on
  the instrumented `timed` copy): jul-tern's 25 among 5,604 candidates, 4 within 100, 12 within 1,000
  (the ladder's last rung), 11 beyond and 2 not among the candidates at all. But 5star, which the ladder
  solves, ranks its designer's cuts as low (7 of 12 within 1,000): the ladder finds other cuts keeping
  the rules there. So the network's ranking is not shown to be what fails on jul-tern; that two of its
  cuts are not candidates at all is a definite gap.
  Why they are not: candidates are straight cuts only (`candidates.js`), kept where the straight line
  stays clear of the outline; of the two, one is nearly straight (0.24 mm off), the other bent 1.1 mm,
  while cuts bent as much elsewhere have straight candidates between their ends. One-bend candidates
  (the middle pushed 0.5 to 1.5 mm either way where the straight one fails, `BENT=1` in the copy) add
  2,552 to the 5,146 straight ones on jul-tern and change nothing (18 segments, rules broken); the
  pruning that keeps each point's 8 cheapest might drop them, but kept through it (`BENT_KEEP=1`) they
  change nothing either: the solver still settles at 18 segments, rules broken. With the candidates
  there, it does not find a drawing keeping the rules above the count's bound in its time.

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

- **A visitor's "no usable cuts" (2026-11-03, fixed 2c7018a6).** A star in a circle on a 5x5 board,
  mirrored lobes, 0.5 mm minimum width, the exact template alone: the live view drew a good template,
  then the page said "Der blev ikke fundet brugbare snit". The page (`PaintPage.svelte` `toResult`)
  converted every answer through `convertValidatedCutGeometry`, Tegn's own crossing and spacing checks
  at its fixed 1.5% of the square and with no tolerance, and showed a `CutGeometryError` as no
  solution. So the engine's never-empty-handed near misses (2026-11-01) never reached the page when
  their cuts cross or come close, nor did templates the export takes by the 0.1 mm tolerance
  (inter-slit 1.4 to 1.5 mm on a 100 mm square). Now a template failing those checks is converted as
  it is and shown with the read template's note (too close for Tegn; open it there to see where).
  Reproduced on a mask rebuilt from the screenshot (`tmp/e2e/even/userstar.mjs`: the engine, then the
  page's conversion, in Node) and checked on juleflet.dk. Whether Tegn should tolerate the same 0.1 mm
  is the user's to decide.
- **A repair pass after the count stage (2026-11-03): no template gained, not shipped** (branch
  `wip/exact-repair`). A drawing the count stage leaves breaking rules is solved again with every
  column held at its value except those near where it breaks them: within 4 then 8 mm, then whole faces
  and rings of faces around them, the count free to rise there (`exact/repair.js`). On jul-tern it
  takes the count stage's penalty from 47 to 3 in 2 s, but those 3 are closed slit loops (`cycle` rows),
  which no neighbourhood small enough to solve in time mends; jul-2026's traced outline starts at 282
  (273 of them connectivity rows) and stays there. On the 41 test pictures without a template from
  both searches and 15 with one (`nudge/repair-ab.sh`, off and on side by side): ladder alone 23 and
  23 of 56 (median 8.6 s against 9.8 s), today's search alone 18 and 18; two near misses lose a kind of
  failure. The penalty that is left is topological, not local.
- **Relaxing the rules for hearts whose designers broke them (asked 2026-11-03): not done, why.** The
  hearts are davidsstjerne-circ, hjerte-i-hjerte-i-hjerte and santa (designer templates turning over
  150°, clearances 0.2 to 0.5 mm short, santa crossing itself). In Mal a heart carried over from Tegn
  is shown with its designer's own cuts (`useTemplate`, with the too-close note where Tegn's check says
  so), and searched from its picture all three get a fitted template passing every check (both kinds,
  the default). What a relaxation changes is the exact search alone's answer on these three, which the
  page now shows as a near miss with its problems marked; relaxing the search's rules for every picture
  to reach them would weaken every visitor's paper. The search's rules were instead brought up to the
  export's where they were looser (below).
- **The search's inter-slit gap now includes the editor's clearance (2026-11-03).** The export's final
  check asks two slits of one paper to stay the larger of the nominal width and 1.5% of the square apart
  (`validate.js`, HEART_CLEARANCE_UNITS); the search's lazily checked rule (`outline.js` `interGap`)
  asked only the nominal width. The two differ below a minimum width of about 1 mm on 100 mm paper
  (0.5 mm: 1.0 against 1.5 mm) and on paper over about 170 mm, where the search could settle on
  drawings the export then fails. At the defaults nothing changes. 12 library pictures at 0.5 mm
  (`nudge/narrow-ab.sh`): 12 and 12 pass, median 29.0 against 29.3 s, triple-heart 7 hidden cuts
  where 9. The visitor's star picture, rebuilt, fails as before (its best template crosses itself).
- **Closed slits ruled out in the model (2026-11-03): no gain** (`wip/exact-repair`, `ACYCLIC`). The
  papers' flows allow a slit closing on itself as a circulation, cut only once a solution has one;
  an order on each paper's points rising along every arc it takes (as the fitter's paths have,
  `solver.js`) rules them out in the model (+10k rows on jul-tern's 42k). Alone it changes nothing on
  jul-tern: its count stage never leaves its start (penalty 47 from rules the start breaks, at the
  bound 18), with or without it. With the repair pass the 47 no longer falls to 3 (those 3 were closed
  slits), and with 14 s a round, up to whole faces, no drawing near the start breaks less. A drawing
  keeping the rules there is not a repair of the start; it needs another start (the designer's has 25).
- **The fitter's template as the exact search's start never applies on jul-tern** (2026-11-03). The
  fitter's template passes every check there (1.8% from the mask), but the reader cannot place it on the
  traced outline (`template.js` `readTemplate`: "The template's switches do not fit the outline", also
  with its tolerances raised from 1 to about 4 mm), so `exactStart` falls back to the topological
  witness and the search ends as without it (`FITTER_START=1`, with and without `MODEL_TOLERANCE`). A
  start from the fitter needs a reader for templates whose hidden runs meet the outline elsewhere than
  its switches allow, not looser tolerances. Why it does not fit: the reader's switch choice
  (`chooseSwitches`) is infeasible, its only hard rows being one place per hidden run's end and an even
  number of switches on each closed edge, so the fitter's 68 ends switch an odd number of times on some
  closed edge. With that parity a penalty (in the `filt` copy, `SOFT_LOOP`) the reading has 34 chords,
  but searched from directly it gives no drawing in 55 s (its papers inconsistent), and as `exactStart`'s
  hint the topological search repairing it runs out of time: the search then starts from nothing and
  ends 13% from the picture.
  On all 26 test pictures where only the fitter has a template (`nudge/fitstart.sh`, `FITTER_START=1`,
  today's search alone): no exact template. The fitter's template is the start on none of them, read
  and then repaired on 2 (vissevasse-arranged-r2c2 and r3c3, both still breaking rules); the others
  start from the grid or topology (4), find no start in time (3) or end before a start is chosen (17,
  photographs and vissevasse mostly, whose traced outline gives the search nothing to start on).
- **What the network gets wrong, read from its maps; weights edited without training (2026-11-04): no
  gain.** On the 52 test pictures with a designer template that has hidden cuts, the share of the
  designer's hidden cut syn1v marks (its probability within a pixel, median) is 0.87 where its ladder
  passes (44) and 0.50 where it fails (8: roed-blomst 0.32, hjerte-paa-hjerte 0.39,
  hjerte-i-hjerte-i-hjerte 0.41, jul-2026 0.49, santa 0.51, jul-tern 0.52, davidsstjerne-circ 0.55,
  mor-far 0.72); the failing designs have three times the hidden cut (486 pixels against 142) and the
  network is not unsure there (more pixels over 0.5, not fewer). So it does not know these designs'
  hidden cuts: text hearts, nested hearts, santa's figure. Without training (`nn/tta.py`, `soup.py`,
  `agree.py`): the maps averaged over the square's 8 symmetries mark less (0.85 and 0.45); syn1v's
  weights averaged with ei2's (fine-tuned from it) change nothing (0.88, 0.51); with syn1's (another
  run, its decoder started elsewhere) the maps go flat (precision 0.29 to 0.06). syn1 alone marks more
  (0.90, 0.60) at less precision, the trade the 127-picture runs already measured (95 against 93).
  What is missing is not in the weights to be edited out. Nor is it simply more of the training data:
  a quarter of the synthetic designs are already words in random fonts (`gen-synth.mjs`), and syn3's
  data weighted to the hard kinds, text included, scored 93 against 95. On the generator's own word
  hearts held out of syn1v's training (9 with hidden cuts) it marks 0.81 of the hidden cut (370 pixels
  at the median, as large as the failing designs), the figures 0.87 (30): words as such are not the
  gap. By frame, the checkered one is (letters in checks): 0.60, 0.65 and 0.87 on its three, against
  0.70 to 0.95 on the woven, circle and layers ones. jul-tern (a letter in each check) and mor-far
  (checks the size of the letters) are that frame (0.52, 0.72); god-jul (a circle ringed by checks) and
  jul-2026 (a medallion in bands) are not. A training round with more checkered words (ck1, 2026-11-04,
  `nn/ck1.sh`): 836 new words in that frame (random letters, a second word now and then, all nine shipped
  fonts where training had six: `gen-synth.mjs` `CHECKERED=1`), the 354 whose templates keep the
  export's rules, mixed 3:7 with the synthetic pack, syn1v fine-tuned 2 epochs at lr 2e-4 (4 and 6 min on
  the M2 Pro's GPU, a few GB, not the full run's 27). The held-out generator words in that frame mark
  0.92, 0.58 and 0.75 (from 0.87, 0.60, 0.65); the test pictures do not move: jul-tern 0.52 to 0.50,
  mor-far 0.72 to 0.69, the 8 failing 0.500 to 0.507, the 44 passing 0.873 to 0.869. Not run through
  the ladder, not shipped. The frame as it is today is not what the network misses on these hearts.
  jul-tern's layout, a letter in every check turned 45 degrees (3 x 3, S-curved hidden cuts), is not
  what today's checkered frame makes (each letter once, along a diagonal): it is the repeating frame
  the generator dropped in 83cd8068, so the network never saw it. rpt1 (`nn/gen-repeat.mjs` on the old
  generator, `nn/rpt1.sh`): 672 such words, the 266 keeping the export's rules, with ck1's and the
  synthetic pack 25:10:65, syn1v fine-tuned 2 epochs. The designers' hidden cuts marked: 0.884 on the
  44 passing (from 0.873), 0.540 on the 8 failing (from 0.500), jul-2026 0.55 (0.49), santa 0.55 (0.51),
  but jul-tern 0.53 (0.52). Through the ladder on all 33 test pictures syn1v's has no template for
  (`nudge/rpt1-miss.sh`): none gained, 9 near misses, 24 nothing. Not shipped. Adding the missing family
  moves the maps a little and the templates not at all: on these pictures better maps alone do not
  lead to a template (the designers' own cuts as the ranking did not either, section 9).
- **The ladder takes what the export takes, sooner; a loosened last pass (2026-11-04, shipped).** The
  ladder assessed a rung only when it broke none of the model's rules, but the model's limits are a hair
  stricter than the export's: a rung breaking up to `LOW_PENALTY` (5) of them is now assessed too, and
  taken when the export passes it. With more than 90 s (a longer search under Avanceret), the ladder
  alone gets what the one-minute search gives it (50 s, or a third), and the rest goes through it again
  with the model's clearances 0.05 mm lower (`cfg.modelTolerance`: `outline.js` `rules`, `nogoods.js`
  returns), judged by the export's own. On the 33 test pictures syn1v's ladder has no template for
  (`nudge/low.sh`): at 60 s none gained (25 end within a second, their traced outline giving the search
  nothing to start on), at 180 s jul-tern (18 hidden cuts, its count's bound) and
  vissevasse-arranged-r3c3. All 127 at the default minute (`nudge/low-ab.sh`, old and new alternately,
  one process): 91 and 92 (stjernerogkors gained, 59 s to 18 s; none lost), median 9.5 against 7.9 s.
  amy-pinecone and balls failed in one later run and passed in four reruns each (run-to-run variance;
  the old engine also missed balls once in three). Lowered from the start instead the model's
  clearances lose venus and vissevasse-arranged-r3c2, whose returns then fail once smoothed.
- **What a template adds, and saying so (2026-11-04, shipped).** hjerte-i-hjerte-i-hjerte's fitted
  template passes every check 0.4% from its mask but adds three islands of about 10 mm² its picture does
  not have (the features check only asks the picture's regions to be kept). `strayRegions`
  (`feature-shapes.js`) runs the same check the other way round, and the export's report lists them as
  `features.stray`; reported, not failed: as a failure it took templates from photographs whose edge
  noise gives such regions too (a bauble, 10 and 28 mm² beside the paper's edge) and failed nine engine
  tests. Of the 83 designer templates it lists one (fisk, whose template is not its picture's). The page
  names the specks, and a template failing the export's checks now reads as the nearest there is
  ("Ingen skabelon holder alle regler. Her er den nærmeste.") instead of "Skabelonen er fundet".
- **The three photographs without a template** are the photo step's, not the search's:
  danish-red-gold's mask splits one patterned paper into both colours; danish-tree-group-top's crop
  takes two overlapping hearts; gathering-hanging-trio-middle's fitted template keeps every cutting rule
  and the paper but loses two 8 and 10 mm² specks (a red island 76% kept but no longer enclosed, one
  gone), noise in the photograph that the features check counts as the picture's (at least 3 mm²
  with a 0.5 mm core). Tuning the photo step on test pictures would only tune it to them.

- **Regions a template's weave joins (2026-11-04, shipped).** A user's 3 × 3 generator heart with a small
  heart in each white check (Små motiver, 79 %): today's exact search drew two hidden cuts about 3 mm
  apart where both papers' should meet, and the strip of paper between them joined each outer heart to
  the red check beside it (3.75 mm apart in the picture). 0.3% off its picture, it passed every check
  and won the race over the ladder's clean template (3 s, 0.1%). `mergedRegions` (`feature-shapes.js`)
  finds two regions of one colour (each at least 3 mm²) more than 2.5 mm apart that lie mostly inside
  one region of the weave narrowed by 0.5 mm (one-pixel seams join nothing). Regions linked through
  nearer ones are one group: a checkerboard's diagonal checks, joined at their corners, link checks far
  apart (triple-heart's ladder template, flagged at 18.6 mm by a first version without the groups).
  Nearer than 2.5 mm a weave may join on purpose: the tracer's near touchings, and a photographed
  checkerboard's diagonal checks, which the blur leaves up to 2 mm apart (a test fixture's at 1.8 mm).
  It fails the features check in the exact search's own assessment (`stage.js` `assess`) and in the
  export's (`finalFeatureAudit`): on the user's picture today's template fails and the ladder's is shown.
  None of the 83 designer templates is flagged. All 127 test pictures, one process
  (`nudge/merge-ab.sh`, with the first version): the ladder 92 and 92 (venus gained; triple-heart
  lost, regained with the groups), today's search 89 and 89 (balls gained; vissevasse-arranged-r1c1
  lost while the run was paused, passing on a rerun). The fitter's templates join regions too and now
  fail: of the 33 pictures without an exact template, jul-tern (a letter's tail joined to the check
  below by a 3 mm diamond); four engine-test fixtures (the stacked motif 6.25 mm, the checked crown
  12 mm, the crown photograph 4.4 mm), whose tests now allow exactly that shortfall
  (`export-shortfalls.mjs` `passedBut`). Open: the fitter has no term against joins; and on the user's
  heart its alternative (3 + 3 cuts, a third cut on each paper running through the three hearts) clips
  the red checks' corners where it passes between them, 0.5% off and passing. The shadowed-frame crop
  benchmark fails on c51369a4 too, unrelated.
  On juleflet.dk the race then took a second template of today's search (7 hidden, 0.3% off, a white
  hairline through a motif, a red sliver from another) over the ladder's (7, 0.1%): a held ladder
  template stood only with fewer hidden segments. With as many it now stands when closer to the
  picture (`worker-controller.js` `ladderStands`). A second run there gave no exact template at all:
  the fitter's answer went out at 24 s, and once it had, today's failing answer (fewer hidden segments)
  displaced the ladder's passing one, or ended the ladder before it came. A passing template now stands
  against a failing one; after the fitter's answer, today's failing answer waits for the ladder; and
  with today's search given up and the fitter's answer passing, the ladder goes on for the alternative
  instead of being ended.
  Yet runs on the site still showed no exact template: the ladder had not run at all. The search waits
  at most 1.5 s (`CUT_MODEL_WAIT_MS`) for the cut model, 9.5 MB fetched and compiled at Find snit, and on
  a fresh page that is often not enough. Side by side, the maps now go on loading and the ladder starts
  when they come, while no exact template has been taken (also after the fitter's answer went out); its
  coming is waited for as a running ladder's is, until the search time is up. The model held back 8 s on
  the page: the ladder starts at 8.8 s and its template (0.03% off) is the answer at 11.7 s.

- **The page itself on all 127 test pictures (2026-11-05).** `sweep/sweep.mjs`: each picture through
  juleflet.dk's Mal page (Chrome headless, one at a time, the page's defaults), the panel's answer and
  what each worker returned. 121 show a template passing every check; the other 6 have none from any
  worker (jul-2026, jul-tern, and four photographs whose exact search ends at once). One exact template
  Node finds is lost in the browser: vissevasse-arranged-r3c4, whose searches take 48–50 s alone in
  Node and end as near misses beside two other workers. A fitted heart shown while the exact search
  looked stayed when the exact one, also over 1 %, came closer (balls: the fitter's 1.4 % after 10 s,
  the ladder's 1.2 % after 52 s); it now gives way (`verdict.ts` `givesWay`). Six photographs show the
  fitter's heart over a passing exact one 1.3–3 % off (the fitter's 0.4–1.4 %): the page's rule for
  hearts only close, kept. First answer: median 12 s.
  The fitter accepted a candidate on the features check without the joins, so in the browser it ended
  at 10 s on gathering-hanging-trio-bottom's template joining three regions (1.6 %), which the export
  then failed: no template. Its acceptance (`candidate-verification.js`) now uses the export's own
  check (`finalFeatureAudit`); the page then finds one at 15 s (1.4 %). The page's fitter route in Node
  on all 127 (`nudge/fitgate-ab.sh`, old and new alternately): 119 and 120 passing (tak gained), none
  lost, no template's mismatch changed by more than 0.2 points, median 8.2 and 8.4 s.
  The hairlines through a motif (the user's heart, a run of today's search on the site) are cuts of the
  two papers drawn nearly together: of today's 107 saved templates on the test pictures
  (`sweep/slivers.py`: A's cuts 0.03–0.4 mm from B's in runs over 1.5 mm) three have any
  (hjerte-i-hjerte-i-hjerte, jul-tern, lilje1; 1.7–2.8 mm), the user's heart's none. Rare, not chased.
  jul-tern's ladder template at 180 s (the loose pass, 18 hidden, 0.47% off), counted solved above,
  joins a letter's tip to the check beside it by a red wedge 4 mm across: it now fails, as do those at
  90 and 120 s. No search time tried gives jul-tern a template; a longer default would gain
  vissevasse-arranged-r3c4 (48–50 s alone in Node), which the page's minute misses.
  Tried, not shipped: the joins as the solver's own lazy rows. A solution whose weave joins regions
  (checked on HiGHS's improving solutions at most every 300 ms, and on each run's last) ended the run,
  its hidden segments within 2 mm of the gap forbidden together at the rules' penalty, and the search
  went on. The rows came (the user's heart: two; god-jul: one), but no search then found a template
  without joins in its time: today's search on the user's heart kept its joined drawing at the penalty
  (where the ladder's candidates hold a clean one, found in 3 s), jul-tern and god-jul ended as before.
  gathering-hanging-trio-middle's exact templates (both searches, 1.4% off) fail on one region: a red
  strip 1 mm wide and 10 mm² that a one-pixel white seam of the photograph's mask cuts off the red check
  beside it. The template takes it into the check, as the paper must (a strip narrower than a cut can
  leave); the features check (3 mm², 0.5 mm core) asks for it. Not changed: a core rule wide enough to let
  it go would let letters' 2 mm strokes go too.

- **Generator hearts on the page; the symmetry fallback ends untied (2026-11-05).** 40 new generator
  hearts (`nn/gen-synth.mjs`, seed 5150, held out by their seed) through juleflet.dk's Mal page
  (`sweep/sweep.mjs`, `gensweep/gsum.py`): 32 show a template passing every check. 20 of the 40 have a
  generator template keeping the export's rules (`even/genvalid.mjs`), so an exact one exists; the page
  showed one on 11 of them, the fitter's on 7, the nearest on one, and one run ended "Beregningsmotoren
  kunne ikke indlæses" after 19 minutes on a swapping machine (a rerun: the ladder's at 11 s).
  Three of the exact misses (a letter and a number in a hexagon, an O) are symmetric twice over
  (antiTranspose and its turn): under both ties the count has no solution; under the turn alone the
  outline is not symmetric enough, or the drawing breaks rules and the fallback stopped there, taking
  it; the diagonal alone was not reached. Untied, today's search passes all three 0.1–0.5% off. The
  fallback (`stage.js` `fallbackTies`) now takes a drawing under part of the symmetry only when the
  export takes it, and searches untied for the last share, keeping the closest drawing should none
  pass. Today's search alone, old and new alternately (`nudge/untied-ab.sh`, `gensweep/untied-ab-gen.sh`):
  36 generated hearts with two or more symmetries 11 → 21, none lost, median 45.6 → 40.4 s; the 43
  test pictures with as many 41 → 41, the same fallbacks taken (davidsstjerne-circ's crossing near
  miss is gone, its fitted template shown as before).
  Still without an exact template: square-number-7-check, whose middle motif meets at one-pixel
  diagonal contacts (crossings): the generator's own cuts read onto our traced outline come 1.44–1.495 mm
  apart (1.5), untied the search comes within one rule, and the outline widened for rounded tips erases
  the motif (0.65%, a region lost); and two corners-frame hearts (checkered corners round a circle or
  a rounded square) with no drawing at all, untied too, like davidsstjerne-circ.
  A ladder template above the traced outline's bound is held while today's search goes on: on the 23
  pictures of both sweeps where the ladder's came first and both passed, today's had fewer hidden cuts on
  8 (origami 28 → 4, dagognat 9 → 3), as many on 13, more on 2, after 13 s more at the median. The hold
  stays; showing the ladder's at once and swapping would be the page's to decide.

- **The ladder's plain K300 sooner (2026-11-05, shipped).** A user's 4 × 4 heart of small stars (Små
  motiver, `star4/`) failed on the page: today's search stalls at its bound (16 hidden cuts, rules
  broken), and the ladder's template, K300 on the rounded outline in 4–6 s, came only in the second
  phase, 40–43 s in, after the first had spent each outline's share on the samples before K300 and given
  K300 4 s. The first phase now runs K10, K10′, K30, K10″, K30′, K100, K300 (6 s), then the remaining
  samples (`stage.js` `ladderRungs`): star4 11–18 s, god-jul 35–46 → 11–34 s. The ladder alone on 169
  pictures (`nudge/plain2.sh`: 127 test, 40 generated, the two users' hearts; the 14 that changed run
  twice more, `nudge/interr-ab.sh`): passing 115 → 114, median 10.7 → 9.4 s where passing; lost
  brand-discord-corners and battery-4-layers (generated; 2 of 3 runs → none: the samples of K100 on the
  rounded outline, and the second phase's K300 there, out of time), which today's search passed in the
  page sweep (28 s, 31 s). The plain rankings first all through (K10 to K300, then the samples) were
  faster still (median 8.8 s) but lost play-card-j-silhouette, which K30's first sample finds on the
  wider outline (3 of 3 → 0 of 3). Every reordering trades one picture's rung for another's: the
  first phase's time is fixed and split over the outlines.
- **A benchmark of the generator's hearts; untied under a single tie (2026-11-06, shipped).** Each
  picture the user sent was fixed at another's cost: the ~170 test pictures are mostly simple, the
  generator's hearts the hard ones, and a 1-2 picture A/B moved with the machine's load. Two tools:
  - The CPU clock (`even/prodcheck3.mjs` `CPU_CLOCK`): every deadline, HiGHS's `time_limit` too (both
    read `performance.now`), counted in the thread's CPU time. Verdicts repeat at moderate load (14 of
    14); under load ~14 a marginal picture still flips (fejlternet's ladder, on either core).
  - 170 hearts from the generator's offered presets (`bench/gen-bench.mjs`): every figure frame with 8
    motifs, every board and strips size with star, heart and tree, every text frame with 6 words (JUL in
    3 more fonts); 161 distinct (a board's default size is its 5, motifs' and strips' their 4). Masks as
    the page imports them (`rasterizeDesign`), each with the generator's own template checked as the
    export is (`even/genvalid.mjs`: `verdict`, then the paper after `verifyPaper`): 85 export, a proof
    that the picture has a template. The 9 twins agree in 35 of 36 runs (the other at 53 s, the end of
    its time).

  Main on the 161, each search alone (`bench/base.sh`, `bench/summary.py`): 92 pass (ladder 89,
  today's 70), the first template in 5.1 s (median, CPU); 11 of the 85 with a template missed. Of the 69
  failing (today's/the ladder's reason): no template 30, no template and rules or regions 14, rules 10,
  regions 9, mixed 6. The strips frame passed 1 of 17 (4 with a template): its hearts are mirrored on a
  diagonal, one tie, none under it, and `fallbackTies` went untied only after parts of the symmetry, of
  which a single tie has none. It now goes untied there too (`bench/fix.sh`, `fix-core`), on the 161:
  92 -> 97 pass (strips 1 -> 4: heart on 3 and 4, flower; NOEL checkered; 2026 woven in a square, with
  no tie, noise; star on 4 strips in 1 of 2 runs, at 53 s), none lost; with no template from either
  search 30 -> 15 (the rest a template breaking rules, the nearest); on the 66 with one tie and a
  template, median where both pass 5.85 -> 5.6 s. Nisse in layers and on the board changed once, and
  change as much on main's core (`bench/nisse-ab.sh`: layers 48 s, then none twice; board 24 s, then 47 s). The 30 test pictures with no template in some run
  (`bench/fixab.sh`): unchanged (fejlternet's ladder noise).

  Missed still with a template (9): heart on 5 board strips (12-14 hidden, a cut through itself, 3
  clearances short), the snowflake in corners (its template, 4 hidden, kept by the model, none found from
  no start: only untied and K1000 or K300's samples give one, 13-27 s), star in motifs (5, 6), star on 3
  and 4 strips (regions; one clearance 0.9-1.8 mm short), JUL woven in oswald and kalam, NOEL woven
  letters. Most strips hearts still failing have no template from the generator either.
- **The generator's hearts the search misses: the start, not the model (2026-11-06).** The 43 hearts
  failing on regions in either search were solved again with their templates saved (`bench/regions.sh`)
  and audited as the search judges them, specks under n²/1333 px gone (`bench/featdir.mjs`, the harness's
  verdict on 68 of 68). 38 have no exportable generator template. The failing templates are fallbacks:
  plain weaves with no hidden cut (Små motiver: 10 to 24 motifs lost), or drawings of a solution that still
  breaks a lazily added rule when HiGHS's time ends. A detached loop is drawn by no slit (`slitPiecesOn`
  walks from the border), so the drawing passes the cutting rules and loses that region (star on 3 strips:
  its bottom tip, 0.4% of the picture, its whole 0.5% error). The rule is a row; HiGHS had no time left.
  - Star on 3 strips, traced outline, untied (`bench/islandprobe.mjs`): from the generator's template, a
    passing template in 5-10 s (2 hidden, 0.04% off). From the topological start, none in 40 s: its
    witness has 1 hidden cut (the count bound), which no drawing keeping the rules has, and HiGHS ran 3
    rounds in 37 s, the gap still 99.98%. No help from (`bench/dbg-core`): the fine grid (penalty 15,
    a model 4 times larger); stopping a run once its improving solutions break rules not yet rows (2
    stops, the same penalty); a topological witness 1 or 2 above the bound (other topologies, penalty
    29 and 42). The topological search knows no geometry, and only the generator's topology draws.
  - The ladder with oracle maps (the generator's own cuts, `nn/oraclemaps.py`), untied: K10 to K100 all
    fail; with the template's switch positions added to the grid, K30's third sample passes, at 24 s. A
    rung starts from nothing and uses the maps only to rank hidden cuts; the template start also gives
    each run's paper and the switch places.
  - From their generator templates (untied, 30 s), 5 of the 11 missed with one pass: star on 3 and 4
    strips (5, 16 s), snowflake in corners (20 s), heart on 3 and 4 strips (1-2 s, which the untied
    fallback above already finds). The other 6 (motifs, text) are not read onto the traced outline.
    Templates the export rejects are not repaired from their own start either (4 strips hearts: 2 not
    read, 2 still breaking rules at 30 s), so they give no labels for training this way.
  - The network (syn1v) on star on 3 strips: of its 104 hidden-cut pixels over 0.5 none lies within a
    pixel of the generator's hidden cuts (0.09 at most on those), paper right on 71% of the outline. Its
    training kept 10 of 78 strips designs (13% export) and 17 of 37 motifs ones (`--drop`); new strips and
    motifs designs with random icons (`gen-synth.mjs` `STYLES`, `EXCLUDE`): 0 of 20 export.
  So a heart carried over from Tegn has the start the search lacks, its own template; but the user
  ruled that out (2026-11-06: Mal solves from the picture, and starting from the answer it was handed
  is cheating). Any start must know the geometry: the network's paper and
  switch maps as a rung's start, or a topological search told which chords cannot be drawn.
- **Teaching the network the strips hearts; the network's maps as the start (2026-11-06).** Three
  routes for the generator's hearts the search misses (the entry above), none winning one.
  - New designs (`nn/synstrips.sh`: 3 h of `gen-synth.mjs`, styles strips, motifs and board, the
    benchmark's 8 motifs left out): 1733, of which 309 export (board 172 of 298, strips 101 of 1283,
    motifs 36 of 152), 2472 with their symmetric copies (`synstrips/pack.npy`). syn1v fine-tuned one
    epoch with them a fifth of it (ss1, 17 min): the benchmark's readings (`bench/readall.mjs`, the maps
    read onto the traced outline against the generator template's reading) no nearer, 30 of 89 within a
    tenth of the edges, the mean share of edges differing 0.342 (syn1v 0.344); motifs 0.84, strips 0.42.
  - Even on its own training designs the network reads strips hearts 60% off: the paper on visible cuts
    right on 72% of their pixels (syn1v 70%, chance 50%), motifs 79%, board 93%; hidden cuts found
    (66% within a pixel on strips, 97% on board) but 7 of 10 predicted ones not the template's. An epoch
    with the new designs half of it (replay.py: 6000 pictures of the old packs, 1.6 GB, beside them):
    strips 73.5%. Training on all nine packs reached a 12 GB footprint and made the user's machine slow;
    on the replay pack 7.7 GB after one epoch, 6.3 GB with the MPS allocator capped (watermarks .4/.25):
    neither run finished, and longer training waits for an idle machine.
  - Where the network is sure (paperA under .2 or over .8) it is right: 92-100% of those pixels on all
    training designs but three (76-80%), covering 20-70% of each heart's cut pixels; the rest near .5. An
    edge read sure (80% of its samples sure, each switch's hidden cut clearly on one side; dbg-core
    `mapsReading` `sure`) differs from the template on 2-7% of edges (board, figures, strips; text 0.5%),
    against 13-38% for all edges; motifs are the exception, sure and wrong on 67%.
  - The start from the sure edges alone (dbg-core `MAPS_PARTIAL`: the repair holds only their papers,
    switches and sides; `HOLD_TIGHTEN`: tightened under those, where the plain tightening drops them and
    collapses to the count bound's topology): star on 4 strips' witness then agrees with its template on
    32 of 40 edges at its 1 hidden cut, and HiGHS ends one rule short (penalty 1, at 45 s and at 90 s;
    the fine grid: penalty 17). Holding the unsure edges too, let go first (`MAPS_TIERED`): worse. On
    the 68 distinct hearts failing today (`bench/partial.sh`): 5 pass, 4 of which the same probe passes
    without the maps, the fifth (JUL oswald circle) with no start in either run; and the hinted
    topological search ran out of its 3 s on 58 of them, where the plain one finds a witness (tree in
    motifs). So no maps start in the core.
  - The near misses: of the 68, 8 have a template within 0.3 mm of the clearance rules, every one also
    failing the paper (5 'fail', 3 'uncertain' even at 1000 cells). The final return repair moved 2026's
    five short returns apart in 0.5 s and was refused on an undecided 360-cell lattice; checked finer as
    the assessment does (`verifyPaper`; bench/rr-core) it stays undecided, so the export refuses it too.
    GOD JUL's repair refuses at once ('initial_symmetry': its template keeps less symmetry than the mask
    asks); heart on a 5 x 5 board has a self-crossing, which the repair does not take.
  Left: the network trained longer on strips hearts when the machine is idle (`nn/idle-train.sh`; one
  epoch: strips paper on cuts 0.735 to 0.739); the paper core in the search for the near misses. Not a
  route: a carried-over heart's own template as the start (the user: cheating).
- **A symmetric picture is taught two answers (2026-11-06).** Why the network's paper map stays near 74%
  on the strips designs it is trained on: trained on 16 of them alone (8 copies each, 40 epochs,
  `nn/over/run.sh`), it learns their hidden cuts by heart (recall 1.0, precision 0.62) but their papers
  only to 86%, the loss still falling slowly. Most strips pictures are symmetric about a diagonal while
  their generator templates are not; the pack holds the template and its mirror image (`dihedral.mjs`,
  papers swapped correctly), both valid for the one picture, and on that picture they agree on 49 to 87%
  of the cut pixels. The paper map can only learn their mean. `train.py --sym-min` teaches each picture
  the nearest of its valid templates instead (`sym_alternatives`: the row's template moved by each
  symmetry its picture has, papers swapped where columns become rows, spread a pixel onto the row's own
  cuts; `min_losses`: every loss per picture against each, the smallest taken), so a symmetric picture
  gets one consistent template; `synstrips/fitscore.py` scores the paper against the nearest too (today's
  models: the same as against the template, 0.741). Ruled out on the way: the ladder from its own failing
  template's switch places (star on 3 strips: its 4 switches lie on other edges than the generator's 4)
  and with the generator's switch places but the network's maps (no rung passes; with the generator's
  own maps K30 does), so the maps are the limit. And the order of the ladder's rungs: on the snowflake
  in corners each of 14 rungs (K10 to K1000, 3 seeds) ends in 1 to 15 s without a template.
  On the 16 designs alone (`nn/over/run-sm.sh`) `--sym-min` reaches 0.908 against the nearest valid
  template (0.862 without), the paper loss 0.211 (0.272); motifs and board unchanged (few symmetric).
  Eleven epochs more of the replay and synstrips packs with it, while the machine was idle
  (`nn/idle-train.sh`, about 4 minutes each), from epoch 1's 0.741: strips 0.765 (hidden recall 0.86,
  precision 0.40, from 0.71 and 0.31), motifs 0.836, board 0.958; still rising slowly.
  Where the search finds none, the fitter's template is what the page shows (`bench/fitter.sh`): of the
  68 missed distinct benchmark hearts it passes on 34, 1.05% from the mask in the median (2.4% at most):
  every board, corners, layers and sunburst heart, 12 of 15 strips, 6 of 16 motifs (none from 6 motifs a
  side up), 7 of 28 text hearts (no nunito word on strips, layers or checks). So the page gives a passing
  template on about 130 of the 161 (96 exact).
  That network (`idle/m-e12.pt`) on the benchmark, the ladder alone from its maps (`bench/e12.sh`): 103 of
  170 against the site's 95 (with today's search 106 against 98). Three runs each of the 14 it changed
  (`bench/e12/confirm.sh`): 26 passes of 42 against 17; held: elephant on the board and reindeer in the
  corners (3 of 3 against 0, neither found by today's search), JUL oswald in layers, heart on strips;
  lost: JUL nunito and righteous in a circle (0 of 3 against 3; today's search finds both in 22 s). But on
  the 127 test pictures through the browser's float16 path (`nn/e12-test.sh`): 91 against the site's 95,
  none gained; tak and gathering-hanging-trio-top lost 3 of 3 (its K300 rung no longer finds them; epoch
  1 still does). Not shipped as it is. The two networks' weights averaged (`nn/soup.py`, from the same
  start): 0.7 of the site's and 0.3 of m-e12 (`m-soup3`) keeps tak, gathering, both circles and kalam's
  checks and still gains reindeer, elephant in the sunburst, nisse with motifs, the strips hearts, JUL
  oswald (13 of those 17 pictures; half and half 12, losing tak). hjerte-paa-hjerte fails with both (the
  site's ends at 52 s). Its full runs (`nn/soup3-full.sh`): the 127 test pictures 95 against the site's
  95 (venus gained, hjerte-paa-hjerte lost; median 6.2 s against 8.0 where both find a template), the
  benchmark 104 against 95 (10 gained, flower in the corners lost). Three runs each of those 13
  (`nn/soup3-confirm.sh`): 29 passes of 39 against 18: reindeer in the corners, JUL oswald in
  layers 3 of 3 against 0; nisse with motifs and the blank word on a woven square 3 against 1; heart on 2,
  3 and 4 strips, venus and NOEL on strips 3 against 2; flower in the corners 0 against 2 (today's search
  finds none either: lost); hjerte-paa-hjerte 0 against 3 (the site's at 52 s), which today's search beside
  it finds in 16 s. **Shipped** as `cuts-4362d1d3.onnx` (float16, same size), replacing syn1v.
- **After the soup (2026-11-07): nothing more shipped.** What was tried on the benchmark's misses:
  - Twelve more idle epochs from m-e12 (`nn/idle2-train.sh`, the same packs and `--sym-min`): strips
    paper on cuts 0.764 (0.775 against the nearest symmetric template), hidden recall 0.834 and precision
    0.445, motifs 0.841, board 0.977: a plateau. Its soup with syn1v (0.7 and 0.3, `m-soupB`) passes 12 of
    the 17 deciding pictures against m-soup3's 13 (elephant in the sunburst lost).
  - Two networks side by side: the ladder from soup3's maps or m-e12's passes 109 benchmark hearts where
    soup3's alone passes 104, at twice the ladder's time and a second download. Not worth it.
  - Ties off for the whole run (`NOSYM=1`) on the 14 failing strips hearts: only tree on 3 strips passes
    (26.5 s); star on 3 strips stays 0.113 mm short.
  - Proving there is no template under the ties before the ladder (bench/lns-core `PROBE`: one rung on
    every candidate): HiGHS proves it in 2.3 to 4.2 s on the strips hearts, but the untied fallback needs
    its own time after it, so no heart ends sooner or differently.
  - Carrying a rung's rule-breaking solution into the next rungs as their start (bench/lns-core `LNS=1`:
    its segments kept among the candidates, its papers and chosen cuts the start; the incumbent breaking
    fewest rules): on the 20 ladder near misses 1 gained (tree on 3 strips); on the 127 test pictures 95
    against 95, the same pictures; on the benchmark 102 against 104. Three runs each of the 4 hearts it
    changed (`bench/carry-confirm.sh`): 8 passes of 12 against 7, each heart flipping in both arms (tree
    on 3 strips 1 of 3 in each). No measurable effect.
  - The fitter's passing template as the ladder's maps (`bench/fitmaps.sh`: prodcheck3 `SAVE_FITTER`, then
    `oraclemaps.py` on it, alone or averaged with the network's by `blendmaps.py`), on the 29 benchmark
    hearts only the fitter passes: 3 exact templates from its maps alone (elephant on the board and in the
    corners, reindeer in layers), 3 from the mean (heart on a 5 x 5 board, elephant in the corners, tree on
    3 strips), mostly at 50 to 55 s and after the fitter's own 8 to 37 s. The rest end as before: near
    misses on the strips hearts (the fitter's drawing is not one the outline's candidates can make), lost
    regions on the motifs, no template on the text hearts. Too little for a second ladder after the fitter.
- **Where the ladder's time went (2026-11-07): shipped.** A CPU profile of one heart passing at 42 s
  (flower on strips, `node --cpu-prof` on prodcheck3): HiGHS 11.4 s, the paper audit 12.4 s, the
  candidates' clearance test 6.6 s. The same template's paper was audited up to four times (the model's
  audit of an incumbent, the search's final check, the ladder's ranking; each `verifyPaper` then
  `finalMaterialAudit` at the lattice it had just settled on), and `Outline.nearLocally` (27 million calls)
  formatted a point key for each edge end on every call, where most calls lie past `rules.local` along
  the route and so have a limit below zero. Now: `materialAudit(..., {reuse: true})` answers from the
  last six family audits whose chords and fold endpoints are exactly the same (copies, maps kept), asked
  only by the exact search (`verifyPaper`, `paperSpots`, `assess`); the export's audit and the fitter's
  never reuse. `nearLocally` keeps each edge's touching ends and returns at once below a zero limit (100
  million calls on three hearts checked against the old code: no difference). The audit 12.4 to 5.4 s,
  the clearance test 6.6 to 3.0 s, HiGHS 11.4 to 18 s of the same run.
  - Measured with `bench/memo-core` (which also reused the export's audit; same verdicts, a little
    faster): on the 127 test pictures (`nn/memo-full.sh`) 95 against 95, the same pictures, median 5.0 s
    against 6.4 to the first template (mean 9.8 against 10.4); on the 170 benchmark hearts 102 against
    104, median 4.8 s against 6.8 on the 101 both pass (mean 11.3 against 12.6).
  - The 4 benchmark hearts that changed, three runs each on HEAD's core and the shipped one
    (`bench/memo-confirm.sh`): 5 passes of 12 against 3. Tree on 3 strips passes every time (25 s; 0 of 3
    before); the other three flip near the deadline in both arms (2026 woven square 1 of 3 each, NOEL on
    strips 1 of 3 against 2, JUL oswald on strips 0 of 3 each).
- **Two ladders side by side (2026-11-07): shipped.** After the faster audits a heart still passed when
  the rungs before it had run out their time: flower on strips at 41 s either way, its template from the
  second outline's long rungs. The ladder searches up to five outlines (traced, tips rounded, rounded,
  wider, outer strip), each phase's time shared among them, and 69 of its 102 benchmark templates come
  from the traced outline's first phase (2.6 s at the median), the second outline's 14 s, the second
  phase's 30-51 s. Now, where the machine reports 8 threads (and not under 4 GB), the page runs two ladder
  workers, each on every other outline (engine.js `ladderPart`, worker-controller.js `ladderGroup`: the
  first template stands at once, else the better near miss once both have answered). Measured with
  `bench/split-core` (`LADDER_PART`, `bench/split.sh`), the pair counting a pass in either at the earlier
  CPU time:
  - 170 benchmark hearts: 110 against 102 (part 0/2 alone 106: the traced outline's cheap rungs get more of
    the first phase; NOEL woven letters there at 14 s), solvable missed 12 to 9. On the 101 both pass,
    the first template at 3.3 s against 4.8 at the median (7.3 against 11.3 on average; on the 50 the
    single ladder took over 5 s for, 8.2 against 14.1).
  - The 10 hearts that changed, three runs each (`bench/split-confirm.sh`): the pair 30 of 30, one ladder
    12 of 30. Gained every time: elephant on the board (50 s), tree in small motifs, b3 (13 s), JUL oswald
    woven square (17 s), NOEL woven letters (14 s), ANNA checkered (34 s) and on strips (50 s); sooner:
    elephant in the sunburst 52 to 43 s, flower in the corners 52 to 22 s, 2026 woven square 53 to 15 s.
  - 127 test pictures (`bench/split-confirm.sh`'s second half): 96 against 95, none lost (fejlternet
    gained, 12 s); on the 95 both pass the first template at 3.0 s against 5.0 at the median (6.3 against
    9.8 on average; on the 47 over 5 s, 7.5 against 11.3).
  - In Chromium (12 threads) on the flower in the corners: four compute workers, the fitter's template at
    21 s and an exact one (0.7% off) as the alternative some 20 s later, wall clock on a busy machine.
  - One ladder (machines under 8 threads) now counts the traced outline twice in the first phase
    (`TRACED_FIRST_WEIGHT`: a third of it with five outlines, as the pair's part 0/2 has; `bench/weight.sh`):
    the 170 hearts 103 against 102, the 127 test pictures 96 against 95, none lost either way (the two gained
    late: 2026 woven square at 54 s, fejlternet at 47 s); the first template at 3.5 s against 5.0 at the
    median on the benchmark, 4.3 s against 5.0 on the test pictures: the traced outline's rungs to K300 fit
    in the first phase.
  - Three ladders where the machine reports 12 threads (and not under 8 GB; outlines 0 and 3, 1 and 4, 2;
    `bench/three.sh`, `bench/three-confirm.sh`): the 170 hearts 115 against two's 110, none lost; three runs
    of the 5 gained: 10 of 15 against 4 (reindeer in layers 44 s and ANNA in the circle 48 s every time,
    against never; tree on 3 strips 11 s against 21; star on strips never in either, NOEL on strips once in
    each). The 127 test pictures 98 against 96, none lost (roed-blomst 40 s, vissevasse r4c1 35 s), the
    first template at 5.6 s against 6.4 on average.
  - The fallback ties' floor kept (stage.js exactSearch; `bench/reserve-core` FALLBACK_RESERVE): alone, the
    ladder under all the ties took every second of an outline, so the fallbacks after it (part of the
    symmetry, untied) started only when `TURNS_FLOOR` (6 s) was left, which it rarely was. With 3 minutes
    (Avanceret) three of the 7 solvable hearts still missed passed: JUL kalam woven square at 22 s and star
    on strips at 29 s, both untied, snowflake in the corners at 170 s. Now, with at least two floors' time, the
    tied ladder leaves the fallbacks one. Two ladders: the 170 hearts 114 against 110, the 127 test pictures
    95 against 96; three runs of the 4 that changed: JUL kalam 3 of 3 at 21 s against none, star on strips b4
    none in either, NOEL on strips once in each, vissevasse r3c3 2 of 3 at 52 s against 3. Three ladders:
    115 and 98 as before (JUL kalam gained at 20 s, star on strips, a flip, lost). One ladder rarely has 12 s
    on an outline.
- **How far the templates are from their pictures (2026-11-08): two changes shipped.** The bench now logs
  every exact template's mismatch with its mask (`off`; `bench/off2.sh`, two ladders, the page's core). At the
  median of the passing ones, on the 170 hearts and the 127 test pictures:
  traced outline 0.10% and 0.34%, tips rounded 0.19% and 0.55%, rounded 0.54% and 0.69%, wider 1.1% and 1.8%.
  The opened outlines lose more than an edge's sub-pixel place: opening the mask by two or three pixels cuts off
  what hangs on a thin neck (the nisse in small motifs, 1.66% off: its hands, feet and pompom), and the
  redraw on the mask only moves edges, never brings those back.
  - The redraw reaches as far as the outline was opened (refine.js `edgesOnMask` `open`, raster.js metadata
    `open`; `bench/unround-core` UNROUND, `bench/unround.sh`): of the 74 templates found again on the same
    outline and rung, 40 came closer to their masks, 9 a hair further, 25 the same (the 170 hearts' median
    0.33% to 0.30%; flower in the corners 0.29% to 0.08%). The passes that changed all came on another
    outline or rung, in both directions (4 gained, 5 lost): the redraw is taken only where it passes, so the
    flips are the clock's.
  - Two ladders' first template is often the coarser: in 9 of the 41 pictures both found one, the first came
    from a more opened outline, and the closer one from the other ladder 0.1-35 s later (star on the board
    b7: 1.17% off at 15.7 s, 0.33% at 15.8 s; elephant on wedges 1.59% at 16.6 s, 0.64% at 19.6 s; triple-heart
    1.80% at 26.8 s, 0.73% at 27.6 s). Now a template more than 0.7% off waits for the other ladders a quarter
    of the time so far (2-8 s; worker-controller.js `LADDER_FINE`, `LADDER_GRACE`), and one at least 0.2 points
    closer stands instead. On the baseline's times 6 pictures get the closer template, for 0.35 s more at the
    mean (10 of the 113 passing benchmark hearts wait, 15 of the 95 test pictures).
- **More time does not crack the hard test pictures (2026-11-08).** The 14 test pictures that search the whole
  ~50 s without a template, given 3 minutes each (`bench/long-test.sh`, two ladders, the page's core): 3 pass,
  roed-blomst and the vissevasse r3c3 and r4c1 flips (which pass and fail between runs anyway). The other 11 are
  not short of time; the cuts they need are not among the candidates (JUL i tern's best template is right but
  for one whole L, the near miss studied 11-03/04). The 18 test failures that end within a second are uneven
  photo crops the exact search cannot start on.
- **Damaged masks (2026-11-08).** The 34 test pictures two ladders pass, damaged 7 ways (`bench/rob.sh`; the
  masks in `tmp/e2e/even/<kind>`, made from the gallery's masks, so the control is those: `bench/rob-clean.sh`,
  34 of 34). Two ladders pass, of 34: edges jittered 34, bumps 34, grown by a pixel 33, shrunk by a pixel 33,
  scratches 33, grown with ragged edges (`c2`) 32, blobs of radius 2 to 7 (`bigspecks`) 27. The losses:
  - god-jul (scratches, shrunk, `c2`): its letters' necks are at the paper's limit, so any damage there
    breaks them; the template returned is a near miss.
  - lilje1 (grown, `c2`): its leaves are split by white lines a few pixels wide, which growing the red
    closes: a different picture.
  - blobs: radius-7 blobs (9.3 mm², 149 px) stay in the picture by design (the despeckle limit is 120 px, so
    that jul-2026's 144 px digit counters stay); amy-pattern, god-jul, hvirvel, plus and lilje1 (that one also
    a near miss) get a template that drops one or two of them, reported as missing features; amy-weave-2's
    sit on checker corners and join diagonal cells, a different picture with no exact template. Puslespil lost its template to two blobs biting into the square's edge,
    which the despeckle did not take: now it does (MAL-PICTURES.md "Larger blobs at the edge"), and puslespil
    is exact in 3.3 s (blobs 28 of 34).
  The median distance of the passing templates from their masks: clean 0.27%, jittered edges 1.64% (the
  jitter itself changes 1.3-2.7% of the pixels, and a template follows the smooth edge; 27 of the 34 still on
  the traced outline), `c2` 0.69%, the rest 0.25-0.30%.
- **Crops a little off (2026-11-09).** The same 34 pictures shifted right and down by 3 and 6 px (0.75 and 1.5 mm
  of the 100 mm square, the edge repeated into the gap) and scaled 2% about the centre (`bench/rob2.sh`, main
  b77d449a): 33, 32 and 33 of 34, the median distance from the mask 0.27-0.36% as clean. Lost: god-jul at 6 px
  (its necks, as above) and ball in all three. Ball's circle comes within the outer strip's width of the side
  (today's search: a template at its bound of 4 hidden cuts, `outer_side_clearance` only), and the outline
  pulled off the sides (border.js `outerStripBand`) leaves it, as the circle comes closest where a checker
  line ends on the side, which the band takes for a cut ending there at an angle. No near miss on the 170
  hearts or the 127 test pictures has that rule broken, so the band's rule stays.
- **Thin parts widened instead of opened away (2026-11-09): not shipped.** Some near misses are the picture's:
  heart on strips b5 has two visible slits 2.23 mm apart where the paper needs 2.505. Every part of either
  colour from 0.75 mm to that width plus 0.1 mm wide made that wide (the distance transform's ridge points
  grown by a disc, red first, then white; `bench/widen-core` raster.js `widenNecks`, ~20 ms at 400 px), the
  outlines traced from it pass 5 of the 9 near misses studied (JUL oswald on strips, 2026 woven, tree on strips
  b5, heart on the board, reindeer in layers; 0.2-2.5% off the painted mask). In the ladder, two ladders:
  - The opened outlines made from the widened mask instead (`bench/widen.sh`): the first ladder 102 of 170
    against 106, three gained, nisse in motifs and elephant on wedges lost (found in 16 and 20 s before).
  - Widened copies added after the five outlines, where they differ (`bench/widen2.sh`; they do on 140 of the
    170 and 88 of the 127): 90 against 88 of those 140 (heart on the board, elephant in corners and reindeer in
    layers gained, star on strips b4 and NOEL on strips lost), 78 = 78 test pictures. But seven templates came
    further from their pictures (tree in motifs b4 0.08% to 1.14%): the outlines share a ladder's time, so
    with more of them the traced outline's share runs out sooner and a more opened one answers first.
  Only as a last resort, given time once the picture's own outlines have none, could it keep the precision,
  for about two of the 170.
- **What the page shows where the two ladders miss (2026-11-09).** The 56 of the 170 and 31 of the 127 the two
  ladders give no template the export takes (`bench/off2` with `unround`), searched by the smooth fitter alone, as
  it runs beside the ladders on the page (`bench/fitter2.sh`, main's core, CPU clock): it passes every check on 24
  of the 56 and 25 of the 31. The page so gives a passing template on 138 of the 170 and 121 of the 127. The 6 test
  pictures without one (danish-red-gold, danish-tree-group-top, gathering-hanging-trio-middle, jul-2026, mor-far,
  vissevasse-scattered-blue-fish) all lose a region in the fitter's template too.
  Of the 32 generator hearts left without one, 31 have no template the export takes from the generator either
  (its own breaks the cutting rules there); only star in motifs b6 has one. The generator's own templates pass
  on 93 of the 170, the page on 138.
  Four of the 32 miss only the image limit with the fitter (every cutting rule kept, 3.8-5.6% off); the fitter
  with Avanceret's 3 minutes stops early (83-139 s) and stays over 3% on all four (snowflake in layers 3.8%,
  star in motifs b6 4.1%, tree in motifs b6 and b7 over 4%, b6 now losing a region).
- **The "features-only" misses are the search's (2026-11-09).** 24 of the 56 end with every cutting rule kept but
  a region lost. They are not lost in `finish`: the ladder's nearest is a plain weave with every motif or letter
  region 0% kept, 2-11% off the picture. Only 3 of the 24 have a generator template the export takes (star in
  motifs b5 and b6, star on strips b3); of all 56, 7 (`bench/genassess56.jsonl`, `even/genassess.mjs`). Ranked as
  the search ranks a near miss (`exact/stage.js` `assess` `near`; `bench/vsgen.py`), our answer is behind the
  generator's own template on 45 of the 56 (ahead on 8): the generator keeps the regions and misses clearances
  by 0.03-2 mm, which the search's model never draws. Lowering the model's clearances by 0.5 mm for the whole
  ladder (`bench/best-core` `BEST_TOL`) changes none of 8 such hearts; nor does the generator's template as the
  start (heart in motifs b5: the reader cannot place it on the traced outline). Motif hearts pass from 2x2 to
  4x4 squares (bound 4-16 hidden cuts, 1-47 s) and none from 5x5 up (bound 24-64): the count of hidden cuts the
  board needs outgrows the search.
- **Three ways at the motif boards that did not work (2026-11-09).**
  - Each motif square tied to its diagonal neighbours (`bench/trans-core` `TRANSLATE=1`: `symmetry.js`
    `PartialTranslation`, ties only where the step maps an edge onto an edge, the board size found from the
    outline: 5x5 star 32 of 52 edges, 6x6 heart 52 of 78, 7x7 tree 78 of 108; the plain board none). Worse:
    heart in motifs 2x2 and 3x3 slower (5.1 and 8.7 s against 1.4 and 2.5), 4x4 lost (its template has 20
    hidden cuts, not alike in every square), 5x5 to 8x8 still none. A square at the board's edge cannot copy
    a construction that reaches past it, and the ties chain every square to every other.
  - The fitter's passing template as the start: the reader drops it, 27-31% of its visible cuts more than
    1 mm off the traced outline (star and tree in motifs b5, jul-tern); JUL oswald in a circle is read
    (24% off) but the topological search finds no start from it in 20 s. Its maps as the ladder's (11-07,
    `bench/fitmaps.sh`) passed 3 of 29, the 5x5 motif hearts none.
  - The generator's template is read onto the traced outline without stray (0%) but admits no papers
    (`completeWitness`, at once) on every motif board but 3x3: its converter flags stretches on the checker
    lines hidden and cuts them twice (the `edge_parity` artefact the export check sets aside), so the reader
    makes segments that end in two faces. Not a start the page may use anyway (picture-only starts).
  - More time is not it either: Avanceret's 3 minutes (`bench/long-motifs.sh`, two ladders) leave star, heart
    and tree in motifs 5x5 and star 6x6 at 0 hidden cuts, as one minute does.
- **Where the motif boards do get somewhere: the topological witness (2026-11-09).** The SAT search for papers
  and segments alone (`topology.js` `topologicalWitness`, `bench/topoprobe.mjs`) finds one for heart in motifs
  4x4 in 4.4 s (28 hidden, bound 16) and star in motifs 5x5 in 26 s (42; 37-51 s tightened to the bound, 24).
  The search gives it at most `START_SECONDS` (3 s), and the ladder none. From that witness `exactFromTemplate`
  (`bench/wprobe.mjs`) draws the first 5x5 motif template keeping every star (0.21% off), but with one
  self-intersection and 0.56 mm of clearance short where three hidden cuts leave right at a star's point
  (penalty 8): the same template with 40-180 s, 16 neighbours, or a 0.4 or 0.25 grid. On 4x4 at the bound the
  same (0.97 mm short, a self-intersection); untightened (28 hidden) far worse (9.2 mm). The witness search
  knows no geometry, so the next step would be a loop: a drawn witness's broken spots back into the SAT
  search as forbidden pairings, then a new witness.
  Redrawing only around the broken rules does not mend it either (`bench/lns-core` `LNS=1`: every label and
  segment further than a reach from the rows with slack held, the rest solved again): with 24 or 13 of the 52
  edges free, 9-48 s a window, the penalty stays 8. Those three stars cannot be joined within the rules while
  the rest of the board stays as drawn.
  Nor does the loop back into the witness (`bench/cegar.mjs`, `diag-core` `forbiddenWitness`: the edge pairs of
  the segments nearest each broken spot never joined again): penalty 8, then 13, then 37, and the fourth witness
  not found in 90 s. On jul-2026 (whose designer's cuts lie on our outline 0.025 mm short) the witness search
  does not even end within its 120 s. The motif boards from 5x5 up stay out of the exact search's reach.
  How the fitter passes star in motifs b5 (`bench/wovenbound.mjs`, its woven picture against the mask): it joins
  each of the 8 stars in the border squares to the square's edge with a bar about 2.5 mm wide (2.42% of the
  picture), so 4 of the 12 islands are left; its template reads onto our outline only with a 3.3 mm margin
  (`readTemplate` `near` .4: 3% stray, 22 hidden cuts against the outline's bound of 24) and then admits no
  papers. Its picture traced as ours are has a count bound of 48, not fewer: an outline with such bars would
  not make the exact search's task smaller.
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
