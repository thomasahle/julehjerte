# Image-to-template integration

The engine runs in the editor's paint mode, `/editor/mal/` and `/en/editor/paint/` — see [../redesign/PAINT.md](../redesign/PAINT.md). The visitor paints or imports a two-colour mask of the woven square, and "Find snit" asks the engine for the cuts that weave it. The standalone `/generate/` page this integration was first built for has been retired; everything below it — the worker bridge in `src/lib/inverse/client.ts`, the presets, and the vendored engine under `static/inverse/` — is unchanged and is what paint mode uses. The notes below still describe that page's controls where they explain how the engine behaves.

The feature imports the recovered JavaScript engine from `juleflet-codex-handoff.zip`. It is experimental: it can find checked template pairs for simple artwork, but it is not a completed reconstruction of the published gallery. The Star button now prepares an image for a fresh inverse solve using the explicit matching-sheet preset. Its cuts are compared against the published template; see [REFERENCE-QUALITY.md](REFERENCE-QUALITY.md). JUL still audits saved geometry. The 38-design blind raster benchmark achieves reference-quality matches for 11 designs across two presets; the sanitized visible-vector track and broader reconstruction work remain unfinished. No physical paper assembly has been tested.

The new motif-locator addendum provides automatic single-heart fitting, rough rectangle selection in collages, draggable corners and an original-photo preview. See [LOCATOR.md](LOCATOR.md) for integration details and the full 40-heart benchmark: 29 proposals, 11 unresolved crops, and one provisional numerical reconstruction.

Example buttons now perform a visible action immediately: Waves and Star prepare editable pattern previews, while JUL runs a saved-template check. On mobile, the preview scrolls into view. Examples clear the prior upload and its error state; failed example requests clear stale exports and permit retry.

The photographic recrop handoff adds an explicit red/white mixture conversion and a direct JavaScript Bézier fitter. **Fit curves to image** produces 11 accepted pairs among the same 31 fully visible motifs, versus 3 with tracing at the same 60-second budget. Twenty perturbations retain accepted exports, but five change slit counts. See [DIRECT-FITTER.md](DIRECT-FITTER.md) for crop/colour comparisons, remaining visual defects and root-cause experiments; [PHOTO-RECROPS.md](PHOTO-RECROPS.md) records the earlier archive validation.

## Runtime and changes

- `static/inverse/core/` contains the recovered numerical modules. Keeping their relative URLs intact also preserves the pinned HiGHS wrapper/WASM pairing. The build copies these assets verbatim; SSR never imports the engine or initializes WASM.
- `static/inverse/worker-bootstrap.js` and `worker.js` run preparation, inverse solving, saved-template audits and ZIP creation away from the main thread. Cancellation terminates the worker; another preparation creates a fresh one.
- `src/lib/inverse/client.ts` owns the worker lifecycle and rejects stale replies. The Svelte page clears prepared artwork and downloads whenever settings, colours or input change.
- SVG previews are generated from numerical geometry and displayed as blob-backed images. Uploaded SVG markup is never inserted into the document. PNG/JPEG/WebP decoding and all artwork processing stay in the browser.
- The general preset retains the original routing and manufacturing constraints. The matching-sheet preset adds border-inferred mid-curve portals and corner candidates, with compact turn costs and an original-image fidelity gate in both profiles. Core fixes cover SVG inversion, limiting tracing resolution to the source image size (with the existing 32-pixel minimum), consistent pixel-edge coordinates for photo crops, and an explicit reason when a search ends without a validated solution (`time_limit`, `candidate_graph_exhausted`, or `round_limit`). Exhausting the finite candidate graph does not prove a design impossible.
- Raster corner detection now requires a turn to persist across a physical neighbourhood, preventing tiny pixel stairs from pinning artificial corners. Cubic fitting refines point parameters before subdividing while retaining the existing fit acceptance checks. If refinement fails, subdivision uses the original error distribution. Numerical regressions cover smooth bends and intentional right angles.
- Raster crop borders use a 3 mm band in the General and Simplify presets of inward-profile consensus to reduce false slit endpoints. The earlier 1.5 mm default sampled inside the photographed background fringe on automatic star crops; [AUTOMATIC-STAR-QA.md](AUTOMATIC-STAR-QA.md) records the diagnosis and complete browser reconstruction checks. Set **Stabilize crop border** to zero to disable it. The original classified crop is retained for the binary-mask view and result image-error measurement. See [ROBUSTNESS.md](ROBUSTNESS.md) for the algorithm, the bell perturbation tests and 19 cropped collage cases.
- Image conversion exposes the recovered engine's nearby-junction merging in millimetres. It joins compatible opposed corners, skips unrelated corners and records each repair in the report. The optional **Simplify traced artwork** action reprepares with a 0.75 mm fitting tolerance, 0.3 mm smoothing radius, 1.5 mm junction-merge radius and 30 mm maximum segment length. Detailed defaults remain 0.5 / 0 / 0 / 15 mm. Simplification changes the target artwork: inspect the preview, changed-pixel fraction and component warnings before generating.
- Worker integration additionally clears stale prepared geometry before attempting another preparation and stores the latest result for ZIP export. Template files are still withheld on failed or uncertain strict paper checks; diagnostic files can be downloaded.

