# Repairing an initializer without relaxing template acceptance

The [captured-candidate experiment](clearance-candidate-repair.md) showed that
the ordinary Bézier fitter can repair a useful grid rejected for slit spacing.
The integration now gives such an initializer a bounded attempt before its
routing is discarded. It uses the original classified mask and the common
curve fitter; it does not import a fitted template or change crop coordinates.

Three related changes address the one-pixel leaf shifts:

- Reserve one unrepresented, simpler cut-count pair using the existing
  image-error plus 0.005-per-cut objective and a 0.015 competitiveness window.
  Keep three finalists, the best coarse seed and any opposing-border reservation.
- Allow the existing clearance comparison with three seconds remaining rather
  than requiring 3.5 seconds. The finalization reserve and total budget remain.
- Give a competitive initializer with only inter-slit-clearance violations a
  short refinement attempt when there is no accepted image candidate. A checked
  repair is retained and can seed further ordinary refinement.

The repair has a 500 ms refinement deadline and at most a 1.2 s local allowance,
subject to the remaining solve budget. These are checkpoint deadlines, not
hard real-time caps. It must pass final geometry, original-mask agreement,
source-feature retention and paper checks. An uncertain coarse paper audit may
be checked at resolution 700; that verified resolution follows the candidate
through subsequent fitting, polishing and finalization. Crossings, requested
symmetry and weighted borders do not enter this repair path. The original
candidates and remaining count hypotheses stay available.

## Regression checks and rejected shortlist revisions

The first integrated revision passed all twelve candidate runs across six
fixed masks and two repeats, versus eight baseline passes. Independent renders
at 400 and 800 pixels checked the actual exported geometry. Its focused flower
test then failed: selecting the fewest cuts inside the expanded window displaced
the useful 3+3 initializer with a worse 3+2 start. A fresh comparison returned
4+4 cuts at 0.77375% disagreement, versus the baseline's 3+3 at 0.45000%.

Ranking extra starts by the regularized score corrected the flower but exposed
another diversity issue: the other colour phase of an already represented 4+4
pair displaced the leaf's 3+3 start. The final reservation therefore ranks
**unrepresented count pairs**, with alternate phases retained in the ordinary
remaining queue. Neither failure was addressed by weakening the tests.

All nine focused tests pass, including both photographed flower resolutions,
fresh upward-shifted leaf fitting without saved cuts, independent exported-image
agreement, preservation of finer paper verification through polishing, crossing
rejection, exhausted budgets, and exclusion of weighted/symmetric inputs.
The fixture's captured cuts are used only for isolated repair tests; the fresh
solve receives only the original mask. Its run-length-encoded mask is hash checked.

The first paired experiment remains in
`tmp/heart-learning/clearance-repair-integration-v1/`; its flower diagnosis is in
`tmp/heart-learning/clearance-repair-flower-v1/`. The corrected paired replay is
in `tmp/heart-learning/clearance-repair-integration-v2/` with 208 pinned source
files. That replay and full corpus/browser QA are pending. These development
cases do not update the published 25/31 photographic success rate.
