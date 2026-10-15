# Recovering an enclosed motif from a rejected integer routing

The [corner study](enclosure-corner-study.md) restored consistent slit counts
but exposed integer candidates with narrow returns. A fresh offline replay now
recovers a three-by-three template pair from that same frozen mask. It keeps all
four heart motifs enclosed, passes the unchanged geometry and finer paper-core
checks, and survives conversion to the actual editable SVG format.

This is one previously investigated **estimated neural paper mask**, not original
artwork, a new raw-photo benchmark pass, or a deployed algorithm. The automatic
fitter does not yet schedule the corner proposals or the broader repair option.
The 25/31 photographic result is unchanged.

## What failed and what changed

The rejected routing contains both short returns and nonlocal narrow necks.
The existing projector handles only the former, while ordinary continuous
refinement improved pixel error without consistently clearing the remaining
returns. A local projection of both kinds of clearance witness can produce
geometrically legal cuts, but the initial result still has uncertain paper-core
connectivity at 700-pixel resolution.

Tracing the disconnected core regions locates tight corridors on the same cuts,
rather than an inter-slit or outer-edge failure. Using the fitter's existing
clearance cushion as the projection target opens those corridors sufficiently
to pass the finer paper check. That alone introduces a small crossing between
adjacent segments near the top heart.

The crossing has a concrete cause: the original visible span is straight and
about 1.46 mm long. Its endpoints move during clearance repair, but independently
moving handles overshoot the shortened endpoint chord. The resulting curve
crosses the following shared segment. A generic near-straight simplification
does not remove it because it correctly refuses longitudinal overshoot.

The broader repair therefore retains endpoint-based parameters for input spans
that are already exactly straight, have ordered handles, and are no longer than
the nominal strip width. It propagates their gradients to the endpoints by the
chain rule. Shared controls still have one identity; curved and longer spans
retain their freedom. This removes the crossing without a separate fitter or
a relaxed acceptance rule.

The existing projection now has an explicit `clearanceMargin` option. It adds
nonlocal witnesses carrying curve parameters, retains the original editor
return witnesses, and also probes the wider clearance target. Retaining the
original witnesses matters: the ordinary-bend exemptions change with margin,
so a wider probe alone can miss an original short-return violation.

Updates in this optional mode are clamped to the existing displacement bounds.
Original controls and fixed endpoints remain unchanged in the caller. Every
returned repair still needs a complete geometry audit and must preserve any
selected matching-sheet relation and requested symmetries. Image fidelity,
enclosure and paper connectivity are measured separately by the caller.
Default short-return projection and production scheduling are unchanged.

## Fresh replay results

The replay reads only the frozen mask fixture. It chooses the smallest-change
corner proposal, traces it at the fixed development tolerance of 0.75 mm, and
asks HiGHS for a fresh integer routing. The rejected-candidate observer stops
with an explicit MILP failure; the separately projected result is never
misrepresented as a validated MILP incumbent or given its objective bound.

| Measurement | Fresh replay |
| --- | ---: |
| Slits per sheet | 3 / 3 |
| Corner preparation and fresh routing | 8.822 s |
| Bounded projection | 2.070 s |
| Preparation, routing, projection and engine finalization | 11.453 s |
| Independent exported-render disagreement with original mask | 2.4525% |
| Actual editable SVG disagreement with original mask | 2.42875% |
| Enclosed heart motifs after export and editable conversion | 4 / 4 |
| Minimum individual heart component IoU after editable conversion | 92.59% |
| Engine and editable geometry checks | pass |
| Engine and editable paper-core checks at resolution 700 | pass |

These timings exclude subsequent independent rendering, Vite module startup and
editable-SVG audit. They are not a ten-second solve claim. The new run reproduced
the earlier rejected routing's complete geometry hash; no saved routing was
loaded to obtain it. The input mask and probability map remained unchanged.

The earlier invalid route agrees more closely with the mask (1.855625%). The
repair pays image error to achieve the geometric clearance. The earlier direct
fit's approximately 1.2% error is lower too, but its opened heart motifs are a
different visible defect. Pixel error alone cannot rank these as equally usable.
The repaired motifs still follow the polygonal trace rather than recovering
smooth original artwork.

The fifth source component is a checkerboard region with ambiguous point
contacts. It touches the border in the independent exported renderer and remains
closed in the editable renderer. All four heart regions remain enclosed in
both. This supports the earlier finding that exact raster connectivity at a
checker junction is unsuitable as a universal enclosure rule. No physical paper
assembly or tear-strength claim is made.

## Reproduction and checks

```sh
node scripts/inverse/diagnostics/corner-clearance-repair.mjs \
  --output=tmp/corner-clearance-replay --seconds=20
node --test --test-concurrency=1 \
  scripts/inverse/clearance-projection.test.mjs \
  scripts/inverse/clearance-witnesses.test.mjs \
  scripts/inverse/linear-controls.test.mjs
```

The output directory must be new. The trace tolerance and five-second repair
allowance are fixed; `--seconds` controls the routing allowance. A saved invalid
routing fixture is used only by regression tests, never by the fresh replay.
The replay exports both template SVGs, the woven preview, an independently
rendered image, and an editable SVG only after its full checks pass. It pins
253 source hashes and verifies them again at completion.

Twenty-two focused tests pass, including the existing hidden-return, matching,
symmetry and rejected-routing regressions. New coverage checks the photographic
repair, exact straight-control derivatives, exclusions for curved or reversing
handles, parameterized nonlocal witnesses under subdivision/reflection, and
refusal of pre-existing crossings or pinned/unavailable repairs. Explicit core
lint passes. Full repository QA is recorded separately in the
[measurement record](corner-clearance-repair.json).

Next work is automatic scheduling within the common search budget, followed by
the full fixed-photo/Hunodan comparison. The broader option is deliberately not
counted as a production improvement until that integration is measured.
