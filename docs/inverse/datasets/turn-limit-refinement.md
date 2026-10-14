# Turning-limit feedback during Bézier refinement

Commit `932b1f8` gives the optimizer a corrective force near the configured
maximum join turn. Intentional corners previously received no turning force,
even after becoming too sharp for the independent validator. The fitter could
therefore discard an otherwise improved checkpoint and return an earlier fit.

The new squared-angle cost starts one degree before the requested limit. It
is zero below that cushion and disabled when the limit is 180 degrees. Ordinary
sharp corners retain their previous behavior. The image objective, checkpoint
selection, maximum allowed turn, geometry checks and paper checks are unchanged.
This is a soft optimization cost, not a replacement for validation or a guarantee
that every trial step is legal.

## Controlled evidence

A synthetic pointed motif starts with an allowed cutting path and asks the
fitter to approximate a sharper silhouette. With the same initial controls,
target, 240 steps and 145-degree limit, the old fitter rejects its last checkpoint
and returns **0.04340%** disagreement in an independent rendering of the exported
curves. The corrected fitter retains a valid **0.03299%** approximation; its
largest join turn is **143.94 degrees**. Both selected results pass the original
geometry and paper checks.

The new regression file fails two of three tests on the unchanged fitter, then
passes after the correction. Tests also compare the complete control-point
gradient against finite differences in both path directions and verify that
ordinary corners receive no added force. All **20 focused tests** pass, including
the existing mixed straight/curved motif and direct-fitting tests.

The earlier gift comparison mixed this change with experimental return forces,
a different short-return predicate and wall-clock-dependent starting states.
It did not isolate the turning fix. A new diagnostic captures one late gift
refinement and runs both production/cushion variants from exactly that graph for
320 steps without a deadline. They select **identical control coordinates** at
**2.40375%** error. Crossings and short returns still reject subsequent gift
checkpoints. This one controlled result does not explain every error difference
in the timed corpus.

## Full native corpus and actual editable SVGs

The isolated implementation used for the benchmarks matches the committed
implementation except for comments. No experimental short-return predicate,
checkpoint projection or cached return force is included.

- **22/22 regular Hunodan designs** pass below ten seconds; maximum
  **7.793 seconds**. Every independent image error exactly matches the preceding
  fully validated release.
- **25/31 complete hard photographs** pass, with the same six failures. Source
  pixels, proposed crops, classified masks and fitting targets remain unchanged.
  Among the 25 successes, 17 errors are identical, four improve and four worsen.
  The largest increase is **0.071875 percentage points** on the warped checker.
  This is pass retention, not a uniform photographic quality improvement.
- All **51 available outputs** pass production conversion and SVG serialization/
  parsing. All **47 accepted pairs** retain the image, feature, current geometry
  and paper checks after editable conversion: 22 Hunodan and 25 photographs.

The [evidence record](turn-limit-refinement.json) preserves case-level results,
failed-before/passing-after tests, the fixed-start gift comparison and 251
artifact hashes. Native timings do not establish browser click-to-ready latency.

The separate [short-return subdivision inconsistency](short-return-export-audit.md)
remains unresolved. Passing the current geometry checks here does not establish
representation-independent validity. No physical cutting or assembly tests were
performed.

The first full repository run passes type checking, lint, 855 application tests
and **828/829 inverse tests**. Its only failure is the offline experiment
builder: the projection patch still assumes the previous import block.
Commit `6874c18` updates that context. The affected projection test and all three
turning-limit tests then pass. The failed run is preserved in the evidence record.

A complete rerun and refreshed-browser verification are in progress; the native
and editable results above do not substitute for them.
