# Independent controls and deliberate shared cuts

`CurveGraph` previously assigned one parameter to every coordinate rounded to
1e-7 mm, regardless of how that coordinate was used. A cubic handle is not a
geometric junction. Two unrelated handles can coincide in a straight starting
grid, and a handle can even coincide with another curve's endpoint. Coupling
those variables adds constraints that the requested cutting geometry does not
imply. The same problem applies to isolated crossing anchors belonging to two
independent paths: a crossing does not require both paths to retain the same
parameter value at that intersection as their shapes change.

The controlled moving-chord study isolated this as the cause of the remaining
2×2 stalls after the endpoint-gradient correction. Subdividing the starting
curves exposes additional stalls at coincident interior anchors, including
single-cut sheets. These are representation constraints, not noisy boundary
counts or failures of the image derivative.

## Parameter identity

`direct/curve-topology.js` allocates control occurrences independently and
joins only:

- Adjacent path anchors, including an explicitly closed path's first and last
  anchors, when they meet under the established geometric key.
- All four corresponding controls of a complete shared cubic, in either
  direction. These identities propagate through connected neighbouring cuts.

A union-find structure compacts those relations into the existing point-array
representation. First occurrences determine the stored coordinates and point
order. Complete-curve canonicalization still uses the established 1e-7 mm
keys, but a partial coordinate coincidence alone no longer joins parameters.
A handle coincident with its own endpoint can therefore move independently,
while the actual endpoint remains on the square boundary.

The existing edge table still represents every shared cubic once. Its even
multiplicity cancels before combined rendering and boundary integration.
Shared cuts remain shared through reconstruction, symmetry, simplification
and export; the change does not introduce independent copies of those cuts.

## Geometric branches versus optimization variables

Shared-run simplification must retain geometric branches and slit endpoints,
even when different paths have independent parameters there. Its branch
incidence now uses geometric endpoint keys explicitly. This is a different
question from whether an optimizer must move those endpoints together.
The original branch-preservation regression continues to pass without changing
its expectations.

The earlier joint-projection regressions intentionally test a coupled crossing
and coupled handles. Their fixture now creates that coupling explicitly rather
than relying on the constructor's old accidental behavior. This retains the
mathematical regression, including Adam's retry after a coordinate projection
fails. Ordinary graph-construction tests require the opposite behavior for
unrelated controls.

## Verification scope

New tests cover coincident handles, isolated crossing anchors, handle/anchor
coincidences, collapsed endpoint handles, reversed shared cubics, connected
neighbours, rounded-key sharing, actual closed loops and disconnected paths.
Four refinement regressions require a low-error fit, preserved symmetry at
every accepted checkpoint, valid geometry and paper, and an unchanged seed.
The complete engine suite passes all 483 tests, including the later feature-refinement regression.

The expanded controlled study compares the preceding engine (`28a9c06`) with
the new representation using one or two cubics per starting cut. Both studies
supply cut counts to isolate refinement. They separately record disagreement
with the prepared 200-pixel mask and with the ideal underlying curves at 400
pixels; binary input quantization is not attributed to the fitter.

`curve-topology-solve-benchmark.mjs` supplies only the generated pixels and a
within-curve symmetry request to the full automatic solver. It records the
inferred counts and independently renders the exported JSON with resvg. The
known template is saved for inspecting the experiment, but never passed to the
solver. This distinguishes a representation improvement from any demonstrated
benefit in the normal image-to-template workflow.

## Controlled and automatic results

With one cubic per cut, the four problematic 2×2 cases improve; the other 20
retain their errors. With two cubics per cut, 18 cases improve and six remain
unchanged. None of the 48 prepared-mask errors increases. The maximum errors
fall from 10.815% to 0.525% for one cubic, and from 10.085% to 0.2425% for two.
Median time for 301 refinement steps remains about 0.41–0.46 seconds.

The separate full automatic comparison gives a useful limit on that result:
all 24 synthetic images already fit well with the previous initializer. The
new engine retains byte-identical exported geometry, identical input and
prepared-mask hashes, and the correct inferred counts in all 24 cases. Maximum
independently rendered source error remains 0.3375%. The new run's maximum
prepare/solve/validate/export time is 4.15 seconds, versus 4.05 seconds before;
this comparison does not establish a speed improvement.

The controlled result therefore demonstrates removal of artificial constraints
from refinement. It must not be presented as rescuing 22 previously failing
uploads in the normal automatic workflow. The two experiment types are saved
separately in `tmp/control-identity-{before,after}-{1,2}/` and
`tmp/control-identity-solve-{before,after}/`.

## An export-score regression and its correction

The initial photo replay found one changed Hunodan result, `hjfig-05` (the
anchor motif). Its internal source error improved, but independently rendered
export disagreement increased from 1.02317% to 1.03549%: 14 additional pixels at
337×337. The rejected intermediate result is retained in
`tmp/control-identity-hunodan/hjfig-05/` rather than being reported as unchanged.

