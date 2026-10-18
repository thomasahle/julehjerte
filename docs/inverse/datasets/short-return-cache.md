# Faster experimental short-return checks

The stronger offline short-return predicate now caches each cubic's tangent-axis
and curvature critical points during one geometry audit. Searching many nearby
point pairs previously solved the same polynomials repeatedly. Coordinates,
root calculations, candidate order and rejection thresholds are unchanged.
The cache is discarded after every audit because fitting can move the controls.
The application still uses its existing validator; this is not a deployment of
the experimental return rule.

A paired replay covers 12 analytic/captured cases and 51 saved native outputs,
with four exact subdivisions and both orientations: **504 representations**.
Three alternating-order pairs per representation give **3,024 evaluations**.
Every complete issue object matches exactly, including witness coordinates,
parameters, distances and angles. Inputs remain unchanged. Combined checker time
falls from **11.007 s to 8.026 s**, a **1.371× speedup**. These are checker timings,
not whole-pipeline latency or new reconstruction successes.

All ten focused return/subdivision/projection tests pass. A new regression moves
handles on reused cubic objects between audits and compares with fresh objects.
It fails when the cache is deliberately made global: stale roots change the
reported turning angles. Earlier bird-only perturbations did not expose that
bug; the retained regression uses the captured gift's curved spans.

The [evidence record](short-return-cache.json) pins the comparison, source files,
focused test log and deliberately failing cache-lifetime control. The reusable
comparison accepts an earlier predicate source and a saved native corpus:

```sh
git show cfe2813:scripts/inverse/diagnostics/self-return-candidate.mjs > tmp/return-before.mjs
node scripts/inverse/diagnostics/short-return-cache-study.mjs \
  --before=tmp/return-before.mjs \
  --corpus=tmp/heart-learning/turn-limit-v1 \
  --output=tmp/heart-learning/return-cache-replay
```

The output directory must be new. This numerical speedup does not resolve the
experimental rule's physical interpretation or the current editor's subdivision
inconsistency. Fresh fitting and actual SVG checks remain separate gates.

The [complete repository run](short-return-cache-validation.json) passes type
checking, lint, **855 application tests** (one existing skip), **830 inverse
tests** and build. All 825 recorded source-file hashes match. The app runtime
remains unchanged; these are not new browser workflow results.
