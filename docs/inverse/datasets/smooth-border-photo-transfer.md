# Smooth border proposals need evidence for their inward anchors

The speed improvement on [five synthetic controls](controlled-border-perturbations.md)
does not transfer directly to the photographic benchmarks. An isolated copy of
the main fitter tried the original smooth-row proposals after its four ordinary
border repairs failed. Images, crops, classified pixels, probability fields,
settings and final acceptance rules were preserved. The app was not modified.

| Benchmark | Before | Experimental early fallback | New proposals accepted |
| --- | --- | --- | ---: |
| Difficult photographs | 25/31 native passes | 25/31 native passes | 0 of 87 |
| Regular Hunodan designs | 22/22, maximum 8.22 s | 22/22, maximum 8.61 s | 0 of 66 |

All 22 Hunodan errors are exactly unchanged. The same six photographic failures
remain. Five passing photographs have slightly higher errors, with a largest
increase of 0.085625 percentage points; one passing case improves, and the
already-failing bauble gets worse. No new border proposal supplies any of those
outputs. The extra work consumes time inside the existing solver budget, and
ordinary timing variation remains a confounder; this single comparison does not
isolate the cause of each changed fit.

The proposal stage adds a median 0.224 seconds on the 29 photos with crops and
0.209 seconds on the Hunodan inputs. These measurements include proposed-mask
generation, tracing and its admission checks. They are not browser latencies.
The native photo results in this experiment have not been represented as a new
set of editable/browser passes.

## Failure mechanism

All proposed endpoint counts balance, but none of the resulting traces passes
the fast initializer's existing image/complexity checks. For example, the
outlined star's best proposal changes 0.89% of its target, above the fast path's
0.5% allowance; the dense checker also has over 300 traced segments. Several
other inputs lose 3–8% of their classified image in this initialization.

The continuity prior was starting from a **fitted** inner row even when that row
did not support the assumed counts, colors or minimum spacing. This is a poor
anchor for extrapolating cuts outward. In these cases, enforcing balanced outer
counts conceals disagreement with the local image model rather than resolving
it. The original checks correctly keep those proposals out of the solver.

## Committed correction

Commit `f800e65` requires the four actual inner rows to agree on opposite counts
and corner phases, with no runs below the nominal strip width. Unsupported data
returns no proposal. A coherent inner edge determines one count/phase pair;
there is no need to allocate three unused constant-profile masks or fit away
contradictions before running the row optimizer.

The post-result replay checks 61 unchanged masks: 29 photographs with detected
crops, 22 Hunodan inputs and ten clean/noisy synthetic controls. It retains one
proposal for the dense checker and one for `hjfig-05`; the other 49 photographic
inputs stop at the inexpensive evidence check. All ten synthetic controls retain
their previously selected proposal **pixel-for-pixel**. Every retained photo
proposal is also identical to a candidate from the original experiment.

Single paired proposal-generation timings, with alternating call order, fall
from medians of 17.46 to 1.06 ms for the photo set, 21.18 to 1.01 ms for Hunodan,
and 13.84 to 4.39 ms for the synthetic controls. These exclude tracing and full
fitting. The evidence check was developed from these observations, so this is
development evidence, not an independent generalization estimate.

Seven focused tests and lint pass. Tests include unsupported but individually
well-spaced inner counts, sub-strip uncertainty, blank inner rows, three image
resolutions, rotations, paper-color inversion, clean slanted cuts and unchanged
interiors. The preceding full 807-test QA belongs to `f1c602b`; it is not a claim
that the full suite was repeated after this correction.

A fresh full photo/Hunodan replay of the corrected helper has completed separately
under `tmp/heart-learning/smooth-border-supported-v1/`. Its [completed record](supported-border-replay.json)
retains 25/31 native photo passes with no changed pass status and 22/22 Hunodan
passes with exactly unchanged release errors, maximum 8.36 seconds. The photo
run generates only one proposal, which is rejected; median border-stage overhead
falls to 1.33 ms. Photo errors still fluctuate: eight passing cases increase,
at most 0.110625 percentage points, and two improve. These are fresh native
fits, not a claim of identical outputs or new editable/browser verification.

The helper and its proposed early integration remain offline. The [frozen record](smooth-border-photo-transfer.json)
retains the unsuccessful broad trial and the 61-mask evidence replay; later
results must not overwrite those experiments. No acceptance limits were relaxed,
no neural model was trained, and nothing was pushed or deployed.
