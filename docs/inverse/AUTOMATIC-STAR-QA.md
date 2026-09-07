# Automatic star reconstruction and black crop boxes — 2026-09-07

The user's 22:31 screenshots exposed two separate issues. Both are fixed in the current General workflow. The earlier QA proved that automatic corners appeared, but its full reconstruction diagnostic failed; passing the interaction tests did not establish a successful reconstruction. The new browser regression requires an actual downloadable template pair.

## Black rectangles

The four SVG arcs used `class="outline"`. Tailwind defines that class as a CSS outline, which drew a black rectangle around each arc's SVG bounding box. Those rectangles were display artifacts, not additional proposed crops. Computed browser styles confirmed `rgb(17,17,17) solid 1px` on each arc. The class is now `detected-outline`; the dashed curves remain. A browser assertion checks that crop polylines have no rectangular CSS outline.

Before/after evidence is in `tmp/generator-qa/outline-boxes/`. The same actual image was checked in Chromium, Firefox and WebKit. Commit: `dbd6d5a`.

## Why the correctly located star still failed

The earlier uploaded 528 × 360 photo reproduces the exact message in the screenshot: five start transitions versus four end transitions. The higher-resolution web photo instead produced five versus six. Both automatic crops include a narrow blurred/background fringe at the physical paper edges. The two-colour mask loses alternating strips there.

The previous 1.5 mm border setting samples inward at one to two times that depth and extends the resulting colours through a bounded outer band. On the 360-pixel target it reads rows 5–10; several of those rows still lie inside the contaminated fringe. The genuine five-transition pattern becomes clear farther inward. A 2.5 mm band solves the original crops but still fails the earlier photo after a one-source-pixel horizontal shift. The 3 mm band recovers five transitions on every edge for both photos and all 18 tested variants.

The General and Simplify defaults now use 3 mm. This is a change to the existing preprocessing allowance, not a new fitting algorithm. The setting remains visible, adjustable and disableable. The displayed corners, input pixels and original classified crop are preserved. Border changes are recorded in the report, and the export gate still compares the reconstructed weave with the **unedited** classified crop using the same 3% limit. Geometry and strict paper checks remain enabled. The direct fitting target is unaffected by border preprocessing.

The synthetic regression supplies a known six-strip checkerboard with a 2.4 mm light-background fringe. At 256, 360 and 400 pixels, the earlier shallow setting loses endpoints; the current photo preset restores the original mask exactly without modifying the supplied input. Existing tests still check colour inversion, bounded edits, explicit disabling and preservation of real narrow strips. Implementation and repeatable QA: `918bd06`.

## Full browser verification

Both original source photos passed in **Chromium, Firefox and WebKit**, using fresh uploads, automatic corners and the default General settings, including the 60-second search budget and twelve perturbation trials. No manual corners, crop inset, saved solution, solver response or target mask was injected.

| Source photo | Slits per sheet | Independent disagreement with original classified automatic crop |
| --- | ---: | ---: |
| Earlier uploaded photo | 5 | 2.430% in all three engines |
| Higher-resolution web photo | 5 | 2.394–2.396% |

All six downloaded ZIPs contain newly solved templates with passing geometry and paper audits. The tests parse the downloaded curves and render them independently with resvg against the actual browser-decoded input. They also verify that crop coordinates remain unchanged and inspect the woven preview, both cutting-template views and paper-support view. Original cutting paths and physical assembly are not known.

The automatic-star suite passed **30 browser checks**. The broader generator suite passed its **63 checks** again in all three engines, including upload failures, cancellation, manual tools, mobile layout, both languages, General/direct solves and worker recovery. That is **93 checks in this follow-up**, not an accumulation of earlier replays. Automated tests passed **236/236** (127 website/worker, 109 engine/integration). Type checking found zero errors and eight existing accessibility warnings; lint and the production build passed.

Evidence directories under `tmp/inverse-browser/`:

- `2026-09-07T20-43-26-732Z-automatic-star` — Chromium, both photos.
- `2026-09-07T20-43-26-727Z-automatic-star` — Firefox, both photos.
- `2026-09-07T20-43-26-724Z-automatic-star` — WebKit, both photos.
- `2026-09-07T20-43-26-724Z-generator-qa` — broader generator regression.

## Perturbations still expose search failures

`scripts/inverse/automatic-star-benchmark.mjs` tests each photo unchanged, with crop translations of ±1 source pixel in both axes, RGB brightness changes of ±8, JPEG quality 75, and half-resolution resizing. Compression/brightness/resizing cases rerun automatic detection. All comparisons use each variant's unedited classified crop. The search budget is 30 seconds with zero cutting-perturbation trials; this differs from the browser's defaults.

The result is **13 accepted pairs out of 18 attempts**. The earlier photo passes unchanged and with all six crop/brightness perturbations. Its JPEG version reaches the solver's round limit, and its half-resolution version exceeds the candidate-graph size limit. For the larger photo, shifting right/up or brightening reaches the time limit; the other six variants pass. All 18 now have consistent border counts. The five remaining failures are therefore tracing/routing/search failures, rather than the original endpoint-count rejection. These are two motifs, not an improved score on the separate 31-heart benchmark.

All seven historical manually cropped yellow-star perturbations also passed again. Local evidence: `tmp/inverse-automatic-star/2026-09-07T20-40-23-220Z/` and `tmp/inverse-yellow-star/2026-09-07T20-40-24-543Z/`. Earlier diagnostic radii and every failed attempt remain under `tmp/generator-qa/star-boundary/`.

```sh
npm run benchmark:inverse:automatic-star
# After building and starting a fresh preview:
INVERSE_TEST_URL=http://127.0.0.1:4174 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:automatic-star:browser
```

The earlier uploaded photo is the existing committed fixture; the web photo is an optional local source. The browser test supports `INVERSE_TEST_BROWSERS` and `INVERSE_QA_YELLOW`. Local screenshots and downloaded test ZIPs remain ignored. `AUTOMATIC-STAR-VALIDATION.json` records exact evidence paths, hashes, checks and unresolved failures.
