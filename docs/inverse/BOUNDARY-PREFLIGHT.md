# Diagnose impossible routing endpoints before connector search

The five-point-star crop `vissevasse-arranged-r1c3` remains a difficult input.
The photograph's classified mask retains the main star, but the grid fit rounds
its corners and loses two small white regions. The prior full-photo replay
measures 3.26375% independent disagreement and reports the result for review.
The capture in
[`photographic-star-boundary.json`](../../scripts/inverse/fixtures/photographic-star-boundary.json)
preserves the failing mask, source attribution, crop coordinates and checksum.
It is not a reference reconstruction.

## A balanced count can still be impossible

The ordinary trace has inconsistent endpoint counts. The previous recovery
proposes a deeper top-edge interpretation with three transitions on each side,
then reports the resulting graph as infeasible. A closer constraint audit finds
a simpler necessary obstruction: two top endpoints are at **15.75 and 17.25 mm**,
only **1.5 mm apart**, while the configured strip allowance requires about
**2.505 mm**.

Both top-entering segments must belong to the same sheet. Their ordered endpoints
identify distinct cuts, but their separation violates the minimum inter-cut
clearance. Four rows of the original MILP and its fixed endpoint labels already
imply a contradiction. Adding more optional connectors cannot make those fixed
endpoints sufficiently far apart. Thus an infeasible graph should not, by itself,
be diagnosed as a shortage of interior connectors.

Diagnostics tested 20 alternate traces, 10 spacing adjustments, 12 combinations
of spacing with small-component cleanup, and 12 with shorter spans/additional
connection points. All 54 finite candidate graphs remained infeasible. Wider
spacing removes the first obstruction but does not establish a valid routing;
one inspected widened graph makes two required top-entering cuts meet at the
same vertex. These rejected experiments do not establish that the underlying
physical motif is impossible, and their modifications are not used in production.

## Shared necessary-condition check

`inspectBoundaryEndpoints` now reports either mismatched counts or inadequate
spacing, with the sheet, edge, positions and required clearance. It also checks
the outer paper margins. The existing topology initializer and detailed recovery
use this same check. Detailed recovery runs it before generating hidden connectors
or initializing HiGHS. Hidden shared connections cannot change the visible
boundary endpoint parity.

A spacing rejection may still trigger the existing smoother-seed retry, just as
an infeasible MILP graph did previously. Recovery retains its fixed original
image reference and final image, feature, geometry and paper gates. The check is
necessary only: well-spaced endpoints can still lead to crossings, disconnected
paths or unsupported paper inside the square.

The recovery report distinguishes these boundary rejections from actual MILP
search outcomes. It also records border proposals rejected by the existing
seed-image-error cap; previously those skipped proposals had no individual
rejection record. Existing endpoint-spacing wording is retained alongside the
new measured values.

The regressions cover both count and spacing failures, every edge orientation,
outer margins, unchanged geometry and the invariance to adding hidden connectors.
The captured photographic star must be rejected before connector/model/solver
progress, with its source pixels preserved. The existing actual-integer-solver
narrow-strip test remains in the suite as an independent rejection check.
