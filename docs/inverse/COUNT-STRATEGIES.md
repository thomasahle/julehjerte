# Measuring cut-count search strategies

**Border consensus is the fastest of the three full-solve policies tested**, but
the median paired saving is only 2.0% (6.8% across total elapsed solve time).
It solves the same cases as the baseline and can increase image error by
0.168 percentage points. The production count search remains unchanged.

This experiment compares image-derived initialization strategies with fixed
photographs, crops, masks and probabilities. No published cutting templates,
reference slit counts or saved fitted curves enter a search. All policies use
the same fitter, geometry checks, paper-core checks and image-error threshold.

The corpus contains 91 prepared targets: 22 regular Hunodan photographs, six
predeclared one-pixel crop shifts, 29 web-photo crops, 22 collage crops, seven
individual photographs, two user examples and three synthetic silhouettes.
Another 33 catalogue entries are explicitly excluded for missing or unresolved
crop proposals. The crops and colour estimates are not ground truth.

Each of five initializers is run twice on every target (910 initializations).
Policy order rotates by case and repetition. Full solves compare the baseline
with two shortlisted policies on 49 cases selected before timing: all 22
Hunodan cases and six perturbations, every fourth entry in each harder-photo
group, the two user examples and the three silhouettes. Runs are serial on an
Apple M2 Pro, Node 25.6.1, with a ten-second search budget. The full timing
includes fitting, validation and export, including failed attempts; frozen
preparation and the independent export renderer are outside that timing.

## Initializers

| Policy | Work performed |
| --- | --- |
| `all` | Existing count hypotheses and both phases, 18 alternating initialization rounds. |
| `border-consensus` | When the inset bands on opposite edges agree confidently, try that pair and both phases; otherwise fall back to `all`. |
| `race` | Three rounds on every hypothesis, then restart the best six count/phase pairs and any confident border pair for the full 18 rounds. |
| `shared-work` | Keep every hypothesis; reuse identical linear projection calculations and stop a seed only at an exactly repeated deterministic cycle. |
| `race-shared` | Combine the short race with shared calculations. |

| Policy | Median initialization | Median paired time / `all` | Retained baseline's best seed | Identical complete seed set |
| --- | ---: | ---: | ---: | ---: |
| `all` | 1.068 s | 100.0% | 182 / 182 | 182 / 182 |
| `border-consensus` | 0.908 s | 80.1% | 174 / 182 | 100 / 182 |
| `race` | 0.659 s | 64.2% | 180 / 182 | 0 / 182 |
| `shared-work` | 0.879 s | 84.9% | 182 / 182 | 182 / 182 |
| `race-shared` | 0.585 s | 58.6% | 180 / 182 | 0 / 182 |

The short race with shared calculations is fastest at initialization: its
median paired reduction is 41.4%. Shared calculations alone save 15.1% while
preserving every seed's coordinates and score exactly in all 182 paired runs.
This is an initialization result; it does not establish the same percentage
improvement in total solve time.

Border consensus discards the baseline's best seed on `hjfig-05`, its one-pixel
shift, `hjfla-01` and `danish-tree-green`. The short race discards it on
`danish-tree-dots`. Neither means the final reconstruction must fail: later
candidates can still improve. They do show why edge counts or a very short
coarse fit cannot be assumed to identify the best count pair reliably.

## Complete solves

| Policy | Accepted cases | Median elapsed time | Median paired time / `all` | Total elapsed time | Largest increase in error on an accepted pair |
| --- | ---: | ---: | ---: | ---: | ---: |
| `all` | 38 / 49 | 8.430 s | 100.0% | 373.39 s | — |
| `border-consensus` | 38 / 49 | 8.181 s | 98.0% | 348.17 s | 0.168 percentage points |
| `race-shared` | 38 / 49 | 8.706 s | 99.1% | 368.70 s | 0.112 percentage points |

Every engine-accepted result also passes the independent export renderer's
3% image-error threshold and substantial-feature audit. All policies accept
and reject exactly the same cases. There are no gained or lost successes.
Both largest error increases occur on `orange-upload-1254`.

| Input group | Accepted by every policy |
| --- | ---: |
| Regular Hunodan | 22 / 22 |
| One-pixel crop perturbations | 6 / 6 |
| Web photographs | 2 / 8 |
| Collage crops | 2 / 6 |
| Individual photographs | 1 / 2 |
| Hard user examples | 2 / 2 |
| Synthetic silhouettes | 3 / 3 |

On Hunodan alone, border consensus saves 8.3% in the median paired comparison;
on the harder web and collage crops, there is essentially no full-solve saving.
The fitter spends much of the saved initialization time on later refinement,
sharing and polishing within its deadline. A 41.4% faster initializer therefore
does not imply a 41.4% faster answer: `race-shared` saves only 0.9% in the median
paired complete solve.

This gives two separate conclusions. Shared calculations are a promising way
to reduce initialization work without pruning candidate seeds; their complete
solve performance was not separately benchmarked here. For an immediate public
default, neither shortlisted pruning policy establishes a consistently better
speed/quality result, so `all` remains the default and no additional mode is
exposed to visitors.

The unchanged failures suggest that choosing fewer count hypotheses is not the
main obstacle on these hard photographs. Because every policy receives the
same fixed crop, these results alone cannot attribute a failure to cropping
rather than colour estimation, topology or refinement. They also do not prove
the baseline found globally optimal counts or cutting paths.

## Reproduction and scope

The frozen experiment uses the integration branch's engine at `4f42839`, with
reporting and atomic-resume changes through `fffa69a`. Numerical source hashes
are retained. It predates the redesign QA's resampled-boundary simplification;
the numerical code was held fixed while the long comparison resumed after the
editor QA. This is not a comparison of the old and redesigned interfaces.

```sh
node --input-type=module -e '
  import {prepareCorpus} from "./scripts/inverse/count-strategy-data.mjs";
  await prepareCorpus("tmp/count-strategies/corpus");
'
node scripts/inverse/count-strategy-benchmark.mjs --stage=initialize \
  --repeats=2 --output=tmp/count-strategies/screen
node scripts/inverse/count-strategy-benchmark.mjs --stage=solve \
  --strategies=all,border-consensus,race-shared \
  --output=tmp/count-strategies/solve
node scripts/inverse/count-strategy-report.mjs \
  --solve=tmp/count-strategies/solve
```

Corpus preparation needs the local source files recorded by the existing photo
manifests. `--corpus=...` can instead replay an already frozen corpus. Add
`--resume=true` to the solve command after an interruption: only complete
case/policy blocks are retained, and changed numerical source hashes are
rejected. Run timed experiments without simultaneous builds or browser solves.

[COUNT-STRATEGIES.json](COUNT-STRATEGIES.json) records per-case outcomes,
source hashes, settings, excluded entries and resume metadata. The redesigned
app's separate production validation is in
[REDESIGN-MIGRATION.md](REDESIGN-MIGRATION.md).
