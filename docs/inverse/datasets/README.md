# Data for learned heart reconstruction

This collection prepares a small photo-to-graph model for the existing solver.
It contains downloaded source images, synthetic images with exact cut labels,
and verified pretrained encoder checkpoints. Offline studies cover synthetic
proposal learning and a small real-photo adaptation pilot. No learned model
has been added to the website.

The inventory, with material annotations updated on 2026-10-15, contains:

| Asset | Verified count | Meaning |
| --- | ---: | --- |
| Real-source image files | 1,034 | Includes templates, process shots and rejected/uncertain material. |
| Files containing assembled-heart photographs | 573 | Includes multi-heart scenes and mixed photo/template pages; 461 reviewed near-duplicate groups. |
| Public Pinterest imports | 470 of 487 selected pins | 198 image files contain assembled-heart photographs; these are a subset of the real-source totals. |
| Synthetic cutting geometries in existing experiments | 192 | Original 128 plus 64 mixed-angle lattices; color phase is excluded from geometry identity; still only three recipe groups. |
| Synthetic photographic views in existing experiments | 768 | Original 512 plus 256 supplementary views; all 5,952 referenced assets verified. |
| Unassigned radial-motif candidates | 64 geometries / 256 views | One additional recipe group with exact shared approaches; not used in training. All 1,984 referenced assets verified. |
| Pretrained encoder checkpoints | 2 | MobileNetV3-Small: researched timm LAMB weights and the TorchVision weights used by the experiment. |
| Trained proposal models | 4 | Same 880,466-parameter network: random/ImageNet, balanced loss, and broader corner data; synthetic-only, offline. |
| Trained foreground models | 5 | RGB-only, 880,449 parameters; random/ImageNet, background augmentation, and paired clutter/control runs, all offline. |
| Decoder-adaptation checkpoints | 4 | One synthetic control and three grouped real/synthetic folds; no all-data or deployed model. |
| Material-pilot checkpoints | 9, plus 2 synthetic diagnostics | Three grouped pilots independently audited. Printed-paper augmentation improves some material identities but has large per-photo regressions; no integration. |
| Printed-paper photographic variants | 96 | Three ink recipes on the same 32 training replay geometries, plus 32 byte-identical controls. Exact body, material and graph labels retained. |
| Training background variants | 2,040 | Five changes to each of 408 original training views; geometry labels and split groups unchanged. |
| Training scene variants | 2,448 | Neighbours and handles paired with all six backgrounds for the same 408 training views; no new geometry families. |
| Source-photo material QA samples | 78 integrated + 25 new | Four hearts in two reserved photographs; sparse assistant-reviewed development observations, not dense labels or training data. The new jigsaw review is not yet in the common benchmark fixture. |
| Real visible-body annotations | 18 | Seventeen instances in fifteen groups outside source QA, plus one reserved gold-angel instance. Uncertain pixels are excluded; the eight additions to the original ten-instance pilot have not entered training. |
| Real partial paper-material annotations | 16 existing heart instances | Nine instances in the existing pilots plus seven additional reviewed instances. Separate body and material uncertainty; no additional photographs. The seven newest annotations have not entered training. |

## Current results and limits

[Five additional material annotations](additional-material-labels.json) cover a
curved hanging checker, a green/white bicycle medallion, a yellow/purple sloth,
a decorated red/white checker and a yellow/teal checker on a reflective red
background. Conservative interiors were inspected on the source photographs
and compiled at 256 and 768 pixels. The compiler verifies every pixel, and RGB
and body assets remain byte-identical to the previous exports. One sloth
polygon initially crossed a paper boundary; it was corrected and re-reviewed.
Fine bicycle strokes, handles, occlusions, seams and uncertain material remain
unlabelled. These five labels are not new held-out photographs and have not
entered training. The material inventory is now sixteen instances.

The first [joint material pilot](material-pilot-results.md) has completed all
three training runs and its independent checkpoint audit. Mixed out-of-fold
material disagreement is 46.11%, versus 45.24% for the synthetic-only control;
visual review shows mostly single-paper predictions. These checkpoints are not
suitable for integration. Full reconstruction replay confirms zero crop proposals
from either joint material model; production yields two checked editable pairs
and mixed body evidence yields one on these nine development photos. Training-set
diagnostics expose underfitting: a tenfold rate increase reduces synthetic training
material disagreement from 48.24% to 4.09% at the same update count. A fresh grouped
photo follow-up has now [completed](material-pilot-v2-results.md): mixed observed
material disagreement falls to 17.84%, while body IoU falls to 81.24% from 85.42%.
The joint model recovers only one of nine complete reconstructions, versus two
for production. Restoring the original body predictions alone does not recover
the other joint crops. Printed-paper identity, clutter, outline evidence and
paper connectivity remain distinct failure sources. No learned model is deployed.

