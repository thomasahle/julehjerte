# A network and the exact solver together for Mal: what we know so far

> **Update, evening of 2026-10-31:**
>
> - **An orientation bug, now fixed.** The tracer's reference frame has y running up (target.js
>   `toReference`), while the network's maps have rows running down. Every ranking before the fix read
>   the maps upside down; the symmetric gallery designs hid it. Fixed in the ranking (timed copy and
>   production), the network start and the GRPO geometry, with a unit test (exact-structure.test.mjs).
> - **v3 after the fix, on the 21-design benchmark:** a template on all 9 measurable original designs,
>   each faster than today (median 6.0×): lilje1 45.4 → 4.3 s, david4 36.0 → 4.4 s, hermanngitter
>   27.6 → 6.6 s, lilje2 17.1 → 2.9 s, kogle 31.2 → 6.3 s. r4 is about as good (8/9, 6.2×) and, on the
>   10 newly held-out designs it never saw, 8/9 at a median 10.9×.
> - **Hard pictures** (today's search finds none in 1 or 3 minutes), v3 after the fix: tak (10.8 s) and
>   khatam (36 s) exact. venus was exact only with the flipped maps, not with the fixed ones.
> - **Production version** on the local branch `claude/nn-ladder` (not pushed):
>   - `static/inverse/neural/cuts.js` and `cuts-bbd773ab.onnx` (v3, float16, 9.5 MB, Apache-2.0 encoder
>     weights noted in NOTICE.txt);
>   - `rankScores` and the rank pruning in `exact/candidates.js`;
>   - candidates built once per ladder (`reuse`) in `exact/search.js`;
>   - `networkLadder` in `exact/stage.js`: rungs K = 10, 30, 100, 300 of 2–4 s, a quarter of the
>     search's time at most, then today's search;
>   - the maps from the worker (`cutModel`, Mal only; the model loads while the picture is prepared,
>     and a search waits at most 1.5 s for it).
> - **Tests:** exact 53 + 19, worker controller 24, compute worker and runtime 10, app 227, all passing.
> - **In Chromium** through the page's worker: tak exact in 9.0 s (13 hidden, validation passed), and
>   with the network off no exact template after 44.4 s; lilje1 exact in 11.5 s (8 hidden) against
>   about 45 s today.
> - **GRPO** (grpo/grpo.py with server.mjs, the solver as reward): built and run for 60 steps, but
>   before the orientation fix, so its result says nothing yet.

Status 2026-10-31. Research only: nothing in this note is on main, apart from the pieces marked shipped.
The prototype lives in an instrumented copy of the engine (`tmp/e2e/even/timed/core`) and in
`tmp/e2e/nn/`. Measured numbers are from a machine under load (load average 6 to 20, other sessions'
jobs running), so seconds can be up to twice what a quiet machine gives. Counts are exact.

## The goal

A hybrid solver for Mal's exact template:

- a network proposes likely cuts, both visible and hidden;
- the exact solver (HiGHS with lazily added rules) finds the best template among them;
- the solutions go back into training, with refinement steps in between;
- robust, fast and precise, and able to run in the browser.

## 1. How the exact search spends its time (santa, the library picture)

| Step | Time | Size |
|---|---|---|
| Trace the outline from the mask | 0.14 s | 253 curves → 16 faces, 20 edges |
| Topology of the outline | 0.01 s | |
| Search for a start (which paper cuts which piece) | 3 s, times out on every way | |
| Positions along the outline | | 312–373 |
| Hidden-cut candidates (every straight pair in a face) | 0.6–1.9 s | 4.1k–5.8k |
| Pruning (2 nearest a position, one per other edge, one per distance band) | | 1.7k–2.3k |
| Static clash rows (candidate pairs that cannot both be cut) | 0.7–1.7 s | 45k–90k |
| HiGHS on the model | 6–8 s a run, never a feasible point | 11k–14k columns, 38k–63k rows |

Of santa's 48 s: HiGHS 26.5 s, building candidates and rows 10.5 s, the start search 8.5 s.
With 3 minutes, today's search still finds no template for santa (168 s) or tak (165 s).

## 2. What makes a picture hard

- **Not the model's size.** kogle, hvirvel and 5star have as many pruned candidates (1.4k–1.9k) and as
  large models (10k–12k columns) as santa and tak, and solve in seconds.
- **The missing start.** The easy pictures get a topological start; santa and tak never do.
- **A second group** (venus, khatam, balls) does get a start but has 2–5× larger models and faces with
  many holes (khatam 9 boundary cycles, balls 14).
- **The lazy rules are the obstacle, at every level.** The topological search alone (no geometry; kinds
  and an order of switches) finds nothing for santa or tak in 120 s, with 2, 8 or 16 switch slots an edge.
  With 8 slots it made 713 SAT solves of about 80 ms, each followed by a loop or crossing check that adds
  one or two rules (1039 loop and 712 crossing cuts in 60 s), and it never settles. The positional model
  has the same pattern.
- **Faces with holes.** Santa's face 0 (an outer boundary and two holes) holds 11 of the designer's
  13 hidden cuts and all of the crossing conflicts found earlier.

## 3. Oracles: what a perfect proposal would buy

**The designer's hidden cuts as the only candidates (santa):**

| Candidates | Model | HiGHS a run |
|---|---|---|
| All (pruned) | 11.4k columns | 18.5 s, never keeps every rule |
| Designer's 13 + 2 nearest a position (1071) | 8.4k | 16 s |
| Designer's 13 + all within 5 mm of their ends (329) | 5.0k | 0.2–1.2 s |
| Designer's 13 + all within 2 mm (73) | 3.5k | 0.1–0.9 s |
| Designer's 13 only | 3.2k | 0.05–0.14 s |

No rule-keeping template came out of these runs: the designer's santa itself fails our export check
(turns of 153–180°, a self-intersection, necks of 2.1–2.5 mm against our 2.5, short returns, all in the
face). A narrower minimum strip (1.5 mm) does not help santa either.

**A ladder with an oracle's ranking:** the candidates nearest one of our own exact solutions' hidden
cuts, the top K for K = 10, 30, 100, 300, each from no start on the fine grid.

| Picture | Today | Perfect ranking | Noisy ranking (3 mm mean) |
|---|---|---|---|
| 5star | 37.6 s | 2.4 s | 4.5 s (K100) |
| david4 | 36.1 s | 1.6 s | 4.9 s (K300) |
| lilje1 | 45.6 s | 2.5 s | 2.4 s |
| roed-blomst | 42.0 s | 0.9 s | 0.9 s |
| kogle | 30.3 s | 3.4 s | 17.1 s |
| lilje2 | 18.3 s | 4.5 s | 7.0 s |
| hvirvel | 17.5 s | 1.7 s | 1.8 s |
| amy-weave-1 | 2.0 s | 1.3 s | 1.3 s |
| hermanngitter | 27.6 s | fails at every K (1.3 s each) | |

Every success above found the same hidden-cut count as today. So a ranking that puts the true cuts
within the top 100–300 of several thousand is enough.

## 4. How many choices there really are

- Santa's 5754 candidates fall into **79 kinds** (face, and the two edge sides joined, positions ignored);
  the designer's 13 cuts are in 12 kinds.
- Ranked by length, the designer's cuts sit at 46 to 4695 of 5754. Seven are their ends' nearest partner;
  the long structural ones (21 and 45 mm) rank 26th to 30th even at their own ends.
- Equivalent cuts (same kind) weave the same picture and the same count, but differ in whether they can be
  drawn (clearance, angles, crossings), in length and in paper strength.
- Kinds alone do not make it easy: the topological search works with kinds and slot orders and still
  stalls (section 2). The kinds expand again once several cuts a kind and their order are allowed
  (8 slots: 8328 slot chords, 128k variables).

## 5. Short hidden cuts at crossings

- In the 72 exact gallery templates saved on 2026-10-29: 180 of 431 hidden cuts are shorter than 3 mm,
  79 shorter than 1 mm, in 28 templates.
- Where the designer has none they are noise: a crossing traced as two points 0.08–0.97 mm apart, bridged
  by a switch and a stub (stjernegitter 15 of ours against 0, amy-pinecone 12, groen-stjerne 8,
  amy-pattern 5).
- **Today's engine already joins most of them** (near-touch 0.9 mm and corner turn 0.7, shipped
  2026-10-30): stjernegitter, amy-pinecone and groen-stjerne now exact with 0 hidden cuts in 4–6 s, as
  their designers drew them.
