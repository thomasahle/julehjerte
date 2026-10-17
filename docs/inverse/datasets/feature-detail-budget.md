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
match after these checks. The broader inverse suite and the
Hunodan browser speed target still require verification. The preview remains
on the previous validated build.