A [controlled printed-paper follow-up](material-printed-study.md) now reduces
mixed observed material disagreement to 15.41% and raises body IoU to 82.38%.
The joint pipeline yields two checked editable pairs out of nine, matching the
production count but on partly different photos. Floral/stripe and blue/gold
paper improve substantially; star, stacked hearts and the hand-held checker
regress. Seven joint crops remain unresolved, including photos with almost zero
observed material error. The model remains offline; these results do not replace
the established solver benchmarks below.

An [additional material annotation](protruding-material-labels.json) now covers
conservative red/white interiors on the existing photograph with protruding
motif pieces and a yellow background. Both 256- and 768-pixel overlays were
visually reviewed and pass the compiler's source, grouping and pixel checks.
The 256-pixel RGB and body PNGs are byte-identical to the earlier body-training
exports. Seams, fine tips, the handle, shadows and uncertain body regions remain
unlabelled. This brings the material inventory to ten existing heart instances;
the new labels have not entered training, and this previously used foreground
development photograph is not a new held-out test.

A [curved-checker material annotation](curved-material-labels.json) adds eleven
conservative red/white regions on an existing development photograph with a
painted background. Source and compiled overlays at 256 and 768 pixels were
visually reviewed; admitted PNGs reproduce those overlays exactly, and the
256-pixel RGB/body files match the previous training exports byte for byte.
This is the eleventh material-labelled instance and has not entered training.
A hand-held printed heart was excluded because its pale ink could not be
confidently identified as a second sheet.

A [frozen stacked-hearts investigation](enclosure-corner-study.md) finds that
low pixel error and the current feature gate can still admit unwanted channels
from larger motifs to the background. It also isolates a corner fragment that
adds endpoints on two adjacent sides. New bounded routing proposals restore
consistent counts without changing the image reference, but later narrow-return
failures remain. The proposals and new photographic regression fixture are
offline; this is not an additional accepted-photo result.

A [fresh clearance-repair replay](corner-clearance-repair.md) now constructs a
checked three-by-three editable pair from that frozen mask, keeping all four
heart motifs enclosed. The repair adds nonlocal clearance witnesses to the
existing projector and preserves endpoint-based parameters on short straight
spans, preventing a newly diagnosed handle-overshoot crossing. Preparation,
routing, repair and engine finalization take 11.45 seconds; independent mask
disagreement is 2.4525%. A second fresh replay with ordinary Bézier refinement
reduces disagreement to 1.76125% while retaining all four enclosures, including
at the finer independent render scale. It passes editable-SVG checks and takes
14.91 seconds before independent audits. That isolated fixed-mask experiment
preceded automatic scheduling and did not change the 25/31 photo result.

The [automatic enclosure recovery](enclosure-recovery.md) now schedules the
same routing, repair and refinement for small supported corner disturbances.
The real Paint/worker/Draw workflow keeps all four hearts enclosed, with 1.73%
editable-mask error and 16.74 seconds click to ready. All 883 inverse tests,
857 application tests and six browser workflows pass. The 22 Hunodan designs
retain exactly their validated errors and finish within 7.94 seconds; all 47
accepted corpus exports pass editable checks. Photographic acceptance remains
25/31, but five errors increase slightly, so the strict release comparison
still fails. The linked record retains these regressions and a timing probe.

