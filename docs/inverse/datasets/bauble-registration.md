# Bauble foreground diagnosis

Current status: the upload workflows and 33-case browser comparison pass. The
full inverse run recorded 1,081 passes and one offline adapter failure; the
adapter is corrected and all seven affected tests pass on recheck. Independent
feature checks on the downloaded editable SVGs also pass. The validated build is
now available on port 5232. Earlier experiments below preserve the failures and improvements.

The automatic R5C4 bauble crop includes background and extrapolates its bottom
corner below the 1,112-pixel photograph. Earlier experiments with longer scan
bands or outer foreground runs did not recover a supported physical outline.

A segmentation-only replay isolates another cause. The red/white classifier's
mixed-paper term admits background next to this heart. Together with adjacent
hearts, that leaves only 16 usable rows for estimating the lower edges. The
right-hand samples have only 62.5% line support over a 15-pixel vertical span.
The resulting tip is at pixel-edge coordinates (619.50, 1139.31).

Removing the mixed-paper term is not a fix: it opens gaps within the actual
paper and reduces line support. Two estimates using learned chromaticities also
leave the original edge fit unchanged. Sampled background on the right is close
to pale paper in hue, although darker; the background on the left has a stronger
brown tint. A hue-only foreground model loses useful brightness information.

A diagnostic with three RGB clusters, initialized from confident red, pale and
background pixels within the rough selection, gives more consistent lower-edge
samples. Pixels are compared with the red–pale colour segment and the background
cluster. This changes only photographic registration fields, not the input or
the motif mask used by the solver.

| Registration hypothesis | Samples per edge | Left / right support | Predicted tip, pixel edges |
|---|---:|---:|---|
| Current classifier | 16 | 100% / 62.5% | (619.50, 1139.31) |
| Mixed-paper term removed | 59 | 54.2% / 23.7% | (592.66, 1115.51) |
| Learned RGB foreground/background | 41 | 97.6% / 73.2% | (573.16, 1118.01) |
| Learned RGB, longer lower band | 62 | 66.1% / 75.8% | (583.44, 1109.09) |

**These are edge-registration diagnostics, not successful crop results.** The
last tip lies inside the photo, but that alone does not establish correct
overlap corners. Full lobe/shape fitting, known-geometry controls, broader photo
regressions and independent template reconstruction remain necessary. Neither
approximate historical corner annotations nor solver error entered these probes.
The existing malformed-mask solver stress fixture is unchanged.

The subsequent full-shape probe completed with all source hashes unchanged.
Both RGB variants satisfy the current lower-edge, lobe-outline and cap-colour
support checks. The ordinary-band tip still lies outside the photograph.
Both variants have weak colour contrast across the upper overlap boundary
(0.022 and 0.005 on one diameter), despite their improved outer-lobe fits.
Visual overlays were inspected; these numerical support passes do not establish
the true overlap geometry.

All three frozen proposals were replayed through classification, fresh template
fitting and independent exported-curve rendering. Corners stayed fixed, no inset
was added, and each proposal used a fresh process with a 180-second request.

| Proposal | Independent mask error | Solve and validation | Numerical result |
|---|---:|---:|---|
| Current classifier | 2.549% | 42.79 s | Geometry, paper and features pass; crop remains outside photo |
| Learned RGB, ordinary band | 1.014% | 97.36 s | Rejected: loses a 5.125 mm² source region; crop also outside photo |
| Learned RGB, extended band | 1.713% | 33.36 s | Geometry, paper and features pass; crop fully inside photo |

The extended-band candidate uses five cuts per sheet. Its rectified photograph
and independent weave were inspected: the central bauble is recovered, while
uneven and disconnected border details remain. Known-geometry and broader photo
tests are still required before adopting the crop hypothesis.

Different crops produce different targets, so these errors are not an
equal-domain comparison or a way to select the correct physical crop. The
earlier current-classifier error of 4.375% used a ten-second request; its
improvement here is not evidence of a same-budget solver improvement.

