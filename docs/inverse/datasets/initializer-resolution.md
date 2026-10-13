# Fixed-crop initializer resolution study

Changing the row-DP initializer's sampling can produce a valid fresh fit for the
remaining vertical Stonehenge crop shift. It is **not a safe replacement for the
current initializer**: it also destroys previously successful fits. Both tested
policies remain offline experiments; production code is unchanged.

This follows the [retained-start diagnosis](retained-grid-starts.md). That study
showed an acceptable fit existed by refining saved geometry from a neighboring
crop. Here every solve starts from the photograph and fixed crop coordinates.
No fitted templates are read. The machine-readable evidence is in
[initializer-resolution.json](initializer-resolution.json).

## Fixed-count experiment

The unresolved input is the same frozen crop translated downward by one source
pixel. The photographic classifier, 400-pixel mask and probabilities stay fixed.
Only the resolution of the alternating row-DP initializer changes. This affects
both row quantization and spline projection; it is not an isolated test of either
one. All variants use three cuts per family, phase 1, 16 controls, 18 DP rounds,
the same feature weights and unweighted scoring target.

Eligible starts receive the same fine-grid, clearance and 750-step free-curve
passes, without deadlines. The coarse image and feature gates are unchanged.
These are diagnostic fits before normal final cleanup, not full count searches
or ten-second production benchmarks.

| DP samples | Exported mask error | Error at twice the resolution | Result |
| ---: | ---: | ---: | --- |
| 88 | 4.7300% | 4.7880% | Image error |
| 92 | 3.1369% | 3.2286% | Image error |
| 94 | 3.1681% | 3.2517% | Image error |
| 96, current | 3.1006% | 3.1953% | Image error |
| 98 | **2.8781%** | **2.9741%** | All checks pass |
| 100 | — | — | Fails the unchanged coarse cutoff |
| 104 | 3.0544% | 3.1581% | Image error |

The 98-sample start retains only **60.11%** of the small opening's source pixels
at initialization, just above the existing 60% color-retention gate. Its final
export retains the feature and passes geometry and paper checks. This small
initial margin helps explain why replacing one fixed resolution with another
does not eliminate sensitivity.

## Full solver comparison

The replay tests three policies in separate copies of the current modules:

- **Current:** the production initializer, unchanged.
- **Replace feature sampling:** use 98 samples in every feature-grid search,
  including joint and finer-spline searches. Ordinary count initialization stays
  unchanged.
- **Bounded alternatives:** keep the current search. Only after a successful
  near-miss rescue at the original cut counts, test 94 and 98 samples at that same
  count/phase. Admit a new start only if it retains all source colors, meets the
  original coarse cutoff and has lower unweighted coarse error. Keep the original
  rescued start as an alternative. Existing downstream scheduling still decides
  whether an alternative receives full refinement; retaining it does not guarantee
  that it will be fitted within the time limit.

Each replay uses a ten-second requested solve budget, fresh photo classification,
normal candidate selection, cleanup, matching preference and export. Preparation
and the diagnostic independent renderer are outside the reported solve time.
Every exported pair is independently rendered at the source resolution and twice
that resolution. The latter reference repeats each source mask pixel, so it tests
export sampling consistency rather than supplying new photographic detail.

The case set is the original crop and all eight integer offsets in a 3 × 3
neighborhood, plus the existing half-resolution puppy regression. These are
development cases from two photographs, not ten independent motifs or a new
held-out benchmark. The broader 31-photo benchmark was not rerun for this
experiment; its production code is unchanged.

| Input | Current, source error | Replace feature sampling | Bounded alternatives |
| --- | ---: | ---: | ---: |
| Original crop | 2.6687%, pass | 4.6037%, fail | 2.7644%, pass |
| x + 1 | 2.4663%, pass | 3.7637%, fail | 2.4663%, pass |
| y + 1 | 3.0931%, fail | **2.8931%, pass** | **2.8931%, pass** |
| x − 1 | 2.7612%, pass | 2.9463%, **fine-scale fail** | 2.7612%, pass |
| y − 1 | 2.6013%, pass | 2.5687%, pass | 2.6144%, pass |
| x + 1, y + 1 | 4.2444%, fail | 5.5369%, fail | 3.2681%, fail |
| x − 1, y + 1 | 2.6775%, pass | 2.9144%, fail | 2.6775%, pass |
| x + 1, y − 1 | 3.8206%, fail | 2.7338%, pass | 3.7656%, fail |
| x − 1, y − 1 | 3.2181%, fail | 2.5088%, pass | 3.0200%, fail |
| Half-resolution puppy | 0.8626%, pass | 0.9592%, **geometry fail** | 0.8652%, pass |