- amy-pattern keeps two 0.08 mm stubs: two corners each with two visible curves, 0.08 mm apart, that the
  join does not pair. A short-edge contraction (junctions joined by an edge under 0.25 mm) and a sub-pixel
  join (corners within 0.3 mm whatever their turn) did not change it. The cause is not found.
- Elsewhere short hidden runs are the design's own: the designer's lilje1, lilje2, blomster-hjerte,
  glaskuppel and dagognat have them too.
- **Training labels must come from the current engine**: the first network learned the stale stubs.

## 6. The network

**Shape.** A U-Net with a pretrained EfficientNet-B0 encoder (timm, ImageNet). Our own decoder,
attention over the coarsest cells, 4.7M weights. It works at 128 × 128 (0.8 mm a pixel). The input is
the mask plus x and y channels; orientation matters, because A runs top to bottom and B left to right.

**Outputs, one map each:**

- visible cuts;
- which paper cuts each visible stretch;
- junctions;
- switches (where a hidden cut leaves the outline);
- hidden cuts, with their direction as a doubled angle (cos 2a, sin 2a), since a line has no sign.

**Ranking.** Each candidate scores the hidden-cut field along its route (weighted by how well its direction
agrees) plus the switch probability at its ends, as OpenPose scores limbs. The top K go to the ladder.

