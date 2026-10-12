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

The [shared-cut ordering follow-up](datasets/shared-cut-order.md) also retries
alignment when final straight-span selection changes the curves. This removes
a photographed frame seam that was rejected before straightening, while
retaining useful earlier alignments and the same total sharing budget.

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

In the initial study, the remaining eligible case, `squares`, failed its oracle witness.
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
fix repairs candidate coverage but does not resolve the earlier tracing losses.
The `squares` witness still failed at this stage; the next follow-up addresses it.

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

### Follow-up: closed curves and collapsed boundary fragments

The next graph fix, `c105a1b`, resolves two opposite endpoint-handling errors.
Noding discarded a genuine closed cubic because its first and last points
coincided, regardless of the shape between them. Graph construction instead
split every near-closed segment, including a 0.000004 mm straight fragment in
`squares`. Endpoint normalization turned that fragment into two duplicate
self-loops, preventing a valid routing.

Both stages now inspect the whole cubic control hull. Only a segment whose four
control points share one five-decimal graph vertex key can collapse. Genuine
closed curves are recursively subdivided into edges with distinct endpoints;
even tiny bridges across distinct vertex cells remain connected. The existing
endpoint and adjacent-handle normalization is measured in graph metadata.
The independent geometry, paper and image acceptance rules are unchanged.

Five focused tests preserve closed-contour area at two scales, preserve the
rendered mask through graph construction, reject artificial self-loops, retain
a tiny bridge across vertex cells, and retain nonzero excursions when a cubic's
midpoint returns to its start. All five failed before the fix. A sixth test
loads the actual `squares` reference and solves it with ordinary connector
proposals and unknown sheet ownership. Oracle witnesses now also require an
independent rendering check after their paths are remapped through normalized
edges.

Across all 38 gallery entries and three repetitions, the 24 eligible references
now all pass the exact-boundary heuristic variant, up from 23. The other 14
remain excluded under the existing import, geometry and paper criteria. The
`squares` solution has zero sampled mask error and a preview identical to its
reference, with no oracle connectors added. Its ordinary candidate graph takes
0.986 seconds at the median; supplying only the known hidden connectors reduces
that to 0.075 seconds. All other case statuses and image errors are unchanged.
The blind raster strategy remains 9/24. Exact geometry and reference vertices
are supplied in the successful oracle experiment; this is evidence about graph
construction and search, not 24 successful photographic reconstructions.

The regular Hunodan replay passes 22/22 in under ten seconds, with a maximum of
8.923 seconds and all 22 errors identical to the preceding run. The hard-photo
workflow remains 23/31 accepted: three cases have no crop and five generated
pairs fail image/detail acceptance. All 28 generated pairs pass editable
conversion, editor intersections and nominal geometry/paper checks; their crops,
masks and fitting probabilities are unchanged. Ten time-limited fits have
different measured errors, including increases of up to 0.074375 percentage
points. These measurements are retained rather than presented as uniform photo
improvements. Visual review still finds Viking seams/frame defects and lost
Stonehenge sun rays.

All 607 inverse tests and 855 application tests pass (one existing application
skip), as do lint and the production build. Type checking reports zero errors
and seven existing warnings. Fourteen Chromium/WebKit workflows pass, including
the star, closed circle, independent-sheet free-border hat, Viking and Stonehenge
photos, Hunodan `hjfig-05`, and bird mask. All 65 served engine/worker JavaScript
hashes match the source. See the per-case results and unchanged acceptance
criteria in [CLOSED-BOUNDARY-VALIDATION.json](CLOSED-BOUNDARY-VALIDATION.json).

### Follow-up: boundary quality versus junction placement

The next study (`8b32f16`) tests eight graph constructions on the same 38 gallery
entries. The same 24 references qualify, and each variant gets three repetitions
with a three-second solve allowance. Source masks, geometry/paper requirements
and the 1% independent exported-image error limit are unchanged. Known hidden
connections and sheet ownership are never supplied in these variants.

| Graph construction | Passes on all three repetitions |
| --- | ---: |
| Original photo-oriented trace | 9/24 |
| Same trace plus projected reference junctions | 8/24 |
| Clean-mask trace: no border repair, smoothing or snapping; 0.25 mm mixed straight/cubic fitting | 6/24 |
| Clean trace plus projected reference junctions | 6/24 |
| Clean trace subdivided to at most 8 mm per segment | 2/24 |
| Exact boundary and reference subdivision | 24/24 |
| Exact boundary with straight degree-two interior anchors removed | 23/24 |
| Previous variant subdivided to at most 8 mm per segment | 12/24 |

