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

Production code has not changed. A guarded full-shape probe is prepared at
`tmp/heart-learning/bauble-segmentation-2026-10-18/crop-study.mjs`; it refuses to
run until the current inverse suite passes and its processes exit. Measurements,
source hashes and experiment identifiers are in
[bauble-registration.json](bauble-registration.json).