**Labels.** Rasterized from any template (`labels.py`). Augmented with:

- smooth warps that keep the square's sides;
- the square's 8 symmetries. A and B swap where columns become rows; slits are re-ordered and turned to
  run from their start side.

Every variant's picture is woven anew from the moved template (`sampleWeave`), so picture and labels
always agree (99.7–100% with the moved mask).

**Data sources:**

| Source | Size | Notes |
|---|---|---|
| Our exact gallery templates (29 Oct) | 72 (62 bases for training) | stale stubs; being replaced by a re-solve with today's engine |
| The same, warped and turned | 6336 pictures | |
| Designers' templates for 11 new designs | 11 → 968 with warps and turns | edge-parity artefact of the converter (shared cuts kept as two curves) tolerated |
| The site's generator (`generate.ts`): random motifs of 2668, random words in 6 fonts and its text frames | 849 so far, about 4 s each | woven templates by construction, many hidden cuts; test-like words (JUL, GOD, MOR, FAR, 2026) left out |
| Generated motif pictures (check background, blobs with holes) and Voronoi bands, solved by today's search | 54 exact of 86 so far | new bases from the solver |

**Results so far (first model, trained on the 62 gallery bases only):**

- It overfits within 2–3 epochs: held-out hidden-cut loss 0.57, 0.63, 0.92. The decoder alone, encoder
  frozen, does the same, so the lever is distinct designs, not the encoder.
- On 7 held-out library pictures, the ladder with its ranking finds a template the export takes on 4:
  5star 37.6 → 5.6 s, kogle 30.2 → 4.4 s, hvirvel 17.5 → 6.8 s, amy-weave-1 1.9 → 1.4 s.
  david4, lilje1 and lilje2 fall back to today's search.
- Our own solutions' cuts rank from single digits to the thousands.
- On the 11 hard pictures (santa, tak, venus, khatam, balls, davidsstjerne-circ, god-jul, jul-tern,
  mor-far, jul-2026, hjerte-i-hjerte-i-hjerte) none is found. Each rung fails within 0.1–7 s, so the ladder
  costs little where it fails.
- Its paper map as HiGHS's start, with rungs to K = 3000, does not get santa or tak either.

**Next model (v3, queued):** fresh gallery labels from today's engine, the generator designs, the solved
generated pictures and the new designer designs; the best epoch on held-out pictures kept.

## 6b. v3: more distinct designs (2026-10-31, afternoon)

Trained on 13009 pictures from **789 bases** (against 62):

- fresh gallery labels from today's engine (73 of 83 exact), bent and turned;
- 600 of the site generator's designs, turned;
- 104 solved generated pictures, turned;
- 11 new designer designs.

