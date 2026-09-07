# Reference cutting-path quality

The Star example now prepares a raster image and performs a **fresh inverse solve** when “Find cutting templates” is clicked. The previous `star.saved.json` remains only as a historical regression fixture. It is no longer a button example.

The new result matches the published `static/hearts/5star.svg` cutting paths closely, at a normalized 100 mm overlap:

| Measurement | Previous saved pair | Fresh image reconstruction |
| --- | ---: | ---: |
| Symmetric mean cut-path distance | 2.238 mm | 0.037 mm |
| Sampled maximum cut-path distance | 21.779 mm | 0.312 mm |
| Independent exported-image error | Not evaluated in the old audit | 0.265% |
| Correct slit count and ordered family assignment | 4 + 4 | 4 + 4 |

The distance comparison uses fixed right/A and left/B families, sorted border endpoints, uniform 0.1 mm arclength samples, and 0.005 mm chord tolerance. It reports symmetric mean, RMS, maximum and endpoint errors, plus unmatched slit counts. There is no fitted rotation, reflection or translation. The sampled maximum has an additional 0.06 mm approximation allowance. The two renderers agree on the clean star reference at 600 × 600 pixels.

[Cut-path overlay: blue published, red reconstructed](star-cut-comparison.svg)

## What changed

- An optional **Straight motif · matching sheets** preset preserves straight edges and enforces transposed copies of the two sheets. It rejects images whose classified diagonal asymmetry exceeds 1%. Source-image error is still measured against the original classified pixels after this adjustment.
- Border transitions supply horizontal and vertical guide lines. Exact Bézier subdivision adds connection points where these lines meet the middle of visible curves. Corner-bisector candidates supplement nearest neighbours, so additional guide points cannot crowd out useful corner connections.
- Hidden routing prefers continuation of the inferred grid. Away from guides, a corner balance cost favors connections through the middle of a pointed motif. The transpose diagonal is included; the other diagonal is not implied by matching-sheet symmetry.
- Turn costs use one epigraph variable per interior vertex and sheet, rather than one variable per incident pair. This has the same integral cost under the existing maximum-degree-two constraints; its continuous relaxation differs. Exhaustive local degree-two selections and actual WASM solves are tested.
- A stopping bug is fixed: adding an objective constraint invalidated the native solver's gap information. The decision to stop now uses the captured objective bound, instead of a reset gap value.
- An original-image fidelity gate withholds cutting SVGs above 3% classified-pixel error. Geometry and strict paper checks also remain required. This image gate alone does not establish similarity to unknown original cuts.

The matching-sheet preset is explicit in the UI. Its corner profile uses a 175° maximum turn and a local self-clearance neighbourhood factor of 8, compared with 150° and 3 in the general profile. It preserves sharp corners instead of rounding hidden cuts. The star comparison uses the same 2 mm strip width and 0.25 mm per-edge cutting allowance as the general defaults. The published star itself fails the general turn/self-clearance profile and passes the matching-sheet profile, including strict paper checks. These are separate constraint profiles, not a claim of improvement under identical manufacturing constraints.

## Blind input and reference evaluation

`scripts/inverse/reference.mjs` imports each published SVG using the site's actual parser, then renders its woven overlap with the site's renderer and resvg. Only the resulting RGBA image enters `prepare` and `design`. The source SVG, slit ownership, hidden routes, reference curves, reference endpoint coordinates and saved solutions are not passed to the solver. The generated Star PNG contains no vector paths.

Evaluation happens after reconstruction. A second renderer (`export-renderer.mjs`) builds a weave from the exported cubic paths with resvg, without calling the engine's target/weave samplers. Published and generated cutting paths are compared separately. The reference import and renderer alignment checks are retained, including failures. This is a raster-track benchmark; the handoff's sanitized visible-vector track is still outstanding.

## Small input perturbations

All **9/9** star cases pass the declared reference-quality criterion: original, x/y/both half-pixel shifts, resize to 450 and 400 pixels, JPEG quality 95, and deterministic colour noise of ±4 and ±12 levels. Settings are fixed across cases; no selection uses reference geometry.

Across these cases, independent image error is at most **0.482%**, mean path error at most **0.114 mm**, and sampled maximum path error at most **0.523 mm**. These cases do not establish robustness to arbitrary perspective errors, occlusion or photographs.

Evidence: `tmp/inverse-reference/2026-09-07T14-28-27-102Z/results.json`.

## All 38 gallery designs

The registry's complete 38-design inventory was evaluated with both general and matching-sheet presets, five-second search budgets, and independent export rendering. A quality pass requires permitted exports, ≤1% image mismatch, no unmatched slits, ≤0.25 mm mean path error, and ≤1 mm maximum path error including the sampling allowance.

| Profile | Reference-quality passes / all 38 | Returned pairs failing reference quality | Reconstruction failures | Unsupported rectangular overlaps |
| --- | ---: | ---: | ---: | ---: |
| General | 5 / 38 | 10 | 20 | 3 |
| Matching sheets | 10 / 38 | 2 | 23 | 3 |

Across the two profiles, **11/38** unique designs pass: `classic-3x3`, `ramme`, `gaver`, `stjerne`, `5star`, `simple-5star`, `explosion`, `nihon`, `amy-weave-2`, `juletrae`, and `nemt-hjerte`. The union is an evaluation result, not an automatic preset-selection success rate. The three unsupported references are `stjerne-ramme`, `amy-weave-1`, and `amy-pattern`; they remain in the denominator. Reference geometry itself passes the respective constraints for only 18 and 23 of the 35 square designs. These numbers must not be interpreted as a like-for-like algorithm comparison.

This clean-gallery benchmark is separate from the user's 40-heart photograph. It does not improve or replace that photograph's unreviewed crop annotations or establish 100% reconstruction. See [LOCATOR.md](LOCATOR.md) for the existing photograph results.

Evidence: `tmp/inverse-reference/2026-09-07T14-28-39-305Z/results.json`. Each result retains source and pixel hashes, reference audits, full failure reasons, exported curves, reports, overlays and independent rendered images. Timings are diagnostic; some development jobs overlapped on the same machine.

```sh
node scripts/inverse/reference-benchmark.mjs --seconds=5
node scripts/inverse/reference-benchmark.mjs --ids=5star --profiles=matching-grid --perturb=true --seconds=10
npm test
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/inverse/reference-browser-test.mjs
```

Browser QA exercises the actual Star button, PNG decoding, preparation, real worker/WASM solve, downloaded ZIP contents, reference path comparison, independent rendering, all result tabs, restoration of general settings for Waves, and the Danish example. Physical assembly and strength have not been tested.

Final checks: 205 tests pass; `check` reports zero errors and eight existing accessibility warnings; lint and static build pass. Production Chromium/Firefox QA passes 72 workflow checks in total, including 10 star reference-quality checks. Current evidence links and hashes are recorded in `VALIDATION.json`; earlier failures remain available.
