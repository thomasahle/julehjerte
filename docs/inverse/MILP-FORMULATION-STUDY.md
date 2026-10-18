# MILP formulation experiments — 18 October 2026

The perturbed sloth sometimes reaches its routing deadline before HiGHS returns
the first integer candidate. These experiments test equivalent formulations of
the existing finite graph. None is enabled in production.

The [recorded results](datasets/milp-formulation-study.json) retain graph and mask
hashes, timings, and hashes of the original diagnostic artifacts. First-candidate
trials use two one-pixel perturbations, two repetitions in reversed arm order,
and a 3.5-second allowance. All original residual checks remain active. A returned
integer proposal can still violate cutting geometry; it is **not** a successful
heart reconstruction.

| Change | Observed result |
| --- | --- |
| Keep membership binary, relax directed-arc integrality | Fewer binaries, slower on both masks; one timeout. |
| Keep directed arcs binary, relax membership integrality | Slower; both vertical-perturbation runs timed out. |
| Tighten label big-M constants to the actual label range | No consistent timing gain across both masks. |
| Require each selected arc to carry at least one unit of flow | Slower; both vertical runs timed out. |
| Bound flow below by shortest remaining path length | Vertical first candidate improves from 3.00–3.18 s to 2.03–2.05 s; horizontal worsens from 1.59–1.75 s to about 3.51 s. |

For the last bound, let `d(v)` be the shortest eligible graph distance from `v`
to any sink of that sheet. The existing flow balance consumes one unit at every
visited non-source vertex. A selected arc `u → v` therefore carries at least
`d(v) + 1` units. This strengthens the continuous relaxation without removing an
integer source-to-sink path. It can nevertheless change branch-and-bound behavior
and which repairable routing arrives first.

An exploratory complete-pipeline comparison used fresh processes and original
pixels, with a ten-second request. Preparation, fitting, validation and export
are timed; independent SVG replay is measured afterward. These are single runs,
and several inputs are related sloth examples.

| Input | Baseline checks / time / error | Distance-bound checks / time / error |
| --- | --- | --- |
| Sloth x + 1 | pass / 8.268 s / 0.9584% | pass / 9.323 s / 1.2032% |
| Sloth y − 1 | fail / 9.305 s / 5.6640% | pass / 9.323 s / 1.2768% |
| Danish green tree | pass / 9.706 s / 0.81875% | pass / 9.940 s / 0.81875% |
| Bible star outline | pass / 8.834 s / 1.1600% | pass / 8.704 s / 1.1025% |
| Sloth photograph | pass / 9.742 s / 1.9968% | pass / 10.022 s / 1.7136% |
| Upward leaf | pass / 9.617 s / 0.85625% | pass / 9.606 s / 0.85625% |

The distance bound recovered one failure but worsened another fit and exceeded
ten seconds once. This is insufficient evidence for a production change. The
baseline failure also revealed a separate issue: a repair with good image and
geometry checks was discarded because its paper audit remained uncertain at
resolution 700. Retaining that candidate for the main fitter's finer check is
the next investigation; longer MILP search does not address that lost checkpoint.

Run each first-candidate study serially from the repository root:

```sh
nice -n 15 node scripts/inverse/experiments/milp-formulation-study.mjs integrality tmp/milp-formulation-study
nice -n 15 node scripts/inverse/experiments/milp-formulation-study.mjs label-bounds tmp/milp-formulation-study
nice -n 15 node scripts/inverse/experiments/milp-formulation-study.mjs flow-bounds tmp/milp-formulation-study
```

The script modifies private in-memory module copies, verifies mutation anchors,
and rebuilds graphs from masks. It never uses the fixtures' saved template curves
as initializers. Timings will vary with machine load and runtime versions.
