# Stop recomputing identical failed refinement blocks

The floral checker CPU study revealed repeated 40-step blocks after refinement
had returned to exactly the same safe coordinates, reset Adam, and reached its
minimum learning rate. The final candidate report describes polishing history;
stage-labelled progress was needed to find these earlier repeated blocks.

The refiner already detects and skips these exact cycles for feature-guided
initializers. Ordinary grid fits now use that same mechanism. It retains the
last partial block, checked incumbent and paper-uncertain alternative. This
changes neither geometry/paper acceptance nor the source image. It does not
stop a merely slow or still-changing optimization trajectory.

A paired isolated replay compares the previous runtime with this single caller
change. Each photo is solved afresh from its unchanged classified mask, with
fixed automatic crop coordinates and no saved cutting paths. Run order reverses
in the second repeat. Both candidate repetitions pass template and source-feature
checks, with no higher independent error at either 400 or 800 pixels.

| Photograph | Previous 400-pixel disagreement | Candidate | Candidate native solve |
| --- | ---: | ---: | ---: |
| Floral checker | 1.9325–1.9419% | 1.8906% | 9.40–9.43 s |
| Viking | 2.1663–2.1938% | 2.1450–2.1525% | 9.54–9.55 s |

The floral candidate jumps from the repeated block at step 280 to the final
partial block ending at 749. Its main refinement costs 2.52–2.58 seconds versus
3.30–3.41, leaving room for subsequent work. Viking remains sensitive to timing;
its small paired improvement is not evidence that all of its remaining error
comes from repeated cycles. These fresh-process errors also differ from the
warmed full-corpus run. This is a focused comparison, not a new 31-photo score.

Ten focused tests pass. The optimizer-equivalence regression now checks both
ordinary and feature-preferred selection at 650 and 750 iterations, requiring
identical selected coordinates, scores, validity and retained uncertain
alternatives with skipping enabled or disabled. Short-budget leaf/star recovery
and refinement-budget checks also pass. Full QA and corpus/browser replays for
this new runtime remain to be completed.

The [record](ordinary-rollback.json) retains the paired runs, CPU profile,
stage-labelled progress, source hashes and test log. The earlier release's
photographic and ordinary-budget browser failures remain in
[their separate record](clearance-repair-release.md).
