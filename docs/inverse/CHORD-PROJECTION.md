# Joint chord symmetry and shared-cut repair

A valid pair of straight cuts exposed an order-dependent error in within-curve
symmetry. The cuts meet at a shared control point. Moving that point by
(0.2, -0.1) mm and applying the old projection leaves the first cut 0.05590 mm
away from its requested symmetry: processing the second cut changes their
common point again. Another pass reduces the error to 0.01398 mm. The issue
occurs for both reflection across the chord bisector (`sym`) and reflection
through its midpoint (`anti`). It does not require a shared curve segment;
sharing one intersection anchor is enough.

The replacement treats all point relations jointly. Each relation has the form
`p[a] = R p[b] + t`, where R is orthogonal. A spanning forest expresses each
connected component in terms of one 2D root. Averaging observations in that
root's coordinate frame gives the unconstrained least-squares solution. Cycle
relations and fixed coordinates supply at most two independent equations for
the root. Dependent equations must also agree; inconsistent systems return
failure without mutating the supplied coordinates.

This avoids a dense solve over all Bézier coordinates. Forest topology and
scratch buffers are cached for the graph; the endpoint-dependent chord maps
are recomputed for each projection. Square symmetries join the same constraint
system. Chord maps use endpoints already projected onto the square constraints,
so their spatial transforms agree with the required endpoint geometry.

The reproducible intersection now satisfies both cuts to about 1e-14 mm after
one pass. Its common point moves by precisely one third of the perturbation,
as expected for the three tied points. A second pass is unchanged within
floating-point rounding, and processing cuts in reverse order gives the same
answer. Gradient tests verify idempotency, self-adjointness and zero movement
on fixed coordinates. Separate analytic tests cover rotated coordinate frames,
cycles pinning a root to a line or a point, inconsistent equations and changing
map offsets.

The gradient still uses the linear part of the frozen chord map. This is an
orthogonal projection for that subspace, not the full derivative of the
endpoint-dependent reflection. Recomputing the map and checking the resulting
coordinates enforces the requested geometry after each update. Failed coordinate
updates are rolled back, and accepted refinement checkpoints independently
measure the requested symmetries in addition to geometry and paper checks.

## Shared cuts

Shared-cut cleanup no longer excludes within-curve requests. A chord symmetry
reverses the same cut's parameter, so its subdivisions propagate under
`g -> numberOfCubics - g` along with the existing square-transform and shared-span
relations. The joint projection supplies the distinct spatial maps. Accepted
coincident curves are re-indexed into the same graph edge before export.

The geometric and image acceptance rules are unchanged. Partition growth
remains bounded; a proposed correspondence whose subdivisions do not close is
rejected. All original-mask, search-scale, fine-scale, symmetry, bend and
paper-core checks still apply. No contour is painted over or omitted from the
source mask.

The added cleanup fixtures cover 40 mirror-about-chord combinations, including
unequal slit counts, and eight midpoint-reflection combinations. They start
from perturbed known cutting paths and require at least 84 mm of exactly shared
geometry, strictly improved source-mask agreement, preserved symmetries, valid
geometry and material, unchanged input and an unchanged second cleanup pass.

The browser fixtures exercise the served implementation and independently
rasterize its exported paths. The fresh Paint cases `chord-frame-sym` and
`chord-frame-anti` upload only rasterized artwork from known legal designs.
They select the real Within curve controls and follow the normal worker solve,
editor conversion and SVG download. No paths, counts or solution seeds reach
the optimizer. The downloaded SVG controls are checked directly against the
requested chord reflection independently of the engine's symmetry reporter.

```sh
node --test scripts/inverse/isometry-projection.test.mjs scripts/inverse/chord-projection.test.mjs
node --test scripts/inverse/sharing-orbit.test.mjs
node scripts/inverse/sharing-orbit-browser-test.mjs
INVERSE_TEST_CASES=chord-frame-sym,chord-frame-anti node scripts/inverse/paint-browser-test.mjs
```

## A UI failure uncovered by the new fixtures

The first full midpoint-reflection replay finished its solver but then crashed
the result panel: `Cannot read properties of null (reading 'toLocaleString')`.
With one cut in each sheet there is no pair of distinct same-sheet slits, so
`minimumInterSlitDistanceLower` is null. The client types incorrectly declared
it always numeric, and the panel formatted it unconditionally. This was a UI
failure after solving, not a solver timeout; the previous browser wait masked
that distinction until its 190-second timeout.

The types now describe the nullable measurement. The result panel shows the
cut counts and measured image error, omitting the inapplicable clearance.
Danish and English tests cover both fixed and free borders and verify that
Open in Draw remains available. The browser observer now reports page errors
immediately, and failed runs retain their worker observation for diagnosis.