Held-out bases as before. Held-out losses at epoch 1, against the first model's best: hidden cuts 0.450
against 0.567, direction 0.399 against 0.747, paper 0.370 against 0.429, switches 0.061 against 0.095.
Best at epoch 3 (held score 1.258 against 1.828). Later epochs overfit (hidden cuts 0.54 to 0.71), so
training was stopped at epoch 5 with epoch 3 kept.

Ladder with v3's ranking on the held-out pictures:

| Picture | Today | v3 ladder | Reference cuts' ranks |
|---|---|---|---|
| roed-blomst | 41.7 s | **1.5 s** (K30), same 7 hidden | 3, 4, 7, 8, 15, 33, 61 |
| 5star | 37.6 s | **3.6 s** (K100), same 12 | 5, 6, 7, 14, 251, … |
| david4 | 36.3 s | **10.8 s** (K300), same 17 | 1, 8, 44, 157, … (the first model: none) |
| kogle | 31.6 s | **7.0 s** (K300), same 25 | 12 of 25 in the top 232 |
| amy-weave-1 | 2.1 s | 1.4 s (K10), 0 hidden | |
| hvirvel | 17.8 s | none | 13, 70, 119, 137, 663, 707 |
| lilje1 | 47.4 s | none | all 333 or worse (short stubs) |
| lilje2 | 18.1 s | none | all 342 or worse (short stubs) |

**Hard set: venus solved**, which today's search does not get in 1 or 3 minutes. 24 s in all, through the
K300 rung (10.9 s): 20 hidden cuts, passes every export check, woven picture 0.30% off the mask. The
other ten still fall back to today's search; with the candidates built once a ladder, their rungs fail in
0.1 to 0.7 s each.

Reading: the network ranks long structural hidden cuts well, and misses the short stubs of tips and
crossings that the liljes' designers use too. Being tested: every candidate under 3 mm added to each
rung; later, a candidate-conditioned reranker.

## 7. The solver side (prototype in the timed copy)

- **The ladder** runs inside the exact search, before today's flow, on up to 45% of the time. Its rungs
  are (K, seconds) = (10, 3), (30, 4), (100, 6), (300, 10). The first template the export takes stands;
  otherwise today's search runs as before, so a picture can only get faster or stay the same.
- **Candidates are built once a ladder:** every rung reuses the full candidate set (about 1 s saved a rung).
- **Refinement:** from the ladder's template, a wider ranking (3 K), starting from that template's reading
  with its own cuts kept, looks for fewer or shorter hidden cuts. It is kept when it ranks better.
- **Start from the network:** its paper map gives each run of each edge its paper (implemented; no effect
  yet with the first model).

## 8. In the browser

- The site already ships ONNX Runtime Web 1.19.2 (`static/inverse/vendor/onnxruntime-1.19.2`, 11 MB) and a
  checksummed model loader (`static/inverse/neural/runtime.js`) for its photo model (U2NETP, 4.6 MB,
  itself warm-started with its encoder frozen).
- `tmp/e2e/nn/browser/cuts.js` runs our network there, from the mask to the maps. On santa its maps match
  PyTorch's within 0.0005, in 106 ms on one thread.
- Sizes:

  | Format | Size | Accuracy | Time |
  |---|---|---|---|
  | float32 | 18.8 MB | reference | 106 ms |
  | float16 weights | 9.5 MB | within 0.018 | 165 ms |
  | dynamic 8-bit | 5.1 MB | off by up to 1.8, unusable without calibration | |

- Not yet wired into the worker: loading the model in the exact worker, the ladder in
  `static/inverse/core/exact/stage.js`, the predictor before the search.

## 9. Considerations

- **Fair evaluation.**
  - Held-out bases are out of training together with all their warps and turns: 5star, amy-weave-1,
    david4, hvirvel, lilje1, lilje2, roed-blomst, hermanngitter, dagognat, triple-heart, kogle.
  - The hard set was never in the data, and the generator's words avoid the text hearts'.
  - Generator motifs may resemble gallery motifs (a star); not identical.
- **Label quality.**
  - Our templates are tight to the clearance limits, so even small warps break the export check. Warped
    near-misses (clearance, turns) are kept and marked.
  - The designers' templates fail our strict rules in places but put their hidden cuts where a design
    needs them.
  - Several valid templates exist for one picture: 5star solved at K300 with only 2 of our 12 reference
    cuts in the top 300.
