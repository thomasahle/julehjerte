# Recovering image details blocked by the fitting margin

Commit `eb1ce8d` adds a bounded final correction for small source regions that the Bézier fitter has pushed against its extra side-clearance cushion. It recovers the vertically shifted bird photograph in a fresh 30-second fit without editing its crop or classified pixels and without relaxing the image, feature, symmetry, geometry or paper checks. The ten-second variant remains unsuccessful.

## Cause and correction

The [preceding diagnosis](cached-boundary-stability.md) identified a horizontal cut at exactly the fitter's coordinate clamp, y = 96.922959 mm in a 100 mm overlap square. The nearby white source fragment contains 95 pixels, of which only 52 remain white in the fitted result. Its 54.74% retention fails the existing 60% feature floor even though whole-image disagreement is below 3%.

This limit includes an extra 0.35 mm fitting cushion beyond the nominal required width, raster allowance and geometric tolerance. The new correction searches only within that cushion. It identifies missing source components near an edge and movable controls exactly at the fitter's clamp. All clamped controls of a span whose control hull intersects that component move together; looking only for controls inside the component's bounding box missed relevant handles.

Four coarse outward proposals bracket the first colour-retaining adjustment. A short bisection then finds a small adjustment before the expensive geometry and paper checks. The feature must also retain its colours when sampled on either side of the existing 0.01 mm geometric tolerance, avoiding a proposal that only just crosses a pixel centre. Motion is capped at 0.35 mm per control point, including any movement imposed by symmetry or matching-sheet constraints.

An adjustment is accepted only if original-mask disagreement does not increase, the current feature is restored, other features do not regress, requested symmetries and existing identical sheets remain intact, and both nominal geometry and strict paper-core checks pass. Multiple local changes remain provisional until all source features pass. Expired budgets, preserved original cubics, already successful candidates, and candidates above the existing image-error ceiling keep their geometry.

The correction is called after ordinary finalization only when refinement reported missing source features. It has a 500 ms proposal budget within the existing export reserve. Individual validation calls are synchronous, so this is a search deadline rather than a hard interruption guarantee. Successful existing fits retain their previous route.

## Fresh reconstruction

The photograph is decoded again and its recorded crop is translated down by one source pixel. Classification produces mask hash `877e2d912dc8bc574c99154dc5a3de16a8d675c899f022c4a517f9216618dd72`. Only those pixels enter the fresh fit; the stored regression proposal is not supplied.

The committed-code replay completes fitting and export in **29.772 s**. Four clamped controls move **0.213281 mm**. The correction itself takes **0.369 s**, restores all source features, and reduces engine disagreement from **2.3994% to 2.3713%**. The independently rendered export has **2.3625%** disagreement at the original 400-pixel resolution. Both geometry and strict paper checks pass at the already selected 700-cell material resolution.

| Ten-second replay | Independent disagreement | Template checks | Fit and export |
| --- | ---: | --- | ---: |
| Vertical one-pixel crop shift | 3.0625% | Fail | 9.460 s |
| Original crop | 2.4719% | Pass | 9.476 s |
| Horizontal one-pixel crop shift | 2.2000% | Pass | 9.447 s |

These are wall-clock-limited trajectories. The correction does not bypass the 3% image ceiling to repair the ten-second vertical result. Recovering that case within ten seconds remains unfinished. This is agreement with a classified photograph, not with unavailable original cutting paths; the enlarged eye in the vertical fit is another remaining fidelity limitation.

## Independent rendering and a corrected earlier claim

The preceding two-control diagnostic claimed that moving controls by 0.200 mm established a valid correction. That claim was too strong: its independently thresholded raster retained 61/95 pixels, but the engine retained only 52/95 and still failed the production feature gate. The earlier report now explicitly records this correction and preserves the original measurements.

Moving the whole span resolves the engine gate. Testing the same saved geometry after transposition exposed another distinction: at 400 pixels, resvg assigns representative boundary pixels black coverage **127/255 horizontally and 128/255 vertically**. Thresholding at 50% changes an entire row of the tiny feature, giving 76.84% versus 54.74% binary retention. This does not indicate different transposed cutting geometry.

The regression therefore measures fractional coverage at the source resolution and separately checks binary feature retention and enclosure at 800 and 1600 pixels, against nearest-neighbour expansions of the unchanged source mask. Both orientations retain **65.79%** of the border component at both finer resolutions and pass the independent checks. The low-resolution transposed threshold result is retained in the machine-readable report; it is not presented as a passing result. The source-resolution engine check and all production acceptance thresholds remain unchanged.

Five focused tests cover both orientations, unchanged source data and original controls, idempotency, exhausted budgets, preserved artwork, requested symmetry, and a fresh image-only fit with observed candidate progress and independent export replay. The frozen rejected proposal is a helper regression fixture only, never a reconstruction input to the app.

## Dataset and browser verification

All **22 regular Hunodan designs pass under ten seconds**, with a maximum measured time of **9.039 s** and exactly unchanged independent image errors. The complete-photo benchmark remains **24/31**, with the same passing cases, crop coordinates and source-mask/probability hashes. Neither benchmark needed the new correction in its ordinary unperturbed cases.

The two remaining low-error edge-feature failures are not the same four-control clamp configuration: the outline star has only one horizontal-family control at its fitting clamp, while crossed ribbons has none. Their lost white regions have centres near y = 98.7–98.8 mm, considerably nearer the edge than the diagnosed bird fragment at y = 96.95 mm. These observations do not prove that different legal routing is impossible. They remain unresolved alongside the three crop failures and the higher-error jigsaw and bauble fits.

Type checking reports zero errors and seven existing warnings; lint passes; **855 application tests pass with one existing skip**; all **710 inverse tests pass**; and the production build succeeds. The preview has been restarted from that build, and its entry modules and served fitter sources match the tested bytes.

All five Chromium replays pass without page errors, including actual worker fitting, editable-template geometry and paper checks, exact shared-cut preservation, SVG export and applicable PDF downloads:

| Browser case | Click to editable result | Editable-template disagreement |
| --- | ---: | ---: |
| Vertical one-pixel crop shift | 87.081 s | 2.370% |
| Horizontal one-pixel crop shift | 17.696 s | 2.275% |
| Original bird | 12.751 s | 2.519% |
| Star | 2.027 s | 0.160% |
| Hat with matching preference | 8.047 s | 0.412% |

These browser runs use the ordinary 180-second search allowance. The vertical case uses the new correction, moving the same four controls by 0.213281 mm in 0.401 s. It passes end to end, but **87 seconds remains a speed failure**, distinct from the fresh Node run with a thirty-second cap. The correction is currently attempted at finalization, after the browser has already spent time refining a candidate that cannot cross its active clamp. Moving a checked recovery earlier is a follow-up opportunity, not a measured speedup in this change.

The photographic replays upload masks prepared from the recorded crops to hold classification fixed while exercising the actual worker, editable SVG conversion and PDF export. Automatic cropping is covered separately by the unchanged full-photo benchmark. Heavy benchmarks, tests and browser runs were serial. The tested preview remains running at `http://127.0.0.1:5232/`.

The [machine-readable report](clamped-feature-recovery.json) and raw artifacts under `tmp/heart-learning/clamped-feature-recovery-v1/` distinguish frozen-proposal diagnostics from fresh reconstruction. No code is pushed or deployed.
