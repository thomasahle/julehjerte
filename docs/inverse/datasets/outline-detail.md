# Recovering outline detail without moving the fold controls

The [sampling fallback](sampling-fallback.md) recovered a valid routing for the
Stonehenge photograph, but its sun lost most of its rays. This follow-up finds
two causes: the coarse curves lack local freedom, and global refinement rolls
back useful interior changes when another part of the template loses paper
support. The numerical image-error limit alone did not expose the missing rays.

The main fitter now uses its existing polishing allowance to subdivide curves
near substantial interior disagreement and hold the outer controls fixed. No
separate fitter, new user option, target edit or looser acceptance limit is
introduced. The first complete nine-crop replay remains **8/9 accepted**, with
substantially better detail on most crops. The vertical-shift case improves
from **2.893% to 1.144%** independent 400-pixel disagreement and from **2.995%
to 1.328%** at 800 pixels, taking **8.21 seconds** for solving, validation and
export. These are classified photographs, not known original cutting paths.

## Separating the causes

Observational snapshots from a fresh solve of the previous fitter show the
sun-window error already at **7.664%** before final cleanup. Sharing,
straight-span selection and export leave that window unchanged. Straight-span
selection changes the whole-square error slightly, from 2.874% to 2.893%,
outside the sun window. Cleanup is not the cause of this particular missing
detail. Snapshot serialization can affect the timing of this diagnostic;
the production comparison is measured separately without instrumentation.

The older detail pass targets small enclosed source regions. The sun is part
of a larger boundary-connected white region, so it does not enter that pass.
Only two other components of this crop qualify for the source-region audit.

Controlled continuations start from the same previously exported vertical-shift
fit and keep its photograph, crop, classification and cut counts fixed:

| Continuation | Curve pieces | Whole-square error | Sun-window error | Result |
| --- | ---: | ---: | ---: | --- |
| Original exported fit | 82 | 2.893% | 7.664% | Valid baseline |
| Another 400 iterations | 82 | 2.893% | 7.664% | No accepted improvement |
| Split to at most 4 mm, 400 iterations | 313 | 2.889% | 7.664% | No accepted optimization step; raster-only difference |
| Fix outer controls, 400 iterations | 82 | 2.601% | 6.911% | Valid improvement |
| Split to at most 4 mm and fix outer controls, 400 iterations | 313 | 1.008% | 1.866% | Valid improvement |
| Residual-selected subdivision and fixed outer controls, 160 iterations | 151 | 1.151% | 2.215% | Valid improvement; binary 400-pixel objective |

The first five rows use the photographic probability objective at 256 pixels;
the last row is a subsequent bounded proposal using the same binary objective
as production polishing. Its time was 1.12 seconds in this isolated run.
These timings are diagnostic and do not establish a general speedup.
Subdivision changes regularizer sampling and normalization as well as degrees
of freedom; those costs are recorded, so this is not a pure capacity ablation.

The rejected subdivided candidates fit the picture much better, but create a
detached possible paper core near the fold, around **x=90–95 mm, y=100 mm** in
sheet A. This is far from the sun. Independent audits at 360, 700 and 1,000
samples all reject those candidates. Fixing outer controls removes this
particular obstruction while keeping all paper and geometry checks active.
This does not establish that all lost details can be made physically valid.

Exact de Casteljau subdivision preserves continuous curves to floating-point
precision. The independent antialiased renderer can still cross its binary
threshold at a few pixels: the uniform 4 mm split changes 0.01125% of the
400-pixel raster before fitting. That is reported separately and is not
credited as recovered detail. A first diagnostic stopped at an overly tight
raster-equivalence assertion; its log remains preserved.

## Bounded integration

Only an already accepted independent candidate can request this polishing
proposal. Explicit symmetry constraints, identical-sheet polishing and weighted
observations retain their established route. Final matching-sheet selection
and all final validation still run.

At the usual 2 mm cutting width, the proposal:

