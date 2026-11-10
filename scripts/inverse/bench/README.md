# Mal solver benchmark

One command runs the production engine (`static/inverse/core`) in Node on painted masks the way Mal's page
runs it, and prints how many pass, by family. The network that feeds the ladder is trained in
[`../cuts`](../cuts/README.md); the lab notebook is `docs/inverse/HYBRID-NN-SOLVER.md`.

## Running it

```sh
npm run benchmark:inverse:mal -- --set generator           # the 170 generator hearts: two ladders, CPU clock
node scripts/inverse/bench/run.mjs --set test --mode both   # the 127 test pictures: the ladders and today's search
node scripts/inverse/bench/run.mjs --set generator --core ../idea/static/inverse/core --out tmp/mal-bench/idea
node scripts/inverse/bench/run.mjs --compare tmp/mal-bench/base tmp/mal-bench/idea   # hearts gained and lost
node scripts/inverse/bench/run.mjs --summary tmp/mal-bench/idea --list               # the table again, with ids
```

| Option | Default | |
|---|---|---|
| `--set` | | `generator`, `test` or a list file (one mask a line); mask files can also be given as arguments |
| `--mode` | `ladder` | `ladder`, `today`, `fitter`, `both` (ladder and today), `all` (both, then the fitter where neither passes) |
| `--ladders` | `2` | ladders side by side (the page: 3 at 12 threads and 8 GB, 2 at 8 threads and 4 GB, else 1) |
| `--core DIR` | `static/inverse/core` | another engine: a copy of `static/inverse/core`, or a checkout holding one |
| `--model FILE` | the shipped `cuts-*.onnx` | another network (float16 ONNX, as `cuts/export.py --fp16` writes it) |
| `--maps DIR` | | the network's maps from `DIR/<id>.pred.json` (`cuts/predict.py`) instead of a model |
| `--budget S` | Mal's default | the search's seconds (Mal offers 60, 120, 180) |
| `--settings JSON` | none | design settings over Mal's own, for a switch under trial (`'{"exactCarry":true}'`) |
| `--why` | | a failed search's report in its line |
| `--wall` | | budgets on the wall clock instead of the CPU clock |
| `--match RE` | | only the masks whose file name matches |
| `--data DIR` | `tmp/e2e` (or `$MAL_BENCH_DATA`) | where the sets' masks are (below) |
| `--out DIR` | `tmp/mal-bench/<set>-<mode>-<time>` | the run's directory; the same command again resumes it |
| `--chunk N` | `10` | masks per process (HiGHS's wasm memory only grows) |
| `--timeout S` | `900` | wall seconds a process may go without a result before it is killed |
| `--min-free-gb` | `15` | stop (resumably) when the disk has less free |
| `--templates FILE` | `sets/generator-templates.jsonl` | the generator templates' verdicts (`check-templates.mjs`): the "solvable" column |

The modes are the page's workers: **ladder** is the network's ladder alone (`ladderOnly`, the maps from the
model), as `--ladders` workers each on its share of the outlines (`engine.js` `ladderPart`). The first part
runs on every mask, the others only where the first did not pass on the traced outline's first phase (the
page takes that at once); a heart passes if a part does, at the fastest part's seconds. **today** is today's
exact search alone, without maps. **fitter** is the smooth fitter alone; with `--mode all` it runs only where
neither exact route passes, so `any` is what the page can show.