A subsequent [rollback investigation](enclosure-recovery.md#refinement-rollback-follow-up)
verifies uncertain paper before repeatedly discarding a useful fit. Its fixed-work
floral-checker regression improves from 4.61% to 1.58% error. Fresh native fitting
keeps all 22 Hunodan designs below ten seconds, improves two of their errors and
leaves twenty unchanged. Photographic checks reach 26/31 and all 48 accepted
editable exports pass. The newly accepted jigsaw still has a visibly distorted
crop, so this does not establish 26 faithful original-design reconstructions.
Two historical photo error regressions remain. Full QA now passes 886 inverse
and 857 application tests, type checking, lint and build. Eleven browser
workflows and fresh entry-loading checks pass. The historical error gate still
fails, so this is not a validated release replacement.

The following [feature-analysis reuse experiment](feature-analysis-reuse.json)
avoids recomputing unchanged interior components. It verifies source bytes and
returns independent arrays; weighted and partially observed inputs keep the
original computation. All 112 semantic comparisons and 24 focused tests pass.
Sixteen paired ten-second fixed-mask fits retain checked outputs, with average
fit time decreasing from 9.442 to 9.361 seconds. The dense-checker pair also
improves its error, but two repetitions per condition do not establish broad
speed or quality gains. The change is committed as `3997441`. Full repository
QA passes 889 inverse tests, 857 application tests, type checking, lint and build;
all 733 pinned source files were verified. Native replay retains all 22 Hunodan
errors from the preceding runtime and completes them within 9.323 seconds.
Photographic checks remain 26/31, all 48 accepted editable pairs pass independent
checks, and eleven browser workflows plus initial-loading checks pass. The strict
historical photo-error gate still fails for crown: 2.411875% previously versus
2.454375% now. Viking clears that historical comparison. Small additional error
increases relative to the immediately preceding runtime are retained in the
record; the cache does not make a timed optimizer's output invariant to speed.

A [final-polishing diagnostic](paper-polishing-resolution.json) finds that a
better crown checkpoint remains uncertain even at the existing 700-cell paper
resolution. Its unchanged curves pass post-fit 1000- and 1400-cell rechecks
at 2.241875% mask disagreement. An isolated fresh solve that verifies such a
checkpoint and carries the finer resolution through finalization reaches
2.273125% in 9.60 seconds, versus 2.333125% in its paired run. This is one
cold-start comparison. A fixed 41-step replay now isolates the verification
benefit: 2.454375% becomes 2.241875% from identical initial controls. Full isolated
replay retains 22/22 Hunodan below ten seconds, 26/31 photo acceptances and 48/48
checked editable pairs, but the strict historical error gate fails on three
photos (two by one or two pixels, Viking by 102 at 400 squared). Fixed 160-step
comparisons produce identical coordinates for dense checker, round checker,
warped checker and Viking; fine checker improves from 1.5775% to 1.553125%.
The bounded finer polishing check is committed as `dfcd6e5`, with progress,
Stop and export regressions. Repository QA covers all 891 inverse tests after
a controlled-clock correction to one clearance-repair test: the initial full
run passed 890/891, and all six tests in the corrected file pass on rerun.
The other 885 results and unchanged application/runtime checks are reused.
Type checking, lint, 857 application tests and build pass. All twelve actual
Chromium upload/example-to-editable-export workflows and initial-loading checks
pass, with 735 source files verified. The ten-second-budget crown exports at
2.284375% disagreement and retains its actual 1000-resolution paper audit;
maple also uses 1000 and exports at 0.7975%. Crown click-to-ready time is 10.69
seconds, including preparation, export and conversion; the solver budget is
not a UI latency guarantee. All twelve Draw results were visually reviewed.
The repair failure also reproduces with the old runtime: its exact
100-step geometry passes at 1000 but not 700, while 125 steps pass at 700.
That production repair limitation remains; fixing the unit test does not cure
it. Default resolution and physical tolerances are unchanged. The timed
historical error regressions remain recorded, not explained away by this test.

A [paper-calibration change](paper-calibration-calls.json) spreads backend
measurements across two real audit requests, comparing both outputs on each
input before selecting WebAssembly. It retains only timings. Across seven
geometries, four alternating-order rounds in Node and Chromium preserve every
paper-map pixel and audit field in all 560 timed complete audits. Chromium's
median first-audit saving ranges from 21% to 43%; the first audit plus four
follow-ups saves 10% to 20%. Deferred work makes some follow-up batches slower,
so these are not uniform per-call gains. Eight cold leaf-repair runs are faster
with the new policy but all still fail the 700-resolution paper check. The
change is integrated locally after 33 focused tests. Its [full QA run failed](paper-calibration-release-failures.json):
880/895 inverse tests pass, while type checking, lint, application tests and build
pass. Corpus and browser stages did not start. Paired replays expose a frozen-clock
geometry test contaminating later backend selection, plus a tree test that rejects
a valid final export solely because its preliminary MILP timed out. The actual
failed tree export independently passes all final checks at 1.1375% mask error
and 0.375% central-region error. The geometry test now runs in its own process;
the tree test retains every final quality check while requiring the routing attempt.
All eight affected tests pass. Other failures remain unresolved. This does not
establish additional successful reconstructions or fix the repair's finer-verification
limitation.

A [repair-budget correction](available-repair-tail.json) now includes the
caller-provided verification tail when deciding whether continuous repair can
start. The previous guard ignored this already allocated time. Two fresh
silhouette fits improve from rejection at 5.3472% mask disagreement to checked
pairs at 1.6064%, with no source changes or larger overall deadline. Across four
fixed masks and two AB/BA rounds, acceptance rises from 4/8 to 6/8. The cropped
tree still fails; some accepted-case errors increase, so this is not a strict
no-regression result. A real-MILP controlled-delay regression fails before the
change and passes after it, including a no-borrow control. All eleven focused
integration tests pass. The subsequent full run passes 896/897 inverse tests,
857 application tests, type checking, lint and build; all 738 pinned source files
are verified. The remaining failure times out while seeking matching sheets,
after the independent pair passes template and paper checks. Native corpus and
browser stages did not start. That scheduling failure remains under investigation;
this is not a completed release validation.
A separate coarser-initializer experiment was not integrated because it did not
repeatably resolve the primary failure. The calibration comparison's remaining
13 tests were also replayed twice per runtime: 21/26 passes before and 22/26 after,
with failures shared across revisions. Those focused runs do not replace the
failed full-suite record.

A [matching-stage preparation optimization](matching-preparation.json) reuses
spline interval bases and snapshots the observed image objective once per
selection stage. All 216 old/new control-coordinate comparisons and 481 image
score comparisons are exactly equal. A fixed 200-step matching replay returns
identical exported coordinates and PNG pixels; its one observed run drops from
2.414 to 2.204 seconds. These are component measurements, not broad speed gains.
Four new snapshot/weight regressions pass, and focused checks pass 29/30; the
existing free-border matching test still times out. Neither a simple priority
budget nor a lower fitting resolution consistently fixes that failure, so those
experiments remain unintegrated. The subsequent full run passes 900/901 inverse
tests, all 857 application tests, type checking, lint and build, with all 739
pinned source files verified. Its only failure compares a computed
0.4999999999999991-second allowance with exactly 0.5 seconds. The matching-seed
regression passes in this run, but earlier timing failures remain unresolved.
The floating-point correction passes both real-MILP tests with all geometry
and paper assertions retained; native corpus and browser stages did not start.

A [late-matching deadline correction](late-matching-finalization.json) now
uses the requested allowance after the independent fit's initial ten-second
phase. Two isolated twenty-second handoffs that previously skipped matching
now find identical templates at 0.4013% independent mask disagreement. Each
has twelve seconds already elapsed and finishes finalization in about three
more seconds. Expired requests still skip refinement; ten-second deadlines are
unchanged. This is not a fresh-photo speed result or a demonstrated cure for
the separate ten-second matching timeout.

A [cropped-tree repair correction](cropped-tree-handoff.json) now lets a bounded
provisional trace improve against the original pixels before requiring final
image accuracy. Its first routing has 3.80125% mask error and two small clearance
violations; the old code rejected it before any gradient step. Final error,
feature, geometry and paper checks are unchanged. In two fresh ten-second runs,
the tree improves from rejected 7.88875% exports to checked pairs at 2.27625%
and 2.29875%, taking 8.39 and 8.66 seconds for design and export. Independent
800-pixel renders also remain below 2.46%. Across four fixed masks and two
alternating-order rounds, acceptance rises from 6/8 to 8/8; all three controls
retain passes, but one increases from 0.6000% to 0.6544% error. The frame still
has visible small defects. All eighteen focused integration tests pass, including
the old ten-second matching regression. The subsequent [full run and paired
diagnosis](feature-recovery-release-failures.json) record 902/905 inverse passes;
type checking, lint, application tests and build pass. Two failed assertions
required an intermediate rejection or a raw MILP success even when continuous
repair had already supplied a valid pair. Those assertions now recognize the
checked repair while retaining every final quality check. Both affected complete
test files pass on follow-up, 17/17. The third failure exceeded the unchanged
1.8% error bound after a one-pixel crop shift; four isolated fits and the complete
file replay each reach 1.341875%, but the original timing-sensitive failure is
not explained. Corpus and browser stages did not start. These experiments do not
increase the published 31-photo benchmark count.

A subsequent [complete QA and captured replay](timed-feature-diagnosis.json)
passes 904/905 inverse tests, along with application tests, type checking, lint
and build. The remaining accelerated-clock near-miss fit reaches 3.035% error
at the independent 800-pixel scale, exceeding the unchanged 3% limit. Two
complete near-miss file replays and one feature-seed file replay then pass all
32 tests, with 24 fits captured. Identical-mask comparisons show a shorter
broad refinement followed by lower-error detail candidates that fail paper
checks; this does not identify cropping as the cause or justify weakening
validity checks. The two intermittent fidelity assertions now retain typed
source arrays, the solver report and byte-identical cut geometry on failure.
Neither the successful replays nor this diagnostic helper cancel the failed
full-suite result. Native corpus and browser stages have not run.

The [count-order comparison](base-count-near-miss-probe.json) retains all 28
checked outputs but does not repeatably improve the difficult short-budget
case, so that shortcut is not integrated. A separate
[checkpoint capture](near-miss-paper-checkpoints.json) reproduces the failure
and locates a pinched hook whose paper-core failure persists at 1400 cells.
The automatic fit's separation force ignores nearby portions of one slit over
eight nominal widths. A shorter exclusion recovers quality in an equal-work
replay, but [applying it throughout polishing](outline-separation-force-probe.json)
damages neighbouring motifs. That version is rejected.

The [conditional paper-separation retry](conditional-paper-separation.json)
now activates only after a complete geometry-valid, paper-failed block during
outline polishing. In the fixed 120-step regression, independent error falls
from 3.0536% to 2.3316%, with paper checks passing at both 360 and 1000 cells.
A fresh cold-start pair improves from 2.9852% to 2.2878%; a successful control
retains every curve coordinate. All 23 focused tests pass. Neither acceptance
rules nor deadlines change, and a changed force resets rollback-cycle detection.
The 24-fit comparison also exposes existing fine-resolution paper failures:
20/24 pass at 1000 cells, and one failed output is byte-identical to an earlier
unmodified baseline export. The retry never ran on that output. This remains
an unresolved validation limitation. Full repository QA now passes all 907
inverse tests, 857 application tests (one existing skip), type checking, lint
and build; all 747 pinned source files remain unchanged. All twelve browser
workflows and fresh entry-loading checks pass. Native Hunodan results are
22/22 below ten seconds (maximum 9.454 seconds), with twenty errors unchanged
and two improved. Photo acceptance is 26/31 and all 48 accepted editable pairs
pass, but bird, round-checker and Viking errors regress against `c000d30`. The
first two changes are one and two pixels at 400 squared; Viking rises from
2.0244% to 2.2181%. The distorted jigsaw crop remains a fidelity limitation.
The strict error gate fails; this is not a validated-release replacement.

An [independent polygon-offset audit](paper-offset-cross-check.json) now
confirms three resolution-sensitive photographic false passes. At intermediate
offset radii, a connection can close before its island becomes too small; the
coarse guard endpoints can both look acceptable. A second case is a thin
fold-centred island that falls between lattice rows. Clipper2 WASM and separate
GEOS offsets agree on all 240 nominal comparisons across 60 current native and
browser exports: 59 pass, while Hunodan `hjcur-05` has a disconnected 4.154 mm²
core on paper A. This qualifies the earlier 22/22 result, which passed the
existing raster rules. The diagnostic has seven committed regression examples
and four passing tests. It is offline; the production lattice, acceptance
settings and fitting remain unchanged. Nominal fine-offset checks take a median
67 ms per pair in this run, excluding fitting.

The [post-diagnostic repository QA](paper-offset-qa.json) passes all 911 inverse
tests, 857 application tests (one existing skip), type checking, lint and build.
All 817 pinned files remained unchanged throughout the run. This verifies the
diagnostic additions; it does not integrate the geometric gate or repair.

A [fold-aware repair experiment](folded-cut-repair-probe.json) then runs 22
fixed-work continuations. Adding separation from the mirrored cut repairs the
Hunodan fold defect and both vertical-crop failures; the independent GEOS
radius probes confirm all three. Hunodan disagreement rises from 0.9259% to
0.9458%, while both vertical crops improve over their saved starting fits.
The original-crop hook also needs the shorter same-cut exclusion; its geometric
core passes, but the coarse lattice still reports uncertain. Always applying
the new force slightly worsens valid controls, so it is not integrated as a
blanket change. These are saved-fit continuations, not fresh ten-second solves.

The geometric check and a [conditional repair](geometric-paper-integration.json)
are now integrated into final export. Both the old lattice rule and fine
unfolded polygon offsets must pass; loading or numerical uncertainty never
silently certifies a candidate. Detected fold defects add a mirrored-cut force
only on the affected sheet, using the main constrained fitter. Valid geometry
is returned unchanged. Paper-support SVGs show the nominal polygon cores;
downloads remain available when checks fail. A fresh integration run passes
22/22 Hunodan below ten seconds (maximum 9.793 seconds); independent exported
errors versus `c000d30` are nineteen unchanged and three improved. Separate
GEOS geometry passes all 264 radius/tolerance/family probes for those exports.
These native timings precede two loading-only fixes; a full replay is pending.

Integration QA caught and corrected two startup issues: the test bundler
rewrote the static WASM URL, and the compute worker could lose its first job
while asynchronous initialization delayed its message handler. The receiver
is now installed before awaiting the engine. All 857 app tests (one existing
skip), type checking, lint, build, 22 focused inverse tests, deferred-entry
checks, delayed-worker and backend-failure browser checks pass. Star and
free-border hat complete the full Paint-to-Draw workflow. The complete inverse
suite then finishes with 918/921 passing. Three original/vertically shifted
near-miss photographic runs fail final acceptance, including one under the
accelerated clock. All 825 pinned files stayed unchanged. Final-report capture
is the next step to distinguish deadline exhaustion from inadequate repair.
The native/photo and remaining browser release stages were not run after that
failure; this candidate is not a new validated release.

A [polishing-stage repair](polishing-fold-recovery.json) identifies the cause:
the detailed fitter froze the border band even when the coarse paper check
missed a fold island. Geometric checks now run during detailed polishing,
activate separation on affected sheets and release only their temporary fold
locks, preserving endpoint constraints. Four fresh source/crop/clock replays
now pass, compared with one before. The two ordinary-clock runs finish design
and finalization in 9.94 and 9.36 seconds; independent mask errors are 1.2575%
and 1.335%, slightly above the earlier invalid outputs. Separate GEOS checks
pass all 48 family/radius/tolerance probes. The nineteen existing focused
tests and six outline tests pass, including two new orientation regressions.
Type checking, lint, all 857 application tests, build, entry-loading and
geometric-backend browser checks pass. Star and free-border hat also pass the
complete Paint-to-editable-Draw workflow, with screenshots visually reviewed.
The full inverse suite and corpus replay remain pending; the historical
photographic fidelity regressions have not been declared resolved.

The latest validated solver revision is `c000d30`. Its
[release record](return-projection-speed.json) passes **22/22 regular Hunodan
designs below ten seconds**, with a maximum of **8.100 seconds**. Automatic
cropping and fitting pass **25/31 hard photographs**. All 47 accepted editable
SVG pairs pass independent checks; all sixteen main Chromium workflows and
four additional budget comparisons pass. Full QA passes 853 inverse tests,
857 application tests (one existing skip), type checking, lint and build.
The preceding `99399ff` [release record](small-feature-release.json) is preserved.

These are complete-pipeline results on fixed development benchmarks, not all
573 collected photo files. The six photographic failures remain unresolved.
[Controlled crop interventions](remaining-photo-failures.md) recover three,
but do not establish a reliable automatic detector. Pale-material loss,
inconsistent border transitions and small-feature loss also occur. Agreement
with an estimated photographic mask is not agreement with unavailable original
artwork. Native ten-second results are not browser latency guarantees; the
Viking browser flow takes 29.71 seconds with its ordinary 180-second allowance.

### Latest solver and browser validation

Runtime revision `c000d30` passes **853/853 inverse tests**, **857 application
tests** (one existing skip), type checking, lint and build. The pinned run
verifies all 845 recorded source files. The fresh Hunodan comparison passes
**22/22 within ten seconds**, maximum **8.100 seconds**, with 21 mask errors
unchanged and the bird improving from 0.8444% to 0.8022%. Source photographs,
crop coordinates and settings are unchanged. The photographic comparison
retains **25/31**, with seven errors lower and none higher; the leaf improves
from 2.5625% to 1.3163%. All photographed inputs, selected corners and classified
masks are unchanged. The same six failures remain. All **47 accepted editable
SVG pairs** pass independent source-feature, geometry and paper checks. All
sixteen main browser workflows pass, as do shifted-star and leaf uploads with
both the ordinary allowance and an explicit ten-second worker request. The
actual downloaded SVGs pass independent 400/800-pixel checks.

Fresh Draw and Paint contexts make no initial solver/WASM requests. Their
initial JavaScript sizes are unchanged at 473,483 and 503,384 bytes. The
corrected browser harness checks current served bytes and compares bundle
sizes; it no longer requires content-hashed filenames from an older build.
All application JS/CSS size multisets match, but only 31 of 68 assets have
identical content. Build-version changes propagate through hashed imports.
The original harness failure and two correction attempts remain in the record.

A newer [shared-alignment optimization](shared-alignment-speed.md) checks an
existing cutting-quality rejection before the full geometry audit. It produces
identical final curves across 47 frozen accepted exports, reducing their total
alignment time from 29.44 to 26.52 seconds; 110 focused tests pass. Fresh full
QA on runtime `b8e20f2` passes 853 inverse tests, 857 application tests (one
existing skip), type checking, lint and build; all 848 pinned source files
remain unchanged. Fresh Hunodan fitting passes 22/22 within ten seconds
(maximum 8.149 seconds), with all 22 image errors unchanged from `c000d30`.
The photo replay retains 25/31 passes and all 47 editable pairs pass, but three
image errors increase slightly, failing the strict comparison gate. Browser
replays and preview refresh were skipped. The leaf exposes a best-intermediate
alignment issue; the two checkerboards stop refinement fifteen steps earlier.
The failed record is retained. This is not a validated whole-pipeline speedup.

The [long-budget leaf diagnosis](long-budget-selection.md) confirms identical
prepared inputs and initial grid scores in the ordinary and ten-second browser
runs. The longer request returns a valid traced recovery before trying grids;
the shorter one reaches a better grid refinement. The first queued comparison did not run after the sharing release failed.
A new twenty-run isolated comparison uses the validated runtime: extending
routing interpolation to long searches reduces the original leaf error from
2.6050% to 1.3163%, with all sixteen long-budget arms passing. The short
vertically shifted control fails at 4.9769%, exposing a skipped clearance-grid
comparison. These are fixed-mask development results; no policy is adopted.
A [repeated clearance-window study](clearance-window.md) recovers the downward
leaf shift in both repeats; the upward shift exposes a separate shortlist
cutoff. A [best-source-prefix sharing experiment](shared-prefix.md) gives
mixed independent-render results and is rejected for adoption.
A [36-run shortlist follow-up](clearance-candidate-repair.md) improves the
right-shifted leaf and exposes a genuinely invalid clearance initializer in
the upward shift. Standalone bounded refinement repairs that seed and passes
the finer paper audit. The [bounded integration](clearance-repair-integration.md)
now passes focused fresh-solve and flower regressions while retaining all final
checks. Two shortlist variants exposed and corrected count-diversity issues.
The corrected paired replay passes 12/12 versus 8/12, with no higher error at
either independent render scale and a maximum native time of 9.522 seconds.
The first full inverse run passes 857/859; its two failures require now-obsolete
search histories. [Paired output checks](shortlist-regression-review.md) retain
maple fidelity and improve the checker before updating those assertions. A
separate guard prevents a new reservation from evicting an already simpler
finalist. Fourteen focused tests pass. The [fresh release comparison](clearance-repair-release.md)
passes all 860 inverse tests, 857 application tests (one existing skip), check,
lint and build. Hunodan remains 22/22 below ten seconds (maximum 8.034 s),
with unchanged errors; photographs remain 25/31 and all 47 editable pairs pass.
Five accepted photo errors decrease, but floral checker and Viking increase
slightly, failing the strict no-higher-error gate. All eighteen main browser
workflows pass, but the ordinary-budget shifted leaf fails its focused quality
check while the ten-second version passes. Initial solver/WASM loading remains
deferred; a generated build-identifier length change adds four raw initial
script bytes and fails the strict size comparison. `c000d30` remains the latest
fully validated runtime.

The newer [robust-search comparison](robust-search-release.md), including exact
rollback skipping and long-budget grid comparisons, passes all 861 inverse tests
and the full application checks. Hunodan remains 22/22 below ten seconds
(maximum 8.113 s), photos remain 25/31 and all 47 editable pairs pass. Floral
checker improves to 1.896250%, but warped checker and Viking increase slightly;
the strict no-higher-error gate remains failed. All eighteen main browser
workflows and all six ordinary/ten-second leaf/star comparisons now pass, including
the previously failing ordinary shifted leaf. Its downloaded SVG scores 0.7600%
and 0.9525% at 400/800 pixels. Both entry routes retain baseline script sizes and
deferred solver/WASM loading.

The [short-search scheduling correction](photo-feature-stability.md) reserves
curve-refinement time for nearly fitting grids while retaining routing priority
when a grid loses a protected feature. Its fixed shifted-star prototype improves
independent disagreement from 2.9869% to 0.7569%, and the leaf from 2.5625% to
1.32875%; these are earlier experimental results, not new corpus measurements.
Subsequent fixes preserve feature-tradeoff routing and useful small junction
probes. A confirmed HiGHS clock bug charged previous native solve time again
on later rounds; resetting native clocks preserves the outer deadline and
restores the intended per-round budget. Reports retain search timing,
skipped-repair reasons and initialization costs.

The [return-projection optimization](return-projection-speed.md) addresses a
separate anchor-repair timeout, also reproduced on the older validated runtime.
It preserves all 104 probe decisions and all 27 accepted cut geometries while
reducing their total projection time by about 30%. Intermediate iterations check
the return constraints; the complete geometry validator still gates every
returned repair. The full QA run includes the previously failing anchor case.
This is a local-operation speed result, not whole-pipeline or browser latency.

Earlier failed checks remain in the [routing](routing-budget-blend.json),
[retry](routing-retry-budget.json) and
[clock/initialization](routing-initialization-budget.md) records. The separate
initialization and repair-budget experiments remain unadopted.

A separate [render-test correction](shape-render-validation.md) avoids system
font discovery for text-free SVGs. All 152 paired renders are byte-identical;
it changes test performance, not the application renderer or solver quality.
The newest reviewed [Pinterest annotations](real-pinterest-annotations.md)
bring the body-label inventory to eighteen; the original ten-photo training
pilot remains unchanged.

### Neural experiments

No learned model is deployed. The approximately 880,000-parameter
[MobileNetV3-based proposal model](boundary-localization.md) benefits from
pretraining, but [the app initializer](app-baseline-correction.md) still has
better one-pixel boundary localization. Learned graph proposals have not yet
established better complete-template recovery or total solve time.

[Grouped real/synthetic adaptation](real-adaptation.md) improves known-region
foreground IoU from 76.95% to 78.63% on the ten-instance pilot. Full reconstruction
still passes 3/10 with the learned fields versus 4/10 with the existing cropper.
A separate [six-label diagnostic](real-supplement-diagnostic.md) passes 2/6 with
the frozen scene model versus 1/6 with the existing cropper. These small,
repeatedly inspected sets are distinct from the 31-photo benchmark and do not
justify a global replacement. The initial seven partial material labels and
joint loss were implemented and checked before the nine-instance pilots
summarized above. A [tested decoder transfer](material-transfer.md) preserves
the learned foreground output when adding paper identities. The
[earlier Pinterest annotations](pinterest-material-labels.md) include uneven
lighting on the same pale paper. The [two silhouette annotations](motif-material-labels.md)
add boar and rabbit interiors with contour shadows; all retain the existing
body labels unchanged.

The [experiment history](experiment-history.md) preserves earlier measurements,
failed alternatives and superseded verification states. Individual reports
retain source hashes, commands and limitations; their historical “current” or
“pending” statements should not replace the status above.

## Collected assets

The [real-photo collection](real-collection.md) records original image URLs,
source pages, retrieval times, file hashes, dimensions, visual classifications
and duplicate groups. The [manifest](real-manifest.json) is the inventory;
downloaded image bytes stay under `tmp/heart-training-real/`, outside Git.
Photographs, scans, illustrations, composites and irrelevant images are counted
separately. A photograph containing twenty hearts is one source image until
its individual heart instances have been annotated.

Open `tmp/heart-training-real/index.html` for the filterable local photo gallery,
and `tmp/heart-training-synthetic/batch-v1/index.html` for synthetic comparisons.

Public Pinterest pins can be imported from an explicit URL list or bounded
keyword discovery and related pin records exposed by public pages. The importer
uses the main image advertised by the public page, choosing its original-size
URL when the page actually supplies one. It records the pin and image URLs;
it does not infer missing full-resolution URLs. Some returned pins contain
unrelated material, so download success alone does not admit a training photo.

The [synthetic generator](synthetic-training.md) creates new validated template
pairs, then varies paper color, lighting, background, pose, perspective, blur,
compression and crop error. Every image retains its exact canonical curves,
phase, shared-edge identities and coordinate transforms. Geometry and nominal
paper checks run before admission, followed by an independent exported render.
The [current geometry re-audit](synthetic-current-geometry.md) checks all 256
saved witnesses, including the 64 unassigned radial designs, against today’s
geometry and paper rules. All pass, with consistent decisions across 768
original/subdivided/reflected representations. These are planar simulations
with limited procedural motif diversity, not substitutes for real photographs.

The selected first encoder is [MobileNetV3-Small](pretrained-models.md). The
research document compares eight pretrained alternatives and records their
sources. The runnable experiment uses the already installed TorchVision model
and its separately hash-verified checkpoint, rather than the researched timm
LAMB checkpoint. Browser inference speed and ONNX export remain unmeasured.

## What the network should learn

The [full-photo foreground labels](foreground-supervision.md) add physical
paper/background supervision for all 768 existing synthetic views, including
both lobes and both paper colours. They preserve the original images and recipe
splits. This supports a separate full-photo localization task. Foreground
models have been trained offline; none is added to the website.

Start with rectified RGB plus the existing uncertain color mask. Predict paper
membership, visible boundaries, junctions and border endpoints. Score a small
set of proposed connections using those features. Keep the MILP, curve
refinement and independent geometry checks in charge of accepting templates.

Synthetic examples provide precise graph supervision. Real photographs still
need checked overlap corners, visible material boundaries and heart-instance
annotations. Linked template downloads are candidate references until their
relationship to the photograph and cut geometry has been verified. Existing
solver outputs are not automatically ground truth.

A cut graph is a valid witness, not a unique answer: hidden shared cuts can
have several valid routings. Do not label every unused connection as a negative.
Keep shared curves as one geometric object, handle interchangeable sheet labels,
and measure whether the proposed graph admits a valid solution within the
overall time budget.

`scripts/inverse/datasets/real_materials.py --output=<new-directory>` compiles
the reviewed material sidecar at 256 pixels (`--resolution=768` for inspection);
`--verify` rechecks the source photographs, pinned body annotations and every
RGB/body/material/overlay pixel. Its training loader checks current source QA
reservations even with historical catalogs. Unlabelled material remains 255,
including known body that still contributes to the independent foreground
loss. `joint_material_loss` permits one global A/B exchange per image, never a
separate exchange at every pixel. It also retains fractional synthetic material
coverage, so antialiased boundary targets need not be thresholded. This is
material supervision, not cut-path ground truth, and no real train/test
allocation has been added. The [joint evaluator](material-evaluation.md) counts
missed body as a material error and retains one global A/B assignment per image;
unknown regions cannot silently become correct background.

## Keep evaluation separate

Existing Hunodan and photographic QA inputs stay reserved for evaluation.
Reposts, resolutions and collage crops inherit the same source-photo group;
motif families must also stay together before any train/test split is assigned.
The real-image inventory intentionally leaves unreviewed family assignments
unassigned. A file hash or perceptual similarity score alone is insufficient
to establish that two motifs are unrelated.

All synthetic lattice variants share one training recipe group; channel and
frame recipes are reserved for validation and test respectively. These are
**recipe holdouts, not topology-disjoint evaluation sets**: for example, a
one-cell shared lattice and a channel can describe the same routing after
redundant subdivisions are removed. A future motif/topology-aware split must
account for these equivalences. Photometric view counts and stored graph
signatures must not be presented as counts of independent motif families.

Image accessibility, attribution and declared usage terms are recorded
separately from visual suitability. The source collection is an inventory for
review, not a redistribution package or a claim that every image is cleared
for training.

## Reproduce and verify

Follow the real and synthetic documents above for collection/generation commands.
The synthetic output directory must be new so inspected experiments are not
overwritten. The verifier checks asset hashes, source grouping and projective
label consistency after copying a dataset.

```sh
node --test --test-concurrency=1 scripts/inverse/datasets/*.test.mjs
python3 scripts/inverse/datasets/real-collect.test.py
```

The Node dataset tests are included in `npm run test:inverse`. The Python
collector tests are offline and require Pillow, which is already present in
the collection environment. No new project dependencies were installed.

The [latest completed release record](small-feature-release.json) pins
its solver, application and browser checks. The newer runtime passes full QA
in [its separate record](return-projection-speed.json), with passing native
corpus and editable-export comparisons; browser checks remain pending.
Earlier and interrupted validation runs remain in the
[experiment history](experiment-history.md).
The synthetic verifiers checked all 5,952 referenced assets, and the real-image
audit checked all 1,034 source files and decoded image identities. Gallery
browser checks are recorded in the real-photo collection report.

Whole-pipeline comparisons must report time, valid-template recovery, mask and
feature error, candidate graph size, and sensitivity to crop, color and noise.
A lower aggregate pixel error must not conceal missing rays or false seams.