These are controlled constructions, not a tuned portfolio or the automatic
application pipeline. The clean trace is one fixed preprocessing choice, not
the best attainable non-neural vectorizer. Projected junctions are reference
visible-edge endpoints projected onto the existing trace within 1 mm. They add
Bézier subdivisions rather than moving the contour or repairing its topology.
Removing straight anchors retains corners, intersections already represented
as vertices, and all curved anchors; exact variants retain the reference's
intersection subdivision policy. This is a partial junction ablation, not a
complete boundary-only oracle.

The `squares` case isolates a useful missing-junction effect. Its clean trace has
zero sampled mask error but its sparse graph is exhausted. Adding eight
projected reference junctions produces a valid reconstruction, while removing
ten straight anchors from the exact reference makes that graph unroutable.
The clean-trace total remains 6/24 because `explosion` then times out after its
own junction additions. Cleaner boundaries and extra junctions do not by
themselves ensure a compact, tractable routing problem.

The star's clean trace improves sampled boundary disagreement from 1.106875% to
0.1525%, but its candidate count increases from 65 to 370; it times out at the
three-second limit. The exact reference uses 30 candidates and succeeds. Dense
subdivision also changes candidate coverage: the star's known 12 mm connection
falls to nearest-neighbor ranks 9 and 17, outside this study's limit of eight.
`graph-pool-diagnostic.mjs` reconstructs all recorded exact-boundary graphs and
finds this new loss in one of the 24 cases. The production recovery route already
has a denser fallback; this diagnoses the sparse first proposal, not every
application search. Missing one reference edge does not prove that alternative
valid routings are absent.

The study exposed another deterministic geometry failure, fixed in `3d48a04`:
collinear endpoints separated only by tolerated roundoff could return segment
parameters outside `[0,1]`. In the star trace this produced an invalid cubic
interval `[1, 1.0000000000015086]`. Endpoint contacts and interpolated curve
parameters are now clamped to their valid domain, with the existing contact
tolerance unchanged. Three regressions fail before the fix and pass afterward,
including the actual failure reduced to two adjacent star fragments.

Boundary diagnostics use cubic ray intersections instead of adaptive chords,
whose rasterization can vary when an unchanged curve is subdivided. Remaining
diagnostic differences affect 34 pixels across three variant/case pairs;
closest-point calculations place all of them numerically on both versions of
the boundary (largest computed distance 1.6 × 10⁻¹³ mm). These ambiguous samples are retained
in the report rather than counted as real image improvements. Final template
acceptance continues to use independently rendered exported SVGs. The
reference and variant boundary SVG/PNG artifacts are saved for inspection.

The learning target should therefore combine a compact boundary representation,
useful junction placement and connector ranking. A clean-trace tolerance sweep
remains useful; the neighbor-budget alternative is evaluated in the next
follow-up. This experiment
does not establish that a neural network is required or that a junction-only
model would improve the full photographic pipeline.

The endpoint-fix release replay retains 22/22 regular Hunodan passes under ten
seconds (maximum 8.927 seconds), with all errors identical to the previous run.
The hard-photo workflow remains 23/31 accepted, with all 28 generated pairs
passing editable conversion, editor intersection checks, and nominal geometry
and paper checks. All crop coordinates, classified masks and fitting
probabilities are unchanged. Nine time-limited fits have different measured
errors, including increases up to 0.0325 percentage points; these are recorded
without claiming a uniform photographic improvement.

Visual inspection of the ten-second photo benchmark still finds unwanted seams
in the Viking reconstruction and loss of fine sun rays in Stonehenge. These cases
pass the current numerical gates; that does not make them faithful photographic
reconstructions. Preserve
their source/mask/weave comparisons in evaluation, and do not treat every
accepted solver output as a clean training label. Geometry validity and visual
fidelity need separate checks when selecting training examples.

