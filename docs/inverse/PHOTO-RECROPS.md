# Photographic colour mixtures and broader robustness tests

The `heart_recrop_reconstruction.zip` handoff contains a fresh-grid Python/PyTorch inverse fitter, a JavaScript cropper, five frozen photographic crops and independently checked candidate templates. It does not contain a browser inverse fitter. The archive's original photo and fitted templates remain local test material under `tmp/inverse-recrops-handoff/`.

## Integrated preparation

In **Image conversion → Separate source colours → Red and white photograph**, the app estimates two paper colours from confident interior samples, then fits each sRGB pixel as `u * red + v * white`, with nonnegative coefficients. `u / (u + v)` estimates red coverage; `u + v` accommodates scalar illumination. The implementation follows `code/unmix.py`, `targets.py` and `calibrate.py` in the supplied study. Chroma selects palette samples only; it does not threshold the final image.

The new mode preserves the original RGB crop and classified mask. Subsequent repairs are measured against that classified mask. Palette estimates, sample counts and colour residuals are included in preprocessing metadata and exported reports. The model is an empirical photographic estimate, not a calibrated camera or known original artwork. It specifically concerns red/white paper; the general colour-group and brightness modes remain available.

The JavaScript palette estimates and all 327,680 binary pixels match the five supplied targets. Four probability arrays match exactly; six checkerboard values differ by at most `1.183e-16` near zero. Analytic regressions check coverage under different lighting, the old chroma erosion, nonnegative endpoint projection, inversion and indistinguishable palettes.

## Endpoint noise is input robustness

Small image perturbations must not automatically become extra slits. Border preparation now takes an odd-window majority **along** each inset profile as well as across parallel profiles. Its radius is capped by half the nominal strip allowance and by the requested border radius. It does not impose equal counts on opposite sides. A real strip wider than the allowance is preserved in the regression fixture.

The General preset uses a 1.5 mm outer edit band. Pixels beyond that band remain unchanged by border stabilization; the classified source remains the image-error reference. Tests include noise that reaches every inward sampling row, both colour phases and multiple resolutions. Existing full-solve tests still recover three slits per sheet from a checkerboard with noisy edge pixels and charge those pixels to the reported error.

This is a limited denoising improvement. It does not make noisy photographic border counts reliable enough to be hard constraints in every case. The larger tests below remain failures, even where opposing counts can be made equal.

## Broader photo benchmark

`scripts/inverse/hard-photo-cases.json` retains all 40 collage motifs. New approximate quads were annotated from source contours before solver feedback; these are assistant visual annotations, not ground-truth geometry. Of those 40 motifs, 24 are fully visible, 15 are clipped, and one is obscured by glare. Seven individual photos bring the inventory to 47 and the reviewable subset to 31. The curved-star individual photo is the previously tested yellow-star source and is counted once.

With the General preset, a 10-second search budget, zero cutting-perturbation trials and the app's normal paper constraints:

| Input group | Accepted pairs | Remaining outcomes |
| --- | ---: | --- |
| 24 full collage motifs | 0 / 24 | Border uncertainty or failed routing search |
| 7 individual photographs | 3 / 7 | 3 border mismatches, 1 exhausted candidate graph |
| All reviewable photographs | **3 / 31** | 23 border mismatches, 5 exhausted candidate graphs |
| Same 24 collage crops with the new mixture mode | **0 / 24** | 20 border mismatches, 3 exhausted graphs, 1 timeout |
| Five fixed archive crops, General and mixture modes | **0 / 5** in either mode | 6 border mismatches and 4 timeouts across 10 attempts |

Accepted app pairs require geometry and guarded paper-core checks plus at most 3% independently rendered disagreement with the unedited classified crop. The comparison renderer reads exported cubic coordinates and uses resvg. This is not original-template or physical-assembly verification. The app's default 2 mm strip width plus cutting allowance requires about 2.505 mm nominal spacing; the Python study accepts 1.5 mm. Their pass rates are not interchangeable.

