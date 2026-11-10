# The cut-proposal network: data, training, export

Mal's exact search ranks its hidden-cut candidates by this network's maps (the ladder,
`static/inverse/core/exact/candidates.js`). It is a U-Net: timm's ImageNet `efficientnet_b0.ra_in1k`
encoder, our decoder, the mask and x, y in at 128 x 128, nine channels out (visible cuts, which paper cuts
them, junctions, switches, hidden cuts and their direction). The site loads it as float16 ONNX,
`static/inverse/neural/cuts-<sha>.onnx`, through `neural/cuts.js`. The story of every model is in
`docs/inverse/HYBRID-NN-SOLVER.md` (sections 3a, 8, 9); measure one with [`../bench`](../bench/README.md).

Two rules for the data: only synthetic hearts (no gallery or library heart and no photograph: they are the
test set), and only templates our export's rules keep (`--drop`; 41% of the generator's templates break a
clearance, and the network learns them as given).

## The pipeline

Python: a 3.12 venv with `requirements.txt` (the encoder's weights come from the Hugging Face Hub on first
use). `LABEL_N` (default 128, what `cuts.js` feeds) must match across every step.

1. **Designs**, templates by construction: `node scripts/inverse/cuts/gen-synth.mjs OUT COUNT SEED` writes
   `OUT/s-*.cut.json` and the `.mask.json` each weaves, from the site's generator with random motifs, frames,
   sizes and strips, a quarter of them words. Environment: `STYLES=strips,motifs,board` (figures in these
   frames only), `EXCLUDE=star,tree,...` (motifs left out: the benchmark's eight keep its hearts unseen),
   `HARD`, `CHECKERED`, `INCLUDE`, `TEXT`, `ONE`. A process can stall on a design: one at a time, with a
   watchdog that starts the next seed when its log stops moving (2026-11-06: 3 h made 1733 designs).
2. **The rules**: `node scripts/inverse/bench/check-templates.mjs OUT/*.cut.json > checked.jsonl` (200 files a
   process); the ids without `"valid":true` are the `--drop` list (`exports` is the looser export verdict).
3. **The square's symmetries**: `node scripts/inverse/cuts/dihedral.mjs DIH OUT/*.cut.json` writes each
   design's seven turned and mirrored copies (the papers swapped where columns become rows; a copy whose weave
   disagrees with its moved mask by over 2% is left out).
4. **Labels into one pack**: `python scripts/inverse/cuts/pack.py PACK @list.txt` (a list of cut files, each
   beside its mask) writes `PACK.npy`, float16 `(count, 8, 128, 128)`: the mask and `labels.py`'s maps, and
   `PACK.json`, the names. One picture's maps to look at: `python labels.py CUT MASK OUT.npz PREVIEW.png`.
5. **Training** (MPS when there, else CPU):
   `python -u scripts/inverse/cuts/train.py PACK.npy... --encoder efficientnet_b0.ra_in1k --out m.pt --epochs 3 --hold .05`
   with `--keep REGEX` (names), `--drop FILE` (base ids; their warped and turned copies go too),
   `--pack-weights` (each pack's share of an epoch), `--init M.pt --lr 2e-4` (fine-tuning), `--sym-min` (a
   symmetric picture taught the nearest of its valid templates, not their mean). It keeps the epoch with the
   best held-out score (hidden cuts, switches, paper, direction). For a fine-tune, a sample of the old packs:
   `python replay.py OUT COUNT KEEP DROP WEIGHTS PACK.npy...`.
6. **Averaging** two runs from one start: `python soup.py A.pt B.pt 0.3 OUT.pt` (0.7 A + 0.3 B).
7. **Export**: `python scripts/inverse/cuts/export.py m.pt m.onnx --install` writes `m.onnx`, `m-fp16.onnx`,
   copies the latter to `static/inverse/neural/cuts-<first 8 of its sha256>.onnx` and points `cuts.js`'s
   `CUTS_MODEL_SHA256` and URL at it; `git rm` the old model. Without `--install` (`--fp16`) it only writes.
