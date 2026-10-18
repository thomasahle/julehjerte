# Try a better route before an entire region disappears

The recovered-frame diagnostic now fits within ten seconds: **1.721% independent
mask disagreement in 9.369 seconds**, compared with **6.015% in 9.199 seconds**
from the preceding implementation. All 26 sparse source-photo observations
survive the new export; previously 23 did. Geometry, paper and feature checks
pass without changing their thresholds.

[Measurements, source hashes and check results](early-feature-routing.json)
record the paired runs and broader verification.

This isolates **fitting on the same experimental mask**. The automatic photo
pipeline does not yet reproduce that mask, and the mask is not artwork or
cutting-path ground truth. The earlier crop and color-classification problems
remain separate. Fine seams and uneven corners remain visible in the fitted
result.

## What delayed the useful layout

The trace/MILP fallback rejects inconsistent border counts almost immediately;
it does not spend the available budget solving this case. The longer direct
search instead reaches an additional grid layout after several ordinary fits.

The ordinary first grid retains 80.3% of its weakest substantial region. That
passes the unchanged 60% whole-region retention gate, so the early feature
initializer previously did nothing. A later, unsuccessful ordinary layout
loses much more of that region and finally triggers feature-weighted starts.
The useful unequal-count routing therefore appeared only late in the
thirty-second search.

Simply adding nearby cut counts to the initial search was insufficient in a
separate probe: it still returned a rejected 6.117% fit. Its promising new
layout did not reach the small finalist set. Enumeration and scheduling both
matter; a longer list of cut counts alone is not a solution.

## Bounded early proposal

The fitter retains its existing route for missing features. It now also tries
one region-weighted initialization after ordinary traced recovery has failed,
when:

- The best coarse grid exceeds twice the allowed image error, and none of the
  fine grids reaches the allowed error.
- The first fine grid passes the existing feature checks, but its weakest
  region has more missing-color pixels proportionally than the whole image's
  error.
- There is enough refinement time remaining, with no explicit symmetry or
  weighted/free-border objective.

The existing initializer emphasizes that region and tests nearby counts and
both phases. No source-photo observations, known template counts or saved cuts
enter the search. The proposal goes first only if ordinary fine-grid fitting
reduces the original unweighted image score **and** preserves every required
feature, including enclosure. Every ordinary finalist remains available.
Physical validation and independent exported-mask checks are unchanged.

The first trial ran this proposal before traced recovery and reduced its
allowance to 0.75 seconds. The full inverse suite caught a regression on an
actual cropped tree: the ordinary border-endpoint retry previously found a
three-cut pair per sheet in 5.6 seconds, while the trial produced four and five
cuts in 9.0 seconds. Both passed image and physical checks, but the trial was
slower and unnecessarily complicated. The corrected order preserves the
existing retry. The focused tree and recovered-frame tests both pass; the
rejected trial and its reports are retained in the evidence directory.

Rejected proposals still cost time. The report records the trigger, original
retention and error, proposed error, feature result and scheduling decision.
This makes the search cost and rejection inspectable instead of counting only
successful trials.

## Paired perturbation replay

Each row starts fresh with the same mask for both implementations, a ten-second
allowance and no fitted templates. The old engine snapshot matches all 94
tracked `static/inverse` files at `a580916`; the new engine is `325f9a1`.
Reflection/transposition do not change the source pixel values. The one-pixel
horizontal translation replicates the leftmost column at the new edge.

| Input | Before | After | New fit/export | Checks before → after |
| --- | ---: | ---: | ---: | --- |
| Original | 6.015% | 1.721% | 9.369 s | Fail → pass |
| Transposed | 5.555% | 2.715% | 9.409 s | Fail → pass |
| Reflected horizontally | 5.947% | 1.472% | 9.450 s | Fail → pass |
| Shifted right one pixel | 2.364% | 2.251% | 9.301 s | Pass → pass |

Disagreement is measured by the independent renderer on exported curves.
These are selected development diagnostics, not held-out evidence or four
independent photographed hearts. The sparse photo observations apply only to
the original coordinates. The regression additionally checks original-mask
exports at 400 and 800 pixels without changing the input during fitting.

The varying errors and selected layouts expose remaining directional
sensitivity. The transpose uses a sampling fallback and four cuts per sheet;
the original selects four and five. Passing all four does not establish
rotation-invariant search or identical recovery of the underlying design.

Raw comparisons, rejected probes, outputs and source hashes are retained in
`tmp/heart-learning/early-feature-v2/`; `index.html` displays the paired weaves.
The initial trial, rejected count-only experiment and stopped failing suite
remain under `tmp/heart-learning/early-feature-v1/`.

## Broader verification

The full photo replay remains **24/31 accepted**, with the same passing cases,
source hashes, effective crop coordinates and classified/fitting targets.
Three cases still have no crop; four reconstructions still fail. The jigsaw
improves from 6.889% to 5.644% but remains rejected. The gingerbread stays
accepted with a small increase from 1.481% to 1.507%; timed refinement can
change the final error even when a speculative proposal is rejected.

All **22 regular Hunodan designs** pass their existing quality and ten-second
gates; the maximum prepare/solve/validate/export time is **8.706 seconds**.
None activates the new proposal. Twenty-one errors match the preceding full
replay. The dense `hjstr-03` case differs by 0.0073 percentage point; two fresh
old/new paired replays then produce identical errors within each pair
(0.5540% and 0.5580%), all under ten seconds. This supports timing-dependent
variation, rather than a changed routing, for that small historical difference.

All **751 inverse tests and 855 application tests** pass, with one existing
application skip. Type checks, lint and the production build pass. Seven
existing type warnings and one existing lint warning remain.

Chromium passes four real upload/worker/editable-export cases with no page
errors. The framed mask retains 1.531% disagreement after editable SVG export;
the tree retains its three-cut sheets. The harness also verifies downloaded
curves against the editor's intersection rules and checks source fidelity.

| Browser case | Click to ready | Editable-mask disagreement |
| --- | ---: | ---: |
| Recovered frame mask | 14.848 s | 1.531% |
| Cropped tree photograph | 6.353 s | 2.385% |
| Dense floral checker mask | 28.417 s | 1.929% |
| Star | 2.107 s | 0.160% |

These use the normal UI's longer allowance and include worker/DOM overhead;
they are not ten-second browser results. The native fixed-mask and Hunodan
benchmarks above have their own explicit ten-second allowances. Browser speed,
especially for the dense checker, remains a separate improvement target.

The owned preview is rebuilt and running at `http://127.0.0.1:5232/editor/mal/`.

## Reproduction

```sh
node --test --test-concurrency=1 scripts/inverse/weak-feature-routing.test.mjs
node scripts/inverse/hard-photo-benchmark.mjs \
  --crop=automatic --target=mask --seconds=10 --output=tmp/early-feature-photos
INVERSE_SPEED_OUT=tmp/early-feature-hunodan \
  node scripts/inverse/hunodan-speed-benchmark.mjs
INVERSE_TEST_CASES=faded-frame-mask \
  node scripts/inverse/paint-browser-test.mjs
```

The browser harness also needs its usual owned preview URL and Playwright
configuration. It uploads the derived mask as pixels and exercises the real
worker, editable conversion and SVG/PDF export, without importing cutting paths.
