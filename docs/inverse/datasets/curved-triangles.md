# Touching semicircles: screenshot and original artwork

**Status: substantially improved, independently checked reconstruction.** The
automatic fitter now finds a 2 / 4-cut pair with **0.67%** observed-mask error;
production editable conversion gives **0.69%**, with geometry and paper checks
passing. The measured import/mask/fit/export run takes **24.92 seconds**. The
circular contacts survive much better, although small join and border defects
remain. The unchanged runtime's 19-second result was at 2.83% and had conspicuous
white channels. Its ten-second run failed; this change does not fix that budget.

The subsequently supplied original poster also succeeds through the normal
browser workflow: **0.945% editable-SVG disagreement**, **2 / 4 cuts**, and
**30.63 seconds click-to-ready** using the page's unmodified settings. The
original-artwork results below are separate from screenshot reconstruction.

## Input and measurement

The user supplied `Screenshot 2026-10-17 at 8.58.14 PM.png`, showing an already
classified Paint mask with nine alternating semicircle tiles. The original
image was unavailable for the initial investigation. The user later supplied
the original poster, tested separately below.
The unmodified screenshot is committed as
[`curved-triangles.png`](../../../scripts/inverse/fixtures/user-photos-2026-10-17/curved-triangles.png),
with a [source catalogue](../../../scripts/inverse/fixtures/user-photos-2026-10-17/curved-triangles.json)
and [fixed square coordinates](../../../scripts/inverse/fixtures/user-photos-2026-10-17/curved-triangles-corners.json).

Those coordinates recover the displayed UI diamond, before fitting. Its bottom
tip is 19.5 pixels beyond the screenshot. At 400 × 400, 159,945 pixels are
observed and 55 are unknown; the unknown pixels never count as artwork or image
error. The extracted square was inspected visually. This is a fixed-mask
fitting diagnostic, **not an automatic photographic crop benchmark**, and no
ground-truth cutting paths are known.

Source SHA-256: `3238e9930dc45e7697a55ed72494f05fba2647fb700bfd222cd371c7dd2b5037`.
Classified mask SHA-256: `77de47c5de58acf92d0733486f4458530905d7c847f34d6af49557cca0ca7e42`.
Observation mask SHA-256: `b15f8e1cf644f9f9e5583fddd438cb3d0409ddf244e72a58c2784af2b757a354`.
The fixture is reserved for development QA, not admitted to neural training.

## Recovery in the automatic fitter

Runtime changes: `c1cd749`, scheduling correction `0cfa803`, and corner-result
comparison `6941e0b` (no push or deployment). Poor grids in searches longer
than ten seconds can try a bounded coarse routing with up to 128 traced
segments. This is a seed for the existing common Bézier fitter, not a separate
circle fitter. No ideal circles, saved solution, cut counts or contact annotations
are supplied. The classified pixels remain unchanged.

The first integer routing follows the motif but narrowly violates clearance on
three cuts. The existing short-return projection removes its clearance witnesses,
then the common image optimizer refines the curves. Every candidate still faces
the original geometry, feature, observed-mask and paper gates. The MILP report
retains `rejected_candidate_observer`; the moved curves are a separately checked
continuous result, not a feasible or optimal incumbent of the original MILP.

This path distinguishes missing photographic coverage from permission to edit
observed pixels. It admits the former but declines free or fractionally weighted
artwork and requested symmetry constraints. It preserves any finer paper lattice
required by the repair through subsequent refinement. Searches of ten seconds
or less retain their existing scheduling and coarse graph limit.

The first integration's full regression run exposed a scheduling interaction.
The added coarse allowance extended a shared deadline even when no usable
coarse seed was found. For the upward-shifted leaf, this changed later routing
and refinement decisions: a fresh replay gave 2.116% disagreement versus 0.753%
with the previous runtime. Two other tests lost their established feature-
recovery scheduling. The correction gives the coarse stage its own allowance,
extends subsequent work only after it returns a seed, and preserves the existing
priority when the original leading grid loses a protected feature. No error
threshold or physical check was loosened to resolve these failures.