The initial real-browser test exposed a small raster regression in the recovered engine: enlarging a 64-pixel checkerboard to the default 400-pixel trace grid changed 24 visible chains into 26 and made the finite routing model infeasible. Tracing at the source resolution retains all four-way junctions, changes zero sampled pixels and produces a validated 3 + 3 slit pair. A second regression fixes the half-pixel offset between an uncropped square and selecting its four outer corners. Both have numerical regressions; the failed browser run is retained with subsequent runs.

Paper width, strip width, kerf, fitting tolerance and cutting allowances use millimetres. Input classification colours are separate from output paper colours. Paper A is the site's right paper and paper B is its left paper. Printable SVGs retain physical dimensions and a 20 mm scale line; the downloadable HTML lays out both pages at actual size. Reports and embedded print instructions remain in English, with Danish/English page instructions.

No source gallery SVGs, editor routes, homepage layout, domain settings or existing licence files were replaced. The optional matching-sheet preset has separately stated sharp-corner constraints. The Python reference, historical release archives and historical generated outputs are not shipped to visitors.

## Validation

The September 7 evening corner-detector and generator QA is recorded in [GENERATOR-QA.md](GENERATOR-QA.md). It includes the reported yellow/gold photo, adaptive palette/lobe fitting, manual-tool recovery, 235 automated tests and 113 actual browser checks. The extended generator suite runs in Chromium, Firefox and WebKit; locator, example and direct-fit regression suites additionally run in Chromium and Firefox. Photo proposal counts and reconstruction quality are reported separately.

```sh
npm run check
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

`npm test` runs the existing website suite, new worker lifecycle regressions, the 48 imported numerical tests and new integration regressions. This also makes the engine suite part of the existing Pages CI test step.

For actual browser/Worker/WASM checks, install Playwright separately (or use an existing installation):

```sh
npm install --prefix /tmp/juleflet-browser playwright@1.58.2
/tmp/juleflet-browser/node_modules/.bin/playwright install chromium firefox
PLAYWRIGHT_MODULE=/tmp/juleflet-browser/node_modules/playwright/index.mjs npm run test:inverse:browser
```

The browser test defaults to Chromium and Firefox against `http://127.0.0.1:4173`. Override with `INVERSE_TEST_URL` and `INVERSE_TEST_BROWSERS` (comma-separated `chromium,firefox,webkit`). It uses real HTTP assets and no solver fixture injection. It checks both languages, fresh SVG and PNG solves, file/ZIP/print export, four-corner cropping, the simplification preset, cancellation/restart, saved-template audit labelling, rejection of active SVG, explicit timeouts, responsive layout and existing gallery/editor navigation. Each run preserves reports, downloads, screenshots and failures under a fresh `tmp/inverse-browser/<run-id>/` directory. External analytics and the GitHub star widget are blocked during these tests. Restart the preview server after rebuilding so its cached asset manifest matches the new files.

