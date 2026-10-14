# Carrying detected returns into refinement

An offline prototype adds a differentiable separation force for point pairs
rejected by the stronger short-return checker. It refreshes those witnesses
every five steps after the first observed failure, rather than relying only on
repairs at forty-step checkpoints. Exactly shared and reversed controls receive
accumulated Bernstein coefficients. Fixed coordinates and the ordinary final
geometry, paper, image and symmetry checks remain in force.

The [evidence record](short-return-active-forces.json) preserves the outputs,
source hashes and visual review. Two finite-difference/invariance tests pass. Fresh paired fits use the same
source pixels, fixed crops, classified masks, time allowances and cached
absolute-turning checker. They start from image-derived grids, not saved paths.
They remain wall-clock-dependent comparisons; differences in intermediate
starting states mean they do not isolate the force by themselves.

| Case | Gap projection control | Active force | Active fit/export time |
| --- | ---: | ---: | ---: |
| Hunodan bird | 1.2415% | 1.0778% | 4.26 s |
| Collage gift | 2.3013% | 2.0525% | 9.35 s |

These are independent exported-weave errors against unchanged source masks.
The bird remains worse than the current app benchmark's 0.9043%; neither case
establishes a universal improvement. Increasing gap-repair iterations from
8 to 16 in a separate paired run yielded identical selected errors and did
not resolve the remaining issue.

All four outputs pass actual production conversion, SVG serialization/parsing,
source-feature checks and the current geometry/paper checks in their original
representations. Editable errors are 1.1702%/1.0170% for the bird and
2.3306%/2.0788% for the gift. Each exported SVG was then checked as original,
halves, thirds and unequal subdivisions, with and without reflection.
All 32 representations pass the stronger experimental geometry predicate.
The existing editor flags both bird outputs and the gift control in thirds;
the active-force gift passes both checks in all eight representations.
Maximum sampled geometry change is 3.22e-13 editor pixels.

Visual review limits the apparent numerical success. Both gift outputs retain
an unwanted hooked stroke near the top, false thin horizontal gaps and rough
border junctions. The bird's eye and body remain recognizable, but its grid
is uneven. No production fitter or validation rule is changed by this study.

The first replay adapter incorrectly compared with an unset raw maxImageError
field. Version 2 uses the normalized report settings and reproduces the same
target hashes, geometry and errors. The initial failed flags are retained;
the corrected checks do not refit the outputs or change their acceptance limit.

The next diagnostic records the editor's exact rejecting point pairs. A
separate fixed-start, fixed-step experiment is prepared to distinguish force
behavior from time-dependent pipeline changes; it has not yet been run.
