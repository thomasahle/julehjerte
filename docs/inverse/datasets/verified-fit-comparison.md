# Spend extra search on competitive simpler layouts

The main fitter no longer uses a finer-verified fallback as a reason to keep
trying every extra grid in coarse-score order. It preserves all ordinary
finalists, then compares competitive simpler layouts directly. This retains
the maple leaf's later three-cut solution while avoiding two intervening
elaborate fits in the selected diagnostic.

## Why the search continued

Coarse paper checks can classify a good image fit as uncertain. An independent
finer paper audit can validate the same coordinates, producing an acceptable
alternative to the poorer coarse-passing incumbent. The existing search kept
up to 25 seconds for further routing comparisons even after that alternative
passed every source-image, feature, geometry and paper check.

Stopping at that first acceptable alternative is insufficient. The maple
leaf's three-cut layout is outside its first three coarse seeds and improves
on the initially accepted four-cut pair. The candle also benefits from an
ordinary simpler finalist. Neither should be lost to a blanket early exit.

## Scheduling change

The initial count search, ordinary finalist list and their order are unchanged.
If those attempts produce only a finer-verified acceptable fallback, extra
comparisons now require fewer total cuts than the simplest accepted pair and
a competitive coarse score. The score uses the existing fine-grid preference
of 0.005 per cut and the existing finalist reservation window of 0.015.

The helper selects the first qualifying seed in the original order. It does
not mutate or discard the other initializations. If no fit is acceptable,
the old continuation order remains available. Weighted/free-border objectives
also retain their previous continuation policy. The 25-second maximum remains;
it is not a requirement to consume that time.

This is a search heuristic, **not a lower bound on attainable image error**.
A rejected extra initialization could theoretically refine well. The final
image and feature thresholds are unchanged, and all proposed curves still
need geometry and paper validation. Matching-sheet search retains the full
initialization pool and the user's one-percentage-point allowance.

The solver report records each extra comparison's reason, accepted counts and
selected counts/phase, including a null selection when no competitive simpler
layout remains.

## Fresh paired experiment

Five selected photographic masks were fitted afresh with the normal
180-second allowance, progress-candidate serialization enabled and no saved
curves. The before/after engines differ only in the continuation policy; both
include the independently tested geometry pruning. Every paired input mask
hash matches. Errors below come from the independent exported-curve renderer.

| Mask | Before | After | Before disagreement | After disagreement |
| --- | ---: | ---: | ---: | ---: |
| Floral checker | 26.73 s | 23.44 s | 1.886% | 1.656% |
| Maple leaf | 20.52 s | 14.49 s | 1.135% | 1.135% |
| Candle | 5.05 s | 5.02 s | 0.484% | 0.484% |
| Warped checker | 26.27 s | 26.14 s | 1.774% | 1.789% |
| Fine checker | 26.78 s | 26.90 s | 2.244% | 2.186% |

All ten results pass image, feature and geometric checks. The maple leaf keeps
three cuts per sheet, and the candle keeps one. The floral checker skips one
extra grid; the maple leaf skips two. The warped and fine checkers perform
the same fine-grid attempt sequence as before, including feature proposals.
They still consume nearly the full allowance; their small timing/error
differences do not establish an improvement from this policy.

These are Node solve/validation/export timings, excluding photograph decoding,
classification, independent replay and artifact writes. They are selected
development comparisons, not unseen photographic ground truth or browser
click-to-ready measurements. Raw inputs, engine snapshots, hashes, outputs and
logs remain under `tmp/heart-learning/browser-search-v1/`.

The production regression starts from the original photograph and frozen crop,
checks the input mask hash, discovers the later three-cut routing, and verifies
its independent export. A separate browser case uploads those pixels and
checks the actual worker and editable export. Saved cutting curves never enter
either solve.

```sh
node --test --test-concurrency=1 \
  scripts/inverse/comparison-search.test.mjs \
  scripts/inverse/refinement-checkpoints.test.mjs
INVERSE_TEST_CASES=maple-leaf-mask,floral-checker-mask \
  node scripts/inverse/paint-browser-test.mjs
```

The browser command additionally needs the normal owned-preview URL and
Playwright configuration. The committed crop is a fitting regression input,
not a claim of verified photographic corners or original artwork.

## Browser comparison and release checks

The [verification ledger](verified-fit-comparison.json) records source hashes,
commands, input identity, exported artifacts and both benchmark stages.

The current UI was also replayed with the preceding engine (`87e3eb4`) served
from its exact Git snapshot. The harness records the intercepted worker-module
requests and hashes; both versions receive identical masks and settings.

| Chromium case | Before click-to-ready | After click-to-ready | Before editable error | After editable error |
| --- | ---: | ---: | ---: | ---: |
| Maple leaf | 21.88 s | 15.93 s | 1.129% | 1.129% |
| Floral checker | 27.91 s | 25.15 s | 1.896% | 1.723% |

The maple leaf's `cut_geometry.json`, editable SVG and Draw screenshot are
byte-identical. Its speedup therefore preserves the actual selected curves,
not just the aggregate disagreement. The floral checker retains seven cuts
per sheet with lower disagreement. These are single paired browser replays,
not a claim about every device's latency.

All five current Chromium cases pass worker, editable geometry, source fidelity
and SVG export checks with no page errors. The four mask/example cases also
download PDFs; the cropped-tree flow checks SVG export only.

| Case | Click-to-ready | Editable disagreement |
| --- | ---: | ---: |
| Maple leaf | 15.93 s | 1.129% |
| Floral checker | 25.15 s | 1.723% |
| Recovered frame mask | 14.57 s | 1.491% |
| Cropped tree photograph | 6.37 s | 2.385% |
| Star | 2.03 s | 0.160% |

Screenshot review confirms the unchanged maple rendering. Irregular borders
and some thin seams remain visible in these photographic reconstructions;
numerical acceptance does not establish the original design's cutting paths.
The separate geometry-pruning gallery also retains the gingerbread's small
border defects rather than presenting its low error as perfect recovery.

The full ten-second photo replay remains **24/31 accepted**, with identical
passing cases, effective crop coordinates, source images and classified/fitting
mask hashes. None of those short runs reaches the new continuation policy.
Small time-bounded error variations remain, including a worse still-rejected
bauble. The ledger preserves them; this change does not recover another photo.

All **22 regular Hunodan designs** pass with exactly unchanged errors and a
maximum preparation/solve/validation/export time of **8.282 seconds**. All
**758 inverse tests and 855 application tests** pass, with one existing
application skip. Type checking, lint and the build pass; existing warnings
are unchanged. Served geometry, count-search and fitter bytes match the
verified workspace. The rebuilt owned preview remains available at
`http://127.0.0.1:5232/editor/mal/`.
