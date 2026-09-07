# Image uncertainty and the next inverse solver

The newer 47-input photographic inventory, edge-noise regressions and colour-mixture handoff are recorded in [PHOTO-RECROPS.md](PHOTO-RECROPS.md). The measurements below are historical.

The bell exposed a boundary-estimation problem before the routing search. On a clean copy of the bell diagram found on the user's Desktop, one visually selected crop produced 24 versus 34 boundary transitions for one sheet. Insetting the crop by 1% produced four endpoints on each opposite side and a checked 4 + 4 pair. The uploaded file's name differed from this clean copy; these tests do not assert byte-for-byte reproduction of the earlier app screenshot.

## Implemented change

Raster preparation now estimates crop-edge colours from a majority of several parallel profiles inside the image, then extends those estimates through a narrow outer band. The default band is 1 mm at the selected paper scale and can be set to zero. It does not force opposite sides to have equal counts. Ties use a central sample so swapping the two colours gives the same geometry. The edited width is rounded down to whole pixels and every change is counted. Perfect checkerboards remain unchanged.

The unedited classified image remains the reference. The binary-mask view shows that reference, the processed preview reports the total changed-pixel fraction, and the result reports a forward-rendered mismatch fraction against it. Source dimensions and crop corners are recorded. The existing routing, minimum-width, self-clearance and paper-core gates still apply.

The unit tests include a checkerboard with five isolated noisy boundary pixels: the original has excess transitions, the repaired version yields a checked 3 + 3 pair, and the report still counts all five pixels as image error. This prevents repaired input from being reported as a perfect reconstruction of the original.

## Measured results

**Historical crop experiments:** the user subsequently rejected the manual collage quadrilaterals below. They are not reliable corner annotations. The newer all-40 ROI-based locator and reconstruction benchmark is documented in [LOCATOR.md](LOCATOR.md); it retains clipped and unresolved hearts in the denominator. The bell perturbation results below still describe the fixed bell crop.

The image-only benchmark uses 100 mm overlap, 400-pixel classification, the simplified tracing preset, a five-second solver budget, strict paper checks, no hidden-cut rounding and zero perturbation trials. It compares a disabled border band with a 1 mm band. Both versions use identical images and crop coordinates.

| Test group | Border stabilization off | Border stabilization on |
| --- | --- | --- |
| Bell: 9 crop translations by up to 2 pixels and 5 independent corner perturbations by up to 2 pixels | 0/14 checked pairs | 13/14 checked pairs |
| New collage: 19 manually cropped complete hearts | 0/19 checked pairs | 1/19 checked pairs |

The successful bell attempts have about 1.9–2.3% image mismatch when rendered independently from the exported cubic cuts. The nominal crop has about 2.0% mismatch. One translated crop still fails nonlocal self-clearance despite finding balanced endpoints. The collage's stacked-hearts case succeeds with about 2.1% mismatch; the other crops still fail, mostly because opposite-border transition counts disagree. These are results on these manually selected crops, not impossibility results for the motifs. The original photo includes blur, paper relief and uncertain overlap corners. Top, bottom and side hearts clipped by the screenshot are excluded.

The independent check reads `cut_geometry.json`, constructs the two sheet parity regions directly from the exported cubic control points, and rasterizes the combined even-odd path with **resvg**. It does not use the solver's curve flattening or either of its raster samplers. It thresholds antialias coverage at 0.5 and measures every differing pixel against the unedited classified crop. This is an independent image measurement, not an independent physical assembly test. A regression verifies an exact checkerboard and detects a deliberately shifted exported slit.

Run `npm run benchmark:inverse:robustness` with the local source images identified in `scripts/inverse/robustness-cases.json`. Source images are not redistributed in the repository. `INVERSE_ROBUST_SECONDS` controls each solver budget; `INVERSE_ROBUST_GROUP=bell` or `collage` limits the group. Every run preserves all source hashes, crops, failures, target previews, reports, exports, independent renders and a contact sheet in a new timestamped folder. The original seven-photo benchmark still produces three checked simplified pairs with the new border setting.

See `VALIDATION.json` for the exact evidence paths and current checks. Saved paper-error simulations remain separate from the input-crop perturbations tested here.

## A broader optimization approach

The proposed direct Bézier optimization is a useful direction because the current MILP fixes every traced visible edge and optimizes cut complexity, not image fidelity. Boundary repair alone does not address that restriction. Differentiable Bézier rasterization has an established implementation in [DiffVG](https://people.csail.mit.edu/tzumao/diffvg/); its paper demonstrates fitting vector parameters through raster-space losses. It does not supply the woven-sheet constraints for this application.

A practical design would make the following distinctions:

1. **Endpoint hypotheses are discrete candidates.** Estimate transitions over several inward profiles, including their location uncertainty and plausible counts. Keep several consistent opposite-side hypotheses instead of freezing the first thresholded border. Missing or extra slits cannot be repaired by moving control points alone.
2. **Optimize independent sheet chains against a soft image loss.** Render each sheet's alternating regions as soft masks `A` and `B`; the two-colour weave is their XOR, `A + B - 2*A*B`, with the appropriate starting phase. Use coarse-to-fine antialiasing and a combination of blurred image error and boundary-distance error. A hard thresholded renderer supplies almost no useful gradient away from boundaries.
3. **Use cutting costs as objectives and physical checks as constraints.** Penalize length, curvature and unnecessary segments, while retaining sheet connectivity, ordered border endpoints, same-sheet nonintersection and minimum clearance. A low loss from narrow or disconnected paper is not an acceptable candidate.
4. **Search beyond one local fit.** Start from several grids and endpoint hypotheses; split segments where residual error persists. Move coordinated groups of controls around shared/hidden stretches, which can have weak image gradients. Retain the best *validated* candidate separately from the best image-loss candidate.
5. **Validate the actual exports.** Re-render the exported cubics with an independent renderer at a finer scale, report their error against the original crop, and rerun geometry and material checks on those curves. Coarse optimization success is not final validation.

This direct gradient optimizer is not implemented in this change. The implemented contribution is bounded boundary inference, explicit original-input error measurement, independent export-render tests and a reproducible set of perturbed/cropped failures for evaluating that next solver. It does not claim general robustness to all photographs or input perturbations.
