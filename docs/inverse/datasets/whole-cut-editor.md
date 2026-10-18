# Whole-cut editor validation experiment

This records the experiment at commit `3e87607`. The current builder uses the
subsequent [shared typed geometry and physical endpoint rule](shared-return-geometry.md).
The measurements below refer to the original experiment.

A complete same-cut search fixes the saved editor inconsistencies without hiding
known returns. Across **424 actual SVG representations**, the proposed editor
and the stronger experimental geometry check agree on every binary verdict.
The original bird and gift remain invalid in every representation; their final
repaired versions pass every representation. This remains an offline experiment.

## Why the previous shortcut was insufficient

The editor previously asked for one closest-point pair per pair of cubic
segments. The closest pair may describe an ordinary bend even though other
nearby points satisfy the return rule. Exact subdivision changes which such
pairs are exposed. Merely exempting the nearest ordinary bend hid three captured
returns and was rejected in the earlier experiment.

The replacement searches along the whole cut, including the turning-constraint
boundary. It retains the editor's existing crossing and inter-cut checks and
endpoint exemptions. The extracted kernel has no cut-graph dependency; the
standalone experiment still uses the engine's cubic math implementation. This
is not yet a typed production UI module or a browser bundle change.

| Saved SVG | Old editor: flagged representations | Proposed editor | Stronger geometry |
| --- | ---: | ---: | ---: |
| Original Hunodan bird | 6/8 | 8/8 | 8/8 |
| Original gift | 6/8 | 8/8 | 8/8 |
| Outlined star | 2/8 | 0/8 | 0/8 |
| Stonehenge | 4/8 | 0/8 | 0/8 |
| Viking | 2/8 | 0/8 | 0/8 |
| Repaired bird | 0/8 | 0/8 | 0/8 |
| Repaired gift | 2/8 | 0/8 | 0/8 |

The other original outputs remain unflagged. These are 51 original outputs plus
two repaired versions, each represented with original, half, third and unequal
subdivisions and their reflections. They are not 424 different photographs.
The 96 additional analytic/captured representations retain every expected
positive and negative result, including the three returns hidden by the rejected
nearest-pair exemption. Seventeen prototype editor tests pass.

## Cost and an accepted early exclusion

The new search is more expensive than the original editor. Median native full
editor-check times in the portable replay are:

| Corpus | Original editor | Whole-cut prototype |
| --- | ---: | ---: |
| Hunodan SVGs | 1.84 ms | 10.90 ms |
| Photographic SVGs | 3.39 ms | 14.38 ms |
| Two repaired SVGs | 3.96 ms | 25.53 ms |

These timings include the editor's other checks. They are not browser interaction
or complete reconstruction times. Photographic checks reach 46.71 ms in this run,
so interaction latency still needs attention before activating the replacement.

A conservative directional test avoids searching paths that cannot meet this
return criterion. If every nonzero derivative control vector lies in a right-angle
cone and every join is exactly continuous, the path's chord is bounded below by
its arc length divided by the square root of two. The two partial flattening
intervals contribute at most two-fifths of the margin to the arc estimate. With
the existing two-margin minimum arc separation, the chord still exceeds the
clearance margin. Zero derivatives, angle wrapping, discontinuities, nonfinite
coordinates and changes to reused controls are covered by tests.

On **5,128 individual cut checks**, this excludes 950 paths and preserves every
complete reported witness object. In an alternating-order paired native run,
kernel time falls from 5.202 s to 4.483 s, about **13.8%**. This is a kernel gain,
not a 13.8% improvement to the application or solver.

A spatial-grid broad phase was also tested and rejected: it preserved witnesses
but increased paired kernel time from 5.280 s to 9.326 s. The existing scan stays
in the selected experiment.

## Reproduction

The builder reads the committed experimental predicate and editor, extracts the
whole-cut kernel, adds the directional exclusion, and writes an isolated editor
module. It rejects unsupported source layouts and existing output directories.
It never rewrites the application's files.

```sh
node scripts/inverse/diagnostics/build-whole-return-editor.mjs \
  --output=tmp/new-whole-cut-editor
node scripts/inverse/diagnostics/editable-return-study.mjs \
  --run=tmp/heart-learning/turn-limit-v1/photos \
  --editable=tmp/heart-learning/turn-limit-v1/photo-editor \
  --runtime=tmp/heart-learning/final-return-corpus-v1/final-runtime \
  --editor-module=tmp/new-whole-cut-editor/editor.ts \
  --editor-manifest=tmp/new-whole-cut-editor/source.json \
  --baseline-editor-module=src/lib/editor/curveIssues.ts \
  --output=tmp/new-whole-cut-study
```

The optional baseline comparison alternates evaluation order. The editor manifest
pins the generated files and direct builder inputs, which are verified before
and after the replay. The [evidence record](whole-cut-editor.json) contains all
case outcomes, timing distributions, failed experiments, source hashes and
artifact hashes. Two new Node tests verify the exclusion preconditions and exact
witness agreement against the original predicate using identical canonical curves.

Production integration still needs consistent endpoint behavior across physical
scales, a small UI module that respects the engine-loading boundary, and fresh
browser/solver checks. The stricter editor must be integrated with final repair:
enabling it alone would correctly reject the current bird and gift outputs.
The current application and its 25/31 photographic benchmark are unchanged.

The subsequent [complete QA](whole-cut-editor-validation.json) passes all 835
inverse tests and 855 application tests (one existing skip), type checking,
lint and the production build. All 831 recorded source files remained unchanged
through the run. This covers the committed prototype and its replay tests;
it does not establish app integration or browser interaction latency.