Release checks pass: 617 inverse tests and 855 application tests (one existing
skip), type checking with zero errors and seven existing warnings, lint and the
production build. Fourteen browser workflows pass across Chromium and WebKit,
covering star, circle, independently fitted free-border hat, Viking, Stonehenge,
Hunodan `hjfig-05` and bird mask. All 65 served engine/worker files match the
validated source hashes. Per-case outcomes, timings, source hashes, input
identity checks and the candidate-pool audit are recorded in
[BOUNDARY-JUNCTION-VALIDATION.json](BOUNDARY-JUNCTION-VALIDATION.json).

### Follow-up: retry an exhausted graph with more useful neighbor slots

The candidate-budget experiment (`5b8bc5c`) excludes already-connected visible
neighbors before taking the nearest-neighbor budget. Previously these pairs
occupied slots and were discarded afterward, so adding a harmless boundary
anchor could exclude a useful hidden connector. This expansion restores a known
12 mm connection in the subdivided star, which solves in all three repetitions
at about 1.68 seconds with three pixels of exported-mask disagreement.

However, applying the expanded pool everywhere makes several other cases slower.
All three-repeat successes in the fixed three-second gallery study are:

| Graph construction | Established pool | Always-expanded pool | Per-graph retry (`ca030d4`) |
| --- | ---: | ---: | ---: |
| Photo-oriented trace | 9/24 | 9/24 | 9/24 |
| Same trace plus projected reference junctions | 8/24 | 6/24 | 8/24 |
| Clean trace | 6/24 | 5/24 | 6/24 |
| Clean trace plus projected reference junctions | 6/24 | 5/24 | 6/24 |
| Clean trace with uniform subdivisions | 2/24 | 2/24 | 2/24 |
| Exact boundary and reference subdivision | 24/24 | 23/24 | 24/24 |
| Exact boundary with straight interior anchors removed | 23/24 | 23/24 | 23/24 |
| Previous variant with uniform subdivisions | 12/24 | 10/24 | 12/24 |

The projected simple-star graph grows from 97 to 117 hidden candidates. It finds
candidate routings, but they fail the existing narrow-neck checks before the
budget expires. Even the exact `squares` case regresses after adding two optional
connections. These results reject always expanding the default pool; the initial
release replay was deliberately stopped during Hunodan testing and is not used
as completed release evidence. All 192 visible boundary variants are unchanged.
The rejected experiment, paired outcomes, solver histories for changed cases,
and restored-connector diagnostic are preserved in
[CONNECTOR-EXPANSION-EXPERIMENT.json](CONNECTOR-EXPANSION-EXPERIMENT.json).

The next implementation (`ca030d4`) preserves the established smaller graph
first. Only a `candidate_graph_exhausted` result, with time remaining, permits a
second graph whose neighbor budget excludes existing visible pairs. A timeout
is not a trigger. If there are no added candidates, the same MILP is not rerun.
Both graph construction and the second solve use the remaining deadline, and
neither changes the input boundary. The common routing helper is used by the
traced API, automatic vector route, topology initializer and feature recovery.
Intersection, clearance, minimum connector length, graph-size and final
geometry/paper/image checks are unchanged.

A reduced valid fixture places two visible neighbors close to each end of a
necessary shared cut. With two neighbors allowed, the first graph excludes that
cut and HiGHS exhausts it. The conditional expansion solves and its independently
rendered export exactly matches the unchanged reference mask. Six regressions
cover this recovery, quarter-turn/reflection cases, unchanged visible coordinates,
a crossing blocker, successful first solves, cached topology graphs, and avoiding
a repeated MILP when expansion adds nothing. All 30 focused tests pass, including
the existing automatic-star, coarse-topology and graph regressions.

The conditional replay preserves every previous successful case across all
three repetitions. It adds no gallery successes: its demonstrated recovery is
the reduced regression fixture. Eight case/variant pairs try the expansion in
all three repeats; seven still prove exhausted, while the clean circle with
reference junctions changes from exhaustion to a timeout. These remain failures.
All 192 visible boundaries and all reference masks are unchanged. Synchronous
model construction and validation can finish beyond the nominal time allowance;
the measured solve durations, including those overruns, remain in the report.

The full photographic workflow exposed a scheduling problem that the gallery
study could not: immediate expansion of one provisional border consumed the
time needed to try another border. The leaf moved from 2.65125% disagreement to
5.078125% and failed the paper checks; the hard-photo run fell from 23/31 to
22/31. Its crop, classified mask and fitting probabilities were unchanged. The
earlier border's small graph proved exhausted in about 3.59 seconds, but its
expanded graph consumed the remaining allowance. The established workflow had
then tried four later border/smoothing proposals and found a usable refinement
seed. This was a search-scheduling regression, not a cropping change.