The imported test counts are engineering regressions, not counts of successfully reconstructed gallery designs. `PROVENANCE.json` records the source archive and original/integrated asset hashes. `VALIDATION.json` records this integration's checks and browser evidence.

## Photo comparisons

`npm run benchmark:inverse:photos` downloads seven finished-heart photos from the two sites suggested during testing and compares the detailed and simplified presets. `scripts/inverse/photo-cases.json` records source URLs, manually selected corners and small crop insets used to exclude outer paper/background fringes. Both presets receive the same effective crop. No cutting templates are inputs. Runs preserve original photo hashes, effective crops, engine hashes, settings, target previews, successful exports and every failure in a fresh `tmp/inverse-photo-benchmark/<run-id>/` directory. Photos are local test material and are not bundled into the public site.

The initial recorded run below predates crop-border stabilization. It uses a five-second solver budget, 100 mm overlap, 400-pixel tracing, strict material checks, no hidden-cut rounding and zero perturbation trials. `INVERSE_PHOTO_SECONDS` changes the budget. Times below include preparation and checks, so they can exceed the solver budget. The current script explicitly enables the 1 mm border band; its later run and outcomes are recorded in `VALIDATION.json`.

| Photo | Detailed segments / result | Simplified segments / result |
| --- | --- | --- |
| Eight-point star | 53 / checked, 4.63 s | 27 / checked, 2.78 s |
| Curved star | 115 / timed out, 5.28 s | 70 / checked, 1.43 s |
| Outline star | 92 / candidate graph exhausted | 58 / candidate graph exhausted |
| Cross | 48 / checked, 4.33 s | 24 / checked, 1.79 s |
| Puppy | 79 / opposite-border counts disagree | 47 / opposite-border counts disagree |
| Stonehenge | 155 / opposite-border counts disagree | 99 / opposite-border counts disagree |
| Viking ship | 141 / candidate graph exhausted | 80 / candidate graph exhausted |

This was three checked pairs out of seven with simplification versus two with detailed tracing, under the stated settings. For the curved star, simplification merged eight nearby junctions and increased the sampled tracing-change fraction from 1.20% to 2.43%. These checks concern the processed target and numerical paper constraints, not fidelity to the authors' cutting templates, physical assembly or the entire source galleries. Later work adds a clean bell image and 19 manually cropped cases from the newer Pinterest screenshot; their source uncertainty, outcomes and remaining failures are described in [ROBUSTNESS.md](ROBUSTNESS.md). `REFERENCE_IMAGES.json` identifies the user-supplied references without redistributing them.

## Deployment and rollback

This change is on `codex/integrate-juleflet`; it has not been pushed or deployed. The current repository uses Node 22 in `.github/workflows/deploy.yml`. Its existing pipeline checks, lints, tests and builds before publishing `build/` to GitHub Pages on pushes to `main`.

After review, merge the feature branch through the normal repository process. Check the Pages workflow, then verify `/generate/`, `/en/generate/` and `/inverse/vendor/highs.wasm` on juleflet.dk and run a fresh solve. The last pre-integration commit is recorded in `PROVENANCE.json`. Rollback consists of reverting the integration commit(s) on `main` and letting the same workflow redeploy. No DNS or credential changes are needed.

## Attribution

The website's existing `LICENSE` contains GPL-3 text while its README says MIT. This integration preserves both existing files and does not resolve that pre-existing discrepancy or relicense the site. Imported application code retains `static/inverse/LICENSE.txt`; solver notices and binary provenance remain beside the vendored solver. `static/inverse/THIRD_PARTY_NOTICES.txt` is the original notice (its `site/` references describe the source archive). `HANDOFF_ATTRIBUTION.md` preserves the original handoff attribution text; its relative paths refer to that archive. Example artwork retains its original rights and is not assigned the software licence.