- **Optimality.** The ladder takes the first template the export takes. Ways to know a template is the
  best:
  - the count's proven lower bound (`cheapBounds`);
  - doubling the margin until it stops improving;
  - the refinement step.
- **Load.** Today's engine is load-sensitive: 5star failed at 45 s on a loaded machine, against a pass at
  37.6 s quietly. Benchmarks need a quiet machine; the label runs do not.
- **Memory.** 16 GB machine, other sessions' jobs (a Python job at 340% CPU, generator recipes). One heavy
  job of ours at a time where possible.
- **Pretrained weights.**
  - ImageNet encoders (timm) are free.
  - DINOv3 ConvNeXt-Tiny (29M weights) is gated on Hugging Face (your login and its licence) and too large
    to ship; possible as an offline teacher.
  - Wireframe parsers (HAWP, L-CNN) solve the closest task (junctions plus line verification), but on
    photos of rooms.

## 10. Open questions

1. Does the network get good enough with distinct designs (v3: 849+ generator designs)?
   Target: the true cuts within the top 100–300 on held-out pictures.
2. Does a better ranking reach the hard pictures at all, or is their obstacle the lazy rules, which a
   ranking only helps indirectly? Santa failed even with the designer's cuts, because that template breaks
   our rules.
3. Which picture-generation curriculum gives hard training cases with known rule-keeping templates?
   - the generator's text and motif hearts;
   - solved random pictures;
   - template-first constructions (planar cubic graphs) still to build.
4. Bootstrapping: solve hard generated pictures inside a wide predicted margin (K = 1000–3000, longer
   offline budget), add them, retrain. How wide must the margin be, and how do we check optimality?
5. Should the network decide the tracer's judgement calls (joins at crossings, which tips to round,
   specks), using its junction and visible maps? amy-pattern's 0.08 mm crossing is a test case.
6. Kinds or candidates: rank by kind (79 for santa) with a few representatives each, or by candidate?
7. Model size for the browser: float16 EfficientNet-B0 at 9.5 MB, or a smaller encoder (MobileNetV3,
   about 2M weights), or calibrated 8-bit.
8. hermanngitter fails every ladder rung even with the perfect ranking (1.3 s each): its reference may use
   routes the straight candidates cannot draw.
9. The ladder's rungs and time share (45%) are untuned; the refinement step is unmeasured.

## 11. Decisions that are yours

- **Search-time setting** (Avanceret: 1, 2 or 3 minutes): commit 942af891, tested (69 tests), not
  pushed. Push it?
- **DINOv3:** accept its Hugging Face gate (your login) for an offline teacher, or stay with ImageNet
  encoders?
- **The network in Mal:** it ships only when it is measured to help (held-out faster, nothing worse).
  About 10 MB downloaded when the exact search starts, like HiGHS (3.5 MB) and the photo model (4.6 MB):
  acceptable?

## Files

| Path | What |
|---|---|
| `tmp/e2e/even/timed/core` | instrumented engine copy: timings, oracle and network ladders, refinement, network start, crossing prototypes |
| `tmp/e2e/even/santatl.mjs`, `santaoracle.mjs`, `countonly.mjs`, `startonly2.mjs` | timing, oracle, size and topological-search harnesses |
| `tmp/e2e/even/ladder.mjs` | the ladder against a reference solution (oracle, noise, network ranking and its variants) |
| `tmp/e2e/even/solve.mjs` | the page's route on masks with the network's ladder first; exact templates saved as training data |
| `tmp/e2e/nn/labels.py`, `pack.py`, `train.py`, `predict.py`, `export.py` | labels, packing, training, prediction, ONNX export |
| `tmp/e2e/nn/warp.mjs`, `dihedral.mjs`, `weavemask.mjs` | augmentation and woven masks |
| `tmp/e2e/nn/gen-designs.mjs`, `gen-motif.mjs` | generator designs and motif pictures |
| `tmp/e2e/nn/browser/cuts.js`, `parity.mjs` | the network in ONNX Runtime Web, and its check against PyTorch |
| `tmp/e2e/nn/loop.sh`, `build-v3.sh`, `eval.sh` | one feedback round, the v3 build, evaluation |
| `docs/inverse/MAL-PICTURES.md` | the measured findings in order (2026-10-31 section) |