Pass in this table requires the app's template checks **and** independent image
and feature checks at both resolutions. The replaced initializer's x − 1 case
passes the app's native-resolution checks but reaches 3.0267% at 800 pixels.
Mask error alone also conceals the puppy's self-intersection and uncertain paper
support. Its opening passes the feature checks in this replay.

For the nine Stonehenge crops, the strict totals are **5/9 current, 4/9 replacement,
and 6/9 bounded alternatives**. Including the puppy gives 6/10, 4/10 and 7/10.
The successful vertical result takes 7.11 seconds in the bounded-policy replay,
including solve validation and export; its independently rendered errors are
2.8931% at 400 pixels and 2.9947% at 800. That fine-scale margin remains small.

The bounded policy increases the original crop's error by **0.0956 percentage
points**. Its other runtime-dependent differences must not all be attributed to
sampling: some cases never invoke the extra scales, and the deadline-limited
solver can visit different later candidates as runtime varies. Earlier local
explorations are retained alongside the canonical replay and show this variation.
All runs were serial, but other activity on the computer was not controlled.

## Root cause and decision

Repeated inset-border measurements support 3 + 3 cuts on eight of the nine
Stonehenge crops, including every failing current-solver case. The sole crop
without consistent border support succeeds. Thus, these failures are not simply
inconsistent opposite-edge counts preventing the solver from starting.

The same fixed mask admits better fits from fresh image-derived starts when the
initializer's discretization changes. The downstream optimizer and validators
do not change. On the unshifted crop, however, replacing feature sampling loses
the small region in the three-cut start and promotes a five-cut route with large
visible distortions. On the vertical shift, the replacement retains the region
and keeps the useful three-cut route. These observations support a combination
of discretization-sensitive starting shapes, feature gating and routing selection.
They do not establish that the photographic crop is ground truth, or that every
remaining failure has the same cause.

The union of the three policies contains checked exports for nine of the ten
inputs. That is an **after-the-fact selection across multiple full solves**, not
a nine-out-of-ten solver within a single ten-second budget. It suggests testing
a bounded portfolio of starting layouts with actual final validation and time
accounting. It does not justify changing the default grid resolution or silently
choosing the best experiment after inspecting results.

Neither experimental policy is promoted. The next useful change must preserve
working candidates while giving alternative layouts enough refinement time, and
measure the resulting accuracy/time tradeoff across the existing benchmarks.
Visual inspection also still shows rounded motif details and uneven borders;
passing these numerical checks is not a claim to have recovered original artwork.

## Reproduction and verification

```sh
node scripts/inverse/initializer-resolution-study.mjs \
  --output=tmp/initializer-resolution-study
node scripts/inverse/initializer-resolution-replay.mjs \
  --output=tmp/initializer-resolution-replay \
  --policies=baseline,replace-feature,nearby \
  '--cases=original;horizontal;vertical;puppy-half;-1,0;0,-1;1,1;-1,1;1,-1;-1,-1'
```

The replay requires a new output directory. It checks source file and decoded
pixel hashes, exact fixed crops, identical mask/probability hashes across policies,
every copied module's hash, and source-array immutability after fitting. Its
experimental patch sites are asserted exactly once. Both independent resolutions,
feature reports, exported geometries, module hashes, solver histories and failures
are retained. No browser source, downloaded photograph or production module is
modified by either tool.

Release checks pass: **731 inverse tests**, **855 application tests** with one
existing skip, lint, and the production build. Svelte reports zero errors and
seven existing warnings. The local evidence inventory contains **885 hashed
files**, including exploratory failures and the canonical 30-run replay. The
preview remains available at `http://127.0.0.1:5232/editor/mal/`. No new browser
flow is claimed for this diagnostic-only change; the preceding production
browser/export checks are recorded in the retained-start report.