The scheduling correction (`7b7d17a`) queues connector expansion until after the
established smoothing and border alternatives. It preserves single-boundary
recovery for vector inputs and topology initialization. The queues retain only
the final exhausted pool of each interpretation; an expansion that adds no
candidates is not solved, and a graph-construction rejection does not prevent trying
later queued proposals. No provisional border may use the new expansion ahead
of an existing border alternative.

A frozen-photo regression fails before this scheduling correction and passes
afterward. It verifies the later valid leaf routing, unchanged mask/probabilities,
independent rendering and geometry/paper checks. A separate closed-motif fixture
verifies that expansion still runs after every ordinary hypothesis is exhausted;
the new recovery is deferred, not disabled. The fresh ten-second leaf replay
again passes at approximately 2.65% disagreement. The browser replay now also
includes its frozen classified mask, uploaded as pixels without template paths.

The full suite then caught a duplicate graph-progress notification introduced
by the shared routing helper. The existing slow-probe regression expected one
notification per recovery phase, but received an extra event inside the resumed
phase. Commit `53b823e` lets recovery retain ownership of that notification; the
unchanged regression passes again.

The first deferred-expansion photo replay also spent more time on unsuccessful
checkerboard routing. The warped checker has a concrete connector-independent
contradiction: a visible curve joins adjacent square borders, so its minimum
control-hull clearance is zero in both directions. The existing MILP disables
that entire curve on both sheets, while requiring every visible curve to belong
to one sheet. Additional hidden connections cannot satisfy these bounds with
that segmentation. This does not prove that the photographed design is illegal;
different subdivision, tracing or initialization may still recover it.

Commit `c69c9b9` records that contradiction after an exhausted solve and skips
both the denser ordinary pool and deferred expansion of the same boundary. It
still tries the alternative smoothed trace. The margin calculation is shared
with the existing MILP variable bounds; no geometry or image acceptance rule is
relaxed. Two regressions fail before the change and pass afterward, including
the original warped-checker pixels at frozen automatic corners. Its routing
attempts fall from five to two, with the input mask and probabilities unchanged.
All 16 focused routing, scheduling and feature-refinement tests pass.

The same diagnostic finds neither a doubly forbidden visible edge nor an
impossible local junction assignment in the fine checker. Its failed connector
expansions remain real extra work; the warped-checker explanation cannot be
generalized to that case. The release comparison retains all measured errors
and stage timings rather than attributing the entire quality difference to
uncontrolled timing variation.

The final Node replay retains 22/22 regular Hunodan passes, with identical
independent errors and a maximum prepare/solve/validate/export time of 9.00
seconds. The photo run remains 23/31 accepted; all 28 generated pairs pass
editable conversion, editor intersections and nominal paper checks. Crops,
masks and probability fields are unchanged. Twelve final errors increase by up
to 0.16 percentage points relative to the earlier release replay; no uniform
photographic quality improvement is claimed.

To distinguish repeatability from the new search overhead, three paired replays
alternate the old and current engines on the same frozen checkerboard masks.
The warped checker's errors are identical within each pair (2.175625%, then
2.096875% twice), while median feature-routing time falls from 0.533 to 0.192
seconds. On the fine checker, median routing time rises from 0.646 to 0.837
seconds and median error rises from 2.578125% to 2.631875%. That small quality
regression remains unresolved; the extra optional searches have not helped this
input. Both engines' older single-run values differ from these fresh replays.
The comparison records all repeats and does not select only the best outcomes.

Release checks pass: 627 inverse tests, 855 application tests (one existing
skip), type checking, lint and production build. Sixteen browser replays pass
across Chromium and WebKit, including editable SVG and PDF export, and all 66
served engine files match their source hashes. The browser runs use the normal
application budgets rather than the ten-second benchmark budget. Visual review
still finds fine seams in the Viking and missing small rays in Stonehenge;
passing aggregate image error is not sufficient evidence of motif fidelity.
The complete results, paired repeats, source hashes and limitations are recorded
in [CONNECTOR-RETRY-VALIDATION.json](CONNECTOR-RETRY-VALIDATION.json).

