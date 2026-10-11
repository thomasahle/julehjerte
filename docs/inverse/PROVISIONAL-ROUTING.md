# Refine a useful routing before rejecting its image fit

The red/white tree photograph (`danish-tree-red`) retains its sharp branches in
the classified mask, but the previous returned grid fit rounded them away.
The automatic crop and colour conversion do not explain that loss: a much
closer routing had already been found from the same mask, then discarded.

## Where the candidate was lost

Feature recovery traces the classified image, solves the resulting routing
problem with HiGHS, and validates geometry and paper support. Its previous
contract returned a solution only if the image error and protected-feature
checks passed too. The direct fitter therefore had nothing to refine when a
valid routing narrowly failed either image check.

This made a small crop-edge fragment disproportionately affect the central
design: its rejection discarded the already recognizable tree along with it.

For the tree, the recovered 3+3 routing passed geometry and paper checks, but
had 3.05% source-mask error before refinement, just outside the 3% acceptance
limit. It also missed an 8.8125 mm² classified fragment centered at
`(99.228, 80.208) mm`, near the right edge. The fitter discarded this routing
and returned a poorer 4+4 grid with **6.71125% independent exported error**.

An isolated probe reproduced the image-derived routing without supplying
reference cuts or correcting the crop. The common Bézier optimizer reduced
independent exported error to **2.05375% after 160 steps**, and **1.761875% after
750 steps**. Both retained valid geometry and paper support. The small edge
fragment remained missing, so neither probe qualified as a fully passing result.
The longer probe is diagnostic; production keeps its existing 160-step,
700-millisecond recovery-refinement allocation.

## Production behavior

- Recovery still returns `solution` only when all of its existing acceptance
  checks pass. A geometrically valid, paper-valid image rejection may additionally
  return an explicitly provisional `refinementSeed`.
- The common fitter retains both the untouched routing and its refined candidate.
  This prevents refinement or endpoint clamping from losing a useful fallback.
- Both join the ordinary candidate comparison against the original source mask.
  A candidate passing all checks ranks ahead of one with outstanding image or
  feature problems. Among otherwise comparable fallbacks, lower original-source
  error wins.
- Final geometry, paper, image-error and protected-feature checks are unchanged.
  The crop, classified mask and probabilities are not edited. Requested symmetry
  and weighted/free-border routes retain their existing behavior.

The fresh production photo-to-export replay now selects the 3+3 recovered tree,
with **2.05375% exported disagreement** and recognizable branch outlines.
It takes **9.293 seconds including automatic cropping and external rendering**
in the recorded Node replay. It still reports `templateChecksPassed: false`
and the missing-region warning. This is a substantially better downloadable
approximation, not a claim to have recovered the physical cutting paths or solved
the remaining crop-edge interpretation.

## Verification

The new regressions exercise two distinct contracts. A noisy checker with a
zero-error acceptance limit yields a provisional geometry but no accepted
solution, and still fails the final image check. The actual tree photograph is
automatically cropped, classified, solved and independently rendered; the test
checks improved exported error, retained branches, geometry/paper validity,
unchanged source arrays, and continued reporting of the missing edge fragment.

The 22 regular Hunodan frozen-crop benchmarks all pass with exactly unchanged
errors. Median preparation-through-export time is **4.947 s**, maximum
**8.381 s**. These exclude decoding and external resvg replay and are not directly
comparable to the complete tree-photo timing above.

All 845 application tests and 537 inverse-engine tests pass, with one existing
application skip. Type checking has zero errors and seven existing warnings;
lint and build pass.

All **12 Chromium/WebKit workflow checks pass**, covering both tree photographs,
the Hunodan recovery case, independent and matching free-border hats, and the
blue/green checker. They include SVG download/reimport, the editor's intersection
checks, exact shared-span preservation and the displayed approximation notice.

The complete 44-photo replay retains **9 passing candidates, 20 needing review,
and 15 without a crop**. Every input, crop and preparation result is unchanged.
The red tree improves from 6.71125% to 2.05375%, but still needs review. Two
printed-paper cases have small increases under the wall-clock budget:

| Case | Before exported error | After | Search evidence |
| --- | ---: | ---: | --- |
| `danish-red-gold` | 13.795625% | 13.9425% | The selected grid's clearance stage completes 90 rather than 100 steps |
| `vissevasse-arranged-r3c4` | 5.818125% | 5.8225% | The selected grid's last recorded refinement checkpoint changes from step 444 to 564 |

Neither case produces a provisional recovery seed, and neither exercises the
new refinement path. Their observed variations remain recorded; this is not a
claim that all errors are unchanged. The other 26 rendered outputs have the
same independent errors, and all candidate pass/review statuses are unchanged.

## Browser search latency before the border-stability correction

The measurements in this section describe the first routing-retention release
(`ca79a33`). The subsequent border-stability correction is described below.

