# Hunodan photograph and template benchmark

All 27 source photographs and published cutting templates from https://www.hunodan.dk/julehjerter/julehjerter.html are retained under `scripts/inverse/fixtures/hunodan/`, with URLs, SHA-256 hashes and the original index. The required set contains **22 regular designs**. The user's exception for cuts ending inside the paper excludes four partial-slit templates and, under the stated scope assumption, the Greenland flag's separate internal semicircular cutout. All five remain in the corpus; see `scope.json` for the template-based reasons.

## Acceptance and validation

The benchmark uses photographs only, starts from fresh grids, and fixes automatically proposed crop corners throughout fitting. Published cutting paths, slit counts and reference rectangles are validation inputs only. They are never supplied to the optimizer.

A pass requires nominal geometry validation, strict unfolded-paper-core validation, at most **3% independently rendered image disagreement**, and retention of at least **60% of every substantial interior source region**. The separate renderer reads exported cutting geometry. Region checks cover both colours, ignore components touching the crop border, and require at least 0.03% image area and a solid core of radius 0.5% of image width (with small pixel floors). This detects disappeared details; it does not certify identical topology or recover invisible cuts uniquely.

The latest complete replay and browser tests with the stronger feature check are in progress. The preceding complete direct run passed the pixel/geometry checks on 22/22, but visual inspection found the anchor's eye missing. That result is **not counted as a complete motif reconstruction**. The revised combined method recovers the eye from the same mask at 1.78% independent disagreement, retaining 93.5% of its area.

## Root causes and changes

- **Pale paper was discarded during crop detection.** Cream/green `hjcur-02` was the only missing crop in the original 26/27 locator pass. The fallback lowers the chroma threshold only after normal attempts fail, retaining the heart-outline, lobe-colour and edge-support checks. The fresh replay proposes all 27 crops. All coordinates and source hashes match the frozen corpus used in solver experiments.
- **Noisy outer edges created false slit constraints.** Exact tracing consumes border transitions as hard endpoints. The direct fitter uses several smoothed inset bands as optional initialization evidence, so one noisy row cannot prohibit fitting. Its count/phase candidates remain independent of published references.
- **Uniform initial grids trapped the optimizer.** Independent nonuniform strip profiles and alternating row dynamic programming move coordinated groups of transitions, then project them to smooth splines. This recovers narrow and uneven strip layouts before local gradients refine the curves. Both sheet shapes remain independent.
- **Chained resampling changed narrow junctions.** Each working scale now samples the original classified source directly. Reducing to 256 pixels and then to the coarser grid scales introduced different boundary mixtures. The first flag exposed this failure.
- **A shared initialization deadline starved later candidates.** A failed Firefox report had zero initialization rounds for the correct four-slit colour phase. Every candidate now completes the small fixed initialization before timed gradient search; reports record all rounds. Previous 30- and 60-second failures are retained as diagnostic evidence.
- **Global error hid a missing feature.** The anchor's eye accounts for only 0.35% of the image. A boundary-motion gradient cannot create that remote island when initialization omits it. After grid fitting, a missing substantial region triggers a traced/MILP routing attempt from the same untouched mask, using at most 10 seconds and 45% of the remaining search budget. The candidate must pass image, feature, geometry and paper checks. Otherwise direct refinement continues within the original deadline. The final export gate also rejects lost features for either solver.

The combined solver reports `hybrid-bezier-trace` and `traceUsed: true` when recovery succeeds. Its repaired traced border supplies hard endpoints; ordinary direct fitting still treats border counts only as proposals. Search budgets exclude final validation/export overhead, and fixed-size initialization can extend very short requested budgets.

## Reproduction

```sh
npm run benchmark:inverse:hunodan:prepare
INVERSE_HUNODAN_CASES=tmp/inverse-hunodan/<crop-run>/cases.json \
INVERSE_HUNODAN_METHOD=direct INVERSE_HUNODAN_SECONDS=30 \
npm run benchmark:inverse:hunodan
npm run benchmark:inverse:hunodan:report -- tmp/inverse-hunodan/<fit-run>
```

`INVERSE_HUNODAN_IDS` optionally selects comma-separated IDs. `INVERSE_HUNODAN_INCLUDE_EXCLUDED=1` includes auxiliary irregular cases. `hunodan-reference-report.py` separately compares slit counts and overlays exported curves on held-out template scans. Distance to scanned ink is diagnostic: printed guides and text prevent treating it as exact cutting-path ground truth.

In the website select **Pattern style → Fit curves to image**. The General style remains the tracing solver. Original masks and measured difference overlays remain available after fitting; original traced paths are retained for workflows that prepared a trace.

## Practical limits

Photographic agreement is measured against the two-colour estimate, not unavailable original vector artwork. Concealed cutting routes can differ while yielding the same visible weave. The paper model has not been physically assembled or strength-tested.

Extra perturbation tests of the first flag remain mixed: deterministic RGB noise passed (2.05% independent error), while a 75% resize and JPEG recompression failed (4.01% and 3.86%). These were fresh crop-and-fit attempts with the preceding direct version, separate from the original 22-photo denominator. Passing the original corpus does not imply complete perturbation robustness. The image files and rejected attempts remain in local artifacts.
