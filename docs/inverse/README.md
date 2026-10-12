# Image-to-template integration

The engine runs in the editor's paint mode, `/editor/mal/` and `/en/editor/paint/` — see [../redesign/PAINT.md](../redesign/PAINT.md). The visitor paints or imports a two-colour mask, and "Find snit" finds the cuts. The latest algorithm work has been migrated with the redesign's symmetry constraints preserved; see [REDESIGN-MIGRATION.md](REDESIGN-MIGRATION.md) for the comparison, the star conversion regression, and current QA instructions.

Run `npm run test:inverse:paint:browser` against the built app for the actual Paint → Draw → export flow. This checks the final editable geometry as well as the worker's result. The older browser harnesses navigate to the retired `/generate/` page and are historical evidence, not tests of the current UI.

[COUNT-STRATEGIES.md](COUNT-STRATEGIES.md) compares count initialization on the frozen photo dataset, separating the cost of finding initial grids from complete solve time and measured reconstruction quality.

Current full-pipeline investigations are recorded in
[FEATURE-BUDGET.md](FEATURE-BUDGET.md) (giving feature-preserving template layouts
time to refine without cutting off useful traced routing),
[SHARING-SOURCE-VALIDATION.json](SHARING-SOURCE-VALIDATION.json) (checking each
shared-cut repair against the original mask, and separating crop, classification
and template-fitting failures),
[FEATURE-RETRY.md](FEATURE-RETRY.md) (recovering an opening lost after a one-pixel
crop shift, including refinement of an uncertain paper proposal),
[FEATURE-ENCLOSURE.md](FEATURE-ENCLOSURE.md) (preserving enclosed details through
actual upload, alternate template fitting and editable export),
[FEATURE-RESOLUTION.md](FEATURE-RESOLUTION.md) (small-feature spline capacity and
rejected fits that fail editable export),
[FEATURE-CHECKPOINTS.md](FEATURE-CHECKPOINTS.md) (small motif details, initialization,
crop perturbations and editable exports) and
[UNCERTAIN-REFINEMENT-CHECKPOINTS.md](UNCERTAIN-REFINEMENT-CHECKPOINTS.md)
(dense photographic patterns and independent finer paper audits). These distinguish
image agreement, source-feature retention, legal geometry and nominal paper checks;
the historical reconstruction counts below describe earlier implementations.

Shared-cut cleanup now checks proposed alignments against the original-resolution
mask and its protected details before accepting each edit. Previously, one bad
edit could make the final check discard a whole batch of useful seam repairs.
The batch keeps the incoming template's image-error ceiling, so complementary
alignments can trade a few boundary pixels without making that fit worse. The
geometry, paper, symmetry and final whole-batch checks still apply. In that
shared-cut validation run, the 22 regular Hunodan designs retained or improved
their independent errors and remained below nine seconds for preparation,
solving, validation and export.

The diagnostic photo runs also expose limits upstream of fitting: the automatic
jigsaw crop is distorted, and the bauble loses much of its frame during colour
classification even with a historical hand-reviewed crop. Both automatic masks
can receive low-error template fits with a longer budget. That does not establish
correct reconstruction of the photographed hearts; the full-pipeline evidence
retains the source photographs, crops, masks and exported weaves separately.

## Learned graph proposals: controlled experiment

Before training a model, `scripts/inverse/experiments/graph-oracle.mjs` measures
what better graph proposals could accomplish. It explicitly supplies privileged
reference information to selected experimental variants. **These results are
not blind reconstructions, a trained network, or new application success rates.**
The initial study did not change the browser engine. The experiment and five
regressions are committed in `e8bc579`; per-case outcomes, exclusions, timings, source hashes and
export hashes are in [GRAPH-ORACLE-VALIDATION.json](GRAPH-ORACLE-VALIDATION.json).

All 38 gallery identifiers were attempted. Twenty-four imported square
references passed the existing geometry/paper checks and reproduced the gallery
mask within 0.1%. Eleven references failed that eligibility gate and three have
rectangular overlaps unsupported by this importer. They remain in the report;
this does not establish that the published designs are impossible. Eligible
cases use the same 400-pixel mask and a 100 mm overlap. Success requires the
normal geometry and nominal paper checks plus at most 1% disagreement with an
independent rendering of the exported curves.

| Information available to the experiment | 1-second run | 3-second run, passes on all three repeats |
| --- | ---: | ---: |
| Raster tracing and sparse heuristic connectors | 8/24 | 9/24 |
| Exact visible curves and reference vertices, heuristic connectors | 22/24 | 22/24 |
| Same boundaries plus missing reference connectors | 23/24 | 23/24 |
| Same boundaries with only reference connectors | 23/24 | 23/24 |

