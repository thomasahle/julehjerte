# Clearance repair across nearby photograph crops

Commit `399a126` extends the earlier [rejected-routing repair](rejected-routing-repair.md)
to nonlocal narrow sections within one slit and preserves finer paper verification
through subsequent fitting. The same eight fixed sloth crop variants improve
from **3/8 to 5/8** checked editable pairs. This is a development study of one
photograph, not an unseen-corpus result or a neural-model deployment.

## Controlled diagnosis

The source masks and crop coordinates are unchanged. A tracing-only comparison
uses smoothing radii 0.3, 0.5, 0.75 and 1 mm. A separate fresh-process experiment
then tries the first three radii on each mask, with four seconds for each sparse
routing graph: 24 routing attempts in total. These are diagnostic budgets, not
extra time granted to the application. No saved cutting geometry enters them.

Most failures find an integer route whose image is recognizable but whose cuts
fail clearance. Some have a short return; others have a nonlocal narrow section
within the same slit. The previous repair admitted only one or two short-return
issues with at most a 5% deficit, so it could not attempt these other routes.

Smoothing alone is not a reliable remedy. For example, the radius-0.5 horizontal
shift finds no integer route within four seconds, while radius 0.3 reaches a
repairable rejected route in 1.65 seconds. Conversely, the positive vertical
shift has a valid radius-0.5 route but the radius-0.3 route remains invalid after
local refinement. Unbranched visible-chain quality is ordering evidence, not a
proof about the eventual two-sheet assignment.

A controlled refinement of the first rejected routes uses the existing common
Bézier optimizer, unchanged pixels and unchanged final gates. Five of fifteen
selected routes pass at the original paper resolution. Of the remaining
geometry-valid uncertain results, four pass a separate 700-cell paper audit and
one remains uncertain. These captured-route experiments establish opportunities;
they are not fresh full-solve successes. Routes with crossings or excessive
turns remain rejected even when their pixel error is lower.

## Change to the main fitter

A rejected integer route may now receive the same single bounded refinement
attempt when its only geometric defects are at most four short or nonlocal
clearance failures, with at most a 15% relative deficit. Each kind uses its own
required width and measured distance bound. This is an eligibility limit for
trying optimization; **it does not change a cut-clearance acceptance limit**.
Initial source-image and feature checks are still required. Weighted inputs
and explicit symmetry constraints remain outside this repair path.

Optimization still has at most 700 ms and 160 updates, within the original
recovery deadline. Final geometry, image, feature and paper checks remain
mandatory. If the original paper lattice is uncertain, an otherwise valid
result may receive the same 700-cell audit already used by the grid fitter.
An uncertain result never passes merely because it was refined.

The verified resolution now follows a repaired route through recovery's final
check, the original and polished candidates, progress snapshots, final cleanup
and export. Reverting to the coarser lattice could otherwise reject or move an
already verified shape. The new regression tests cover this complete handoff.

## Fresh fitting and editable export

Each new fit starts from the original photograph and fixed crop, reclassifies
it identically, then prepares the unchanged binary mask as Mal does. It receives
the same ten-second setting and no saved route. The previous outputs are
archived from `f7056e3`; this is not a contemporaneous paired speed comparison.
Every old and new saved output is independently rendered and feature-audited,
then replayed through production SVG conversion, serialization/parsing, editor
geometry and physical checks.

| Crop | Previous engine error / checked | New engine error / checked | New editable error |
| --- | --- | --- | ---: |
| Production | 1.3728% / yes | 1.3728% / yes | 1.3600% |
| Frozen neural model | 4.3584% / no | 4.3808% / no | 4.4272% |
| Synthetic-only adaptation | 5.3472% / no | 5.3472% / no | Rejected geometry |
| Mixed-model, out of fold | 1.0304% / yes | 1.0304% / yes | 1.0192% |
| Mixed crop, x − 1 pixel | 0.5808% / yes | 0.5808% / yes | 0.5888% |
| Mixed crop, x + 1 pixel | 5.7328% / no | 1.1312% / yes | 1.1360% |
| Mixed crop, y − 1 pixel | 5.6544% / no | 1.3152% / yes | 1.3040% |
| Mixed crop, y + 1 pixel | 5.1424% / no | 5.1424% / no | Rejected geometry |

