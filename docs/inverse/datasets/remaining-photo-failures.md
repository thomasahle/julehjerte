# Separating the six remaining photographic failures

The automatic benchmark remains **25/31**. This diagnostic changes crops while
keeping the source photograph, production classifier, fitter and validation
rules fixed. Three of the six failed cases produce checked editable templates
with the historical approximate corners. That identifies useful crop work,
but does not establish three new automatic successes or verified artwork.

## Fixed-crop intervention

The six historical quadrilaterals and their recorded 1.5% inset come unchanged
from `hard-photo-cases.json`. These earlier assistant-reviewed coordinates were
disputed; they are an intervention, not ground truth. The current automatic
preset receives a ten-second search allowance and the ordinary classified mask.
Neither saved templates nor known slit counts enter fitting.

| Case | Automatic result | Historical-crop mask disagreement | Editable checks |
| --- | --- | ---: | --- |
| Nested squares | No crop | 1.843% | Pass |
| Outline star | Lost small source feature | 0.687% | Fails source-feature retention |
| Santa | No crop | 8.433% | Fails image agreement |
| Jigsaw | 5.644%; distorted crop | 0.971% | Pass |
| Crossed ribbons | Lost source feature; tip outside image | 1.538% | Pass |
| Bauble | 9.191%; tip outside image | 3.509% | Fails image and source-feature checks |

Errors refer to independent renders of the exported cuts against each track's
own classified mask. Changing a crop changes the target, so these percentages
are not paired scores against identical artwork. The six source file/pixel
identities and all 93 pinned locator, fitter and benchmark source hashes match
the completed automatic release. All six SVG conversions succeed, and the same
three cases pass the complete editable checks. Their editable errors are
1.855%, 0.998% and 1.539%, respectively.

Visual inspection supports a substantial crop problem in jigsaw and crossed
ribbons: their fixed-crop reconstructions retain the intended repeated shapes
much more clearly. Nested squares reconstructs its grid, but retains uneven
boundaries. The bauble's pale frame is already missing from the classified
target. Cropping alone therefore cannot repair that result.

Santa exposes an additional routing limitation. Its traced initializer reports
one versus five opposite-border transitions; later feature recovery sees two
versus seven and exits before MILP search. Coarser tracing and existing border
repairs do not obtain a balanced graph. The selected five-by-five direct grid
still has 8.43% disagreement. This is not evidence that Santa is unweavable or
that a longer MILP time limit would help: that route never reaches the MILP.

## Broader lower-edge search

An offline prototype gathers transitions from multiple horizontal foreground
intervals, keeps up to twelve separated line hypotheses per side, and fits the
existing heart model to plausible line pairs. It does not consume historical
corners, cutting templates or solver scores. Six failed cases and two controls
(flower and dense checkerboard) receive five variants:

1. Existing red/white foreground fields with additional line hypotheses.
2. Three chromaticity clusters, with a continuous paper-color mixture.
3. Three RGB clusters with the same mixture construction.
4. Joint chromaticity/brightness clusters.
5. The joint model with color-specific lobe boundaries and flexible cap depths.

The first four variants find no candidate meeting both lobe-support thresholds
of 65% and cap-color-loss limits of 30% in any of the eight cases. More line
hypotheses do not compensate for wood classified as paper or neighboring
hearts joined in the foreground. RGB clustering can merge dark red with wood;
chromaticity clustering can merge white paper with wood. Their failures are
preserved, including their masks and candidate geometry.

The color-specific joint model yields lobe-qualified candidates in nested
squares, outline star and the flower control. Before running their fitters,
the recorded selection rule chooses the lowest outline-loss candidate among
those satisfying these lobe tests. No candidate is replaced using template
error. Pixel-center proposals are shifted by 0.5 pixels for engine preparation,
with no historical inset.

This is deliberately **not the full production crop gate**: the prototype's
line-inlier denominator includes multiple transitions per row and cannot be
compared directly with production lower-edge support. These experiments test
candidate generation, not a validated replacement cropper.

| Selected proposal | Independent mask disagreement | Complete editable checks |
| --- | ---: | --- |
| Nested squares | 6.118% | Fail |
| Outline star | 0.748% | Pass |
| Flower control | 1.036% | Pass |

The nested-squares proposal visibly removes much of the right-hand motif even
though its lobes meet the exploratory thresholds. It is rejected as a crop
improvement. The star and flower resemble their derived masks, but their
physical overlap corners remain unverified. Neither is counted as a new
automatic benchmark success. In particular, low template error cannot certify
that the preceding crop preserved the photographed design.

## Evidence and next work

The [frozen record](remaining-photo-failures.json) pins 248 local artifacts,
including the five executable prototypes, all forty crop-probe records, nine
complete fitting/export replays, the pre-fit selection rule and the visual
review. Data live under `tmp/heart-learning/remaining-photo-failures-v1/`.
All nine saved candidates pass editable conversion; five pass the full
image/feature/geometry/paper criteria across the two diagnostic tracks.

No production code, acceptance threshold, source annotation or training split
changes in this study. It adds no neural training. The previously completed
test suites are not presented as newly rerun tests.

The next useful directions are distinct: physical foreground/edge coverage
for crop candidates, photographic classification that retains the bauble's
pale frame, and routing initialization that can tolerate missing or noisy
border transitions without changing the input artwork. Santa is now a concrete
fixed-crop case for that last investigation.