Both upload-to-editable-SVG replays preserve the recovered branches, display the
approximation notice and retain the missing-feature failure in their engine
reports. Editable error is **2.024375% in Chromium** and **2.031875% in WebKit**,
measured by the editor's renderer rather than resvg.

However, Find to ready takes **72.393 seconds in Chromium** and **75.896 seconds
in WebKit**. The browser requests
up to 180 seconds, unlike the ten-second Node benchmark. After retaining the
good routing, it still refines all 18 count/phase grids because no candidate
passes the edge-feature check. Grid/curve refinement consumes about 59 seconds
without displacing the recovered tree. This latency is unresolved; the fast
Hunodan and short-budget Node timings do not establish fast browser completion
for this failure case. It is a separate search-budget problem exposed by the
full-pipeline QA.

## Follow-up: stable interior features and an independent routing trigger

The remaining fragment consists of 141 source pixels at columns 395–398 of
the 400-pixel crop, with just column 399 between it and the boundary. Its long,
narrow shape follows the right crop edge. The feature detector previously
excluded regions touching the exact outermost row/column, but a single-pixel
background fringe made the same region count as an interior motif. Thus a
one-cell crop or classification perturbation could change a final acceptance
decision and trigger another minute of searching.

Interior-feature classification now requires **more than one source pixel of
clearance from the square boundary**. This is an explicit change to which
components receive the extra 60% retention check. It does not erase the fringe,
alter the mask or probabilities, change the crop, or exclude pixels from image
error. An intentional detail within that one-cell neighbourhood still counts
towards total mask disagreement, but no longer has a separate interior-feature
guarantee. Geometry and paper validation and the 3% image-error limit remain
unchanged. The report records `borderClearancePixels: 1`.

Regressions exercise touching and one-cell-separated regions on all four sides,
in both colours and at 100, 400 and 800 pixels. They check unchanged masks and
the full fringe contribution to image error. The same small region with two
cells of clearance remains protected and fails if omitted. Existing tests also
retain the rejection of a lost interior motif even below 1% whole-image error.

Removing the false feature exposed a second coupling: the useful detailed
routing had only been attempted because the initial grid missed that fragment.
The grid retained almost 90% of the tree's connected region, so its substantial
branch distortion did not fail the component-retention test. The fitter now also
tries detailed recovery when the coarse initialization is far outside the image
limit, every fine grid remains outside it, and coarse topology has supplied no
candidate. The regression verifies that the tree takes this route even when its
initial component audit passes.

The fresh ten-second-budget workflow selects the same 3+3 tree and exactly the
same **2.05375% independently rendered mask error**. It now passes the revised
interior-feature check. This new pass is due to the explicit border-classification
policy above, not a claim that the missing fragment was reconstructed. All 22
regular Hunodan cases retain exactly their previous exported errors and pass
their speed/quality gates; the slowest is **8.370 seconds**.

The actual editor replay confirms the latency correction:

| Browser | Previous Find to ready | New Find to ready | Editable mask error, before and after |
| --- | ---: | ---: | ---: |
| Chromium 145 | 72.393 s | 4.556 s | 2.024375% |
| WebKit 26 | 75.896 s | 4.600 s | 2.031875% |

These are individual serial replays, not population latency estimates. Both
reuse the same photograph, automatic crop and source mask. The feature check
now allows the good routing to finish the search before the extra 18 grid
attempts. It retains the visible approximation notice because the displayed
image disagreement remains 2.0%. SVGs still pass the editor's intersection and
conversion-fidelity checks. The one-pixel rule corrects this measured stall;
it does not guarantee fast completion for every photograph.

[Detailed measurements and source hashes](PROVISIONAL-ROUTING-VALIDATION.json)
retain all 44 outcomes, the 22 speed checks, 12 browser runs and the diagnostic
refinement probes. Browser stage timings are included so this remaining search
cost can be investigated independently of crop or renderer time.

Run the checks serially from the repository root:

```sh
node --test scripts/inverse/feature-refinement.test.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --ids=danish-tree-red --output=tmp/provisional-tree
INVERSE_SPEED_OUT=tmp/provisional-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/provisional-web-all
```

For the actual editor replay, build and serve on an isolated port, then run:

```sh
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_TEST_BROWSERS=chromium,webkit INVERSE_TEST_CASES=web-danish-tree-red,web-danish-tree-green,hunodan-hjfig-05,top-hat-preferred,top-hat-independent,web-bibel-checker-3 INVERSE_TEST_OUTPUT=tmp/provisional-browser node scripts/inverse/paint-browser-test.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed standalone Playwright module when needed.

The previous complete pipeline baseline is recorded in
[COUNT-FINALISTS-VALIDATION.json](COUNT-FINALISTS-VALIDATION.json), from commit
`ee468d2`. The image-only benchmark retains failed and uncertain cases in its
denominator; a better approximation does not automatically increase its pass rate.
