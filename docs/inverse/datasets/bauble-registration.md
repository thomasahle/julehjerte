# Bauble foreground diagnosis

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
