# Clearance repair: full QA and photographic regression check

The new runtime passes full code QA and preserves the accepted-template counts,
but two photographic errors increase. It has **not passed the strict release
comparison**. The last fully validated runtime remains `c000d30`. Browser QA
has completed separately on the owned preview at port 5232 and found an
additional ordinary-budget leaf regression.

Runtime `9ee6f49` and test/harness revision `7e264de` pass **860/860 inverse
tests**, **857 application tests** (one existing skip), type checking, lint and
build. All 855 pinned source files were verified unchanged. The earlier two
search-history test failures and their independently checked corrections remain
in [the regression review](shortlist-regression-review.md).

Fresh fitting passes **22/22 regular Hunodan designs within ten seconds**, with
a maximum of **8.034 seconds** and every image error unchanged from `c000d30`.
The complete hard-photo cases remain **25/31**; none loses its previous pass.
All **47 accepted editable SVG pairs** pass the separate conversion, image,
feature, geometry and nominal-paper checks.

Five accepted photographic errors decrease: gingerbread, warped checker, fine
checker, orb and maple leaf. Maple decreases from 1.3325% to 1.1350%. The strict
comparison still fails because:

| Photograph | Previous independent error | New independent error |
| --- | ---: | ---: |
| Floral checker | 1.940625% | 2.012500% |
| Viking | 2.024375% | 2.040625% |

Every recorded source, automatic crop coordinate set and classified/fitting
mask remains unchanged. These two regressions therefore occur downstream of
cropping and classification in this comparison. This does not mean cropping is
correct on every photograph or that these mask scores establish original-artwork
fidelity.

The floral checker's reported selected-candidate checkpoints through step 40
are identical.
The previous run reaches step 69; the new run reaches step 49 before its deadline.
Its 182 curved pieces are unchanged at those common checkpoints. The final report can contain polishing history in place of the main refinement
history. These records expose sensitivity to the work completed within the time
budget; stage-labelled progress is needed to localize the changed allocation.
A serial repeated comparison and a separate CPU profile are recorded in
[the ordinary rollback study](ordinary-rollback.md). The profile is not an
uninstrumented speed measurement.

Viking needs a separate diagnosis. Both runs choose six cuts per sheet and reach
step 84, but their reported initial checkpoint geometries already differ (206 versus
211 curved pieces). The final iteration count alone cannot explain this result.
Both retain the same photographed input and mask. No cause is assigned solely
from a changed wall time or a passing unit test.

The [evidence record](clearance-repair-release.json) pins full QA, native corpus
and editable-export reports, including failures and checkpoint observations.
The diagnostic browser replay continues despite the failed native comparison;
all eighteen main workflows pass. Five of six additional budget flows pass.
The ordinary-budget shifted leaf returns 2.225625% engine disagreement and
fails the focused 2% silhouette check before export; its missing downloads
remain a failure. The ten-second version passes, with 0.899375% independently
measured disagreement at 400 pixels and 1.071094% at 800 pixels. The ordinary
unshifted leaf also remains rougher than its ten-second result. The earlier
[long-budget selection diagnosis](long-budget-selection.md) remains relevant.

The strict entry-size comparison fails on four additional raw bytes. SvelteKit
derives a build identifier from its timestamp: the baseline identifier has six
characters and the new one has seven, referenced four times in that chunk.
Application source code is unchanged. A separate fresh-context check passes
for both Draw and Paint: served bytes match the build and neither loads solver
code or WASM initially. Raw initial totals are 473,487 and 503,388 bytes. The
original size-check failure is retained. No push or deployment occurred.
