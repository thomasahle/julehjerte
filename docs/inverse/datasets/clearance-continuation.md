# Continuing a repaired spacing initializer

A short spacing repair could fix the cutting geometry and retain the source
features, yet discard the result before checking its paper support. The helper
allowed an unfinished improvement to continue only when its caller requested
feature recovery. A spacing-only repair instead had to meet the final image
limit immediately. Small timing differences in clearance preparation could
therefore choose different branches with different continuation rules.

Both branches now use the same continuation rule: the original-mask error must
improve, every source feature must survive, and the resulting curves must pass
geometry and paper checks. A result above the requested image limit is returned
only as a continuation, with no accepted candidate. The common fitter must
still meet the original acceptance criteria before reporting success. The
repair's work allowance and enclosing deadline are unchanged.

The regression reproduces the actual stacked-heart failure with fixed work,
without a real-time cutoff. Ordinary initialization and fine-grid fitting
produce the four-cut-per-sheet proposal; 80, 100 and 120 clearance steps retain
the same narrow-neck initializer. Its minimum inter-slit distance is about
1.184 mm, below the existing 1.5 mm requirement. The saved initializer is used
only by the isolated helper regression; fresh reconstruction tests still start
from the photograph's mask.

| Stage | Original-mask disagreement | Status |
| --- | --- | --- |
| Initial spacing violation | 7.526875% | Invalid geometry |
| After 45 repair steps | 3.6875% | Checked continuation; still above the 3% image limit |
| After 120 common-fitter steps | 1.581875% | Independently rendered exported curves pass |

The previous helper fails this regression because it returns no continuation.
With the change, the intermediate and final geometry pass the existing nominal
geometry and paper checks; the exported result preserves the image features.
The input mask, probability field and initializer coordinates remain unchanged.
Two negative regressions verify that neither failed nor uncertain paper support
can produce a continuation, despite improved geometry and image error.

All 23 focused tests pass, including fresh Viking, stacked-heart and shifted
leaf fits, the delayed comparison, and the formerly failing handoff test.
Type checking, lint, build and all 874 application tests pass (one existing
skip). All 1,040 source hashes match after the checks. The
[measurements](clearance-continuation.json) distinguish this fixed-work
regression from real-time fresh fitting. These results do not establish that
the remaining full-suite failures or the Hunodan browser speed misses are
resolved. The preview remains on its previously validated snapshot.
