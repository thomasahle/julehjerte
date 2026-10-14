# Recovering image quality after short-return rejection

The [subdivision audit](self-return-subdivision.md) exposed close returns that
the original adjacency exclusions miss. Simply rejecting those checkpoints
increased the Hunodan bird's error from 0.9043% to 1.7417%. An offline constraint
projection now recovers **0.8612%**, while retaining the experimental geometry
check. A second case, the collage gift, also recovers its previous image quality.
Neither the validator nor projection has been enabled in the app.

## Refinement, rather than cropping

The existing separation gradient excludes nearby parts of the same slit over
the configured local arc neighbourhood. It therefore supplies no separating
force at the problematic short returns. At step forty, the bird's image error
has improved to 1.0734%, but the new predicate rejects two close returns. Later
improvements are rejected too, so rejection-only refinement keeps an early fit.

The proposal projects a failed checkpoint's close point pairs apart. Bernstein
weights map those points to the existing control coordinates; coefficients of
shared controls are combined. Fixed coordinates stay fixed. Bounded successive
corrections must pass the complete geometry audit before becoming a proposal.
The normal paper, image, feature and candidate-selection checks still decide
whether to keep it. Failed, expired or immovable repairs return no replacement.

This changes coordinates, never curve identity or shared-cut membership. It
does not smooth the mask, change the crop or expand the requested search budget.
Projection can still fail, and it is not a physical strength guarantee.

## What the comparisons changed

The first implementation checked and attempted projection before every regular
checkpoint. It recovered the bird, but spent time checking valid shapes twice
and made the gift slightly worse. The selected implementation follows the
existing checkpoint path first and attempts repair only after all ordinary
proposals fail specifically on short-return clearance. It reuses that audit.
The repaired coordinates are rescored and must pass the usual paper checks.

The bird's offending spans each include a shared hidden curve with free handles.
A separate variant tries only those handles first, preserving visible controls.
It improved rejection-only fitting but finished at 0.9272%, above the former
0.9043%. The general projection gave the better final fit. The gift's offending
spans are both visible. These experiments do not establish a universal advantage
for restricting repairs to hidden controls.

| Input | Previous runtime | Experimental rejection only | Projection after failed checkpoints | Fit/export time with projection |
| --- | ---: | ---: | ---: | ---: |
| Hunodan `hjfig-05` | 0.9043% | 1.7417% | **0.8612%** | 3.66 s |
| Collage gift | 2.3094% | 2.3719% | **2.3038%** | 9.43 s |

These are independent exported-weave errors against the same frozen targets.
The previous-runtime column is the retained paired study; the rejection-only
column was rerun beside the selected projection. Each run starts from fresh
image-derived grids. Timings cover fitting and export, excluding preparation,
decoding and the separate independent replay. They are not browser timings.

All four fresh rejection-only/projection outputs pass production editable
conversion, SVG round trip, source-feature checks and the current independent
editor/geometry/paper checks. The two selected SVG errors are 0.8682% and 2.3319%.
The experimental return predicate also passes both engine exports before and
after halving every cubic. The independent editor has not yet been updated to
use that predicate; this remains a necessary pre-promotion task.

Visual inspection shows the bird's grid-border distortion is reduced. The gift
still has thin seams and contour nicks. The improvements are evidence from two
cases, not a full-corpus gain or proof of exact artwork recovery.

## Reproducible offline runtime

The runtime builder copies `static/inverse` into a new directory, installs the
experimental predicate and applies a small committed refinement patch. It
refuses an existing output directory, records source hashes and never edits the
live runtime. The patch includes the projection helper and the failed-checkpoint
integration, so the experimental changes can be reviewed without an entire
duplicate source tree in Git.

```sh
node scripts/inverse/diagnostics/build-short-return-runtime.mjs \
  --output=tmp/heart-learning/new-return-runtime
node --test --test-concurrency=1 \
  scripts/inverse/self-return-projection.test.mjs \
  scripts/inverse/self-return-subdivision.test.mjs \
  scripts/inverse/self-returns.test.mjs
```

All eight focused tests pass. They include a real projection through the
experimental runtime, fixed-endpoint and caller-immutability checks, rejection
of expired/frozen repairs, subdivision checks and the existing saved-return
and MILP regressions. The new JavaScript files pass lint. The completed 824-test
repository run and thirteen browser flows cover the unchanged app runtime;
they precede the new projection test and do not substitute for broader testing
of the proposed runtime.

The [evidence record](short-return-projection.json) retains the successful and
unsuccessful variants, exact source identities, four editable replays and 154
local artifact hashes. The next gates are the full Hunodan/photo corpus and
consistent independent editor checks before considering runtime promotion.
