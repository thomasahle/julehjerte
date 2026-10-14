# Alternative traces before dense routing

Runtime commit `66e91bd` changes recovery scheduling in the main fitter. A
sparse routing graph keeps its full phase allowance, including subsequent
geometry-validation rounds. Only after it is exhausted is its dense version
queued behind the existing alternative traces and border interpretations.
Timed-out sparse graphs are not declared exhausted. The queued dense graphs
and later neighbour expansions remain available if simpler alternatives fail.
Bounded trace retries retain their remaining individual allowance.

Recovery now records which trace supplied the selected route. Routes from the
stronger 0.75 smoothing retry receive up to 800 common Bézier-refinement steps
within four seconds and the original global deadline. This previously applied
only to the reduced-junction retry; the self-intersection retry can need the
same refinement to recover its displaced boundaries. Neither change edits the
source mask or relaxes image, feature, symmetry, geometry or paper checks.

## Evidence so far

The [foreground diagnostic](real-foreground-bounds.md) found that a gold angel
never reached an alternative trace because a dense graph consumed its recovery
budget. With the new order, the first sparse graph exhausts, the second trace
is rejected for a required self-crossing curve, and the third sparse trace
solves. A two-photo prototype replay reduces the angel's independently rendered
mask error from 7.07% to 0.76%, with a 5.84-second solve, from the same crop and
classified mask. The rabbit remains rejected at 4.34%; its dense fallback is
still attempted after the sparse alternatives.

The committed regression reconstructs the angel from classified pixels only,
with no saved template or preferred trace. It verifies sparse exhaustion,
the self-intersection diagnosis, subsequent refinement, independently rendered
error below 1.2%, geometry/paper checks and unchanged source pixels. Its crop
originates in reviewed foreground labels: this tests the main fitter, not
automatic detection of the original photograph. A matching browser-mask case
has been added for worker, editable SVG and PDF verification.

All **13 focused tests pass**. The completed fixed Hunodan replay retains
**22/22 successes**, with every error exactly unchanged from the preceding
release and a maximum time of **8.22 seconds**. The
[focused evidence record](trace-search-order-focused.json) pins the inputs,
prototype measurements, final runtime hashes, test logs and all 22 timings.

The [completed native-photo checks](trace-search-order-native.json) retain all
**25/31** previous successes, and all 25 pairs pass editable export. Source
photographs, crop coordinates, masks and fitting probabilities remain unchanged.
Five accepted cases have lower measured errors; the Viking increases by one
pixel (0.000625 percentage points). Visual review of those six cases finds no
large structural change at the inspected scale. Rounded contours, border
defects and complex Viking routing remain. JPEG and half-resolution star
perturbations also retain their passes. The other six photo failures remain.

The larger release run is still in progress under
`tmp/heart-learning/trace-order-release-v1/`: full inverse/application tests,
check/lint/build and eleven Chromium flows. No new browser result is claimed. The
preview remains on the preceding verified build until the release driver
reaches its rebuilt-browser stage. Nothing has been pushed or deployed.
