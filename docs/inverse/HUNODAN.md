# Hunodan photograph and template benchmark

All 27 source images from https://www.hunodan.dk/julehjerter/julehjerter.html are retained under `scripts/inverse/fixtures/hunodan/`, with source URLs, hashes, and the original index. The user excluded templates with cuts ending inside the paper on 2026-09-07. `scope.json` records the four exclusions; the required set has 23 designs. Exclusion is based on the published cutting template, not a solver failure.

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
