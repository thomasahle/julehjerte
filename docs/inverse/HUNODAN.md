# Hunodan photograph and template benchmark

All 27 source images from https://www.hunodan.dk/julehjerter/julehjerter.html are retained under `scripts/inverse/fixtures/hunodan/`, with source URLs, hashes, and the original index. The user excluded templates with cuts ending inside the paper on 2026-09-07. `scope.json` records the five exclusions; the required set has 22 designs. Exclusion is based on the published cutting template, not a solver failure.

Run `node scripts/inverse/hunodan-corpus.mjs` to isolate photographs and propose overlap corners. Pass its emitted `cases.json` as `INVERSE_HUNODAN_CASES` to `node scripts/inverse/hunodan-benchmark.mjs`. The benchmark reads only those photographs and fixed crop proposals. The printed reference templates are not solver inputs. `INVERSE_HUNODAN_METHOD` selects `general`, `simplified`, or `direct`; `INVERSE_HUNODAN_SECONDS` selects the search budget; `INVERSE_HUNODAN_IDS` optionally selects a comma-separated subset. Intermediate results are saved after every case.

The current benchmark acceptance gate requires the app's geometry and paper checks plus at most 3% disagreement when a separate renderer reads the exported cutting geometry and compares its weave with the classified photographic crop. This is photographic agreement, not yet a verified template-geometry score. Reference-template fidelity must be assessed separately; a low photo error alone does not establish it.

## Crop diagnosis

The initial locator found 26 of the 27 photographs. `hjcur-02` has cream and green paper on white. The adaptive palette mask discarded low-chroma cream paper as background, so it could not identify both paper populations. A fallback lowers the chroma threshold only after the existing locator attempts fail, then applies the same full-heart outline, lobe-colour and lower-edge support checks. It does not change the uploaded pixels or force a proposal through the support gate.

The revised corpus pass proposes all 27 crops, retaining review statuses and corner provenance. All 23 locator regression tests pass, including a new synthetic cream/green case and the original Hunodan photo. Existing blank-image, non-heart-shape, multi-heart, known-homography, alpha and resampling checks remain covered.

Initial local artifacts: `tmp/inverse-hunodan/2026-09-07T21-18-03-265Z-crops/`. Revised crop replay: `tmp/inverse-hunodan/2026-09-07T21-32-32-000Z-crops/`. These are local generated artifacts, not public site assets.

## Coordinated initialization

The initial direct fitter passed 15 of the 23 regular cases. Eight failed: one missing crop and seven reconstructions above the unchanged 3% image-error limit. Recorded baseline and targeted results are in `HUNODAN-BASELINE.json`.

The revised initializer combines uniform grids, soft endpoint proposals from several inset border bands, and independent nonuniform straight-strip profiles. It then alternates sheet updates: an exact row dynamic program moves all transitions in a row together, followed by a smooth spline projection. Gradient refinement, geometry validation, paper checks and independent export rendering remain in place. Neither initialization nor fitting loads reference templates or per-case slit counts.

This addresses an initialization failure: uniformly spaced starts can strand a narrow cluster of cuts in the wrong part of the photograph. More local gradient steps then refine the wrong layout. Border evidence is useful for proposing spacing, but must remain optional; for the sixth-order curved grid, a uniform coordinated proposal performed better than the border proposal.

A targeted 30-second-per-case replay recovered all eight baseline failures with independently measured errors of 0.57–2.31%. All ten cases in that replay also recovered the published full-slit counts, as checked separately against reference drawings. This is not yet a complete fresh-run score or an exact curve-agreement claim. The full replay remains in progress.

All 245 unit/inverse tests pass, including exhaustive verification of the row dynamic program against every feasible segmentation on small rows, a nonuniform unequal-strip image fixture, and the existing gradient/geometry tests. Type checking and production build pass.

Reference review identified `hjhih-03` as another partial-slit design (two shoulder endpoints, four fold endpoints). It is excluded under the user's rule even though it passed the initial image test. Reference rectangles and counts are recorded separately in `references.json`. The second flag also includes a semicircular cutout; its full-slit counts alone cannot establish fidelity of that detail.

