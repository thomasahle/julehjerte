# Continuous fills for curves outside the overlap

The first [lobe-join fix](LOBE-JOINS.md) retained SVG rectangle clipping when
curves left the woven square. That protected the semicircles, but also retained
the old antialiasing seam for `amy-pattern` and `triple-heart`.

`f1fb202` adds geometric clipping before constructing the continuous fill.
All **38 gallery hearts**, in both weave phases, now use joined contours.
This changes only rendering geometry; it does not move the cutting paths,
repair an invalid paper design, or change the fitter's mask or objective.

## Method

`createBezierLoopClipper` clips each closed ribbon against the four rectangle
half-planes. It partitions cubics at scalar derivative extrema, finds every
boundary crossing in the resulting monotone intervals, and uses de Casteljau
subdivision to retain the interior portions. Boundary connectors close the
result, including concave shapes and disconnected regions. Retraced connectors
cancel when the continuous-fill builder applies even-odd parity.

The clipper owns a cache for each half-plane. Forward and reversed copies of
the same cubic use one canonical calculation, so their clipped portions retain
bit-identical shared controls. This prevents clipping itself from reopening a
shared seam. Each render owns its clipper; there is no cache of editable source
geometry across renders.

Already bounded curves keep the existing fast path. A comparison against
`f826c88` confirms that the resulting fill-path strings are **byte-identical
for the other 36 gallery designs**, in both phases. Nonfinite geometry and
unusable ribbon data still retain the defensive SVG clipping fallback.

## Verification

- **1,231 tests pass:** 840 application tests and 391 engine tests. One existing
  optional application test is skipped. Type checking reports zero errors and
  seven existing warnings; lint and the production build pass.
- The seven new clipping tests cover enclosing/disjoint loops, concavity,
  holes, disconnected pieces, tangencies, corner intersections, a cubic with
  three crossings, reversed shared curves, and deterministic curved loops.
- Twenty geometric comparisons each check **2,491 independent off-edge parity
  probes**. Their reference samples the original cubics uniformly and does not
  use the clipper's root finder or SVG tessellation. Each case also verifies
  closure, cubic bounds, unchanged source data, and independent resvg coverage.
- Clipping a long diagonal can change resvg antialiasing without changing the
  curve. These adversarial fixtures permit at most 0.2% aggregate pixel error
  at 400 pixels, confined to edge neighborhoods. Their independent parity
  probes must agree exactly. The gallery tests retain the stricter 0.05%
  coverage bound at 384 pixels.
- At 800 pixels, clipping `amy-pattern` changes overlap coverage by at most
  **0.00056%** relative to the old clipped image. `triple-heart` is pixel-identical
  in that comparison. These are rendering comparisons, not reconstruction
  scores against a photograph.
- **54 production browser rendering checks pass:** classic, Amy pattern and
  triple heart × Chromium/Firefox/WebKit × three size/device-scale combinations
  × two palettes. Uniform lobe joins are selected from the source mask. Every
  sampled join has zero channel deviation after rendering.
- **Nine actual Draw → SVG export checks pass** for those three designs in all
  three engines. The served Draw contours match the shared fill builder, there
  are no browser errors, and all 1,728 exported scalar controls match the source
  to within **5.7 × 10⁻¹⁴ editor units**. The comparator pairs curves by geometric
  order: SVG import regenerates IDs, so IDs are not an identity invariant.

No fresh fitting benchmark was repeated: solver code is unchanged. The prior
hat/star workflow results remain recorded in [LOBE-JOINS.md](LOBE-JOINS.md).

## Replay

Build and restart the isolated preview on port 5232, then run:

```sh
PLAYWRIGHT_MODULE=/Users/ahle/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
INVERSE_TEST_DESIGNS=classic-3x3,amy-pattern,triple-heart \
INVERSE_TEST_OUTPUT=tmp/clipped-render-browser \
node scripts/inverse/heart-render-browser-test.mjs

PLAYWRIGHT_MODULE=/Users/ahle/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
INVERSE_TEST_OUTPUT=tmp/clipped-editor-browser \
node scripts/inverse/heart-clipping-editor-browser-test.mjs
```

Reports and screenshots are in the two output directories. The one-off gallery
comparison is `tmp/clipped-gallery-results.json`; check logs are
`tmp/clipped-{test,check,lint,build}.log`. The committed evidence summary is
[CLIPPED-FILLS-VALIDATION.json](CLIPPED-FILLS-VALIDATION.json).

The branch is `codex/solver-initialization`. Nothing was pushed or deployed,
and neither the main nor redesign checkout was edited.
