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

The original release used only the linear part of the frozen chord map in
its gradient. The [moving-endpoint correction](MOVING-CHORDS.md) now includes
translation and rotation of the frame, removing the resulting translation
and tilt stalls. Coordinate projection still uses the joint isometry solver
described here. Failed updates are rolled back, and accepted refinement
checkpoints independently measure symmetry, geometry and paper validity.

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

## Fresh browser comparison

With the result-panel fix in both versions, Chromium replays the previous
engine snapshot (`0d59a90`) and the new engine against the same uploaded pixels.
The numbers below measure the **downloaded editable SVG** against the prepared
source mask, rather than substituting the solver's pre-conversion score.

| Artwork / within-curve mode | Previous source disagreement | New source disagreement | Previous / new shared spans |
| --- | ---: | ---: | ---: |
| Frame / Sym | 0.15000% | 0.02875% | 0 / 32 |
| Diagonal / Anti | 0.15000% | 0.00125% | 0 / 2 |

Both fresh cases pass in Chromium, Firefox and WebKit. The enabled Open in Draw
button appears 2.50–5.28 seconds after the Find click; SVG downloading and
independent verification follow afterward. Every downloaded chord relation
agrees within 4e-14 mm in these fixtures. Twenty-one additional served-module
cleanup replays pass, including unequal counts and combinations of square and
chord symmetries. Those controlled geometry fixtures are distinct from the six
fresh image-to-template workflows.

The one-cut crash is retained as a failed UI regression run. The comparison
above reruns the previous engine with the fixed UI; the 190-second readiness
failure is not misreported as an algorithmic speed improvement.

## Release regression checks

All 787 application tests and 391 engine tests pass (one optional application
recording is skipped). Type checking reports zero errors and seven existing
Svelte warnings; lint and the production build pass.

All 45 current-build browser cases pass: 21 controlled cleanup replays, six
fresh chord workflows and 18 established Paint workflows. Two additional
Chromium runs use the previous engine with the same fixed UI for comparison;
their prepared-mask files match the new runs byte for byte.

The 22 regular Hunodan photographs and 32 free-border perturbation cases retain
byte-identical exported geometry and pass every existing quality check. Serial
Node preparation, fitting, validation and export take a 4.88-second median and
8.02-second maximum for Hunodan, and 4.45 / 8.08 seconds for the perturbations.
These runs include progress geometry and retained candidate checkpoints, while
photograph decoding and independent export rendering are measured separately.
The 18 established browser outputs also retain exactly the preceding geometry
and source-image errors.

[CHORD-PROJECTION-VALIDATION.json](CHORD-PROJECTION-VALIDATION.json) records the
per-case browser results, original UI failure, source hashes and artifact
hashes. All 60 served engine/worker source files match the benchmarked checkout.
The preview remains at `http://127.0.0.1:5232/en/editor/paint/`.
