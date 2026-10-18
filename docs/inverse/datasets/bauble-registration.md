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

Production crop code has not changed. Measurements, source hashes and experiment
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
weave. Production changes and actual upload/crop/reconstruction QA remain pending.