This baseline is one trace strategy, not the application's automatic pipeline
with direct fitting and retries. It uses the photographic simplification preset
(including the 3 mm border stabilization band) on clean masks; it is not a tuned
clean-artwork tracing baseline. Ordinary preprocessing and graph-construction
improvements may recover part of the gap without learning. The oracle exposes reference subdivision and
anchors that may be invisible in the image, so its gain cannot be attributed
only to better tracing. The compact variant restricts connectors to one known
valid routing, while leaving sheet ownership unknown to HiGHS. It is not a
search over every possible valid pair. Repeat order rotates between variants.

The five-point star isolates a candidate-generation defect. Both raster and
exact-boundary heuristic graphs are exhausted. Two missing straight reference
connections, 19.22 and 12.00 mm long, are within the neighbour budget but fail
the connector clearance pre-filter. Tiny intervening boundary fragments make
nearby edges appear nonincident: their endpoints are only 0.001042 and 0.01586 mm
away. The complete reference routing passes the normal geometry and paper
checks. Adding those two connectors produces a valid zero-mask-error result
in a median 0.077 seconds; its preview is byte-identical to the independently
rendered reference. An edge ranker cannot recover candidates removed before
ranking. This is also an opportunity for a deterministic graph-construction fix.

Pruning can help after coverage is correct. For `juletrae`, reducing 40 heuristic
hidden candidates to the reference's zero reduces median solve time from
0.435 to 0.042 seconds, at the same 0.095625% error. For `plus`, 90 to zero reduces
0.756 to 0.051 seconds, at zero error. Those are paired three-repeat comparisons.
Times include model construction and in-solver validation, but exclude graph
preparation, solver startup and post-solve rendering: they are not browser
click-to-ready times. Aggregate timings over differently successful case sets
should not be treated as a speed comparison.

The remaining eligible case, `squares`, is retained as a failed oracle witness.
A 0.000004 mm visible fragment becomes two duplicate self-loops after the normal
graph splitting and endpoint normalization; the embedded routing fails
self-intersection and edge-parity checks. No tolerance or witness requirement
was relaxed to make it pass. The experiments therefore expose representation
issues as well as opportunities for learning.

### Follow-up: connector adjacency across tiny boundary fragments

The initial study led to a deterministic graph-construction fix in `ecb35f1`.
Previously, an optional connector was exempt from the proximity filter only for
visible edges incident directly to its endpoints. Subdividing one of those
visible edges 0.0001 mm from the junction could make the otherwise identical
connector disappear. The same condition removed the star's two reference
connections.

Candidate construction now follows connected visible fragments for at most twice
the existing geometry tolerance (0.02 mm with the default settings) to determine
local adjacency. It uses control-polygon lengths, an upper bound on curve arc
length, so spatially close endpoints reached through a long detour are not
treated as adjacent. Optional hidden candidates cannot extend this neighborhood.
The intersection filter and the final geometry, paper and export checks are
unchanged; no source boundary coordinates or masks are moved.

Seven focused regressions cover one or several small fragments, reversed edges
and rotation, production noding, an unrelated nearby boundary, a long detour,
hidden-edge isolation, and a crossing away from the junction. They also solve a
subdivided fixture with HiGHS and compare its exported rendering with the
unchanged reference mask. Three cases failed before the fix.

Repeating the full gallery study three times improves the exact-boundary
heuristic variant from 22/24 to 23/24. The five-point star now solves at zero
sampled mask error without any supplied connectors; all other case statuses and
measured errors are unchanged. The blind raster variant remains 9/24. Thus the
fix repairs candidate coverage but does not resolve the earlier tracing losses,
and the `squares` witness failure remains outstanding.

The full photo workflow retains 23/31 accepted cases, with all 28 generated
pairs passing editable conversion, editor intersection rules and the nominal
paper checks. Crops, classified masks and fitting probabilities are unchanged.
All 22 regular Hunodan inputs pass the established quality gate in under ten
seconds (maximum 9.124 seconds). Twenty-one errors are identical to the preceding
run; `hjstr-03` changes from 0.557976% to 0.561298%, five pixels at 388 × 388.
That case rejects tracing before graph construction and uses the unchanged
time-limited direct fitter. A separate V8 coverage replay confirms zero calls to
both `buildGraph` and the new adjacency helper for that case. Instrumentation
substantially slows that diagnostic, so its timing and error are excluded from
the production benchmark. The variation is retained in the evidence rather
than described as unchanged quality. See
[CONNECTOR-SUBDIVISION-VALIDATION.json](CONNECTOR-SUBDIVISION-VALIDATION.json).