| Measurement | Integrated result |
| --- | ---: |
| Import, mask, fit, finish, independent replay and artifact writes | 24.92 s |
| Fitting and final engine checks | 24.18 s |
| Coarse topology, including routing and continuous repair | 11.54 s |
| Continuous repair within that stage | 4.25 s |
| Independent exported-geometry disagreement | 0.67086% |
| Editable SVG disagreement | 0.68899% |
| Exported cuts, left / right | 2 / 4 |
| Minimum distance between distinct slits, 100 mm square | 3.235 mm |

Geometry, editor intersection, feature and guarded paper-core/offset checks
pass. These are computational checks; the templates have not been physically
assembled. The exported geometry hash is
`8e79809038f6fdb90ad42bbecb44ff8b232011e160497682eefdf954467fde67`.
The engine and editor use different rasterizations, so their error difference
does not measure an optimization improvement. This first integration run
preceded the commit's finer-paper-provenance propagation; this particular
candidate did not require a finer lattice.

The new regression reconstructs the mask afresh from the screenshot, verifies
that unknown pixel colours cannot affect coarse proposals, rejects editable
observed pixels from this recovery path, and independently renders the final
export. Its unchanged-mask error must stay below 1.5%; the old 2.83% output fails
that assertion. It also checks that the rejected MILP proposal remains rejected.

## Verification record

The complete pinned `c1cd749` inverse run passed **1,048 / 1,051 tests** and
exposed the three scheduling failures described above. They are preserved in
`qa/inverse.log`; the full run was not rewritten as a pass. After `0cfa803`, all
**38 affected regressions** passed, including those three cases and the new
semicircle reconstruction. Type checking, lint, all 874 application tests (one
additional skipped test) and the production build also passed on the corrected
sources. The complete inverse suite was not repeated after this scheduling-only
correction. `qa-followup/source.json` pins the tested files.

The actual browser upload exposed another route: importing the extracted square
as a whole image fills the 55 previously unobserved tip pixels, and the ordinary
corner initializer returns a valid but coarse result at **1.85% editable error**.
Its curve updates repeatedly fail clearance; an isolated six-second refinement
did not improve the valid checkpoint. A fresh coarse routing on exactly those
browser pixels reached **0.68%** after common refinement, so more polishing of
the original routing was not sufficient.

`6941e0b` compares one coarse routing before accepting a corner fit above 1.5%
error (or half the requested error limit), provided enough search time remains.
It keeps the original valid pair unless error improves and geometry, paper and
enclosure-preservation checks all pass. Both screenshot variants and the existing
corner tests pass: **5 / 5 focused regressions**, including a fresh whole-mask
solve in 26.64 seconds. No saved routing enters either fresh reconstruction.

On `0cfa803`, actual SVG import/export and all four ordinary browser smoke
workflows passed. All **22 regular Hunodan workflows passed within ten seconds**:
median 6.000 seconds, maximum 8.807 seconds. Their saved engine reports contain
no `validated_corner_topology` result, so the later comparison does not run on
those recorded paths. These timings are page-clock click-to-ready measurements,
not the independent Node benchmark's timer. The stricter new mask browser test
failed at 1.85% and is retained in `qa-followup`; its corrected replay is recorded
separately in `qa-corner`: **1.448% editable error**, with geometry and paper
checks passing in **30.46 seconds click-to-ready** under the diagnostic 30-second
allowance. Type checking, lint and build passed again on `6941e0b`. The full
inverse suite has not been rerun on that final revision.

## Original artwork supplied afterwards