The diagnostic probes above did not change production crop code. Measurements, source hashes and experiment
identifiers are in [bauble-registration.json](bauble-registration.json).
Local probe artifacts are under
`tmp/heart-learning/bauble-segmentation-2026-10-18/`.


The next crop-only replay covered 69 cases: 29 synthetic/known controls and all
40 catalogued collage instances, including incomplete and obscured instances.
The proposed fallback preserves an existing supported, in-photo crop. Otherwise
it selects the lowest shape-score RGB proposal that passes the existing outline
checks and lies within the photograph. Only the bauble changed; no known-corner
case changed. Forcing the RGB hypotheses independently of that selection policy
also checked their geometry: 28 supported, in-photo proposals over 14 known
cases had at most 2.869 pixels maximum corner error.

A further 14 fixed synthetic scenes used JPEG compression, tinted paper and
spatially varying brown backgrounds. These did not activate the fallback. The
14 supported, in-photo RGB proposals over seven scenes were within 4.832 pixels
of known corners. Clipped-tip cases were not promoted to complete in-photo
hearts. Thus unchanged control results establish regression coverage but do not
by themselves validate successful fallback activation on known geometry.

These scenes exposed a separate **existing** weakness: four fully observed
framed-blob controls satisfy the current support gate while their maximum corner
errors are 8.812–11.829 pixels. A clipped framed-blob control is also inaccurate.
The RGB alternatives for the four fully observed failures remain unsupported;
the proposed fallback does not fix them. This is retained as an open physical
registration problem, not counted as successful corner detection merely because
the outline checks pass. No synthetic painted motif is claimed to have a valid
weave. Actual upload/crop/reconstruction QA remained pending at this stage.


The RGB/background fallback is now integrated in the automatic crop pipeline.
It reuses one set of learned fields for the two scan bands, retains the existing
support gates, and does not clamp extrapolated corners. Accepted proposals expose
the background-colour evidence and selected scan band. Supported, fully observed
crops keep their original corners.

The integrated implementation replayed all **83** recorded inputs with exactly
the diagnostic policy's selected coordinates. Only the bauble changed from the
baseline. The 93 crop tests initially had two failures in the offline foreground
adapter's audited source-text seam; updating that seam restored its three tests.
The other 91 crop tests passed, including independent template reconstruction
checks. Typecheck, lint, build and 874 application tests pass (one existing
application skip). Browser workflow and full inverse-suite validation are pending.

The framed-blob controls now have a more specific diagnosis. Their initial line
fits predict the known tip near (190, 230), but the colour-gradient refinement
moves it to y=219–221. The four failures use the background-covariance metric.
Thus the initial segmentation is close, and a later registration step introduces
the displacement. A candidate fix must distinguish a physical paper/background
edge from the stronger nearby interior frame; merely improving the segmentation
network would not address this failure. No refinement change is included yet.


Actual Chrome upload QA recovered the new bauble crop, imported the original
400×400 mask, fitted templates and downloaded the editable SVG. Independent
editable geometry and paper checks pass, with **1.493%** mask disagreement, but
the workflow **fails the feature check**: a 5 mm² red region is completely lost.
It took **106.67 seconds** to reach the editable result. The UI correctly warns
that motif details are missing; export remains available as requested. This is
not counted as a successful reconstruction. The reflective blue/orange control
passes the entire workflow at **0.654%** independent editable disagreement.

The pointer-selected rectangle differs from the offline rectangle only through
floating-point input coordinates. Its crop moves by less than **0.01 source
pixel**, changing **15 of 160,000** classified pixels. Node reproduces the browser
mask exactly from that crop. The missing 5 mm² region itself is unchanged. The
earlier five-cut candidate, independently rendered against the browser target,
retains 83.75% of that detail and has 1.718% disagreement; thus an existing valid
candidate remains feature-complete on this target. It is used only as a
feasibility check, never as a fresh-fitting seed.

