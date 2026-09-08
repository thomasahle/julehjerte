# Inverse engine in the redesigned editor

The algorithm changes on `codex/integrate-juleflet` through `fffa69a` were
migrated to `redesign` in `8367d42`, `787cd0d` and `57d03c9`. The redesigned Paint and Draw
pages remain the entry points. No standalone generator page was restored.

## Engine parity

Compared the branches under `static/inverse`, `scripts/inverse`, and
`docs/inverse`. The remaining engine differences are the redesign's requested
symmetry support and its integration with the migrated fitter:

- Every raster uses the same direct fitter. It can initialize from either
  image-derived boundary topology or fresh grids, then refine both straight
  spans and curved cubics together. Vector inputs retain their vector route.
- Pixel-aware boundary preparation, corner preservation, straight-span
  proposals, half-open raster sampling, feature recovery, matching-sheet
  preference, and the longer browser topology budget are present.
- The photograph colour-mixture model, crop locator, HiGHS WASM, native boundary
  gradient, geometry checks, paper-core checks and independent export renderer
  were already present and remain in use.
- Count enumeration lives in `direct/counts.js`. Requested symmetries still
  constrain count parity and pairings; all actual search targets are averaged
  over the requested group, with parameter and gradient projections retained.
- A topology seed may serve a transpose request only when its subdivisions
  support the parameter ties. Other explicit symmetries use compatible grids.
  Straightening proposals are projected onto those same ties before scoring.
- Web-photo fixtures, silhouette fixtures, benchmark harnesses and their
  historical reports have been migrated. The motif-border work is an experiment;
  it does not implement per-cell free/soft weights in Paint.

## Star regression: validation after conversion

A fresh production replay of **Try the star → Find the cuts → Open in Draw**
reproduced the user's September 8 screenshot. The engine reported valid cuts
with approximately 3.92 mm minimum inter-slit clearance. Its original geometry
also passed the editor's own checks. Refitting each cut independently at the
converter's default 0.25 mm tolerance made `L-cut-1` and `R-cut-1` fail the
editor's self-proximity checks. The previous converter never ran those checks.
This reproduced the warning; it did not establish a physical crossing.

The frozen solver output is
`scripts/inverse/fixtures/editor-star-crossing.json`. It is regression input,
not an initializer or a saved answer used by the solver.

The handoff now preserves exactly shared cubics and simplifies the intervening
runs. `convertValidatedCutGeometry` checks the complete normalized design with
the **same `findFingersWithIssues` and margin as Draw**, after any symmetry
correction. If needed it retries with tighter simplification and then the
original cubics. An invalid symmetry correction can be dropped. If no converted
candidate passes, Paint does not expose it as a successful editable heart.
The image-error acceptance threshold remains separate from geometry validity.

The converter also preserves sharp joins emitted by the fitter: it simplifies
the smooth runs between them and labels those joins as editable corner nodes.
This prevents the handoff from rounding a clean right angle back into a bend.
The same simplifier serves straight and curved cuts.

Low-level conversion still exists for diagnostics and historical fixtures,
including examples that fail current editor rules. Paint uses the validated
handoff. The editor's crossing and distinct-cut spacing checks remain in force.

The broader browser tests also exposed a subdivision bug in the editor's
self-proximity test: a plain right-angle bend passed as two cubics and failed
when the same legs were split into shorter cubics. Closest points constrained to
individual segments were mistaken for a nearby returning part of the cut. For
points within twice the margin along one cut, the checker now requires a local
distance minimum on the whole cut, including both one-sided tangents at a join.
The original distance check still applies to remote returns, and crossings and
distinct-cut proximity have no such exemption. Regression tests include the
identical subdivided right angle and a narrow returning hairpin.

## Paint mask resampling

The same circle that fitted at 240 pixels initially regressed after Paint
resampled it to 400 pixels. Its older pixel steps became 98 traced segments,
producing a 56,400-constraint topology problem that timed out. The common
boundary initializer now tries two larger geometric tolerances on graphs with
over 64 segments. It keeps a smaller graph only below 0.2% disagreement with the
original mask and after a feature-preservation audit. The original target is
unchanged and the normal image, geometry and material gates still apply to the
refined result. The reproduced circle drops to 26 boundary segments.

## Replaying the app

```sh
npm run check
npm run lint
npm test
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  INVERSE_TEST_URL=http://localhost:5200 npm run test:inverse:paint:browser
```

The Paint browser harness exercises actual image upload, automatic cropping,
the built-in star, fresh worker solves, conversion, Draw navigation, editable
SVG export and PDF download. It reads the exported SVG back and checks both
editor geometry and mask disagreement. It supplies no fitted templates or
slit counts to the solver. Set `INVERSE_TEST_BROWSERS` and `INVERSE_TEST_CASES`
to choose replays; reports and screenshots go under `tmp/paint-browser/`.

Port 5200 is a Python static server over this worktree's `build/`. Rebuilding
updates that server's files; a fresh page load is needed to pick up the new
JavaScript. Legacy `/generate/` browser harnesses describe historical tests and
do not test this UI.

The Hunodan speed harness now defaults to `AUTOMATIC_PRESET`, the public
workflow, rather than the internal `DIRECT_PRESET`. The earlier validated
release benchmark explicitly selected `algorithm: auto`; comparing it against
the internal preset initially suggested a quality regression on `hjcur-05`
(1.401% versus 0.943% disagreement). Replaying the public workflow reproduced
the release's 0.943% result. The internal direct route and the public route
have different preparation/timing paths, so their results must not be compared
as an otherwise identical branch change.

## September 8 verification

`npm test` passes **771 tests** (604 application tests and 167 engine tests).
Type checking reports zero errors and seven existing Svelte warnings in
`PaperHeart` and `CategorySection`; lint and the production build pass.

The public-workflow Hunodan replay passes all **22 regular designs**, including
geometry, strict paper-core and substantial-feature checks. Preparation through
export takes **4.19–9.41 seconds**, with a **7.61-second median**, on this
Apple M2 Pro / Node 25.6.1 run. Decoding and the independent export replay are
reported separately. Every independent image error is at or below the validated
release's case-specific error, except `hjfig-02` and `hjfig-04`, which use the
agreed allowance of at most one percentage point for exactly identical sheets.
These are measured local timings, not a bound for every browser or machine.

All **15 production browser replays** pass: star, hat, house, circle and an
automatically cropped Hunodan photo in Chromium 145, Firefox 146 and WebKit 26.
Each freshly exported editable SVG is parsed back and passes Draw's geometry
checks. The star's PDF downloads in all three browsers. The star takes
3.28 / 7.10 / 3.78 seconds respectively, with **0.46% disagreement after editor
conversion** and no crossing warning. The photograph's WebKit replay takes
10.19 seconds; the browser suite does not claim every end-to-end replay is
under ten seconds.

[REDESIGN-VALIDATION.json](REDESIGN-VALIDATION.json) retains the per-case
measurements, browser versions, source hashes, settings and paths to the local
screenshots and exported files. The browser replays exercise the rebuilt site
at port 5200, including the final corner-preservation change.
