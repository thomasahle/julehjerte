# Independent controls and deliberate shared cuts

`CurveGraph` previously assigned one parameter to every coordinate rounded to
1e-7 mm, regardless of how that coordinate was used. A cubic handle is not a
geometric junction. Two unrelated handles can coincide in a straight starting
grid, and a handle can even coincide with another curve's endpoint. Coupling
those variables adds constraints that the requested cutting geometry does not
imply. The same problem applies to isolated crossing anchors belonging to two
independent paths: a crossing does not require both paths to retain the same
parameter value at that intersection as their shapes change.

The controlled moving-chord study isolated this as the cause of the remaining
2×2 stalls after the endpoint-gradient correction. Subdividing the starting
curves exposes additional stalls at coincident interior anchors, including
single-cut sheets. These are representation constraints, not noisy boundary
counts or failures of the image derivative.

## Parameter identity

`direct/curve-topology.js` allocates control occurrences independently and
joins only:

- Adjacent path anchors, including an explicitly closed path's first and last
  anchors, when they meet under the established geometric key.
- All four corresponding controls of a complete shared cubic, in either
  direction. These identities propagate through connected neighbouring cuts.

A union-find structure compacts those relations into the existing point-array
representation. First occurrences determine the stored coordinates and point
order. Complete-curve canonicalization still uses the established 1e-7 mm
keys, but a partial coordinate coincidence alone no longer joins parameters.
A handle coincident with its own endpoint can therefore move independently,
while the actual endpoint remains on the square boundary.

The existing edge table still represents every shared cubic once. Its even
multiplicity cancels before combined rendering and boundary integration.
Shared cuts remain shared through reconstruction, symmetry, simplification
and export; the change does not introduce independent copies of those cuts.

## Geometric branches versus optimization variables

Shared-run simplification must retain geometric branches and slit endpoints,
even when different paths have independent parameters there. Its branch
incidence now uses geometric endpoint keys explicitly. This is a different
question from whether an optimizer must move those endpoints together.
The original branch-preservation regression continues to pass without changing
its expectations.

The earlier joint-projection regressions intentionally test a coupled crossing
and coupled handles. Their fixture now creates that coupling explicitly rather
than relying on the constructor's old accidental behavior. This retains the
mathematical regression, including Adam's retry after a coordinate projection
fails. Ordinary graph-construction tests require the opposite behavior for
unrelated controls.

## Verification scope

New tests cover coincident handles, isolated crossing anchors, handle/anchor
coincidences, collapsed endpoint handles, reversed shared cubics, connected
neighbours, rounded-key sharing, actual closed loops and disconnected paths.
Four refinement regressions require a low-error fit, preserved symmetry at
every accepted checkpoint, valid geometry and paper, and an unchanged seed.
The complete engine suite passes all 482 tests.

The expanded controlled study compares the preceding engine (`28a9c06`) with
the new representation using one or two cubics per starting cut. Both studies
supply cut counts to isolate refinement. They separately record disagreement
with the prepared 200-pixel mask and with the ideal underlying curves at 400
pixels; binary input quantization is not attributed to the fitter.

`curve-topology-solve-benchmark.mjs` supplies only the generated pixels and a
within-curve symmetry request to the full automatic solver. It records the
inferred counts and independently renders the exported JSON with resvg. The
known template is saved for inspecting the experiment, but never passed to the
solver. This distinguishes a representation improvement from any demonstrated
benefit in the normal image-to-template workflow.
