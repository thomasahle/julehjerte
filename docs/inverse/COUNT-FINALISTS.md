# Refine competitive simpler cut counts before stopping

The blue/green three-by-three checker (`bibel-checker-3`) exposed a template
selection failure after a usable automatic crop. The fitter now gives a
competitive lower-count finalist curve refinement even when opposite borders
disagree. It selects two cuts per sheet instead of three, with lower exported
mask disagreement on the unchanged crop and classified mask.

## Diagnosis

The automatic crop includes a narrow light-background fringe. Inset transition
counts are `[2,2,2]`, `[1,9,3]`, `[1,1,3]`, `[2,2,2]` on its four sides. This
disagreement correctly prevents treating any count as confirmed border evidence.
It must not also prohibit searching a simpler solution.

Both 2+2 and 3+3 grids already survived initialization. The 3+3 fine grid had
0.958% optimization-mask error; 2+2 had 2.283%. After clearance constraints and
curve refinement, the 3+3 candidate passed all checks, so the search returned
before refining 2+2. The old exception allowed a simpler finalist only when
confirmed by consistent counts on opposite borders.

For diagnosis, restricting initialization to 2+2 on the **same automatic crop
and source mask** produced a valid pair with **1.4375% independent exported mask
error**, versus **1.4875%** for the previous production result. That restricted
run is not a fair speed comparison or a production solution: it was given the
count. It demonstrated that the common fitter could reconstruct this topology,
and that the missing refinement attempt mattered.

The production change supplies no known count. An already initialized finalist
may receive refinement if it has fewer total cuts and its fine-grid error is
within one percentage point of the current curve candidate's optimization error.
The existing time budget, explicit early-stop setting and weighted/free-border
route remain in force. The final selector still requires the existing geometry,
paper, feature and original-source checks. With uncertain border evidence, the
simpler candidate must beat the other candidates' original-source error; this
change does not add a simplification error allowance.

Candidate diagnostics now include original-source error and image/feature pass
status, alongside optimization error. These are different measurements: the
fine-grid errors above use the fitting resolution, whereas final reported errors
come from independently rendering the exported curves at source-mask resolution.

## Validation and limits

The fresh full-pipeline regression loads the committed photograph, estimates
corners automatically, classifies the crop, fits fresh grids, exports the pair
and rasterizes it with resvg. It checks 2+2 cuts, improvement over the old exported
error, valid geometry and paper, preserved features, and unchanged source mask,
probabilities and crop. No reference template paths enter this process.

The 22 regular Hunodan frozen-crop benchmarks all retain their previous errors
and counts in the serial replay. All pass their quality gates within ten seconds;
median preparation-through-export time is **5.154 s**, maximum **8.514 s**.
These timings exclude image decoding and external resvg replay. The checker
photo workflow, including automatic cropping and external validation, takes
**8.325 s** in the recorded Node run.

A browser counterfactual serves the previous engine snapshot to the current
editor, then repeats the upload against the rebuilt engine. Chromium and WebKit
both keep exactly the same crop and source mask, change 3+3 cuts to 2+2, and
reduce **editable SVG** error from **1.465625% to 1.4200%**. This uses the editor's
renderer, so it is a separate measurement from the resvg numbers above.

| Browser | Previous click to ready | New click to ready |
| --- | ---: | ---: |
| Chromium 145 | 5.698 s | 6.040 s |
| WebKit | 5.597 s | 6.052 s |

These are individual serial replays, not a statistically established latency
improvement. The extra candidate adds work while improving topology and error.

The broader Chromium/WebKit replay passes **26/26** cases, covering automatic
photo imports, unequal lobes, the star, noisy checker/tree masks, the curved
circle, the angular house, and free-border hats with matching, independent and
anti-paired sheets. Editable SVGs retain the engine's exact shared spans and
pass the editor's own intersection checks. The star's PDF download is checked
as well. All 845 application tests and 535 inverse-engine tests pass; one
existing application test is skipped. Type checking reports zero errors and
seven existing warnings; lint and build pass.

Visual comparison still shows bowed edge regions in the checker. A simpler
cut count is not proof of exact recovery of the original artwork or physical
cutting paths. The residual crop/background and boundary-fit errors remain.

The [broader photograph study](WEB-PHOTOS.md) separately records no-crop cases,
classification artifacts, lost features and excessive fitting error. This
change addresses premature template-search termination within that pipeline.

## Reproduction

Run serially from the repository root, with the existing dependencies:

```sh
node --test scripts/inverse/photo-counts.test.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --ids=bibel-checker-3 --output=tmp/simpler-finalist-checker
INVERSE_SPEED_OUT=tmp/simpler-finalist-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/simpler-finalist-web-all
```

Build and serve the worktree on its own preview port, then run the browser
comparison serially (`PLAYWRIGHT_MODULE` may select the installed standalone
Playwright module):

```sh
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_TEST_BROWSERS=chromium,webkit INVERSE_TEST_CASES=web-bibel-checker-3 INVERSE_TEST_ENGINE_REFERENCE=5c8d753 INVERSE_TEST_OUTPUT=tmp/simpler-finalist-browser-before node scripts/inverse/paint-browser-test.mjs
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_TEST_BROWSERS=chromium,webkit INVERSE_TEST_CASES=web-bibel-checker-3,unequal-lobes,top-hat-preferred,top-hat-independent,web-danish-tree-green,star,top-hat,top-hat-anti,hunodan,noisy-checker,noisy-tree,circle,house INVERSE_TEST_OUTPUT=tmp/simpler-finalist-browser node scripts/inverse/paint-browser-test.mjs
```

The previous production full-photo result is recorded in
`docs/inverse/CURVE-DEGREES-VALIDATION.json`; its source commit is
`5c8d753a2ef03ecb702290aebdc112359ef3cf57`. The isolated known-count probe is a
diagnostic only; correctness is enforced by the normal image-only regression
and full production replays.
