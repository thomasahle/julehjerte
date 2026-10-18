# Keeping verified border detail through polishing

Commits `b9b81a4`, `add4398` and `c9291da` preserve the finer paper-check resolution when polishing a fitted candidate, then give improved detail candidates the existing clamp correction before rejecting them. The correction now also checks subpixel area retention. The original image, crop, source-feature thresholds, symmetry constraints and geometry/paper limits stay unchanged.

## Why useful refinement was discarded

A candidate verified at material resolution 700 could return to the default 360-resolution settings during in-fit sharing and polishing. The fitting margin includes a discretization allowance: changing back to the coarser lattice increases that margin. In the bird fixture, its maximum permitted coordinate changes from **96.9230 mm to 96.7322 mm**. That moves a boundary inward by about **0.191 mm before taking a gradient step**, despite the existing finer paper verification.

The new `polishCandidate` wrapper uses the candidate's verified resolution and carries it through progress snapshots. It does not reuse a paper verdict: refinement, accepted changes and export still audit their actual geometry. In-fit sharing uses the same verified settings. A deterministic regression stops before any gradient steps and demonstrates the unwanted movement under the old coarse setup, unchanged fine clearance under the wrapper, a valid paper check and correctly labeled snapshots.

Both the small-feature pass and ordinary polishing could also improve the whole-image fit and eye shape, yet fail because a small border region stopped at the optimizer's optional 0.35 mm cushion. Candidate selection discarded that improved geometry before the existing clamp correction could inspect it. The correction is now offered at both selection points. It must restore every required feature, preserve requested symmetry, pass nominal geometry and strict paper checks, and meet the unchanged error ceiling. An already accepted incumbent cannot be replaced by a higher-error result.

The search stops preparing further clearance grids once their refinement window has expired, preserving that time for the candidate already fitted. Late correction has a half-second attempt budget and leaves a half-second export reserve; synchronous validation can still finish past an attempt deadline.

## A failed export regression changed the fix

The initial implementation passed source-resolution checks but failed the existing independent 800-pixel export regression. Its restored border feature retained **71.58%** of source pixel centres, yet only **59.74%** at the finer scale, below the unchanged 60% floor. The whole-image error improvement did not justify accepting that loss.

The correction now samples all four quarters of each original feature pixel and checks retention under both signs of the existing geometric tolerance. Colours and weights come from the original source pixels; the image is neither reclassified nor edited. This subpixel test participates in the displacement search before nominal geometry and strict paper checks. Its resolution and minimum retained area are recorded with every correction.

The initial failed suite was interrupted to diagnose this error. Its log and independent export audit are preserved under `tmp/heart-learning/polish-clearance-v1/before-area-guard/`, and linked in the machine-readable report. Cancelled tests from that interruption are not counted as completed checks. All final evidence below uses the corrected implementation.

## Browser timing exposed an avoidable cost

The first area-aware version passed the Node regression but took about **84.5 seconds in the browser solver**: its first correction exhausted the unchanged half-second budget, so alternate-layout search continued. That rejected performance result remains in the report.

The finer checks were rendering all rows of the image to measure a feature spanning only a few rows. Regional sampling now evaluates those rows with the same intersection arithmetic and tie rules as the full renderer. A regression compares every requested row, both color phases, reversed boundaries and exactly shared cuts. Unrequested rows are explicitly zero and are never used by the regional feature audit. The source-resolution whole-image comparison remains a full render. No correction budget or quality threshold was increased.

## Fresh reconstruction and its limits

Fresh replays start from the original photograph, apply the same one-pixel vertical crop translation and rebuild the classified mask. The mask hash is unchanged. Three separate committed-code runs with a ten-second allowance gave:

| Run | Fit and export | Independent disagreement | Template checks |
| --- | ---: | ---: | --- |
| 1 | 9.607 s | 3.1294% | Fail |
| 2 | 9.537 s | 2.9069% | Pass |
| 3 | 9.525 s | 2.9069% | Pass |

**2/3 runs pass.** These wall-clock-limited results do not establish reliable ten-second reconstruction across hardware or runtime conditions. Failed outcomes remain in the report. The short search can arrive at a different detail checkpoint before its deadline.

With a thirty-second allowance, the same vertical crop gives **2.3531%** independent disagreement in **27.615 s**, compared with **2.3556%** in **26.777 s** previously. Eye component overlap is **57.4257%**. The per-attempt records show which corrected candidates finish verification and which are discarded before selection. Original and horizontally shifted controls, including any error regressions, are retained individually in [the measurements](polished-feature-recovery.json).

All **22/22 regular Hunodan designs pass under ten seconds**, the slowest at **9.139 s**. Their independent errors are exactly unchanged. The full-photo benchmark remains **24/31**, with the same outcomes, automatic crop coordinates and source-mask/probability hashes.

## Verification

The focused tests cover the initial clearance clamp, both border orientations, source immutability, preserved artwork, expired budgets, requested symmetry and the long photographic replay. Independent SVG rendering checks the repaired shapes at finer resolutions; the regression that exposed the initial defect is retained. The acceptance error is measured on the original 400-pixel mask. Supersampling that mask changes the disagreement measurement. All 400- and 800-pixel error and feature measurements are recorded separately; passing source-resolution error is not a claim of sub-3% disagreement at every scale.

All **855 application tests** pass with one existing skip; all **712 inverse tests** pass; type checking reports zero errors and seven existing warnings; lint and the production build pass. Counts and timings are preserved in the linked logs. Five actual Chromium cases verify the compute worker, editable-template conversion, source features, legal geometry, paper support, shared cuts and applicable SVG/PDF downloads:

| Browser case | Previous click to ready | Current click to ready | Editable disagreement | Checks |
| --- | ---: | ---: | ---: | --- |
| bird-y-shift-mask | 28.229 s | 28.563 s | 2.1975% | Pass |
| bird-shift-mask | 17.431 s | 14.491 s | 2.5406% | Pass |
| bird-mask | 12.688 s | 12.878 s | 2.5188% | Pass |
| star | 2.047 s | 2.033 s | 0.1600% | Pass |
| top-hat-preferred | 7.934 s | 8.004 s | 0.4119% | Pass |

The browser uses the ordinary longer allowance, not a ten-second timeout. Its inputs and settings are unchanged from the preceding replay. The preview was restarted after building, and its served entry modules and fitter source bytes were checked against this worktree. It remains available at `http://127.0.0.1:5232/`.

Raw diagnostics, rejected outputs, fresh runs and logs are under `tmp/heart-learning/polish-clearance-v1/`. The preceding results remain in [the early-correction report](early-clamped-feature-recovery.md). No saved cutting template is supplied to the fresh fitter. Image agreement is measured against classified photographs, not unavailable original cutting paths. No physical assembly has been tested. No code was pushed or deployed.