The two new successes take 7.30 and 9.58 seconds including preparation, fitting,
validation and generated export, but excluding the subsequent independent
rendering. The vertical shift
requires the finer paper lattice. Visual comparison of all sixteen outputs
confirms recovery of the branch and toes in both; uneven boundaries and small
protrusions remain. Error is measured against the classified mask, not original
artwork or cutting paths. None has been physically assembled.

Four already-failed outputs also fail editor conversion, so the all-output
replay intentionally returns a nonzero exit status. None of the five checked
candidate outputs loses its pass through editable export.

## Remaining causes

- The frozen-model crop selects a colour-retaining 4+4 grid which still has
  about 5.1% initial disagreement. After an unsuccessful coarse graph search,
  reserving refinement time for that grid leaves only about 0.33 seconds for
  traced recovery. Its saved rejected route can be repaired, but fresh search
  cannot reach it in that allowance.
- The synthetic-control crop spends about five seconds on a 146-segment initial
  trace. Its later sparse recovery receives about 2.2 seconds, less than the
  3.33 seconds used to reach a repairable first route in the diagnostic run.
- The positive vertical shift's first radius-0.3 route develops crossings under
  refinement. A radius-0.5 route can pass, but current trace ordering and retry
  policy do not reach it within the existing recovery allowance.

These are observed search and scheduling limitations. They do not establish
that any estimated crop is physically exact, or that its classified mask
perfectly reproduces the photographed paper.

## Reproduction and QA

The two new captured routes are in
`scripts/inverse/fixtures/sloth-clearance-routing.json`, clearly separated from
the source masks. Fresh-solve tests send only those pixels to `design()`.

```sh
node --test --test-concurrency=1 \
  scripts/inverse/clearance-routing.test.mjs \
  scripts/inverse/rejected-routing.test.mjs
```

All nine targeted tests pass, including the previous illegal-route and deadline
controls. The new full Hunodan run passes all 22 quality and ten-second gates;
the slowest case takes 8.30 seconds and every image error equals the previous
release run. The automatic hard-photo run remains 24/31, with no pass/fail
changes and identical crop coordinates, target masks, fitting masks and
probability hashes. Some already-passing photo errors vary slightly; this is
not a claim of byte-identical fitting outputs across all photographs.

Type checking, lint, the build, all 767 inverse tests and all 855 application
tests pass (one application test is skipped). Seven actual Chromium flows also
pass, including downloaded SVG reimport, independent geometry/paper checks and
source feature retention. The star and all four mask uploads additionally
download valid PDF files. No page errors occur.

| Browser case | Click to ready | Editable-mask disagreement |
| --- | ---: | ---: |
| Original sloth crop | 7.75 s | 1.3181% |
| Sloth horizontal shift | 8.71 s | 1.4813% |
| Sloth vertical shift | 10.01 s | 1.4506% |
| Star example | 1.97 s | 0.1600% |
| Free-border hat | 7.73 s | 0.4119% of the protected motif |
| Leaf mask | 8.75 s | 2.6300% |
| Photographed tree | 8.46 s | 1.0575% |

The browser imports resize the three sloth masks from 250 to 400 pixels using
the real paint flow. Their worker-input hashes are pinned separately; these
are not the native-resolution ten-second experiments above. The browser uses
its normal 180-second allowance and early return. The vertical shift invokes
continuous repair and retains the verified 700-cell paper lattice through
editable export. The other two sloth uploads solve through ordinary routing.
The star and hat use matching sheets, and the hat retains 43 exactly shared
spans. All seven result screenshots and both new editable views were inspected;
the sloth contours still have small bumps, and the hat has minor edge notches.
Passing the numerical checks does not mean exact artwork recovery.

The owned preview at `http://127.0.0.1:5232/editor/mal/` was restarted after the
build. Served bytes for all three modified runtime modules equal the tested
source hashes. Local diagnostic scripts, all 24 routing attempts, fifteen
refinement experiments, full export audits and release logs are under
`tmp/heart-learning/routing-perturbations-v1/`. The committed
[evidence ledger](clearance-routing-repair.json) records the inputs, comparisons,
source hashes, browser results and local artifact hashes. Nothing was pushed
or deployed.