- Holds controls within 8 mm of the square boundary fixed in both coordinates.
- Erodes the interior mismatch by 0.5 mm before choosing where more detail is
  needed, excluding thin classification fringes and isolated pixel noise.
- Requires a residual core covering at least 0.05% of the source square.
- Splits nearby curves to at most 4 mm, with fewer than 128 additional pieces.
  Shared curves are split once and reused by both sheets.
- Uses the existing 160-step polishing deadline and unchanged binary target.
  An added-parameter result must strictly improve original-source agreement
  and pass geometry, paper and source-feature checks to replace its incumbent.

These are control constraints, not a claim that every point throughout the
outer image band is mathematically frozen. The final weave is independently
rendered after any accepted change.

The focused QA also exposed a provenance bug: successful polishing dropped an
earlier clamped-feature repair's report. That history is now carried forward,
while the polished geometry and paper status are checked afresh.

## Fresh replay and limits

All input, crop and classified-target hashes match the previous replay.
There are no saved-template initializers in these fresh fits.

| Crop translation | Previous 400-pixel error | New 400-pixel error | New 800-pixel error | Status |
| --- | ---: | ---: | ---: | --- |
| Original | 2.669% | 1.514% | 1.647% | Pass |
| +1, 0 | 2.466% | 2.492% | 2.583% | Pass, slightly worse |
| 0, +1 | 2.893% | 1.144% | 1.328% | Pass |
| −1, 0 | 2.761% | 1.366% | 1.496% | Pass |
| 0, −1 | 2.614% | 2.122% | 2.235% | Pass |
| +1, +1 | 2.774% | 2.772% | 2.877% | Fails source-feature check |
| −1, +1 | 2.678% | 1.378% | 1.524% | Pass |
| +1, −1 | 2.734% | 1.179% | 1.315% | Pass |
| −1, −1 | 2.509% | 0.998% | 1.158% | Pass |

The nine crops take 7.76–9.53 seconds each. The half-resolution puppy control
also passes in 9.31 seconds. Native timings exclude image preparation and the
independent replay. These are translations of one repeatedly inspected
photograph, not nine independent motif families or new successes in the
broader photograph corpus.

The horizontal crop rejects the additional-parameter polish because it does
not improve the source fit. Trying it uses time that the former ordinary
polish could use, so the final error is slightly higher. This remains a
scheduling limitation, not a uniformly improved result. The +1,+1 crop still
loses an interior feature and is correctly rejected.

All **22 regular Hunodan designs** pass below ten seconds. Twenty-one retain
exactly their previous errors, one improves, and none regresses. The maximum
is **8.974 seconds**, including preparation, solving, validation and export.
Decoding and independent replay are outside that timer.

The full automatic-crop corpus retains **24/31 accepted complete photographs**,
with no status changes across its 47-entry inventory. Fifteen clipped entries
and one obscured entry remain separately excluded. The seven unresolved
complete photographs are still unresolved; the new detail pass does not fix
missing crop proposals or establish a new routing when source features are
already lost.

Visual inspection confirms that the sun has more recognizable rays, but some
remain rounded or missing. The flower's central opening retains small notches,
and faint seams remain in the gingerbread example and the original Stonehenge
crop. Lower global disagreement is useful evidence, not a claim that these
designs now reproduce every detail of their sources.

## Reproduction and validation

Implementation commit: `b7a32fa`. The pinned previous implementation is
`4fc1c2d`. Raw stages, failed attempts, rejected paper checks, continuations and
fresh benchmarks are under `tmp/heart-learning/outline-detail-v1/`.

```sh
node scripts/inverse/outline-detail-study.mjs \
  --source-ref=4fc1c2d --output=tmp/outline-detail-replay
node --test --test-concurrency=1 \
  scripts/inverse/outline-details.test.mjs \
  scripts/inverse/feature-near-miss.test.mjs \
  scripts/inverse/clamped-features.test.mjs
```

The focused tests, Hunodan benchmark and nine-crop replay pass. Broader corpus,
full-suite and browser/export QA are still in progress; this report will be
completed with their recorded results. No physical assembly test is claimed.