8. **Measure** before shipping: `node scripts/inverse/bench/run.mjs --set test --model m-fp16.onnx` and
   `--set generator`, each against the shipped model with `--compare`. `predict.py MODEL.pt DIR MASK...`
   writes maps for `run.mjs --maps DIR` (generator masks only: see the bench's pitfalls).

## How the shipped network was made (`cuts-4362d1d3.onnx`, 2026-11-07)

All in `julehjerte-mal/tmp/e2e/nn`, `LABEL_N=128`, encoder `efficientnet_b0.ra_in1k`, `--hold .05`;
`KEEP='^(g-|s-|m[1-4]-|w-|grid2-)'` (the synthetic names), `DROP=ei1/invalid.txt`;
`OLD='pack-gen.npy pack-gs.npy r1/pack.npy r2/pack.npy r3/pack.npy r4/pack.npy r5/pack.npy synth/pack.npy'`.

1. syn1v (11-02): `train.py $OLD --keep $KEEP --drop $DROP --pack-weights 0.12,0.04,0.08,0.12,0.16,0.08,0.04,0.36 --epochs 3 --out m-syn1v.pt`
   (27,604 pictures of 4,949 bases; about 80 min).
2. ss1 (11-06): `train.py $OLD synstrips/pack.npy --keep $KEEP --drop $DROP --pack-weights 0.10,0.03,0.06,0.10,0.13,0.06,0.03,0.29,0.20 --init m-syn1v.pt --lr 2e-4 --epochs 1 --out m-ss1.pt`.
3. replay6k: `replay.py replay6k 6000 $KEEP $DROP 0.10,0.03,0.06,0.10,0.13,0.06,0.03,0.29 $OLD`.
4. ss3: `train.py replay6k.npy synstrips/pack.npy --pack-weights 0.5,0.5 --init m-ss1.pt --lr 2e-4 --epochs 3 --out m-ss3.pt`
   (with `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.4 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.25`).
5. m-e12: twelve one-epoch runs as ss3's, each from the last (`--epochs 1 --init` the previous), the first
   from m-ss3 and the other eleven with `--sym-min` (`tmp/e2e/nn/idle-train.sh` ran them while the user was
   away).
6. `soup.py m-syn1v.pt idle/m-e12.pt 0.3 m-soup3.pt`, then `export.py m-soup3.pt m-soup3.onnx --fp16`:
   `m-soup3-fp16.onnx` has the shipped file's sha256 (4362d1d3..., checked 2026-11-10).

## The data and checkpoints (not in git)

What was on disk in `julehjerte-mal/tmp/e2e/nn` on 2026-11-10 (pictures counted with their copies):

| File | Pictures | Size | Made by |
|---|---|---|---|
| `pack-gen.npy` | 4,800 (`g-`) | 1.2 GB | the generator's random designs (`gen-designs.mjs`), turned |
| `pack-gs.npy` | 833 (`m1-`, `m2-`, `w-`) | 0.2 GB | generated motif and Voronoi pictures, labelled by today's search |
| `r1`-`r5/pack.npy` | 3,186 / 7,040 / 12,185 / 2,849 / 5,572 | gone | more generator batches, `grid2-` template-first grids, solved variations of real pictures (notebook section 8) |
| `synth/pack.npy` | 10,848 (`s-`) | 2.7 GB | `gen-synth.mjs` (seeds from 201) and `dihedral.mjs` |
| `synstrips/pack.npy` | 2,472 (`s-`) | 0.6 GB | `gen-synth.mjs` `STYLES=strips,strips,strips,motifs,board`, the benchmark's 8 motifs excluded, seeds from 7201; the 309 that export, with their copies |
| `replay6k.npy` | 6,000 | 1.5 GB | `replay.py` from the packs above, before r1-r5 went |
| `ei1/invalid.txt` | 1,898 base ids | 61 kB | `genvalid.mjs` (now `check-templates.mjs`): the generated templates that are not valid |
| `m-syn1v.pt`, `m-ss1.pt`, `m-ss3.pt`, `m-soup3.pt` | | 19 MB each | the steps above (`idle/m-e12.pt` is gone; `m-soup3.pt` holds its share) |

The designs behind the packs (`*/raw/`) were deleted after packing, and the `r1`-`r5` packs and
`idle/m-e12.pt` since: syn1v cannot be retrained exactly, but `m-syn1v.pt` and `m-soup3.pt` remain, and the
older generators of the `g-`, `m-`, `w-` and `grid2-` designs stay in `tmp/e2e/nn` (outside git).

## Pitfalls

- **Memory:** `train.py` over all the packs grew to 11-27 GB and made the 16 GB Mac slow for its user; a
  6,000-picture replay pack beside the new data held 7.7 GB (6.3 GB with the MPS watermarks above). Train only
  when the machine is otherwise idle (20:00-09:00), never beside a benchmark, and stop `train.py` once its
  `.pt` is written (it can linger at full size). `scripts/inverse/bench/guard.sh PID` stops it on time or
  disk; to kill it by name, `pkill -f "[t]rain.py"`: the bracket keeps the pattern from matching a command line
  that carries it, such as a monitoring loop's.
- **Symmetric pictures:** a symmetric picture's template and its mirror image are both valid, with the papers
  swapped; trained on both, the paper map learns their mean (`--sym-min` fixes that).
- **Judge on the browser's path:** float16 ONNX through `neural/cuts.js` (`run.mjs --model`), on the CPU clock,
  the test set and the generator set both; a model that gains generator hearts can lose test pictures (m-e12
  alone: 103 against 95 generator hearts, 91 against 95 test pictures).