Validation passed all 601 inverse tests and 855 application tests (one existing
skip), lint and the production build. Type checking has no errors and seven
existing warnings. Twelve Chromium/WebKit workflows cover the star example,
independent-sheet free-border hat, Viking and Stonehenge photos, Hunodan
`hjfig-05`, and bird mask, including editable export checks. All 65 served engine
and worker JavaScript hashes match the source. Visual checks retain the photo
limitations: the Viking still has thin seams and distorted frame details, and
Stonehenge still loses sun rays; passing the numerical gates is not exact motif
recovery.

### Candidate learning tasks

The following are proposals, not measured model performance:

| Task | Suggested inputs and outputs | Role and limitation |
| --- | --- | --- |
| Boundary and junction prediction | Soft mask, uncertainty and gradients → boundary distance field, junction heatmaps, subpixel positions and tangents | Preserve lines, corners and small details while avoiding pixel staircases. Also needs an ordinary geometry baseline. |
| Missing-connector proposals | Junction features, local image patches and graph context → endpoint pairs and a few straight/curved connection candidates | Addresses coverage. Hidden routes are not uniquely determined by the picture; offer alternatives. |
| Candidate ranking | Generous geometric candidate pool → usefulness scores | Try a small high-recall graph first, then expand. Never permanently remove a route merely because its learned score is low. |
| Local junction routing | Incident directions and nearby boundaries → likely continuations, crossings or shared spans | A compact classification problem; global parity/connectivity still belongs to the solver. |
| Endpoint/count hypotheses | Smoothed border bands and interior features → distributions over endpoints and slit counts | Test a few plausible hypotheses jointly, instead of trusting each noisy outermost transition. |
| Partial sheet assignment | Graph and image features → several uncertain A/B assignments | Let MILP finish each proposal, releasing fixed choices on failure. A/B exchange and path order must not create artificial training errors. |
| Bézier initialization | Rectified mask → a few coarse template pairs | Existing optimization refines them. Predict shared spans as shared objects so refinement cannot split an invisible seam. |
| Learned repair selection | Current candidate, residual image and validation defects → regions whose topology/curves should be reopened | Useful after a nearly correct fit; retain a valid incumbent and accept only checked improvements. |
| Crop/mask uncertainty | Photo → corner alternatives, paper probabilities and uncertainty | Helps upstream failures. Graph learning alone cannot fix missing crops or incorrect classified targets. |

Other directions worth comparing are retrieval of a small set of validated
topologies followed by deformation; a motif grammar that separates a regular
grid/frame from a central shape; and predicting two latent sheet-parity fields
whose XOR reproduces the image. The last can use rendering supervision, but
without ordered-cut and connectivity constraints the factorization admits many
useless solutions. Learning internal branch-and-bound choices is another option,
but requires more solver integration and cannot repair a graph that lacks any
valid routing. These are lower-priority experiments than boundary/vertex
prediction and candidate coverage, given the results above.

