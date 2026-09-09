# Keep the best validated result when stopping a search

Paint now offers **Use the best one now** beside **Cancel** while a solve is
running. It stops further fitting and returns a retained checkpoint through
normal validation, comparison, conversion and export. The result says that the
search was stopped early. Cancel still discards the search immediately.

This also closes a gap in the hat seam fix: an interrupted fit receives the
same exact shared-cut repair and primitive cleanup as a completed fit. It does
not export two independently fitted, almost-coincident copies merely because
their mask disagreement is small. See [the hat diagnosis](HAT-SEAM-HANDOFF.md).

## A responsive controller and owned checkpoints

The public worker retains the prepared artwork and delegates fitting to a
private compute worker. A synchronous Bézier step or native HiGHS call cannot
prevent the controller from reading Stop. The controller terminates that child
and uses the completed checkpoints it has already received; incomplete work is
discarded. A subsequent solve can reuse the prepared artwork with a fresh child.
Prepared cubic curves are restored after structured cloning, which otherwise
removes their class methods. Derived caches are rebuilt rather than transferred.

The private channel retains immutable `heartcurves-2` snapshots of validated
initializers, refinement/polishing checkpoints and MILP incumbents. Duplicate
snapshots are removed. This channel is independent of the four-per-second live
geometry limit: initializer and polishing snapshots are retained without adding
them to the canvas preview. Mutable optimizer coordinates never become the
retained result by reference.

Every retained candidate is independently checked against the original
prepared source, including its validity mask and free-border weights, geometry,
requested symmetry and guarded paper support. Selection considers image
fidelity and substantial features, then prefers a matching pair within the
configured one-percentage-point allowance. High image error retains the normal
warning; geometry, paper and requested symmetry cannot be waived by Stop.

The selected pair receives bounded shared-cut and primitive cleanup without
starting another matching-sheet fit. Normal finishing/export checks still run.
If that cleanup fails geometry, paper or requested symmetry validation, the
original owned checkpoint is restored and checked again. Tests inject illegal
cleanup geometry to exercise that fallback. If no valid checkpoint exists,
the worker returns the ordinary no-solution response, and the page permits retry.

`report.stoppedEarly` labels the result. `report.alternatives` contains the
retained validated geometries, selected result first, with slit counts and
original-source error. A distinct cleaned result is included alongside its
original checkpoint. The optional `checkpointError` preserves the earlier,
possibly lower-resolution score separately. The API and `report.json` agree.
An alternative-candidate chooser is not part of this UI increment.

Cancel rejects the pending UI request immediately. The controller explicitly
terminates its child before acknowledging cancellation; the client then
terminates the controller, with a one-second fallback for an unresponsive one.
Job identity and request IDs prevent late messages from replacing the mask or
a subsequent result. Cancel also remains available while a kept checkpoint is
being finalized.

## Replays

The browser checks start from freshly imported masks, then open Draw and
download SVG (and PDF for the star). They retain the normal geometry, paper,
original-source fidelity and exact shared-control assertions. The fixture is
a reconstruction of the reported hat silhouette; the user's original drawing
was unavailable, and no saved fitted geometry initializes these searches.

The Stop diagnostic serves an isolated source override over an HTTP proxy,
because Firefox worker imports can bypass Playwright routing. It blocks the
actual compute worker for 30 seconds immediately after a real validated
checkpoint, or before any fitting in the empty-result case. This proves Stop
does not wait for that blocked worker. It is a deliberate JavaScript block,
not a claim that these fixtures entered a long HiGHS call. The cancellation
diagnostic additionally pauses finalization for two seconds. Neither delay is
shipped in the application, and the harness supplies no counts, seeds or fitted
curves. Each retry runs the unmodified production engine.

