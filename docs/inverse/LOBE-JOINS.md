# Continuous lobe and weave rendering

The later [geometric-clipping extension](CLIPPED-FILLS.md) removes the two
gallery fallbacks described below. This page records the original `c82131f`
implementation and its validation; all 38 gallery hearts now use joined fills.

The [hat repair](HAT-SEAM-HANDOFF.md) makes nearly coincident cutting curves
exactly shared. A separate defect could still draw a hairline through a region
whose geometry was already correct: the SVG renderer painted two overlapping
lobe fills, then repainted the woven square through an antialiased clip.
The clip edge and the separately filled strip edges blended with the underlying
paper, leaving a faint diagonal at the join.

Appending a semicircle to the strip subpaths was insufficient. Even with
identical coordinates, browser rasterizers could leave seams where one long
boundary overlapped several shorter boundaries. Encoding both as straight
lines was also insufficient. These intermediate approaches were rejected.

## Change

`src/lib/rendering/heartPaint.ts` constructs continuous fill contours before
painting. The top semicircle and all ribbons contribute to the same even-odd
fill. Boundary intervals covered twice cancel; identical shared cubic edges
also cancel, including reversed copies. The remaining edges are reconnected
into closed contours. Interior curves retain their Bézier controls.

This is paint geometry only. The fitter, target masks, cutting templates,
conversion validation and editor issue checks are unchanged. No stroke or
outline is added to conceal gaps. A boundary-coordinate tolerance of
`1e-12 × max(1, overlap width, overlap height)` absorbs floating-point noise.

Both live SVG components use `HeartWeaveFill.svelte`: the Paint result and
gallery renderer, and the interactive Draw renderer. The string SVG writer
uses the same contour builder, covering exported woven previews as well.

Curves that actually leave the overlap retain the previous clipped rendering.
The bounds check considers cubic extrema when handles leave the square.
This prevents an unrestricted drawing from spilling into a lobe. Of the 38
current gallery designs, 36 use joined contours; `amy-pattern` and
`triple-heart` need the clipping fallback. This change does not remove possible
clip-edge antialiasing in those fallback cases.

## Verification

- **1,224 tests pass:** 833 application tests and 391 engine tests. One existing
  optional application test remains skipped.
- Type checking: zero errors and seven existing warnings. Lint and the
  production build pass.
- All **38 actual gallery designs in both weave phases** pass independent
  resvg coverage comparisons at 384 pixels. Changed path bounds and ordering
  can change the rasterizer's curve tessellation slightly. The test permits
  less than **0.05%** total coverage difference, confined to antialiased edge
  neighborhoods; uniform interior regions cannot drift.
- Additional tests cover reversed and subdivided boundaries, rectangular
  overlaps, curved or missing outer boundaries, clipping, unchanged source
  geometry, outlines, colors, and agreement between Svelte and exported fills.
- **18 production browser rendering checks** cover Chromium, Firefox and
  WebKit, three size/device-scale combinations, fractional CSS offsets, and
  both white/red and blue/yellow palettes. Every sampled uniform lobe join
  has **zero channel deviation** after the fix. The old layered reference
  deviates by up to 90/255 at the top join and 103/255 at the left join.
- **12 fresh Paint → Draw → SVG workflows** pass: matching, independent and
  Anti hats, plus the star, in all three browser engines. The star also
  exports PDF. Every workflow checks paper validity, editor curve rules,
  shared cutting coordinates, reported disagreement, exported mask fidelity
  and browser errors.

| Fresh hat mode | Shared spans retained in SVG | Protected-motif disagreement |
| --- | ---: | ---: |
| Matching sheets | 41 | 0.32065% |
| Independent sheets | 30 | 0.29585% |
| Anti | 39 | 0.31888% |

The table is the same in all three browser replays. These are fresh fits of
the reproduced silhouette, not a recovery of the unavailable original drawing
from the user's screenshot. The underlying solver has not changed in this
rendering commit, so the full 54-case solver speed benchmark was not repeated.

An early test harness incorrectly passed the already prepared gallery data
through the interchange importer, dropping its interior curves. The production
browser comparison detected that mistake. The final gallery tests consume
`src/lib/data/heart-designs.json` directly and retain its actual curves; the
earlier measurements are excluded.

## Replay and artifacts

Use the isolated checkout, build it, and restart its preview on port 5232.
The browser scripts use standalone Playwright:

```sh
PLAYWRIGHT_MODULE=/Users/ahle/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
INVERSE_TEST_OUTPUT=tmp/lobe-render-browser \
node scripts/inverse/heart-render-browser-test.mjs

PLAYWRIGHT_MODULE=/Users/ahle/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
INVERSE_TEST_URL=http://127.0.0.1:5232 \
INVERSE_TEST_CASES=star,top-hat,top-hat-independent,top-hat-anti \
INVERSE_TEST_OUTPUT=tmp/lobe-paint-browser \
node scripts/inverse/paint-browser-test.mjs
```

Raw screenshots and reports live in `tmp/lobe-render-browser/` and
`tmp/lobe-paint-browser/`. Check logs are `tmp/lobe-{test,check,lint,build}.log`.
The committed summary is [LOBE-JOINS-VALIDATION.json](LOBE-JOINS-VALIDATION.json).
The implementation commit is `c82131f` on `codex/solver-initialization`.
Nothing was pushed or deployed; the main and redesign checkouts were not edited.
