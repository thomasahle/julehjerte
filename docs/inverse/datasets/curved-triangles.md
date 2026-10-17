# Touching semicircles in the Paint screenshot

**Status: checked approximation, not a visually faithful reconstruction.** The
unchanged fitter produces a geometry-valid pair in about 19 seconds, but some
arcs flatten and some intended contacts become visible gaps. The ten-second
run fails. Lower pixel error alone did not identify the best-looking candidate.

## Input and measurement

The user supplied `Screenshot 2026-10-17 at 8.58.14 PM.png`, showing an already
classified Paint mask with nine alternating semicircle tiles. The original
image or drawing was requested but was unavailable during this investigation.
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

The remaining problem is finding a suitable assignment of visible arcs and
shared hidden cuts while preserving the circular contacts. No motif-specific
initialization or relaxed physical acceptance rule was added to production.

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

The current case was not added as an automatic success assertion. Its visual
defects remain open even though the longer run meets the existing numerical
acceptance limit.
