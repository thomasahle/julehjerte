# Repairing a fitted image's cutting topology

The [previous investigation](feature-routing-perturbations.md) found why a one-pixel horizontal crop shift broke the photographed bird: local refinement could close its eye only by making a slit cross itself. The new recovery path uses that rejected candidate's visible boundary as a proposal for a small MILP. It reassigns the boundary to the two sheets, then returns to the ordinary fitter and final validation.

Commit `90134f9` enables this recovery only after local feature refinement fails. It does not accept the rejected cutting paths, edit the classified pixels, or relax any geometry, feature, paper or image-error checks. The original candidate remains available if rerouting fails. Successful local refinement does not invoke the additional MILP.

Browser QA then exposed a second problem: the normal long-budget search did not try the same useful initialization early. Commit `e24d236` makes that feature-preserving start available with longer allowances too, keeping the other starts and deferred routing available if it fails.

## Why the smaller problem works

The earlier topology initializer added inferred grid portals and many optional connectors to an already fitted boundary. On the frozen rejected bird proposal, that produced 7,230 binary variables and 60,697 constraints, with no validated answer in ten seconds.

The new probe starts with no inferred grid portals, the two nearest endpoint neighbours, and straight connector candidates. The same 140 input cubics produce 350 noded visible edges and 58 hidden candidates: 2,448 binary variables and 11,446 constraints under the direct fitter's existing turn costs. It preserves the full visible boundary; only the assignment to sheets and optional shared cuts can change.

A separate control keeps the previous initializer's objective settings identical in both variants. The small graph then has 10,048 constraints and produces a checked result in 1.413 seconds including final validation/export; the large graph retains its 60,697 constraints and times out at three seconds. Thus the successful comparison is not explained solely by changing the objective settings. The selected small-graph solution uses one new shared connector; its visibility cancels exactly between the two sheets.

The probe has at most 1.5 seconds and retains the finalization reserve. It starts only when an otherwise rejected geometry checkpoint fits the original source within its existing error limit and retains the source features. A returned routing must independently pass the MILP residual, nominal geometry and paper checks, followed by the original image and feature audits. Reconstructing the editable curve graph receives another ordinary assessment before competing with valid candidates.

This is a direct-fit → MILP → ordinary-cleanup combination. It neither retraces the photograph nor consumes saved cutting templates. The new helper clones the proposed boundary before graph construction, so noding cannot mutate the earlier candidate or its fallback. Explicitly requested cutting symmetries keep their existing constrained fitting path.

## Scope and remaining quality limits

The shifted bird can now produce legal templates with a separate eye within the ten-second search allowance. Its eye still differs from the source: it is larger and less regular. Passing the existing acceptance checks is not a claim of exact reconstruction or recovery of the unavailable original cutting paths.

The paired replay uses commit `002104f` as its baseline, identical classified masks for each pair, and the same ten-second allowance:

| Input | Before disagreement | After disagreement | Before → after checks | New solver time |
| --- | ---: | ---: | --- | ---: |
| Original crop | 2.469% | 2.469% | Pass → pass | 9.228 s |
| Crop translated one source pixel horizontally | 2.934% | 2.226% | Fail → pass | 9.146 s |
| Crop translated one source pixel vertically | 2.686% | 2.693% | Fail → fail | 9.045 s |
| JPEG quality 75 | 1.706% | 1.718% | Pass → pass | 9.059 s |
| Half resolution | 1.565% | 1.565% | Pass → pass, eye omitted below threshold | 9.068 s |

The horizontal variant retains all source eye pixels. Its eye component changes from a region connected to the border to an enclosed 4.4375 mm² region, compared with 3.3125 mm² in the source; component IoU is 0.746. The unshifted crop retains its baseline error, while JPEG and vertical-shift errors vary slightly in these wall-clock-limited replays. The results are not uniformly lower-error; the new fallback is not invoked for the original successful detail pass.

Solver time excludes the separate independent exported-image replay. The measured fit plus final validation/export takes 9.47 seconds for the repaired horizontal variant. The synthetic and fresh-photo regressions supply no saved templates to the full fitter.