### Candidate learning tasks

The [training-data overview](datasets/README.md) now links the collected real
photographs, Pinterest importer, validated synthetic generator and pretrained
model comparison. These prepare learning experiments; no neural model has
been trained or integrated into the live solver.

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
| Free-border completion | Fixed central motif and the user-permitted border band → several boundary completions and endpoint hypotheses | Can make simple blobs weaveable without learning an unconstrained redraw. Never change pixels outside the permitted region. |
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
Likewise, an arbitrary extra Bézier knot does not change the design: training
targets should canonicalize equivalent subdivisions and distinguish visible
corners from latent junctions where a hidden shared cut meets a boundary. The
latter may have no local image evidence; predict alternatives using wider motif
context, rather than treating one reference position as uniquely observable.
Measure that coverage, full-pipeline feature retention and editable legality,
and time to a valid result including inference and model loading. Perturbation
tests and the regular Hunodan speed/error gate remain required.

Longer offline searches can provide several validated alternatives and the cost
of finding them. Keep timeouts as unresolved examples, not evidence that an
edge or routing is impossible. Even proven infeasibility applies to the supplied
graph and boundary hypothesis; it does not rule out a better trace or additional
connectors. This distinction matters when training from solver logs.

The intended hybrid is: uncertain image/boundary proposals → small candidate
graph → HiGHS routing → Bézier refinement → independent export validation.
On failure, expand candidates or retry another topology using the original
mask. Confidence guides search; it does not replace image, geometry or paper
checks. Browser deployment could use ONNX Runtime Web, but model size, loading
cost and WASM/WebGPU performance must be measured on target devices; its
[documentation](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) recommends
WASM for lightweight models and describes the CPU–GPU data transfers to account for.
No model or runtime dependency was added by this experiment.

A first prototype should separate boundary reconstruction from connection
ranking so the two can be evaluated independently. Feed a small encoder-decoder
the rectified soft mask, image gradients and classification uncertainty; predict
boundary distance, junction heatmaps, subpixel offsets and tangent directions.
Convert these into a few alternative vector boundaries and additional junction
proposals. A pair scorer can then combine local image features with endpoint
distance, tangent alignment, boundary degree and geometric clearance to rank
ordinary and newly proposed connectors. Start with a small graph, expand on
failure, and retain the existing geometric proposals as a fallback. Scores
should guide candidate order or break ties, never override legality or the
image-error limits. Each boundary hypothesis still needs its own consistent
MILP; a probability map is not by itself a replacement for the current exact
boundary constraints.

Before training, compare four ablations on held-out motifs: predicted boundaries
with ordinary connectors, ordinary boundaries with learned ranking, the combined
model, and the unchanged full pipeline. Extend the partial junction ablations
above to isolate curved subdivisions and the reference's intersection-noding
policy. Benchmark a non-neural simplifier and a small feature-based classifier
too. The current results favor jointly improving boundary representation,
junction placement and graph size. They do not establish that missing hidden
connectors are the dominant remaining failure on photographs.

Reproduce the gallery study with:

```sh
node scripts/inverse/experiments/graph-oracle.mjs --ids=all --seconds=3 --repeats=3 --output=tmp/graph-oracle-replay
node --test --test-concurrency=1 scripts/inverse/graph-oracle.test.mjs
```

Reproduce the boundary/junction study and its candidate-pool diagnostic with:

```sh
node scripts/inverse/experiments/graph-oracle.mjs --study=boundaries --ids=all --seconds=3 --repeats=3 --output=tmp/boundary-junction-replay
node scripts/inverse/experiments/graph-pool-diagnostic.mjs --run=tmp/boundary-junction-replay --output=tmp/boundary-junction-pool.json
node --test --test-concurrency=1 scripts/inverse/graph-boundary-ablations.test.mjs scripts/inverse/intersection-endpoints.test.mjs
```

Replay the conditional neighbor expansion with:

```sh
node scripts/inverse/experiments/graph-oracle.mjs --study=boundaries --neighbor-retry=true --ids=all --seconds=3 --repeats=3 --output=tmp/connector-neighbor-replay
node --test --test-concurrency=1 scripts/inverse/connector-budget.test.mjs
```

The rejected always-expanded study used commit `5b8bc5c`. The current default
graph preserves the established pool, and the application uses the conditional
retry above.

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