Comparing the two renderers directly locates every disagreement in partially
covered boundary pixels. None is a saturated black or white pixel. The
fitting sampler classifies pixel centres, while resvg thresholds antialiased
coverage; those discrete objectives need not rank nearby curves identically.
This explains why an internal improvement is insufficient evidence for the
independent export criterion.

The recovered topology was also returning after 80 refinement steps while its
image error was still decreasing. The recovery path now allows the same 160
steps used by ordinary polishing, within its existing 700 ms reserve. Geometry,
paper, image-feature and final selection checks remain enabled. No saved
solution or case identifier influences the algorithm.

The independently rendered error decreases to **0.90606%**, below the preceding
release as well as the rejected intermediate result. A fresh production replay
with retained candidate checkpoints takes 3.16 seconds. A new photo regression
loads the source JPEG and frozen crop metadata, performs the full automatic
solve, and requires less than 0.95% disagreement in the actual exported JSON
rendered with resvg. An improved internal score alone cannot pass this test.

## Browser checks and a remaining local-return defect

The expanded browser replay exercises matching, independent and Anti hats,
within-curve Sym and Anti fits, the star, smaller free-border motifs, and a
fresh cropper-driven upload of the Hunodan anchor. The nine large-hat workflows
retain exact common spans through downloaded SVGs in Chromium, Firefox and
WebKit. Protected-source disagreement remains 0.32065%, 0.29585% and 0.31888%
for matching, independent and Anti respectively.

The first small-top-hat replay failed a test-harness assumption: it required
more than ten shared segments, although the cleaned result contains four long
shared cubics. The harness now measures shared geometric length (over 80 mm
for the small hat, 60 mm for the independent hat, and 200 mm for the larger
matching/Anti hats) and still checks every
shared cubic against both exported template families. Splitting a curve into
more pieces must not make that check easier to pass.

The added anchor upload exposes an **unresolved solver validation gap** in
Chromium and WebKit. Their fitted result passes engine geometry and paper
checks, but the converter correctly rejects a tight return in `R-cut-2`,
including with simplification disabled. The Chromium result's closest pair
is 0.51212 mm apart after a 3.11920 mm detour along the cut. This is a small
spur, not a shared cut between different sheets or an SVG conversion drift.
The engine excludes approximately 20 mm of nearby arclength in this preset
(`localNeighborhoodFactor = 8` times nominal width); the editor's exclusion
is shorter. Increasing conversion tolerance or weakening editor validation
would hide the defect rather than repair the generated cut.

The actual failing geometry is retained as
`scripts/inverse/fixtures/editor-anchor-return.json`. A regression requires
the converter to continue rejecting it. The original browser failures are
preserved in `tmp/control-identity-browser/`; Firefox completed the same
upload with 1.42438% source disagreement. The fixed-crop Node benchmark and
the browser upload use different crop and sampling paths: a successful Node
photo score does not establish that every live upload succeeds. Local-spur
repair and a consistent self-clearance policy remain follow-up work.

## Dataset and final browser totals

The final serial replay of all 22 regular Hunodan crops passes the existing
quality and ten-second criteria: median 5.330 seconds, maximum 8.077 seconds.
Twenty-one exported template pairs are byte-identical to `28a9c06`; the only
changed pair is the improved fixed-crop anchor described above. All 32
free-border perturbation cases pass, with the same independently measured
protected-source errors as before (median 4.478 seconds, maximum 8.197 seconds).
Sixteen small-frame template pairs change geometry; the 16 larger-frame pairs
remain byte-identical. Unchanged error is not claimed to mean unchanged curves.

The weighted dataset was run before the feature-recovery step-count correction.
Only `fit.js` differs from the final engine, and the changed recovery branch is
explicitly excluded for weighted inputs. That provenance is retained in the
validation record rather than assigning the old run the final source hashes.

After replacing the fragment-count assertion with shared-length checks, all
30 synthetic browser workflows pass, including all twelve large/small top-hat
workflows. The small hat preserves about 85.65 mm of shared curves with
0.38452–0.39063% protected-source disagreement. Of the three additional live
anchor uploads, Firefox passes and Chromium/WebKit reject the narrow return.
Thus the expanded result is **31/33**, not a universally passing upload suite.

[CONTROL-IDENTITY-VALIDATION.json](CONTROL-IDENTITY-VALIDATION.json) records the
controlled, automatic, dataset and browser results, source provenance, artifact
hashes, final check logs and served-source verification. Reproductions are
saved under the paths listed there; no reference cutting paths are used as
inputs to ordinary automatic fitting.

The final checks pass 841 application tests and 483 engine tests (one optional
application test skipped), lint and build. Svelte checking reports zero errors
and seven existing warnings. All 62 served engine/worker files match the
committed production source. The restarted isolated preview remains at
<http://127.0.0.1:5232/en/editor/paint/>.