All 19 interruption workflows pass: four motifs/modes in Chromium, Firefox
and WebKit; empty-stop/retry and cancel-finalization/retry in all three; and a
390-pixel phone replay. Keeping a checkpoint took 0.51–3.17 seconds from the
Stop message to the enabled Open in Draw button. The stopped matching hat has
45 shared spans and 0.4181% protected-motif disagreement in all three browsers.
The stopped independent and Anti hats also preserve exact shared spans through
SVG export. These are partial-search results, not a promise of the fidelity of
a completed search.

All **1,072 tests** pass: 783 application and 289 engine tests, with one
optional fixture-recording test skipped. Svelte checking has zero errors and
seven existing warnings; lint and the production build pass.

The full Node dataset replay retains checkpoints as the compute worker does.
All 54 exported geometries are byte-for-byte identical to the previous
paper-index release, including their mask errors and shared spans:

| Dataset | Cases | Median time | Maximum time |
| --- | ---: | ---: | ---: |
| Regular Hunodan photographs | 22 | 4.94 s | 8.10 s |
| Free-border masks and perturbations | 32 | 4.61 s | 7.85 s |

Each solve retained at most 27 distinct snapshots. The largest collection of
serialized geometry was 1,107,336 bytes for Hunodan and 420,812 bytes for the
free-border cases. These are serialized sizes, not total heap measurements.
The times include preparation, fitting, validation and export; decoding and
independent export replay are measured separately. This confirms the existing
speed target with checkpoint retention; it is not a paired speedup experiment.

The 25 normal browser/control workflows also pass: 21 full exports, two
JavaScript-fallback exports, and desktop/phone controls with Cancel and restart.
All 19 export cases with a previous browser baseline retain byte-identical
engine geometry. The additional four cover a free-border circle in each browser
and a matching hat with WebAssembly disabled. Combined with the 19 interruption
workflows, this is **44 browser workflows**. The completed matching hat retains
41 shared spans and 0.3206% protected-motif disagreement in all three browsers.
Its full click-to-ready time is 9.31 seconds in Chromium and 16.50 seconds in
Firefox; the Node ten-second target measures a different execution environment.

All **57** tracked engine and worker source files served by the preview match
the checked workspace bytes. The implementation is committed on
`codex/solver-initialization` in `5a46190` and `f20ee5d`; the replay additions are
in `f6356a9` and the isolated control-test cache in `1bce9f0`. No push or deployment
was made. The checked preview is <http://127.0.0.1:5232/en/editor/paint/>.

The full regression measurements and served-source hashes are recorded in
[GRACEFUL-STOP-VALIDATION.json](GRACEFUL-STOP-VALIDATION.json).

```sh
node --test scripts/inverse/{progress,worker-controller,compute-worker,stopped}.test.mjs
INVERSE_TEST_STOP=keep INVERSE_TEST_CASES=star,top-hat,top-hat-independent,top-hat-anti node scripts/inverse/paint-browser-test.mjs
INVERSE_TEST_STOP=empty INVERSE_TEST_CASES=top-hat node scripts/inverse/paint-browser-test.mjs
INVERSE_TEST_STOP=cancel-finishing INVERSE_TEST_CASES=top-hat node scripts/inverse/paint-browser-test.mjs
INVERSE_TEST_STOP=keep INVERSE_TEST_CASES=top-hat INVERSE_TEST_MOBILE=1 INVERSE_TEST_BROWSERS=chromium node scripts/inverse/paint-browser-test.mjs
INVERSE_SPEED_OUT=tmp/graceful-hunodan INVERSE_SPEED_SETTINGS='{"progressGeometry":true}' INVERSE_SPEED_RETAIN_CANDIDATES=1 node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/weighted-solve-benchmark.mjs --strategies=weighted --variants=original,inverted,shifted,free-noise --progress-geometry=true --retain-candidates=true --output=tmp/graceful-weighted
```

Browser replays also take `INVERSE_TEST_URL` for the preview and
`PLAYWRIGHT_MODULE` for the locally installed standalone Playwright module.
The two Node benchmarks include checkpoint serialization/retention but exclude
worker startup and message transfer; the browser workflows include both.