The feature failure caused by a vertical crop shift is a separate test, as are JPEG recompression and downsampling. A half-resolution image whose eye falls below the existing feature threshold must not be presented as successful eye preservation. Complete-corpus results and these perturbation cases are reported separately.

Local refinement of the saved rerouted proposal did not substantially improve its eye at the tested rates. Those experiments remain in the evidence, rather than motivating a new refinement default. The ordinary final cleanup in the fresh pipeline can improve the returned result, but its wall-clock-limited trajectory can vary slightly between runs.

The fresh complete photographic replay remains **24/31**, with the same successful cases and exactly unchanged crop coordinates and mask/probability hashes. No case in that unperturbed run invokes the new rerouting fallback. Its remaining failures have distinct observed outcomes:

| Cases | Observed failure |
| --- | --- |
| Nested squares, Santa, Bibel outline star | No automatic crop proposal. These remain in the denominator. |
| Outline star, crossed ribbons | Geometry and paper pass, and global disagreement is below 3%, but a small source region near the bottom border is lost. |
| Jigsaw | Geometry and paper pass, but image disagreement is 6.69%. |
| Bauble | Geometry and paper pass, but disagreement is 9.30% and several source regions are lost. |

These observations locate the failed checks; they do not establish that every residual image error originates in cropping. The bounded search also produces some changed errors without changing pass/fail status: the largest increase among passing cases is the floral checker, from 2.286% to 2.361%; the already-failing bauble changes from 6.763% to 9.296%. All changes are retained in the machine-readable comparison. The separate 22-design Hunodan replay retains exactly the previous errors, with all cases passing and a maximum solver time of 9.084 seconds.

## Verification

The first Chromium replay on `90134f9` failed for the shifted bird after **89.394 seconds**. Its different initialization supplied a boundary whose rerouted paper support remained uncertain, so the check correctly rejected it. Those artifacts are retained under `browser/`; they are not a passing result.

After the scheduling correction, all four Chromium replays pass the actual import, worker, editable SVG and PDF checks, without page errors:

| Browser case | Click to editable result | Independent editable-template disagreement |
| --- | ---: | ---: |
| Horizontally shifted bird mask | 17.568 s | 2.301% |
| Original bird mask | 12.654 s | 2.519% |
| Star | 2.027 s | 0.160% |
| Hat with matching-sheet preference | 7.947 s | 0.412% |

These use the ordinary 180-second allowance. The original browser bird previously took 25.153 seconds with 2.455% disagreement: the faster result has a small accuracy tradeoff, while retaining the strict original eye-shape and geometry checks. The shifted bird is now accepted; its eye still has visible shape error. Neither timing is a claim that every browser solve finishes within ten seconds.

The dedicated regression creates the shifted mask from the original photograph and fixed crop metadata, runs a fresh search, then checks independently rendered exports at 400 and 800 pixels. It requires a separate eye, at least 90% retained eye pixels, and the unchanged geometry and paper gates. It records a lower shape-quality floor for this still-imperfect shifted eye; the existing unshifted bird test retains its stricter component-IoU requirement above 0.8.

A separate synthetic regression starts with a self-crossing slit and shows that reassignment can produce legal sheets with exactly the same independently rendered image. It also checks that the source pixels and input geometry remain unchanged. Guard checks cover an incompatible original image, an explicit symmetry request and an exhausted budget.

Final verification at `e24d236` passes: type checking reports zero errors and seven existing warnings; lint passes; **855 application tests pass with one existing skip**; all **703 inverse tests pass**; and the production build succeeds. The final Hunodan and 31-heart replays also use that commit. Heavy benchmarks, the browser replays and the full inverse suite ran serially.

The preview was restarted after the final build at `http://127.0.0.1:5232/`. Both advertised entry modules return HTTP 200, and the served fitter and rerouting module match the tested source bytes exactly. No code was pushed or deployed.

Raw proposals, experiments, before/after perturbation renders and verification logs are retained under `tmp/heart-learning/local-routing-v1/`. The [machine-readable report](fitted-boundary-rerouting.json) records their hashes, the initial browser failure, final benchmark outcomes and both source/geometry and quality limitations.

The [cache and clearance follow-up](cached-boundary-stability.md) fixes repeated initialization mutating its cached boundary and identifies the active clearance constraint in the still-unresolved vertical-shift case.
