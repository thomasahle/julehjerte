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
classified mask. Its pair has 3+3 cuts and 64 curve segments, compared with
4+4 cuts and 104 segments in the rejected grid fit. This is not evidence of
the original author's cutting paths. The rabbit remains rejected at 4.34%; its dense fallback is
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

## Completed release verification

The serial release run at `tmp/heart-learning/trace-order-release-v1/` completed
on runtime `66e91bd`. All **794 inverse tests** and **855 application tests**
pass, with one existing application test skipped. Type checking has zero errors
and seven existing warnings; lint has zero errors and one existing warning.
The build and all **eleven Chromium flows** pass, including six PDF downloads.
Every accepted browser pair passes editable SVG conversion, source-feature
retention, independent geometry and paper-core checks.

The gold fixed-mask browser case takes **6.76 seconds** from clicking Find to
a ready result, and its editable export disagrees by **0.73625%**. Its prepared
mask exactly matches the native fixture. No saved cutting paths, candidate
graph, preferred trace or manual cut count enters the worker. This remains a
fixed-mask test: the crop came from reviewed foreground labels, so it does not
establish automatic detection of the original photograph.

The original outlined star takes 8.32 seconds with 1.153125% editable error;
half resolution takes 9.42 seconds with 1.324375%; JPEG quality 75 takes 4.52
seconds with 1.764375%. Original/JPEG exports retain all 28 reviewed source
observations. The puppy and Viking still take 17.92 and 28.28 seconds. These
browser cases use the recorded 180-second allowance and do not establish a
general ten-second browser latency bound.

All eleven result/Draw screenshot pairs were inspected. The gold angel and
frame remain clear, with asymmetric thin border arms. The original star still
has a rounded upper crossing tip, and the half-resolution and polishing-mask
variants retain inner notches. The Viking's lower routing is still complicated.
The built-in star and free-border hat retain matching sheets and aligned shared
cuts. Passing checks does not establish original cutting paths or physical
cutting and assembly performance.

The [release evidence](trace-order-release.json) checks 467 implementation
hashes, 972 local artifacts and all 153 built/HTTP-served assets. The preview at
`http://127.0.0.1:5232/editor/mal/` serves the verified build. Nothing has been
pushed or deployed, and no neural model has been added to the app.
