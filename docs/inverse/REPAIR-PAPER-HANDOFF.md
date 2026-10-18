# Preserve repaired curves pending finer paper verification

The one-pixel vertical sloth crop exposed a failure after MILP search had already
found a useful routing. Continuous repair passed geometry and source-image
checks, with 1.44% engine mask disagreement, but the conservative paper lattice
remained `uncertain` at resolution 700. Recovery discarded its curves. The
fallback exported 5.664% independent disagreement and failed template checks.
The mask and crop were fixed throughout this comparison.

The main fitter already checks unresolved paper connectivity at resolution 1000.
The missing connection was the handoff: recovery returned no candidate, and its
retained raw candidate structure omitted the paper summary that requests finer
verification. This was a candidate-retention failure, not evidence that the crop
or design was impossible. Other failures still time out before an integer routing
arrives; this change cannot resolve those.

Recovery now returns an explicit `refinementSeed` when all geometry, image and
feature checks pass but paper remains uncertain. `solution` stays null and
`accepted` stays false. The common fitter revalidates the reconstructed curves,
retains the paper summary, and applies its ordinary original-image and finer-paper
gates. These gates live in `direct/candidate-verification.js` so the same code is
exercised directly by regression witnesses. A failed paper audit never becomes an
uncertain seed, and unresolved uncertainty never becomes an accepted result.

The existing deadlines still bound admission and optimization. A nearly expired
repair window preserves the seed for verification instead of starting another
refinement checkpoint. Once a fully checked candidate exists, an expired grid
refinement window no longer starts the first unused layout. Final independent
geometry and paper checks still run on the exported curves.

Two saved diagnostic continuations isolate the paper distinction without relying
on machine speed: both pass cutting geometry and have uncertain paper at 360 and
700. At 1000, the 85-step witness passes, while the 60-step witness remains
uncertain and is rejected. Independent final-paper checks agree. Independent SVG
replay gives 1.4864% and 1.5744% disagreement respectively. These saved coordinates
are test witnesses, never input to fresh production fitting.

On 18 October, a fresh ten-second vertical-crop run passed in 9.406 seconds at
1.2912% independent disagreement. That run finished 160 repair steps and did not
need the new handoff. A separate fresh diagnostic with the JavaScript clock
accelerated by 1.1 exercised the handoff: an 85-step repair remained uncertain at
700, passed at 1000, and exported 1.488% disagreement. Its final version took
10.174 simulated seconds (9.249 actual workflow seconds). Thus it demonstrates
recovery of the lost candidate, **not a strict ten-second guarantee under all
scheduling conditions**. Checkpoints and required final audits can still overrun
the requested search deadline.

Focused validation: 14 tests passed, covering both fresh crop perturbations,
late-repair admission, expired audits, unresolved-paper rejection, and the fresh
round-checker finalist. Independent export error and time thresholds were not
relaxed. Fresh recovery tests now allow a finer verified lattice instead of
requiring exactly the earlier resolution, and independently audit final geometry
and paper. Full-suite and browser validation remain separate release gates.

```sh
node --test --test-concurrency=1 scripts/inverse/recovered-paper-candidate.test.mjs scripts/inverse/rejected-routing-deadline.test.mjs scripts/inverse/clearance-routing.test.mjs scripts/inverse/late-routing-repair.test.mjs scripts/inverse/paper-resolution-finalist.test.mjs
```
