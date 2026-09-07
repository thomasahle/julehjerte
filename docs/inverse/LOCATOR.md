# Motif locator integration — 2026-09-07

The `juleflet-motif-locator.zip` addendum is integrated into the existing Danish and English generator. Its four dependency-free JavaScript modules are integrated in `static/inverse/locator/`, alongside a locally added adaptive palette model. The rectifier accepts both clockwise and counterclockwise convex corner selections. The original red/white path is retained; the adaptive fallback fits two coloured papers on a plain background and allows independent lobe depths. The original notice remains alongside them. The previous experimental collage detector is not shipped.

Upload an upright heart to get an initial corner fit, including when the photograph itself is square. For a collage, choose **Select one heart** and drag a rough rectangle around the entire heart, including the lobes and tip. The locator fits the lower paper edges and projective lobes; it returns the overlap quadrilateral, not the full-heart bounding rectangle. It can decline a crop or mark it for review. It does not automatically enumerate hearts in a collage, infer hidden corners reliably, or support every paper/background combination. **Place corners** explicitly switches to manual placement. A failed refinement preserves existing complete corners; a failed initial fit leaves an operable manual tool. See [GENERATOR-QA.md](GENERATOR-QA.md) for the reported yellow-star regression and remaining limitations.

The user can select corners around the perimeter in either direction, drag each numbered corner or edit its coordinates. The preview preserves the supplied image orientation and agrees with preprocessing for both directions. Crossed, concave, incomplete and degenerate selections remain invalid. An unmodified, rectified source-photo preview updates with the corners, before classification or tracing. Invalid quadrilaterals clear that preview. Clearing a numeric coordinate also invalidates the actual crop; it does not keep a hidden stale coordinate. Reset returns to manual placement. Preparing the artwork accepts the displayed crop; changing it invalidates prepared geometry and exports. There is no extra approval dialog.

The source archive's locator uses pixel-centre coordinates while the inverse engine uses pixel-edge coordinates. The adapter adds 0.5 pixels when passing corners to preprocessing and subtracts it for the original-photo preview. A numerical test checks both rectifiers against the same perspective crop to within one colour-channel rounding unit. Source file and decoded-pixel SHA-256 hashes, dimensions, rough region, proposed corners, locator evidence/warnings, manual-edit state and accepted corners are carried into `report.json` through `report.input.sourceImage.cropProvenance`. Reports preserve provenance, not the complete original photo; retain the source file for reproducibility.

## Validation

The supplied archive's integrity tool verified all 165 payload files. Its own 66 tests passed locally, including 32 known-homography analytic fixtures and the JUL/checkerboard discrimination regression. These are development fixtures, not held-out real-photo accuracy measurements. Four compact synthetic fixtures are retained in this repository: clean, blurred/uneven lighting, handle, and occlusion. The integrated suite adds tests for ROI selection, malformed regions, blank/transparent images, rectifier agreement, fitting from a rough region recovered from existing corners, and provenance retention. User photographs are not redistributed.

The production browser test runs over actual HTTP with the real worker in Chromium and Firefox. It checks automatic fitting, a rectangle selecting the second heart in a scene, numeric and pointer edits, preview pixels, source hashes, invalidation and mobile layout. Optional local-photo checks verify that the sRGB collage decodes to exactly the same RGBA bytes used by the benchmark. See `VALIDATION.json` for fresh results and evidence paths.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/inverse/locator-browser-test.mjs
# Include the user's local collage:
INVERSE_TEST_COLLAGE=1 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/inverse/locator-browser-test.mjs
```

## All 40 hearts in the supplied collage

The source is the user's 1482 × 1112 screenshot, preserved locally. It differs in size/pixels from the addendum's 1536 × 1157 photo; their coordinates are not interchangeable. The screenshot's embedded ICC profile was converted to sRGB with Pillow ImageCms, and the normalized PNG and its exact RGBA bytes are separately hashed. Original bytes remain intact.

`scripts/inverse/collage-rois.json` contains all 40 identifiable instances, in five rows of eight, including 16 marked as clipped by the source frame. The rectangles are rough selections derived from the earlier instance inventory, not annotated overlap-corner ground truth. The locator receives only those rectangles. The user rejected the earlier manually estimated quadrilaterals, so runs using those coordinates are historical experiments and must not be represented as localization accuracy or used for a direct success-rate comparison.

Fresh evidence:

- Locator: `tmp/inverse-locator/2026-09-07T12-58-06-522Z/results.json`, with `outlines.png`, `contact-sheet.png` and every proposed crop.
- Reconstruction: `tmp/inverse-locator/2026-09-07T13-06-20-582Z-reconstruction/results.json`, including every attempted preset and all 40 entries.

| Outcome | Count |
| --- | ---: |
| Corner proposal | 29/40 |
| Proposal marked `needs_review` | 28/29 |
| Proposal marked `candidate` | 1/29 |
| No usable corner proposal | 11/40 |
| Pair passing numerical geometry, strict paper checks and ≤5% independent image error | 1/40 |

These proposal counts are **not corner-accuracy measurements**. Visual inspection still shows incorrect perspective fits, notably the gift and jigsaw. The single numerical reconstruction is the white-birds motif, using the simplified preset, with 2.514375% mismatch against the unedited classified crop. Its crop remains unreviewed, so this is a provisional pair, not a confirmed physical reconstruction. No claim of 100% recovery is supported.

Both detailed and simplified tracing presets were attempted for every proposal with 100 mm overlap, 400-pixel tracing, a 1 mm border band, five-second routing budget, strict paper checks, no hidden rounding and zero cutting-perturbation trials. Most failures are inconsistent opposite-border endpoint counts and occur before the routing time limit matters. The independent renderer uses exported cubic control points and resvg; out-of-frame samples are excluded from error and observed coverage is recorded. Missing/cropped hearts remain in the overall denominator. This does not infer their hidden content.

```sh
npm run benchmark:inverse:locator
INVERSE_LOCATOR_RUN=tmp/inverse-locator/<run>/results.json npm run benchmark:inverse:located-photos
```

These commands require the locally retained source files listed in `collage-rois.json`. Each run creates a new directory and records code/input hashes. The bounded interpretation-search and relaxed-routing prototypes were archived locally; they are not exposed in the web application. The tracing presets still treat traced visible edges as constraints. The optional **Fit curves to image** preset now fits independent sheet curves directly; see [DIRECT-FITTER.md](DIRECT-FITTER.md) for its separate 31-case benchmark. The 40-case reconstruction results above remain historical tracing results.
