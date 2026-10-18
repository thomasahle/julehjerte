# Recognizing a usable correction before trying more layouts

Commit `44e17db` moves the existing validated clamp correction into candidate assessment. The original checkpoint remains available, ordinary finalists still compete, and no image, feature, symmetry, geometry or paper threshold changes. A successful correction now tells the search that it has a usable result, instead of discovering that only during final export.

## Why the browser spent 87 seconds

The preceding browser replay tried **17 candidate layouts**. Its best 6+6 candidate already had acceptable whole-image disagreement and valid paper, but a small source feature remained below the 60% retention floor because its adjacent cut was at the optimizer's clearance clamp. Every candidate therefore remained image-rejected, and the fitter continued introducing layouts from its remaining initialization queue.

Only after that search, the finalizer moved the clamped span, checked the correction and returned a valid result. The entire browser flow took **87.081 s**, even though the correction itself took **0.401 s**. The original diagnosis and validation of that movement remain in [the preceding report](clamped-feature-recovery.md).

A temporary instrumented baseline replay saved candidates before finalization. A 6+6 checkpoint was already available at **10.962 s**, with **2.4019%** engine disagreement. Applying the existing correction separately restored its features and passed the strict paper check; its independent export disagreed with **2.3638%** of the source mask. This diagnostic uses saved checkpoints to establish when recovery becomes possible, not to claim a fresh reconstruction speedup.

## What changes in selection

After ordinary candidate assessment and the existing paper-uncertainty alternative, a still-rejected close fit can receive a bounded clamp correction. The candidate must already have valid nominal geometry, missing original-source features, disagreement no greater than the existing 3% ceiling, and sufficient time remaining for correction and export. The same original source, requested symmetry and verified material resolution are passed to the existing correction.

A successful correction becomes a separate candidate. Its original checkpoint is retained, its reconstructed graph is checked again, and its error is rescored against the original target. The strictly checked paper result is carried with the candidate, including its finer verification resolution when applicable. Subsequent cleanup and export continue to recheck changed geometry.

Finding this checked alternative activates the **existing 25-second photographic comparison window**. It does not immediately accept the first result or discard the ordinary finalists: another initialized routing may still produce a better fit. It does prevent an unresolved feature flag on the original checkpoint from forcing the fitter through every unused layout. The late correction remains available as a fallback when an earlier attempt cannot succeed.

The report records each early attempt, its availability time, correction time and outcome. Checked snapshots are also retained by the ordinary progress mechanism, so an early result can survive a graceful Stop with the material resolution at which it was verified.

## Fresh reconstruction and limits

The committed-code replay starts from the original photograph and the same one-pixel vertical crop translation. Its classified-mask hash is unchanged. With a thirty-second allowance, fitting and export take **26.777 s**, down from **29.772 s**. Independent 400-pixel disagreement improves from **2.3625% to 2.3556%**. The first successful correction occurs at **10.809 s** and takes approximately **0.368 s**; later selection and cleanup produce the final result.

The early correction is a new checked candidate, not a substituted saved template. Its source pixels and crop stay unchanged. The enlarged bird eye also remains: its component overlap is approximately **57.4%**, so passing colour retention and enclosure does not imply exact shape reconstruction.

| Ten-second replay | Independent disagreement | Template checks |
| --- | ---: | --- |
| Vertical crop shift | 3.0794% | Fail |
| Original bird | 2.4719% | Pass |
| Horizontal crop shift | 2.2256% | Pass |

The ten-second vertical variant is still above the existing image ceiling, so it is not eligible for the correction. Short-budget trajectories depend on wall-clock scheduling; their individual errors remain in the report rather than being described as identical.

The regression now requests **180 seconds** and checks that a verified early correction activates the 25-second comparison window. It checks source immutability, valid final geometry and paper, an observed checked snapshot at material resolution 700, and independent feature retention and disagreement at 400 and 800 pixels. This distinguishes the scheduling fix from merely testing with a short requested timeout.

## Verification

The actual Chromium replay drops from **87.081 s to 28.229 s**, with **exactly unchanged 2.370% editable-template disagreement**. It requests the same ordinary 180-second allowance. The correction succeeds at 10.873 s, and the candidate list contains four refined layouts plus the corrected candidate, instead of the preceding run's seventeen layouts.

| Browser case | Previous click to editable result | Current click to editable result | Current editable disagreement |
| --- | ---: | ---: | ---: |
| Vertical crop shift | 87.081 s | 28.229 s | 2.370% |
| Horizontal crop shift | 17.696 s | 17.431 s | 2.268% |
| Original bird | 12.751 s | 12.688 s | 2.519% |
| Star | 2.027 s | 2.047 s | 0.160% |
| Hat with matching preference | 8.047 s | 7.934 s | 0.412% |

All five browser cases pass worker, editable-template, geometry, paper, shared-cut and SVG checks, plus the applicable PDF downloads, without page errors. The photographic replays upload the recorded classified masks to isolate fitting and export; the full-photo benchmark separately reruns automatic cropping.

All **22 regular Hunodan cases pass under ten seconds**, the slowest at **9.130 s**, with exactly unchanged independent image errors. The complete-photo benchmark remains **24/31**, with the same passing cases, crop coordinates, source masks and probability hashes. Per-case wall-clock-limited errors are recorded in the machine-readable comparison.

Type checking reports zero errors and seven existing warnings; lint passes; **855 application tests pass with one existing skip**; all **710 inverse tests pass**; and the production build succeeds. Heavy diagnostics, benchmarks, suites and browser runs were serial. The preview was restarted after the build; its entry modules return HTTP 200 and the served fitter sources match the tested bytes.

The tested build remains available at `http://127.0.0.1:5232/`. The vertical perturbation still fails in ten seconds, and the ordinary browser run is still longer than that target. This is a measured reduction of unnecessary search, not completion of the broader robustness work.

The [machine-readable report](early-clamped-feature-recovery.json) compares current results with `41f16c6`. Raw diagnostics and replay artifacts are under `tmp/heart-learning/early-clamp-recovery-v1/`. No code is pushed or deployed.
