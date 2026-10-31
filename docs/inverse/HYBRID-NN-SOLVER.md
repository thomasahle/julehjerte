# A cut-proposal network and the exact solver for Mal

State on 2026-10-31, late evening. The production version is on the local branch `claude/nn-ladder`
(commits 7a4eeb72, 5af99576, 088e08ac), which is **not pushed**. Experiments are in `tmp/e2e/nn/` and in an
instrumented copy of the engine (`tmp/e2e/even/timed/core`).

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

**Still failing:** santa, balls, davidsstjerne-circ and the four text hearts (god-jul, jul-tern, mor-far,
hjerte-i-hjerte-i-hjerte). jul-2026 cannot start, as before. Their ladders fail up to K = 3000; whether
any template keeping our rules exists for them is unknown.

**Decisions that are yours:**

1. **Ship the network in Mal?** It costs 9.5 MB extra on the first exact search; the ONNX runtime is
   already shipped for the photo model. A cautious alternative is to ship it behind an Avanceret switch
   first.
2. **Push the 1/2/3-minute search time** (942af891)? It can go separately from the network.
3. **DINOv3** (behind the Hugging Face gate) as an offline teacher? I recommend not for now: ImageNet
   encoders are doing well and are free of the gate.

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

## 7. Production design (branch claude/nn-ladder)

| Part | What |
|---|---|
| `static/inverse/neural/cuts.js`, `cuts-bbd773ab.onnx` | v3, float16, checksum, loaded like the photo model; NOTICE.txt credits the Apache-2.0 encoder weights |
| `exact/candidates.js` `rankScores`, `ranked`, `keep` | candidate scores from the maps (hidden field along the route by direction, plus the switches at the ends), the top K plus every candidate under 3 mm |
| `exact/search.js` `rank`, `reuse`, `buildSeconds` | rank pruning on a copy; candidates built once per ladder; the build's own time |
| `exact/stage.js` `networkLadder`, `ladderOnly` | rungs (K, s) = (10, 2), (30, 2), (100, 3), (300, 4), plus (1000, 10) when alone; at most a quarter of the time before today's search |
| `engine.js` | `raw.cutMaps` to the traced outline's search; `raw.ladderOnly` |
| `worker-controller.js` | the maps from the mask (`cutModel`, Mal only; loads while the picture is prepared; waits at most 1.5 s); the ladder worker beside today's |
| `src/lib/inverse/engine.ts` | `cutModel` on for Mal unless "smoother cuts" alone |

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
  - the GRPO-trained network (v2 under way: solved share 45% → 49% over 57 steps, reward −0.09 → −0.02,
    to be benchmarked);
  - a second model's ranking as another rung (v3 and r4 solve different pictures).
- **Round 5** (more variations of real pictures): best held-out losses so far (hidden 0.485, against r4's
  0.590); its benchmark is pending.
- **Stubs at crossings** in the tracer: amy-pattern's 0.08 mm case is unexplained.
- **Curved candidates:** clearly bent hidden runs are a minority (designers 11%, generator 6%), mildly
  curved ones common. Straight lines stay the first representation; one or two bent variants along the
  predicted direction would come later.
- **Reranker:** a candidate-conditioned reranker trained on whole-design splits.

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