The new colour model matches the handoff targets but does not by itself make the tracing/MILP algorithm solve these photos. A separate 60-second retry of the white-birds collage also timed out. Selecting conversion modes/radii after seeing the failures produced no validated pair in eight additional diagnostics; these are not an automatic-search success rate.

Twelve perturbations of the three successful individual photos (one-pixel crop shifts, JPEG quality 75, half resolution) yielded 10 accepted pairs at 10 seconds. Both other attempts timed out. At a 60-second budget, the cross shifted one pixel horizontally passed; the curved star shifted one pixel vertically hit the solver's refinement-round limit. One-pixel robustness remains unresolved for that case.

Run `npm run benchmark:inverse:hard-photos -- --presets=general --seconds=10` with the local inputs listed in the manifests. Each run saves all outcomes, source hashes, exact quads, prepared masks, exports and a standalone `index.html` visual report. For the handoff's frozen crops:

```sh
npm run benchmark:inverse:hard-photos -- \
  --recrops=tmp/inverse-recrops-handoff/heart_recrop_study \
  --presets=general,mixture --seconds=10
```

The archive's crops keep their `needs_review` status. The benchmark uses their saved rectified photo directly, without another inset or optimized crop. See `PHOTO-RECROPS-VALIDATION.json` for concrete run locations.

## Direct fitter verification and remaining integration

All 837 supplied file checksums and six actual JavaScript cropper tests passed locally. Independently rechecking the five supplied exports passed all geometric audits at their stated 1.5 mm threshold and checked 4,814 SVG scalar coordinates. CairoSVG and the separate adaptive geometry renderer agree within the stated raster tolerance.

The Python suite passes 37 of 38 tests on this Mac, including every image-gradient test. The only failure is the checkerboard probability test's exact-bit assertion: six near-zero values differ by at most `1.183e-16`, without changing any binary pixel. This persists with the package versions recorded in the handoff. The original archive tests have not been weakened or rewritten.

A source-only replay of all five cases is recorded separately. It copies source code, the photograph and rough ROIs, and regenerates targets and controls. No saved templates initialize the reconstruction. The first attempt exposed the local Cairo library lookup; `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` resolves it. An older Python 3.9 environment selected Shapely 2.0 and was substantially slower; that run was stopped and retained, then restarted with Python 3.12 and the handoff's numerical package versions.

The fresh local run completed in **348.6 seconds** including startup and measurement, while other QA was running. It produced 99.09% checkerboard, 99.29% star, 99.56% flower, 98.36% framed-motif and 99.53% stacked-heart agreement with its estimated masks. All five passed the supplied 1.5 mm audit. The local controls differ from the Linux archive, so this is a comparable reconstruction, not a bitwise replay. Independent export checks validated 4,502 SVG scalar coordinates; maximum CairoSVG/geometry-renderer disagreement was 0.0392% of sampled pixels.

As a separate diagnostic, running the Python audit at the app's approximately 2.505 mm nominal width rejected all five local candidates because of inter-slit or outer-edge clearance. That diagnostic uses the Python checker, not the actual app's paper audit. It reinforces why the 1.5 mm acceptance claim cannot be transferred to the app unchanged.

Browser QA passed 38 checks across Chromium and Firefox: 16 checks for the new colour mode, including all five real crops and a fresh shaded-checker solve/export, plus 22 example-button checks. All 217 repository tests, type checking, lint and the static build passed. Type checking retains eight existing accessibility warnings in `PaperHeart.svelte`.

The browser still uses tracing and MILP. Integrating the direct fitter requires porting its grid/count initialization, boundary-motion derivatives, constrained updates and shared-cut handling. Its horizontal-cut gradient fixtures and separate area/renderer checks are essential acceptance criteria. Simply using the new colour target or fitting longer does not supply that algorithm. The framed motif's visible defects and the stricter app cutting allowance also remain relevant.
