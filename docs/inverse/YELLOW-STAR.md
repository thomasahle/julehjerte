# Yellow curved-star photo regression

The 17:01 failure screenshot showed a yellow/olive woven heart reaching the search limit. Previous browser QA for this photo covered crop preview and preparation, but did not attempt reconstruction. That coverage was insufficient.

The repair works on raw pixel-boundary chains before Bézier fitting. It finds nearby opposed bends, checks that they form four distinct arms, and joins them at a shared vertex. Curve fitting then preserves that vertex. Each edited boundary point moves by at most the selected junction radius; moves are recorded in the report. Straight parallel boundaries and acute motif tips are excluded. Original classified pixels remain the reference for the 3% export-fidelity gate. Geometry, minimum strip width, cutting allowance and paper-core checks remain enabled.

Two additional preprocessing fixes address crop sensitivity: Lab classification tries both extreme and population-based initial colours, retaining the lowest full-image clustering error; border profiles read corner colours inside both adjoining edges. The General curves UI preset uses 1.5 mm junction repair and border stabilization. Simplify uses 0.75 mm fitting tolerance and 0.3 mm smoothing to preserve more detail.

The committed fixture is the user's earlier photograph of this same yellow motif, converted from Display P3 to sRGB with ColorSync. Its four crop coordinates were manually reviewed and recorded in `scripts/inverse/yellow-star-fixture.mjs`. They are not ground-truth cutting paths or a measured reconstruction of the corners in the later UI screenshot. The original screenshot's marker-to-photo registration was approximate; the benchmark uses the documented crop instead.

`npm run benchmark:inverse:yellow-star` solves the photo and six perturbations using the General preset, a 10-second solver budget, and independent rasterization of exported cut geometry. Perturbations translate the crop by ±1 source pixel horizontally/vertically and change RGB brightness by ±8. All seven passed in `tmp/inverse-yellow-star/2026-09-07T15-31-15-404Z/results.json`; independent image mismatch was 1.61–1.74%, with five slits per sheet and passing geometry/paper audits. Earlier runs and failures are retained in `tmp/inverse-yellow-star/`.

This establishes reproduction of the photographed motif under those perturbations. The original cutting paths for this photo are unknown, so the image result does not establish ground-truth path agreement or physical weaveability. The separate published five-point star regression continues to check actual original cutting paths.

`npm run test:inverse:yellow-star:browser` exercises upload, manual crop, preparation, fresh worker solve, ZIP download, independent rendering of downloaded curves, and all four result views in Chromium and Firefox. This closes the earlier gap between preview QA and reconstruction QA.

The development server ignores `tmp/` when watching files: benchmark HTML exports previously triggered page reloads that could interrupt an active solve.

Final production QA passed all 80 browser checks across five suites, in Chromium and Firefox. The yellow-heart check uploads the original Display P3 photo and captures the actual browser-decoded pixels before preprocessing; its independent renderer compares downloaded cuts against that classified input. Evidence: `tmp/inverse-browser/2026-09-07T15-41-48-373Z-yellow-star/results.json`. All 210 automated tests, type checking (0 errors, 8 existing accessibility warnings), lint and the static build passed. A separate check on port 4173 confirmed that writing benchmark HTML preserves the prepared artwork.

The exact displayed processed square was also extracted from the user's 17:00 screenshot (pixel rectangle 1098,604,1240,1240). It solved with 19 junction repairs and five cuts per sheet; independent mismatch was 1.33% against that displayed pattern. This is a separate diagnostic, not a source-photo fidelity measurement.