A small CNN for image features plus a lightweight pair scorer is a practical
first architecture to investigate. A GNN becomes useful if interactions among
candidate edges defeat the pair scorer; a logistic or small MLP baseline should
be measured first. Image-to-junction/segment proposals have precedent in
[HAWP](https://arxiv.org/abs/2003.01663). Partial assignments followed by an exact
solver are studied in [Neural Diving](https://arxiv.org/abs/2012.13349), and learned
selection of variables to reopen is studied in
[learned large-neighborhood search](https://arxiv.org/abs/2107.10201). These papers
motivate designs; their reported gains do not transfer automatically to hearts.

Training should start from varied, independently validated template pairs:
render their weaves, then add blur, resampling, crop offsets, lighting and colour
variation while retaining clean geometry labels. Include curved and angular
motifs, shared cuts, unequal counts, and nearly ambiguous junctions. Generate
new topologies as well as deformations; thousands of corruptions of a few
hearts are not thousands of independent designs. Keep real photographs and
entire motif families held out, grouping crops and all augmentations of a source
in one split. Fine-tune photo processing only on reviewed real examples.

Several template pairs may render the same motif. Do not label every connector
absent from one reference as impossible. Use multiple valid routings where
available, sheet-swap-invariant targets, rendering agreement and solver-validated
alternatives. The useful metric is whether a small proposed graph contains a
valid low-error pair, not exact recovery of an arbitrary reference's edge IDs.
Measure that coverage, full-pipeline feature retention and editable legality,
and time to a valid result including inference and model loading. Perturbation
tests and the regular Hunodan speed/error gate remain required.

The intended hybrid is: uncertain image/boundary proposals → small candidate
graph → HiGHS routing → Bézier refinement → independent export validation.
On failure, expand candidates or retry another topology using the original
mask. Confidence guides search; it does not replace image, geometry or paper
checks. Browser deployment could use ONNX Runtime Web, but model size, loading
cost and WASM/WebGPU performance must be measured on target devices; its
[documentation](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) recommends
WASM for lightweight models and describes the CPU–GPU data transfers to account for.
No model or runtime dependency was added by this experiment.

Reproduce the gallery study with:

```sh
node scripts/inverse/experiments/graph-oracle.mjs --ids=all --seconds=3 --repeats=3 --output=tmp/graph-oracle-replay
node --test --test-concurrency=1 scripts/inverse/graph-oracle.test.mjs
```

## Historical integration notes

The sections below record earlier releases and experiments. Their standalone-page controls, browser commands and deployment instructions refer to those releases.

The feature imports the recovered JavaScript engine from `juleflet-codex-handoff.zip`. It is experimental: it can find checked template pairs for simple artwork, but it is not a completed reconstruction of the published gallery. The Star button now prepares an image for a fresh inverse solve using the explicit matching-sheet preset. Its cuts are compared against the published template; see [REFERENCE-QUALITY.md](REFERENCE-QUALITY.md). JUL still audits saved geometry. The 38-design blind raster benchmark achieves reference-quality matches for 11 designs across two presets; the sanitized visible-vector track and broader reconstruction work remain unfinished. No physical paper assembly has been tested.

The new motif-locator addendum provides automatic single-heart fitting, rough rectangle selection in collages, draggable corners and an original-photo preview. See [LOCATOR.md](LOCATOR.md) for integration details and the full 40-heart benchmark: 29 proposals, 11 unresolved crops, and one provisional numerical reconstruction.

Example buttons now perform a visible action immediately: Waves and Star prepare editable pattern previews, while JUL runs a saved-template check. On mobile, the preview scrolls into view. Examples clear the prior upload and its error state; failed example requests clear stale exports and permit retry.

The photographic recrop handoff adds an explicit red/white mixture conversion and a direct JavaScript Bézier fitter. **Fit curves to image** produces 11 accepted pairs among the same 31 fully visible motifs, versus 3 with tracing at the same 60-second budget. Twenty perturbations retain accepted exports, but five change slit counts. See [DIRECT-FITTER.md](DIRECT-FITTER.md) for crop/colour comparisons, remaining visual defects and root-cause experiments; [PHOTO-RECROPS.md](PHOTO-RECROPS.md) records the earlier archive validation.

The paint editor's symmetry rows are enforced by the engine itself. A requested set of mirrors, transposes or half turns is a hard constraint on the cut set: every per-pixel target the search optimizes becomes the mean over the generated group of its transformed copies, so both mirrorings of the drawing sit inside the loss, and the fitted control points are projected onto the symmetric subspace at every optimizer step. The painted mask is never rewritten — symmetry evidence, feature audits and the reported image error still measure the original classified drawing — and `report.symmetry` lists the transforms the exported control points actually satisfy within 1e-6 mm, measured rather than assumed, with a `report.warnings` entry whenever a requested transform is missing from that list. A per-cut `withinCurve` option makes each cut symmetric about its own chord. Anything beyond `transpose` routes to the direct fitter, since the traced MILP route holds no mirrored partner to constrain. See [SYMMETRY.md](SYMMETRY.md) for the pairing table, the stage-by-stage targets, the count parity rule and the limits.

## Runtime and changes

- `static/inverse/core/` contains the recovered numerical modules. Keeping their relative URLs intact also preserves the pinned HiGHS wrapper/WASM pairing. The build copies these assets verbatim; SSR never imports the engine or initializes WASM.
- `static/inverse/worker-bootstrap.js` and `worker.js` run preparation, inverse solving, saved-template audits and ZIP creation away from the main thread. Cancellation terminates the worker; another preparation creates a fresh one.
- `src/lib/inverse/client.ts` owns the worker lifecycle and rejects stale replies. The Svelte page clears prepared artwork and downloads whenever settings, colours or input change.
- SVG previews are generated from numerical geometry and displayed as blob-backed images. Uploaded SVG markup is never inserted into the document. PNG/JPEG/WebP decoding and all artwork processing stay in the browser.
- The general preset retains the original routing and manufacturing constraints. The matching-sheet preset adds border-inferred mid-curve portals and corner candidates, with compact turn costs and an original-image fidelity gate in both profiles. Core fixes cover SVG inversion, limiting tracing resolution to the source image size (with the existing 32-pixel minimum), consistent pixel-edge coordinates for photo crops, and an explicit reason when a search ends without a validated solution (`time_limit`, `candidate_graph_exhausted`, or `round_limit`). Exhausting the finite candidate graph does not prove a design impossible.
- Raster corner detection now requires a turn to persist across a physical neighbourhood, preventing tiny pixel stairs from pinning artificial corners. Cubic fitting refines point parameters before subdividing while retaining the existing fit acceptance checks. If refinement fails, subdivision uses the original error distribution. Numerical regressions cover smooth bends and intentional right angles.
- Raster crop borders use a 3 mm band in the General and Simplify presets of inward-profile consensus to reduce false slit endpoints. The earlier 1.5 mm default sampled inside the photographed background fringe on automatic star crops; [AUTOMATIC-STAR-QA.md](AUTOMATIC-STAR-QA.md) records the diagnosis and complete browser reconstruction checks. Set **Stabilize crop border** to zero to disable it. The original classified crop is retained for the binary-mask view and result image-error measurement. See [ROBUSTNESS.md](ROBUSTNESS.md) for the algorithm, the bell perturbation tests and 19 cropped collage cases.
- Image conversion exposes the recovered engine's nearby-junction merging in millimetres. It joins compatible opposed corners, skips unrelated corners and records each repair in the report. The optional **Simplify traced artwork** action reprepares with a 0.75 mm fitting tolerance, 0.3 mm smoothing radius, 1.5 mm junction-merge radius and 30 mm maximum segment length. Detailed defaults remain 0.5 / 0 / 0 / 15 mm. Simplification changes the target artwork: inspect the preview, changed-pixel fraction and component warnings before generating.
- Worker integration additionally clears stale prepared geometry before attempting another preparation and stores the latest result for ZIP export. Template files are still withheld on failed or uncertain strict paper checks; diagnostic files can be downloaded.

The initial real-browser test exposed a small raster regression in the recovered engine: enlarging a 64-pixel checkerboard to the default 400-pixel trace grid changed 24 visible chains into 26 and made the finite routing model infeasible. Tracing at the source resolution retains all four-way junctions, changes zero sampled pixels and produces a validated 3 + 3 slit pair. A second regression fixes the half-pixel offset between an uncropped square and selecting its four outer corners. Both have numerical regressions; the failed browser run is retained with subsequent runs.

Paper width, strip width, kerf, fitting tolerance and cutting allowances use millimetres. Input classification colours are separate from output paper colours. Paper A is the site's right paper and paper B is its left paper. Printable SVGs retain physical dimensions and a 20 mm scale line; the downloadable HTML lays out both pages at actual size. Reports and embedded print instructions remain in English, with Danish/English page instructions.

No source gallery SVGs, editor routes, homepage layout, domain settings or existing licence files were replaced. The optional matching-sheet preset has separately stated sharp-corner constraints. The Python reference, historical release archives and historical generated outputs are not shipped to visitors.

## Validation

The September 7 evening corner-detector and generator QA is recorded in [GENERATOR-QA.md](GENERATOR-QA.md). It includes the reported yellow/gold photo, adaptive palette/lobe fitting, manual-tool recovery, 235 automated tests and 113 actual browser checks. The extended generator suite runs in Chromium, Firefox and WebKit; locator, example and direct-fit regression suites additionally run in Chromium and Firefox. Photo proposal counts and reconstruction quality are reported separately.

```sh
npm run check
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

`npm test` runs the existing website suite, new worker lifecycle regressions, the 48 imported numerical tests and new integration regressions. This also makes the engine suite part of the existing Pages CI test step.

For actual browser/Worker/WASM checks, install Playwright separately (or use an existing installation):

```sh
npm install --prefix /tmp/juleflet-browser playwright@1.58.2
/tmp/juleflet-browser/node_modules/.bin/playwright install chromium firefox
PLAYWRIGHT_MODULE=/tmp/juleflet-browser/node_modules/playwright/index.mjs npm run test:inverse:browser
```

The browser test defaults to Chromium and Firefox against `http://127.0.0.1:4173`. Override with `INVERSE_TEST_URL` and `INVERSE_TEST_BROWSERS` (comma-separated `chromium,firefox,webkit`). It uses real HTTP assets and no solver fixture injection. It checks both languages, fresh SVG and PNG solves, file/ZIP/print export, four-corner cropping, the simplification preset, cancellation/restart, saved-template audit labelling, rejection of active SVG, explicit timeouts, responsive layout and existing gallery/editor navigation. Each run preserves reports, downloads, screenshots and failures under a fresh `tmp/inverse-browser/<run-id>/` directory. External analytics and the GitHub star widget are blocked during these tests. Restart the preview server after rebuilding so its cached asset manifest matches the new files.

The imported test counts are engineering regressions, not counts of successfully reconstructed gallery designs. `PROVENANCE.json` records the source archive and original/integrated asset hashes. `VALIDATION.json` records this integration's checks and browser evidence.

## Photo comparisons

`npm run benchmark:inverse:photos` downloads seven finished-heart photos from the two sites suggested during testing and compares the detailed and simplified presets. `scripts/inverse/photo-cases.json` records source URLs, manually selected corners and small crop insets used to exclude outer paper/background fringes. Both presets receive the same effective crop. No cutting templates are inputs. Runs preserve original photo hashes, effective crops, engine hashes, settings, target previews, successful exports and every failure in a fresh `tmp/inverse-photo-benchmark/<run-id>/` directory. Photos are local test material and are not bundled into the public site.

The initial recorded run below predates crop-border stabilization. It uses a five-second solver budget, 100 mm overlap, 400-pixel tracing, strict material checks, no hidden-cut rounding and zero perturbation trials. `INVERSE_PHOTO_SECONDS` changes the budget. Times below include preparation and checks, so they can exceed the solver budget. The current script explicitly enables the 1 mm border band; its later run and outcomes are recorded in `VALIDATION.json`.

| Photo | Detailed segments / result | Simplified segments / result |
| --- | --- | --- |
| Eight-point star | 53 / checked, 4.63 s | 27 / checked, 2.78 s |
| Curved star | 115 / timed out, 5.28 s | 70 / checked, 1.43 s |
| Outline star | 92 / candidate graph exhausted | 58 / candidate graph exhausted |
| Cross | 48 / checked, 4.33 s | 24 / checked, 1.79 s |
| Puppy | 79 / opposite-border counts disagree | 47 / opposite-border counts disagree |
| Stonehenge | 155 / opposite-border counts disagree | 99 / opposite-border counts disagree |
| Viking ship | 141 / candidate graph exhausted | 80 / candidate graph exhausted |

This was three checked pairs out of seven with simplification versus two with detailed tracing, under the stated settings. For the curved star, simplification merged eight nearby junctions and increased the sampled tracing-change fraction from 1.20% to 2.43%. These checks concern the processed target and numerical paper constraints, not fidelity to the authors' cutting templates, physical assembly or the entire source galleries. Later work adds a clean bell image and 19 manually cropped cases from the newer Pinterest screenshot; their source uncertainty, outcomes and remaining failures are described in [ROBUSTNESS.md](ROBUSTNESS.md). `REFERENCE_IMAGES.json` identifies the user-supplied references without redistributing them.

## Deployment and rollback

This change is on `codex/integrate-juleflet`; it has not been pushed or deployed. The current repository uses Node 22 in `.github/workflows/deploy.yml`. Its existing pipeline checks, lints, tests and builds before publishing `build/` to GitHub Pages on pushes to `main`.

After review, merge the feature branch through the normal repository process. Check the Pages workflow, then verify `/generate/`, `/en/generate/` and `/inverse/vendor/highs.wasm` on juleflet.dk and run a fresh solve. The last pre-integration commit is recorded in `PROVENANCE.json`. Rollback consists of reverting the integration commit(s) on `main` and letting the same workflow redeploy. No DNS or credential changes are needed.

## Attribution

The website's existing `LICENSE` contains GPL-3 text while its README says MIT. This integration preserves both existing files and does not resolve that pre-existing discrepancy or relicense the site. Imported application code retains `static/inverse/LICENSE.txt`; solver notices and binary provenance remain beside the vendored solver. `static/inverse/THIRD_PARTY_NOTICES.txt` is the original notice (its `site/` references describe the source archive). `HANDOFF_ATTRIBUTION.md` preserves the original handoff attribution text; its relative paths refer to that archive. Example artwork retains its original rights and is not assigned the software licence.