## Full replay and browser discrepancy

The fresh complete direct-fit replay (`2026-09-07T21-39-25-167Z-direct`) passed **23/23** with a 30-second search budget per photograph, 0.39–2.63% independent image error (median 0.74%), and all published full-slit counts. Source hashes and per-case reports are retained in `HUNODAN-VALIDATION.json`. All crop proposals were automatic and fixed during fitting.

This numerical score does not complete QA. The production-browser run found that Firefox fails the first flag at both 30 seconds (3.89% reported image error) and 60 seconds (3.53%). Chromium passes at 30 seconds. The 60-second Firefox run has **identical crop coordinates and matching coarse/fine fitting errors** to Node. The divergence starts in clearance/refinement: more clearance iterations choose a different downstream starting shape. This is a search-robustness issue, not evidence of a crop failure. The failure and screenshots are retained; investigating it is ongoing.

Reference overlays reveal concealed-cut routing differences despite low photo error. The Greenland flag additionally uses an internal semicircular cutout; its full-slit count and low global image error do not establish recovery of that detail. It remains included pending the user's clarification about the irregular-pattern exception.

A Node replay at 60 seconds reproduces the flag regression (3.52% independent difference). The issue is therefore reproducible within one engine by changing the budget. The solver currently selects one clearance checkpoint before free refinement; later checkpoints can enter a worse local solution even when their initial pixel error is slightly lower. Preserving alternate clearance candidates is being investigated.

The 30-second production-browser replay passes all three representative cases in Chromium, and the cream/green and dense curved cases in both Firefox and WebKit. Both latter engines fail the flag. The original browser harness waited only for a successful heading, so its 180-second observation timeouts must not be described as solver timeouts: the app had already returned a draft. The harness now records draft reports immediately. `HUNODAN-BROWSER-VALIDATION.json` preserves these failures and the successful direct-worker/cancellation checks.

The independent-profile initializer now computes each fixed row parity once per update instead of allocating and filtering an array for every pixel. Six old/new replays produced exactly identical scalar control coordinates while reducing those initialization calls from 12–33 ms to 3–10 ms in Node. The numerical algorithm is unchanged; timing-sensitive end-to-end replay remains necessary.

The user did not reply to the optional scope clarification during ongoing work. As stated to the user, the Greenland flag’s separate internal cutout is treated under the irregular/interior-cut exception. The required set is now 22 designs. It remains in the source corpus, reference report, and auxiliary results; the preceding 23-case numerical score is retained rather than recomputed to hide it.

## Fixes from browser QA

Two additional initialization problems were identified:

1. The optimizer first reduced the original mask to 256 pixels, then reduced that result to the 96-pixel grid and 64-pixel strip-profile scales. Chained area resampling differs from directly resampling the source, especially for narrow strips and junctions. Each fitting scale now comes directly from the original classified input. The free-curve stage still uses its bounded working resolution; the acceptance metric still uses the untouched original mask. This reduced the first flag's targeted independent error to approximately 1.35%, and its 30-second replay now passes in Chromium, Firefox and WebKit.
2. A shared deadline inside initial-grid generation could leave later count/phase proposals uninitialized. A 60-second Firefox report exposes the failure directly: the correct four-slit phase had **zero initialization steps**, while the opposite phase survived and was refined. Every count/phase now completes the small fixed-size initializer before timed gradient search. Initialization rounds are reported for each candidate. The six-second noisy-checker regression verifies all 16 equal-count/phase proposals completed their 18 rounds. Redundant full-resolution scoring inside this preparation stage was removed; candidate ranking still uses the same bounded working-resolution mask.

The previous budget/clearance investigation is retained above because it describes real failed outputs; simply replacing the clearance stage's iteration limit with 300, 400, 500 or 600 steps did not fix the flag. The resampling and candidate-starvation fixes address the earlier divergence instead. The final complete corpus and browser replays are still being run.
