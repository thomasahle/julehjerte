# Reserving detail time for an already checked fit

A fresh puppy reconstruction could pass the 1.8% whole-image regression limit
while its small opening grew to more than four times the observed area. The
opening stayed enclosed, so retaining its colour and enclosure did not measure
that shape error. The cold run stopped its detail pass after 105 steps.

For short requests, an already checked candidate now keeps one second for
finalization instead of 1.7 seconds. That gives its existing detail pass up to
700 ms more time within the same overall request. Such a candidate cannot enter
the rejected-boundary rerouting branch. Unaccepted candidates retain the full
1.7-second reserve for possible rerouting; longer requests retain three seconds.
The 160-step detail cap, original mask, geometry and paper gates are unchanged.

The [recorded comparisons](feature-detail-budget.json) independently render
the exported curves against the same frozen source mask:

| Fresh-process fit | Error at 400 px | Opening area | Opening intersection-over-union |
| --- | --- | --- | --- |
| Before | 1.3900% | 31.875 mm² | 22.35% |
| Rejected earlier handoff | 1.6256% | 51.875 mm² | 13.73% |
| Checked-candidate detail window | 1.0694% | 9.625 mm² | 71.79% |

The reference opening is 7.125 mm² in the estimated photographic mask. At
800 pixels the selected result has 1.1797% disagreement and 72.65% opening
overlap. Both resolutions preserve its enclosure. Nominal geometry and the
combined lattice/polygon paper checks pass. No physical assembly is claimed.
These are serial, low-priority fresh fits with a ten-second solver request;
they are not browser latency measurements or identical-trajectory benchmarks.
The initial trajectories and available work vary with timing.

An earlier experiment handed the coarse fit to detail sooner. It completed
160 detail steps but started from a worse outline and enlarged the opening
further. That experiment was reverted. The adopted change retains the original
handoff and spends more time only after an acceptable candidate exists.

The puppy test also required an intermediate paper audit to be uncertain before
passing at finer resolution. A valid trajectory can pass its first audit
directly. The test now validates and independently renders the actual retained
Stop checkpoint instead of requiring that particular transition. The original
1.8% limit remains; exported curves additionally pass geometry and final paper
checks, independent rendering at 400/800 pixels, enclosure retention and
opening overlap above 50%. The stronger shape check exposed the cold-run defect
before this scheduling change.

All 25 feature, crop-perturbation and rerouting tests pass, including four crop
offsets with both ordinary and 1.5× clocks, and shifted-bird rerouting with
10- and 180-second allowances. The final conditional implementation also passes
the puppy test in a separate cold process. Type checking, lint, build and 874
application tests pass (one existing skip); all 1,040 pinned source hashes
match after these checks. The Hunodan browser speed target still requires
verification. The preview remains on the previous validated build.

The subsequent complete inverse suite on runtime `4379b66` finishes with
**1,051 passes and nine failures** in 1,476.14 seconds. All 1,040 source hashes
still match. Twelve of the previous fourteen failing tests pass in this run;
the ten-second shifted bird and dense checker still fail, and seven other
tests fail. The measurement file retains every assertion and the comparison
with the previous run. This revision has **not passed release QA**.

The failures cover different conditions:

- The half-resolution puppy fails final template checks. Its initialization
  still reaches the expected finer spline; the original failure does not save
  the complete output, so capture replays are needed to identify the remaining
  defect.
- The shifted bird returns a feature-preserving grid instead of the expected
  rerouting. That assertion precedes its export-quality checks; it alone does
  not establish the returned image or paper quality.
- The dense checker passes geometry and paper but has **4.32125%** original-mask
  disagreement, above the unchanged 3% limit. It selects the same 10-by-11 cuts
  as an earlier captured passing run with 2.525625% disagreement.
- The two late-routing repair tests fail differently: one attempts repair but
  completes zero refinement steps; the other has no rejected-candidate record
  at the assertion. The separate topology repair-tail tests pass.
- Three sloth search-scheduling cases fail. The actual reports and exported
  cuts are preserved in the full log: the synthetic control and vertical shift
  fail geometry and paper at 5.3536% and 5.1552% error; the Paint-resampled
  horizontal shift passes those checks but has 6.175625% error.
- The crown passes geometry but retains uncertain paper support.

These reproductions use frozen masks or fixed crop coordinates. Their failures
occur downstream of automatic corner detection. Timing-sensitive initialization,
refinement and selection still need investigation; neither a passing focused
replay nor observed system load explains away a failed final gate. The preview
has not been refreshed, and no browser-speed improvement is claimed.

The subsequent [indexed scalar-loss experiment](indexed-boundary-loss.md)
reduces repeated segment scans without changing the loss values. All nine
failures pass its targeted replay; it still requires complete-suite and browser
verification and does not replace the failed full-run record above.
