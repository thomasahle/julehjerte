# Faster bounded short-return projection

The anchor application test exposed a deadline-sensitive local repair. Its
hidden-control attempt correctly stopped when the remaining witnesses had no
movable gradient. The subsequent all-control attempt repeatedly reached their
shared 400 ms cutoff before retaining a valid checkpoint. This failure also
reproduced with the frozen `99399ff` runtime; it was not introduced by the
HiGHS clock correction.

The projector previously ran the complete geometry validator after every small
coordinate update. It now evaluates the same complete short-return predicate
during those intermediate updates and runs the complete geometry validator
before returning any repaired coordinates. The caller's image, feature and
paper checks remain in place. Iteration counts, time budgets, movement bounds,
fixed controls and symmetry constraints are unchanged.

The [measurements](return-projection-speed.json) compare frozen runtime copies
in serial processes:

| Check | Previous loop | New loop |
| --- | --- | --- |
| 104 geometry probes | 27 accepted repairs | Same decisions and identical serialized accepted geometry |
| Total projection time in those probes | 5.744 s | 4.018 s |
| First fresh anchor repair | Accepted, 2.195 s | Accepted, 1.650 s |
| Second fresh anchor repair | Rejected, 2.961 s | Accepted, 1.717 s |
| Accepted anchor's independent disagreement at 400 px | 0.8750% | 0.87375% in both runs |
| Accepted anchor's independent disagreement at 800 px | 0.9796875% | 0.97703125% in both runs |

The 104 probes cover saved and analytic curves, exact halves and reflection,
and both hidden-only and all-control projection. This is not a 27/104 photograph
reconstruction score: some inputs need no repair, and some cannot be repaired
by this bounded local operation. Projection timing excludes the initial audit
and separate final checks. The approximately 30% reduction is specific to these
probes, not a whole-pipeline or browser speed claim.

Both accepted anchor candidates pass final export, geometry and paper checks.
Their independent SVG renders are checked at the original and doubled source
resolution. The source mask and incoming geometry remain unchanged.

A new negative regression supplies an incomplete initial audit for a slit with
a fixed wrong endpoint. The local return is resolved, but the complete final
validator rejects the remaining endpoint defect. This checks that completing
the faster local loop cannot certify an otherwise illegal template.

The adopted code passes twelve focused geometry tests and the previously
failing anchor application test. The committed diagnostic reproduces all 104
decisions and all 27 accepted geometries:

```sh
node scripts/inverse/diagnostics/return-projection-study.mjs \
  --output=tmp/return-projection-check
```

Use `--runtime=<inverse directory>` for a frozen runtime copy. The output must
be new and stays inside this worktree. It records source hashes, stopping
reasons, geometry identities and timing scope. Full QA and the Hunodan,
photographic and browser release replays remain required before calling this
a validated release.