A run directory holds `run.json` (the settings, the commit, whether `static/inverse` or `src/lib` had
changes), one jsonl per route (`ladder-p0.jsonl`, `ladder-p1.jsonl`, `today.jsonl`, `fitter.jsonl`; a line
per mask: `solve.mjs`'s fields and the part, family, mask hash and file), `log.txt` (the processes' stderr) and
`summary.txt`. `--summary` and `--compare` also read the old run directories and jsonl files of
`tmp/e2e/bench` and `tmp/e2e/nn` (`p0.jsonl`, `ladder.jsonl`, `today.jsonl`, the fitter's).
`solve.mjs` can be run alone with the environment it documents (it is `tmp/e2e/even/prodcheck3b.mjs` with
only these settings), e.g. `CPU_CLOCK=1 LADDER_ONLY=1 node scripts/inverse/bench/solve.mjs MASK.json`.

## What counts as a pass

The engine's own verdict, which is what the page takes as a template (`templateChecksPassed`): the export's
cutting rules, clearances up to 0.1 mm short allowed, the paper (an `uncertain` paper fails, as
`requireMaterialCore` asks), and the picture within the export's 3%. In a line: `exact && passes &&
features !== false` and no `near` key (`solve.mjs` adds `near` to every answer that fails the verdict); the
fitter's line passes when `fitter` is true. `tmp/e2e/bench/summary.py`'s `ok()` tested `!near` and so also
counted near misses that break no rule but have an uncertain or failing paper or a picture over 3% off: on
the `off2` runs 113 against 109 of the 170 and 95 against 94 of the 127. Old runs read here are judged by
the new rule.

Why the rest fail (per mode, where no mode passes): `rules` (the near miss breaks a cutting rule), `regions`
(it loses or joins a region of the picture), `paper`, `picture` (over 3% off), `no template` (the search
found nothing), `timeout`, `crashed`, `error`. "Solvable" means the generator's own template exports, so a
passing template is known to exist; "missed" counts those that still fail.

## The sets and their data (not in git)

The lists name masks relative to the data root (`--data`, default `tmp/e2e` in this checkout). They are
`{size: 400, data: [0|1, ...]}` JSON files and lived in `julehjerte-mal/tmp/e2e`; from another checkout pass
`--data /path/to/julehjerte-mal/tmp/e2e`.

- `sets/generator.txt`: the 170 hearts of `generator-set.mjs` (was `tmp/e2e/bench/gen-bench.mjs`), made
  2026-11-05 at 20e1ea97 into `bench/designs/` (170 masks, 52 MB, 0.6 MB gzipped; and each `.cut.json`, the
  generator's own template, 5.4 MB). The generator has changed since, so today's checkout makes different
  hearts for some; the same hearts again from a checkout of that commit:
  `git worktree add ../jh-20e1ea97 20e1ea97`, link its `node_modules`, then
  `E2E_ROOT=../jh-20e1ea97 node scripts/inverse/bench/generator-set.mjs tmp/e2e/bench/designs`
  (not tried: the masks of 11-05 were kept). Their verdicts: `node scripts/inverse/bench/check-templates.mjs
  tmp/e2e/bench/designs/*.cut.json > scripts/inverse/bench/sets/generator-templates.jsonl` (2026-11-05: 85 of the 161 pictures export).
- **Twins:** 9 of the 170 are the same picture under two names (the board frame's default is 5 strips, the
  motifs' and strips' 4, for star, heart and tree). The summary counts pictures by mask hash (161) and names
  twins whose verdicts differ.
- `sets/test.txt`: the 127 test pictures, none of them in the network's training: `jf-maskmode/` (64, the
  juleflet.dk library painted as masks, 2026-10-26), `gallery/masks/` (21 gallery-only hearts, 10-28) and
  `web44-masks/` (42 photographed hearts through Mal's photo import, 10-27); 40 MB, 0.5 MB gzipped. They were
  made by page and browser runs at the time; no script in git remakes them.

## Pitfalls

- **The CPU clock** (on unless `--wall`): `solve.mjs` makes `performance.now()` count this thread's CPU time,
  and both the core's deadlines and HiGHS's `time_limit` read it. On the wall clock the same picture passes or
  fails with the machine's load (of 14 flip-prone pictures 5 changed their verdict over three wall-clock runs,
  none over two CPU-clock runs). Even so,
  verdicts reached near the deadline (45 to 55 s) flip between runs: run the hearts a change moved three times
  before believing it. `wall` is logged beside `seconds`.
- **Kill with SIGKILL.** A SIGTERM does not stop a solving process (its handler waits for the solver's long
  synchronous calls). `run.mjs` kills a hung process with SIGKILL, marks the mask it hung on and runs the rest
  of its chunk again; from a shell use `timeout -s KILL`.
- **One vite cache per process**, removed afterwards: two servers sharing one fail each other ("outdated
  optimized dep"), and a killed process leaves its cache behind. `run.mjs` gives each process
  `OUT/.vite-cache` and removes it; `solve.mjs` alone uses `$VITE_CACHE_DIR` or `tmp/.vite-solve-<pid>`.
- **One heavy job at a time** on the 16 GB Mac: no benchmark beside training or another benchmark; the
  processes are niced. Long runs belong to 20:00-09:00: `scripts/inverse/bench/guard.sh PID` stops a run's
  whole process tree from 08:50 or when the disk has under 15 GB (`MIN_FREE_GB`, `STOP_FROM`, `STOP_UNTIL`);
  rerun the same command to resume. macOS sleeps: `caffeinate -i node ...`.
- **How long:** on 2026-11-08 the 170 generator hearts with two ladders took 2.4 h (1.3 h for the first part,
  1.1 h for the second on 88), the 127 test pictures 0.7 h; today's search alone on the 170 1.6 h.
- **The page's maps:** the page makes the mask symmetric before the network reads it, as `solve.mjs` does;
  `cuts/predict.py` reads the raw mask, which differs on photographs: judge a new network with `--model`.
