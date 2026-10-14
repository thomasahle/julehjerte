# Export replay exposes missed short-return constraints

The first full checkpoint-projection experiment retained **22/22 Hunodan**
speed/quality passes and **25/31 hard-photo** passes under its validator. An
independent SVG/subdivision audit then found that its short-return search could
miss real point pairs satisfying its own rejection rule. Those pass counts did
not establish representation-independent validity. The proposal remains offline.

## Full-corpus comparison before the stronger audit

The experiment starts from fresh image-derived grids, with the same photographs,
crop proposals, classified masks and fitting probabilities as the current
row-initialization release. It does not receive saved fitted paths.

- All 22 Hunodan cases pass the original experiment's speed and quality gates;
  maximum preparation/solve/validation/export time is **7.882 s**. Against the
  current release, 21 independent errors are identical and the bird changes
  from 0.9043% to 0.8612%.
- All 25 previously accepted photographs remain accepted; none of the six
  failures is recovered. Four accepted errors improve, eighteen are unchanged,
  and three increase by at most **0.020625 percentage points**. These are single
  wall-clock-budgeted replays, not a statistical timing/quality comparison.
- All 51 produced outputs convert through the production editor and SVG
  serialization/parsing. The same 47 meet the complete image, feature and
  current geometry/paper criteria. Four photo outputs still fail image/features.
- The 22 Hunodan targets were recreated from their original photograph/ROI/quad
  and settings. Independent exported-weave errors reproduce the saved values
  exactly. Photo source identities, crop coordinates, classified masks,
  probabilities and fitting targets are unchanged.

These timings exclude decoding and independent export replay. The 31-photo
denominator follows the corpus's complete/obscured classifications, not the
separate `clippedByFrame` flag: the bottom flower has clipped lobes but a complete
overlap square. No browser-latency or physical-assembly claim follows.

## Why subdivision still changed the answer

The first proposal polished the closest points in each pair of nearby flattened
intervals. It then asked whether the path between those points turns at least
180 degrees, or whether both points are local distance minima.

That mixes an unconstrained minimization with a constrained question. The
closest pair can fail the turning condition while other points in the same
interval satisfy it and are still less than 1.5 mm apart. Changing subdivision
changes which intervals expose those other pairs.

The exported bird supplies a concrete witness: a **1.4662 mm** gap with
**180.8657 degrees** of total turning. The old search accepted its original
representation. The same defect also exists in its pre-conversion engine
geometry, so this is not explained solely by SVG simplification.

Nine interval probes recovered that bird, but the gift exposed another narrow
feasible interval. A one-dimensional search along the turning constraint caught
both saved outputs, yet a fresh bird fit passed in one orientation and failed
after reflection. Reversing the cut swaps the fixed and searched parameters.

The revised experimental predicate therefore:

1. Tests the polished pair and interval endpoints/interiors.
2. Uses turning monotonicity to locate the feasible parameter boundary, while
   retaining the original arc-distance limits.
3. Searches this boundary in both path directions.
4. Rejects only with actual evaluated curve points satisfying the original
   distance, turning/stationarity and endpoint criteria.

The boundary minimization is bounded and numerical. It is not a proof that every
possible return will be found. The 1.5 mm rule and acceptance thresholds have
not been relaxed. Three exported counterexamples are now committed fixtures.

## What the expanded checks establish

The final two-direction search gives stable binary verdicts across:

| Audit | Representations | Result |
| --- | ---: | --- |
| 12 analytic/captured cases and 51 saved engine outputs | 504 | No subdivision/reflection decision changes |
| Actual SVGs from the full corpus | 408 | Bird and gift rejected in all representations; all other outputs pass the proposed geometry check |
| Four fresh control/proposal SVGs | 32 | Three rejected consistently; only the final gift proposal passes in every representation |
| Three captured exported returns, independent random knots per cubic | 300 | Every known return remains detected |

The first three rows use original, halves, thirds and unequal subdivisions,
each with and without reflection. Maximum sampled SVG geometry change from
subdivision is below **4.1e-13 editor pixels**. These are multiple representations
of the same designs, not hundreds of independent photographs.

The current editor still changes its own verdict for five full-corpus SVGs:
bird, gift, outlined star, Stonehenge and Viking. It has not been changed in this
experiment. The new audit records the independent editor and experimental
engine results separately, rather than treating either as the other's oracle.

## Fitting quality remains unresolved

The stronger checks expose a genuine optimization problem. In the final fresh
one-direction-search trial, the bird's independent mask error is **1.2680%** and
the gift's is **2.3719%**, compared with current-runtime errors of 0.9043% and
2.3094%. Both fit/export calls finish under ten seconds. The subsequent
two-direction audit rejects the bird, including its exported SVG. The gift
survives that audit but has higher error. Neither is a release improvement.

The retained trials also include up to 160 extra steps after an improving
projection, visible-control movement costs of 2/10/100 times hidden controls,
and a smaller step size after projection. None establishes a qualifying
improvement. Their records remain available; they are not selected by changing
the source mask or acceptance limits.

Visual inspection of the final editable previews still shows uneven bird-grid
borders and an irregular eye, plus gift contour nicks and thin seams. The next
useful optimization change is to carry active return constraints into the
gradient updates: the current general separation penalty excludes these short
arc neighbourhoods, leaving periodic projection to repair recurring defects.

## Verification and artifacts

All ten focused tests and focused lint pass. Tests cover captured returns,
ordinary bends, reflection, random subdivisions, projection immutability/fixed
endpoints, and the existing MILP rejection regression. No app/runtime files were
changed. Subsequent [complete verification](short-return-export-validation.json)
passes **826 inverse tests**, **855 application tests** (one skipped), type
checking, lint and build. All 822 checked source files retain their hashes.
The refreshed preview serves 153 verified build assets, and all thirteen new
Chromium flows pass. Their screenshots have not all been visually re-reviewed.
The app runtime remains unchanged; these checks do not deploy the proposal.

The [evidence record](short-return-export-audit.json) preserves the full native
comparison, actual SVG audits, intermediate counterexamples, unsuccessful
fitting trials and source/artifact hashes. Reusable entry points are
`diagnostics/hunodan-editor-input.mjs`, `hard-photo-editor-replay.mjs`,
`diagnostics/editable-return-study.mjs` and `self-return-subdivision-study.mjs`,
all under `scripts/inverse/`. No changes have been pushed or deployed.