Two nearby crops and their mask hashes are preserved in
[`bauble-nearby-crops.json`](../../../scripts/inverse/fixtures/locator/bauble-nearby-crops.json).
A four-cell fresh-process comparison is running to separate mask perturbation
from the offline/application settings. Browser timing remains another factor.
The production preview on port 5232 retains the previously validated runtime;
the temporary browser-QA server has been stopped. Full inverse-suite validation
of the new crop fallback is still pending.


The four fresh Node comparisons completed with all 1,109 pinned files unchanged:

| Classified mask | Settings | Independent error | Cuts per sheet | Feature/template checks | Time |
|---|---|---:|---:|---|---:|
| Browser (15 changed pixels) | Application | 1.500% | 4 | Fail | 104.55 s |
| Earlier | Application | 1.713% | 5 | Pass | 33.49 s |
| Browser (15 changed pixels) | Offline benchmark | 1.538% | 4 | Fail | 86.98 s |
| Earlier | Offline benchmark | 1.775% | 5 | Pass | 24.14 s |

The mask-dependent failure persists under both settings, and Node reproduces the
browser failure. Runtime-only and settings-only explanations do not account for
this pattern. Timing can still affect exact numerical results.

The failed search did find a geometry/paper-valid six-cut candidate preserving
all features at approximately 3.17% error. Its final cleanup instead polishes
the four-cut candidate, because neither candidate has passed the combined 3%
image/feature gate and the latter has lower overall error. A bounded experiment
now tries polishing the feature-complete alternative before discarding it. This
uses the existing polish eligibility band and retains the original fallback if
the alternative fails any unchanged final check. It is not yet validated.


The initial cleanup comparison recovered the missing region: the six-cut
candidate fell from 3.169% to **2.807% independent error**, with geometry, paper,
features and template checks passing. This does not match the earlier five-cut
candidate's accuracy or solve time; both remain improvement opportunities.

The final implementation preserves the existing fallback's entire cleanup.
Only when it still fails the combined checks can a long request spend up to
6.5 seconds of unused allowance polishing one feature-complete alternative.
The candidate must be within the existing polish eligibility band, and it
replaces the fallback only after every unchanged acceptance check passes. Short
requests retain their path, and 1.3 seconds remains reserved for finalization.

All **three focused tests pass**: the new nearby-crop regression independently
checks the final weave and feature retention; the existing delayed Viking and
25-second-budget checks still pass. Final browser/corpus/full-suite verification
is pending. The preview has not yet been refreshed with this fitter change.


Final Chrome QA on `47b3d08` used the actual upload, pointer selection, mask import,
default 180-second request, Open in Draw, and SVG download workflow:

| Photograph | Cuts per sheet | Native mask error | Independent editable error | Click to ready | Checks |
|---|---:|---:|---:|---:|---|
| Bauble | 6 | 2.857% | 2.881% | 109.84 s | Native features; editable geometry/paper pass |
| Reflective blue/orange | 4 | 0.649% | 0.654% | 6.52 s | Native features; editable geometry/paper pass |

Neither workflow produced a browser error. The central bauble is recovered in
the inspected preview, while the border remains irregular. The independent SVG
checks so far cover total image error and physical geometry; an additional
feature-retention audit of the downloaded SVG is pending. This distinction matters
because a small lost region can be hidden by a low total error. These comparisons
use classified photographs, not original cutting-path ground truth.

All **33 browser corpus cases** retain exactly their previous native, source-SVG
and painting-SVG errors. The **22 regular Hunodan designs** complete in a median
**5.583 s**, maximum **8.465 s**. These are single-run timings on this machine.
Typecheck, lint, the 874 application tests (one existing skip), and build also pass
on the final fitter. Full inverse-suite verification remains in progress.

