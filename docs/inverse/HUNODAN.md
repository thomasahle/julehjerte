# Hunodan photograph and template benchmark

All 27 source images from https://www.hunodan.dk/julehjerter/julehjerter.html are retained under `scripts/inverse/fixtures/hunodan/`, with source URLs, hashes, and the original index. The user excluded templates with cuts ending inside the paper on 2026-09-07. `scope.json` records those three exclusions; the required set has 24 designs. Exclusion is based on the published cutting template, not a solver failure.

Run `node scripts/inverse/hunodan-corpus.mjs` to isolate photographs and propose overlap corners. Pass its emitted `cases.json` as `INVERSE_HUNODAN_CASES` to `node scripts/inverse/hunodan-benchmark.mjs`. The benchmark reads only those photographs and fixed crop proposals. The printed reference templates are not solver inputs. `INVERSE_HUNODAN_METHOD` selects `general`, `simplified`, or `direct`; `INVERSE_HUNODAN_SECONDS` selects the search budget; `INVERSE_HUNODAN_IDS` optionally selects a comma-separated subset. Intermediate results are saved after every case.

The current benchmark acceptance gate requires the app's geometry and paper checks plus at most 3% disagreement when a separate renderer reads the exported cutting geometry and compares its weave with the classified photographic crop. This is photographic agreement, not yet a verified template-geometry score. Reference-template fidelity must be assessed separately; a low photo error alone does not establish it.

## Crop diagnosis

The initial locator found 26 of the 27 photographs. `hjcur-02` has cream and green paper on white. The adaptive palette mask discarded low-chroma cream paper as background, so it could not identify both paper populations. A fallback lowers the chroma threshold only after the existing locator attempts fail, then applies the same full-heart outline, lobe-colour and lower-edge support checks. It does not change the uploaded pixels or force a proposal through the support gate.

The revised corpus pass proposes all 27 crops, retaining review statuses and corner provenance. All 23 locator regression tests pass, including a new synthetic cream/green case and the original Hunodan photo. Existing blank-image, non-heart-shape, multi-heart, known-homography, alpha and resampling checks remain covered.

Initial local artifacts: `tmp/inverse-hunodan/2026-09-07T21-18-03-265Z-crops/`. Revised crop replay: `tmp/inverse-hunodan/2026-09-07T21-32-32-000Z-crops/`. These are local generated artifacts, not public site assets.
