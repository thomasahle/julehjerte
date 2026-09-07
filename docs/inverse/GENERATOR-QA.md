# Generator and automatic-crop QA — 2026-09-07 evening

The reported yellow/gold star now produces four editable overlap corners on upload. The original detector assumed red/white paper, so it found no usable foreground. A palette fallback alone was insufficient: the photograph's lobes are deeper than the fixed semicircles in the supplied model, which pulled the estimated overlap corners away from the motif.

The supplemental model estimates a plain background and two paper colours, then fits independent lobe depths together with the overlap geometry. It uses the outer foreground outline rather than interior motif boundaries to measure lobe support. Unsupported shapes are rejected. Among candidate fits it prefers those that explain both lobes and their colours; this fixes a resampling failure where a slightly lower image objective displaced a valid alternative. Input pixels remain unchanged, and proposals retain their review status and diagnostic evidence.

Additional user-flow fixes:

- Square photographs also receive automatic detection. A square artwork with no detected heart remains usable as a whole image; bundled examples keep their existing direct preparation flow.
- **Place corners** explicitly enters manual mode. Failed initial detection no longer leaves rectangle selection active while asking the user to click corners. Failed refinement preserves complete user edits.
- Clearing a coordinate invalidates the crop, preview, prepared artwork and downloads. Re-entering it restores preparation. Whole-image mode hides the unused crop overlay.
- Cancellation, failed uploads, worker failures and footer-colour changes recover with a fresh worker and no stale results.

## Verification

The final production build passed 235 automated tests: 127 website/worker tests and 108 engine/integration tests. The crop suite contains 21 tests, including known-corner fixtures for four coloured palettes, unequal lobe depths, transparent backgrounds, odd-size resampling, non-heart negative controls and tiny square artwork. Type checking reported zero errors and eight pre-existing `PaperHeart.svelte` accessibility warnings. Lint and the static build passed.

All 113 checks in the following actual-browser runs passed without page errors. The tests use HTTP assets, real workers and real WASM; exported curves are independently rasterized with resvg where a solve is checked.

| Suite | Engines | Checks | Local evidence directory under `tmp/inverse-browser/` |
| --- | --- | ---: | --- |
| Generator QA | Chromium, Firefox, WebKit | 63 | `2026-09-07T19-58-04-083Z-generator-qa` |
| Locator, including actual collage | Chromium, Firefox | 14 | `2026-09-07T19-58-04-085Z-locator` |
| Example buttons and recovery | Chromium, Firefox | 22 | `2026-09-07T19-58-04-082Z-examples` |
| Direct fitting and export fidelity | Chromium, Firefox | 14 | `2026-09-07T19-58-04-085Z-direct` |

Coverage includes the actual yellow-star photo, file/decode/size failures, malformed template JSON, crossed and incomplete quads, numeric and pointer edits, crop/solve cancellation, worker bootstrap failure and retry, settings invalidation, downloads, mobile width, both languages, General and direct solves, and every example button. Photos and screenshots remain in ignored local evidence directories.

```sh
npm test
npm run check
npm run lint
npm run build
# Start a fresh preview after building; keep it unchanged throughout these tests.
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
INVERSE_TEST_URL=http://127.0.0.1:4174 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:generator:browser
INVERSE_TEST_URL=http://127.0.0.1:4174 INVERSE_TEST_COLLAGE=1 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:locator:browser
INVERSE_TEST_URL=http://127.0.0.1:4174 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:examples:browser
INVERSE_TEST_URL=http://127.0.0.1:4174 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:direct:browser
node scripts/inverse/palette-photo-benchmark.mjs
```

The generator suite defaults to all three engines; `INVERSE_QA_BROWSERS` overrides this. The real yellow photo is optional when running outside this workspace; `INVERSE_QA_YELLOW` supplies its path. Photo benchmarks require the locally retained sources listed in `scripts/inverse/photo-cases.json`. No browser access from the user was required: standalone Playwright engines were available. The in-app browser connection was unavailable.

## Photo coverage and remaining issues

Seven individual photos were tested unchanged, with a rough selection, with JPEG quality 75 compression, and at half resolution. The rough selection uses only a rectangle derived from the earlier visual guide; guide corners are not fitting controls or ground truth. Each original file and the tested decoded pixels are hashed. Evidence and an annotated contact sheet are in `tmp/inverse-palette/2026-09-07T19-56-37-476Z/`.

| Photo | Proposals / 4 variants | Maximum corner movement from full-size automatic fit, in source pixels |
| --- | ---: | ---: |
| Eight-point star | 4 | 7.98 |
| Yellow curved star | 4 | 5.11 |
| Blue/white outline star | 0 | — |
| Cross | 4 | 2.10 |
| Puppy | 4 | 1.71 |
| Stonehenge | 4 | 6.09 |
| Viking ship | 4 | 55.25 |

These are **24/28 available proposals, not 24 accurate crops or reconstructed hearts**. The outline star's white paper blends with its white background; manual placement remains necessary. The Viking half-resolution result shifts the upper/side corners visibly and remains `needs_review`. Compression, downsampling and foreground-edge interpretation still affect localization. The Stonehenge half-resolution failure encountered during development is covered by the support-aware selection fix; the rejected run remains under `tmp/inverse-palette/2026-09-07T19-52-00-536Z/`.

Replaying the unchanged red/white locator path on the original 40-heart collage still produced 29 proposals, the same count as its earlier run. This checks proposal coverage for that path, not accuracy or the adaptive fallback's full collage coverage. Evidence: `tmp/inverse-locator/2026-09-07T19-47-53-948Z/`. The earlier 31-heart direct-fitter reconstruction benchmark was not rerun by this crop/UI change.

## The yellow star: locating and reconstructing are separate checks

The photo's automatic corners, in pixel-edge coordinates, are approximately `(517.3,140.6), (757.0,367.2), (507.8,615.7), (282.1,367.1)`. Both lobe support scores exceed 0.94, but median outline residuals of roughly 4.6 and 5.8 source pixels keep the fit marked for review. The preview and editable coordinates were checked in all three browser engines.

The unadjusted automatic crop was also passed through all three solver presets with a 60-second budget. General tracing fails before search because one sheet has five start transitions and six end transitions. Matching sheets rejects diagonal asymmetry. Direct fitting returns five slits per sheet, passes geometry and paper-core checks, but has **3.73% independently rendered image disagreement**, exceeding the unchanged 3% export threshold; templates are correctly withheld. Evidence: `tmp/generator-qa/yellow-solve/`.

A separate diagnostic inset both sides of the automatic crop by 1% or 2% of its width, retaining all other General settings and a 10-second budget. These yielded accepted five-slit pairs with 1.68% and 1.35% independent disagreement against their respective cropped targets. Using the old visual guide, with or without its historical 4% inset, failed at that budget. Evidence: `tmp/generator-qa/yellow-crop-sensitivity/`.

This isolates sensitivity to a narrow photographed border as a cause of the General preset's endpoint failure. It does **not** establish that an inset recovers the original full motif, and these insets are not silently applied in the app. Better crop detection alone does not resolve all boundary-classification and inverse-fitting failures. The historical manually cropped yellow-star success in `YELLOW-STAR.md` concerns a different recorded crop; it should not be used to claim that every automatic crop reconstructs successfully.
