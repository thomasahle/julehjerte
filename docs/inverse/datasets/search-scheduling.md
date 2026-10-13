# Retaining time for recoverable photographic routes

Commit `0ff2baf` changes search order and allocation without changing source
pixels or final acceptance rules. An isolated comparison on eight fixed sloth
crop variants improves independently checked editable pairs from **5/8 to 8/8**.
All eight prototype runs finish below ten seconds, including preparation,
fitting, generated exports, independent rendering and feature auditing. Image
decoding, process startup and the separate editable replay are excluded.
Eight additional fresh runs of the committed implementation reproduce all
eight checked editable pairs; the slowest takes 9.55 seconds on the same basis.

This is a development study of one photograph. Its crop variants include
outputs of earlier offline foreground models and small translations; it is not
a new neural-model advantage, unseen-corpus score or cutting-path ground truth.
The [preceding clearance repair](clearance-routing-repair.md) supplies the
bounded continuous repair used here. No geometry or paper limit is relaxed.

## Controlled experiments

The source photograph, eight crop coordinates and every classified mask hash
remain fixed. Each run starts a fresh process with the same ten-second setting.
It receives pixels, not earlier cutting geometry. Engine copies record their
base commit, exact code substitutions and source hashes. Separate policies
change only one scheduling decision at a time.

| Policy | Frozen-model crop | Synthetic-control crop | Positive vertical shift |
| --- | --- | --- | --- |
| Previous engine | Fail, 4.36% | Fail, 5.35% | Fail, 5.14% |
| Retain colour-based grid order without reserving its refinement | Pass, 0.58% | Fail | Fail |
| Share a short topology-initialization allowance | Fail | Pass, 0.42% | Fail |
| Prefer fewer short returns within the image/feature gates | Fail | Fail | Pass, 0.69% |

These policies expose three different causes:

- The frozen-model crop moves a colour-retaining 4+4 grid ahead of the 3+3 grid.
  Its image fit is worse, but it also claims the refinement reserve. After an
  unsuccessful coarse routing, only about 0.3 seconds remain for traced recovery.
  Removing that reservation reaches a repairable route without changing the mask.
- The synthetic-control crop spends five seconds searching a 146-segment precise
  boundary, leaving too little time for the simpler recovery graph. Sharing the
  initialization allowance reaches and repairs that later route.
- The positive vertical shift's first trace develops crossings during attempted
  repair. The established smoother trace can route successfully, despite having
  a slightly worse initial image score and a worse maximum visible-chain gap.
  A visible chain may switch sheets through hidden connectors, so that gap is
  ordering evidence, not an infeasibility proof about the two-sheet solution.

## Interactions and selected policy

Combining all three broad rules is **not** successful. Always preferring fewer
returns sends the frozen-model crop to a route whose continuous repair fails.
Removing every colour-based refinement reservation also regresses the Viking
control from about 2.08% error to 7.97%.

The selected policy preserves two distinctions:

1. Colour retention still reorders grids. It reserves refinement time only when
   the selected ordinary grid also improves the previous first grid's image fit.
   Dedicated feature initializations keep their existing reservation.
2. A trace with small, potentially repairable returns stays first unless the
   smoother trace improves both image fit and maximum deficit. Larger returns
   may instead prefer fewer problematic chains, provided the unchanged source
   image and feature gates pass. The existing 15% repair-eligibility limit is
   shared by these decisions; it is not a physical acceptance tolerance.

Requests of ten seconds or less share up to one quarter of their allowance,
maximum 2.5 seconds, between precise and coarse topology initialization. Longer
requests retain their existing initialization allocations. All ordinary grids,
final feature checks, geometry checks and paper checks remain available.

The selected prototype passes all eight crop variants through SVG conversion,
serialization, reimport, editor rules and independent paper/feature checks.
Viking, Stonehenge and crown also retain passing results in separate ten-second
fixed-mask runs. Some already-passing errors vary slightly; this is not uniform
pixel-error improvement. Visual comparison of the three recovered masks shows
restored openings and branches, with small contour irregularities remaining.
Nothing has been physically assembled.

## Reproduction and current verification

`scripts/inverse/fixtures/sloth-search-scheduling.json` contains only the three
source masks and provenance, not cutting seeds. Fresh regression tests replay
exported templates at both 250 and 500 pixels and preserve the original mask
and probability arrays. All 16 targeted tests pass, including prior illegal
routing, paper-resolution and source-feature controls. Type checking and lint
pass with their pre-existing warnings.

The local study is `tmp/heart-learning/routing-scheduling-v1/`. Its 28 corrected
matrix runs and nine control runs are retained alongside the rejected broad
policy. An initial diagnostic harness compared against an omitted raw settings
field and therefore logged an incorrect aggregate `passed` Boolean. Those twelve
runs remain under `initial-harness-run/`; all twelve were repeated using the
expanded engine settings before the comparisons above. They are not pooled
with the corrected results.

The eight additional committed-main runs pass independent image/feature checks
and the complete editable replay. The two already-rejected baseline outputs
that fail conversion remain failures; none of the new checked outputs loses its
pass in the editor. Fresh broader replays of this scheduling commit retain
**22/22 regular Hunodan designs**, with identical errors and a maximum of
8.248 seconds, and **24/31 hard photographs**. The hard-photo input quads, masks
and fitting probabilities are unchanged. Some already-passing photographic
fits have slightly different errors; this is not a universal error reduction.
All 855 application tests pass, with one pre-existing skipped test.

The first full inverse run passes 769/770 tests. Its sole failure is an obsolete
scheduling assertion, not an invalid reconstruction: `hjfig-05` no longer
reserves refinement for its worse colour-retaining 6+6 grid. It routes directly
to a valid 4+4 pair, so the old test dereferences a null deferred-probe report.
A separate fresh replay with the same simulated one-second graph delay passes
geometry and paper checks and measures 0.9043% independent exported disagreement,
within the test's unchanged 0.95% limit. Its report and exports are retained in
`recovery-diagnostic/hjfig-05-1000/`; the failed full-suite log is preserved.

The updated test retains that source photograph and quality limit, and checks
the corrected routing priority. A second test uses the existing pinned Viking
photograph to retain deferred-recovery coverage. A one-second graph delay expires
its initial probe, and a seven-second first-refinement delay forces that grid to
stop. The remaining user allowance resumes routing before later fitting. Only
the clock changes: all candidates come from the original pixels. The test checks
both routing attempts, their remaining budget, source immutability, final
geometry/paper checks and independent image/feature fidelity at two resolutions.

All seven updated tests in `feature-refinement.test.mjs`, type checking, lint
and the build pass. The owned preview now serves this build. All ten Chromium
flows pass the existing export checks, but visual review and paired metrics
expose a remaining quality/timing regression on the shifted sloth: a 53.74-second
six-cut fallback replaces the earlier 8.71-second two-cut result. Thus the green
browser aggregate does not establish preserved quality. The
[routing-timeout follow-up](routing-timeout.md) records the controlled diagnosis,
stronger regression gate and candidate fix. Final full-suite and browser
verification continue with that follow-up. Nothing was pushed or deployed.