The saved four-cell experiment also localizes much of the speed difference. Both
application-setting runs start with 3+3, 4+4 and 5+5 finalists. The earlier mask
produces a feature-complete 5+5 candidate; the 15-pixel variant's two 5+5 fits both
lose a feature. The latter proceeds through **21 extra-grid comparisons versus
three**, spending **81.00 s versus 19.40 s** in curve refinement. Initialization
takes about two seconds in both runs. The next candidate-selection experiment
should test polishing a feature-complete near-threshold candidate when it first
appears. The first point at which the 5+5 refinements diverge still needs a more
detailed trace; these records do not establish a low-level numerical cause.


The full inverse suite finished in **1,503.41 seconds**, with **1,081 passes and
one failure**. All 1,109 source hashes remained unchanged throughout that run.
The failure was in the offline projective-body experiment: its audited source
replacement expected the locator before the RGB/background branch was added.
It rejected the source before doing any numerical fitting. Both offline adapters
now share that exact field-selection string, preventing the two copies drifting.

All **four projective-body tests** and **three foreground adapter tests** pass
after the fix. The first recheck command mistakenly named a nonexistent foreground
test path, which Node ignored; its four-test result was inspected, and the actual
three-test file was then run explicitly. The original failed run and both rechecks
are preserved. Typecheck, lint, 874 application tests (one existing skip), and build
were repeated successfully. Every application and solver source file is unchanged
from the browser/full-suite run; the whole inverse suite was not repeated for this
offline-only correction. Combined evidence is in `final-cleanup/validated-state.json`.

The separate audit now verifies feature retention in the **downloaded editable
SVGs** themselves. Both pass, with exactly the previously measured total errors.
The bauble retains **90%** of the 5 mm² region that the failed four-cut fit erased.
No substantial source region is missing in either exported SVG. This closes the
export-validation gap; the bauble's solve time and irregular border remain open.


The local preview on **port 5232** now serves the validated crop/fitter changes.
A fresh Chrome check loaded the homepage and both language versions of Paint,
opened and closed the import dialog, and reported no JavaScript errors or failed
local requests. HTTP checks also pass for `localhost`, `127.0.0.1` and `::1`.
The served fitter matches the validated source SHA-256. The repeated build changed
Svelte bundle hashes through its default timestamp version; all 122 inverse source
files still match byte-for-byte. The in-memory preview is isolated from subsequent
experimental builds. No push or deployment was made.


An isolated early-polishing comparison ran four fresh processes without changing
production files. It offers one bounded full-resolution polish as soon as a
feature-complete candidate lies within the existing polish eligibility band,
before continuing through additional grids. All acceptance checks remain intact.

| Crop | Policy | Independent error | Cuts | Solve and final checks |
|---|---|---:|---|---:|
| Perturbed browser crop | Current | 2.809% | 6 + 6 | 106.99 s |
| Perturbed browser crop | Earlier polish | 2.731% | 4 + 7 | 36.22 s |
| Nearby earlier crop | Current | 1.713% | 5 + 5 | 33.73 s |
| Nearby earlier crop | Earlier polish | 1.713% | 5 + 5 | 34.16 s |

All four pass geometry, paper and independently rendered feature checks. The
trial polishes a 7+4 candidate at 28.08 seconds, reducing error from 3.309% to
2.790% in 1.62 seconds; finalization returns the transposed 4+7 pair. The nearby
crop does not activate the new pass. These individual paired runs are not a
repeated timing distribution. The policy is **not adopted**; actual editable-SVG
workflows and the broader 33-case comparison are next.

None of the **41 published five-cut checkpoints** for the perturbed mask passes
feature fidelity. Negative phase erases the small region; positive phase eventually
retains 83.75% of its colour but loses enclosure. The nearby mask's positive-phase
run first passes at step 40 and passes at most later checks. Final ranking did not
discard a passing five-cut checkpoint in this run. Feature audits were performed
after timing, using coordinates captured by the same instrumentation in both policies.

The positive-phase control coordinates already differ by up to **1.803 mm** after
grid/clearance preparation, before free refinement, and diverge further later.
These are corresponding control parameters, not visible-boundary displacements.
This narrows the search-sensitivity diagnosis but does not yet separate coarse
initialization, fine-grid fitting and clearance preparation.