The [user-linked Art e Sta JPEG](https://artesta.dk/cdn/shop/files/027524_cap_2a23a975-d5cd-4194-8f7e-f724cfc01235.jpg?v=1763603420&width=1600)
is a 600 × 840 Bauhaus poster, not a photograph of a woven heart. The unmodified
53,117-byte file and [catalogue](../../../scripts/inverse/fixtures/user-photos-2026-10-17/artesta-curved-triangles.json)
are committed. Its SHA-256 is
`e3348a430099a088a2e2ecd23c7d4f85f7a33850d542b711dfb1fd56fc5f9550`.
The related screenshot and poster remain reserved for development QA together.

Before solving, the assistant selected the rightmost three columns and top
three rows: `[[177,66],[546,66],[546,435],[177,435]]`. This reproduces the same
arrangement of semicircle tiles; it does not establish the user's exact original
crop. The coordinates stayed fixed throughout these experiments. The automatic
heart locator offers no supported crop for the rectangular poster, so the browser
test uses **Set them myself**. That is an artwork selection, not an automatic
photograph-localization success.

Both Node preparation and actual browser import produce byte-identical 400²
masks, SHA-256
`d48ec1c8dda844bcfc338fad386313f3691175e7a6aeeb20cc0fc826e539fb7f`.
All 160,000 pixels are observed. Every run starts from this mask without saved
cut geometry or slit counts.

| Original-artwork run | Elapsed | Editable disagreement | Geometry / paper |
| --- | ---: | ---: | --- |
| Node, 30-second allowance | 30.05 s including independent engine replay | 1.318% | pass / pass |
| Browser, diagnostic 30-second allowance | 30.07 s click-to-ready | 2.140% | pass / pass |
| Browser, normal production settings | 30.63 s click-to-ready | 0.945% | pass / pass |

All three have 2 / 4 cuts. Node's separate exported-geometry error is 1.303%.
The successful normal browser run has 0.884% engine sampling error and a
3.756 mm minimum distance between distinct slits at a 100 mm overlap width.
The browser downloads the editable SVG, parses it afresh, and checks editor
intersections, geometric constraints, guarded paper cores and polygon offsets.
Small join/border protrusions remain; there is no physical assembly test.

**The shortened browser replay failed the stricter 1.5% regression target.**
It is retained, rather than relabelled a pass because it clears the application's
3% image gate. Identical imported masks rule out cropping and colour conversion
as explanations for its difference from Node. The coarse repair completed only
5 image updates in the browser versus 125 in Node before its deadline; their
accepted coarse seeds had 2.170% and 1.318% error respectively. This exposes
sensitivity to execution speed and stage deadlines. It does not prove any one
runtime or setting difference is solely responsible. The normal page permits
180 seconds, but this run finished after about 31 seconds; it did not optimize
for three minutes. Short-budget robustness remains unfinished.

The original browser test initially stopped **before fitting** because integer
screen-pixel clicks placed corners 1–2 source pixels away from the preselected
coordinates. The final harness uses the normal corner-drag UI to reproduce those
same coordinates precisely. It never adjusts the crop using reconstruction
error. The failed click-only attempt is retained in `browser-artesta/`.

The committed [browser replay](../../../scripts/inverse/curved-contact-browser-test.mjs)
uses the original JPEG, unchanged production solve settings, UI crop selection,
actual worker fitting, **Open in Draw**, and a downloaded SVG. Run it against a
current preview with `INVERSE_TEST_URL`, `PLAYWRIGHT_MODULE` and a fresh
`INVERSE_TEST_OUTPUT` directory. It asserts the geometry and paper checks and
less than 1.5% editable disagreement. Its final source-file replay also passed
at **0.945%** in **30.67 seconds**, with
identical downloaded SVG bytes to the preceding normal-settings run. The new
harness passes lint. The standalone Node reproduction is:

```sh
node scripts/inverse/hard-photo-benchmark.mjs \
  --catalog=scripts/inverse/fixtures/user-photos-2026-10-17/artesta-curved-triangles.json \
  --crop=fixed --target=mask --seconds=30 --presets=automatic \
  --output=tmp/artesta-fresh
node scripts/inverse/hard-photo-editor-replay.mjs \
  --run=tmp/artesta-fresh --output=tmp/artesta-fresh-editable
```

## Exact ideal artwork has an eight-branch obstruction

This conclusion concerns the **ideal semicircle construction**, not a proof
about every thresholded JPEG pixel. It uses the regular model enforced by our
validator: within either sheet, slit paths are simple and mutually disjoint.
At an interior point there can therefore be at most one slit from each sheet.
Each contributes two local branches, so the visible colour boundary has degree
at most four. Shared cuts can cancel visibility; they cannot raise that bound.

An interior **tile-grid corner** in this artwork has four straight boundary
segments and four circular arcs meeting at the same point: degree eight. This
is different from the degree-four tangency in the centre of a tile. In unit-cell
coordinates, inspect `(1,1)` on a circle of radius `rho`, `0 < rho < 1/2`. In
each quadrant one boundary is a grid ray and the other is a semicircle; their
angular separation is `asin(rho)`. Hence the inspection circle crosses the
colour boundary eight times. The [diagnostic record](curved-triangles-topology.json)
also checks four radii numerically, with eight transitions at the grid corner
and four at a tile centre. The count is justified analytically, not inferred
solely from those samples.

Consequently, **the exact eight-branch junction cannot occur in a regular
two-sheet weave**. Reproducing it would require additional cuts touching in one
sheet, or a slit visiting the same point more than once, violating these rules.
An approximation can separate the junction into several ordinary ones and
shift the tips slightly. This explains why pursuing every ideal contact exactly
is not an appropriate acceptance target.

This local argument does **not** prove that 0.945% disagreement is optimal, or
establish any positive lower bound on image error. Arbitrarily small geometric
perturbations can change junction degree, and the raster may already have such
perturbations. The physical minimum-width constraints, finite representation,
and timed search require separate analysis. Both mathematical restrictions and
algorithmic defects can contribute to the remaining error.

Related mathematical background: Reitebuch, Lipschütz and Polthier,
[“Weaving Paper into Star Patterns,” Bridges 2020](https://archive.bridgesmathart.org/2020/bridges2020-427.pdf),
explicitly distinguish constructions with at most two cuts crossing at a point
from more general tilings requiring additional cuts. The eight-branch argument
above is our application to this ideal motif, not a theorem claimed by that
paper about this particular poster.

## Results on the unchanged runtime

Runtime: `f1cf52e2a42c294458f1c9904997c5d7dfa44bcc`. CPU jobs ran serially at
nice 15 with numerical thread pools limited to one.

| Search allowance | Fit, finish and independent replay | Independent observed-mask error | Template checks | Exported cuts, left/right |
| --- | ---: | ---: | --- | --- |
| 10 s | 10.36 s including import/mask preparation | 9.79% | fail | 2 / 8 |
| 30 s | 19.37 s excluding import/mask preparation | 2.83% | pass | 2 / 8 |
| 60 s | 19.57 s excluding import/mask preparation | 2.83% | pass | 2 / 8 |

The longer two runs produce byte-identical `cut_geometry.json` files:
`fd0628257a89a8723f23f30567a95da3067118af5487793ce5c482ecd1dc8fe2`.
The 60-second allowance is **not 60 seconds of optimization**: the existing
search ends after finding a qualifying candidate. This experiment therefore
shows that increasing the user budget alone does not improve the result; it
does not establish that further optimization could not help.

Production editable conversion, SVG serialization/parsing and raster replay
of the selected 30-second result give **2.76%** error. Editor issues are empty,
the independent geometry checks pass, and the 700-cell paper-core audit passes.
The nominal minimum distance between distinct slits is 3.01 mm for a 100 mm
overlap square. This is a computational check, not a physical assembly test.
The independent engine renderer and editor use different rasterizations; their
2.83% and 2.76% figures should not be presented as an optimization improvement.

## What the diagnostics establish

1. **The short run has a poor starting layout and insufficient recovery.** It
   chooses eight cuts in one direction and two in the other. Its best fine-grid
   image error is about 5.9%, and clearance preparation worsens it. The eventual
   valid approximation still retains visibly flattened arcs and false seams.
2. **Tracing is also a bottleneck.** The fine trace has 170 boundary segments
   and 0.775% error, exceeding the topology initializer's 0.5% gate. A 65-segment
   simplified trace has 1.062% error and is also rejected. Raising the coarse
   seed cap to 128 lets a 99-segment proposal reach routing, but guide noding
   expands it to 170 visible edges, 699 hidden candidates and 44,055 constraints.
   Its roughly one-second integer search times out without a checked pair.
3. **Missing observations affect scheduling as well as scoring.** The 55
   missing pixels give this source a weight field. Existing weighted-input
   guards suppress the supported-border finalist reservation, coarse topology
   recovery and outline subdivision. Restoring each tested opportunity did not
   solve this case. The clipping is therefore not an established sole cause.
4. **Apparent tangencies are fragile.** The extracted raster produces opposed
   narrow cusps separated by small bridges; the ordinary junction repair is
   intended for broad four-arm crossings. Experimental larger-radius cusp
   merges reduce some graphs, but the tested routing candidates remain
   infeasible within those particular graphs. That does not prove the artwork
   impossible.
5. **Whole-image error misses visible defects.** Constraining both mirror axes
   gives a nominally valid 6 / 6 pair at 2.54%, but creates more conspicuous gaps
   and protrusions. It was rejected visually. Several white source regions in
   the selected approximation also reach the outside through narrow channels;
   passing colour-retention checks does not prove the contacts were recovered.

These baseline diagnostics point to the assignment of visible arcs and shared
hidden cuts. The recovery above changes that assignment before polishing. No
motif-specific initialization or relaxed physical acceptance rule was added.

Inspecting the exported paths gives a concrete explanation for the five
vertical gaps: at each nominal contact centre, the two nearest **distinct cut
paths belong to the same sheet**. Their distances from the centre are about
1.40–1.76 mm, and the pair must retain the 2.505 mm nominal paper width. Moving
those two paths together cannot close the contact while preserving the current
routing and physical constraints. This supports rerouting as the next problem
to solve, rather than merely increasing curve resolution. The
[path-distance measurements](curved-triangles-contacts.json) pin the exported
geometry hash; their nine nominal cell centres are diagnostic annotations,
never inputs to fitting. They do not prove that another routing can reproduce
the artwork exactly.

## Rejected experiments

All changes below were injected into isolated modules under `tmp`; none is a
production change. Every final candidate used the original observed mask.

| Proposal | Result |
| --- | --- |
| Restore supported-border finalist, 10 s | Same 9.79% failure |
| Permit coarse topology for this weighted input, 10 s | 10.59%, checks fail; candidates exceed 64-curve gate |
| Also raise coarse curve cap to 128, 10 s | 10.59%, checks fail; routing times out |
| Constrain both mirror axes, 30 s | 2.54%, checks pass, visually worse |
| Permit observation-aware outline subdivision, 30 s | 2.89%, checks pass, no final improvement |
| Broaden narrow-cusp junction repair and route smaller graphs | No checked pair in the four tested graphs |

The outline-subdivision experiment added 49 curves and improved its own
pre-polishing checkpoint, but its final result was worse than the unchanged
pipeline. That is not evidence for shipping the broader guard removal.

## Reproduction and artifacts

Use the command in the [fixture README](../../../scripts/inverse/fixtures/user-photos-2026-10-17/README.md#curved-triangle-paint-screenshot).
Then replay the result through `scripts/inverse/hard-photo-editor-replay.mjs`.
Use a fresh output directory for each run and preserve `observed.bin`.

Local investigation root: `tmp/heart-learning/curved-mask-2026-10-17/`.

- `run/`: baseline ten-second full import/mask/fit benchmark.
- `production-30/`, `production-60/`: unchanged-runtime controls.
- `selected/`: selected engine files plus the exact source mask and observations.
- `editable/`: production editor conversion, editable SVG and physical audits.
- `probe.mjs`: guarded module injections for the explicitly labelled experiments.
- `trace-probe/`, `tangent-probe/`, `tangent-wide-probe/`, `route-probe/`: tracing
  and routing diagnostics, including failed attempts.
- `repair-route-15/`: successful isolated coarse-routing/clearance/refinement
  prototype, 0.91% independent error in 11.58 s excluding source preparation.
- `integrated-30/`: fresh automatic fit with the production recovery.
- `integrated-editable/`: independently checked editable SVG and weave preview.
- `integrated-comparison.png`: observed mask, editable weave and pixel difference.
- `qa/`, `qa-followup/`, `qa-corner/`: pinned checks, including failed runs and
  focused corrections; see the verification record for exact revision coverage.
- `artesta-30/`, `artesta-editable/`: original JPEG Node fit and editable replay.
- `browser-artesta-precise/`: shortened browser run; fails the 1.5% target.
- `browser-artesta-default/`: successful original upload with normal settings.
- `browser-artesta-committed/`: replay of the committed browser harness.

Residual visual defects remain open even though the new regression and nominal
checks pass. The result is compared with the observed screenshot, not unavailable
original cutting paths or a hand-cleaned ideal pattern.
