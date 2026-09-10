# Free-border hat: cause, fix and integration

The September 8, 23:21 screenshot shows long, thin seams through the hat and
its background. A fresh top-hat fit reproduced the defect in the engine's
exported curves, before the editor converted them. The saved reproduction is
`scripts/inverse/fixtures/free-border-hat.json`; the screenshot alone does not
contain the user's original cutting geometry.

Two problems combined. Image disagreement measures area, so a long hairline
can have a small numerical cost. Also, the old `direct/fit.js` only attempted
shared-cut recovery for independent sheets without requested symmetry. It ran
before polishing and the final matching-sheet preference, either of which
could replace the repaired geometry. Reusing one template on both sheets does
not by itself align every overlapping section of different slits.

The common finalizer now chooses the matching pair first, then recovers exact
shared spans. Accepted spans refer to common Bézier control points, including
their reflected or reversed partners. Proposals must retain the image fit,
requested symmetry, geometry and paper checks. Later simplification preserves
these shared spans; the editor also checks the combined weave after conversion.
This is a geometry correction, not a stroke or preview-rendering workaround.

The new final-selection regression perturbs the reproduced hat into separate
sheets and uses an 84% free diamond (a square in the mask's coordinates). It
checks that matching actually replaces the pair, and that the *replacement*
receives seam repair. More than 200 mm of cuts become shared on a 100 mm overlap
square. The observed mask and original geometry remain unchanged, and matching,
requested symmetry, paper validity and non-increasing image error are checked.
The existing regressions separately check antialiased exported coverage and
preserve a narrow line when the input really contains one.

## Integration status

`codex/solver-initialization` now includes the newer Paint UI from `redesign`
through `456e628`, merged in `c10e093`. The merge preserves all solver changes,
including the common finalizer, exact shared cuts and weighted free borders.
The isolated checkout is `/Users/ahle/repos/julehjerte-solver-initialization`.
The main and redesign checkouts were not changed; another agent still needs to
integrate this branch there. Nothing was pushed or deployed.

The key implementation commits are:

| Commit | Change |
| --- | --- |
| `43caaf6` | Recover shared cuts for matching sheets, with a saved hat regression. |
| `bf1ca4e` | Preserve true corners and merge nearly repeated subdivision positions. |
| `faedccb` | Use final shared-cut recovery from both automatic solve routes. |
| `40f7e35` | Check woven-image fidelity when simplifying the editable templates. |
| `9bb8056` | Preserve reversed partners in Anti mode. |
| `4171ae2` | Simplify shared runs jointly instead of refitting each copy. |
| `33c74fd` | Exercise matching replacement followed by repair through the common finalizer. |

This table identifies the changes; it is not an independent cherry-pick recipe.
The branch also carries the weighted free-border objective and related engine
improvements. The newer Paint UI has been reconciled with those dependencies
on this branch. Copying `share.js` alone leaves the call-order bug and misses
conversion checks.

See [the original diagnosis](SHARED-CUTS.md),
[conversion fidelity](CONVERSION-FIDELITY.md), and
[shared-run simplification](SHARED-SIMPLIFICATION.md) for implementation details
and the earlier complete dataset validation.

## Fresh verification of the committed fix

All **985 tests** pass (722 application and 263 engine), along with lint and
the production build. Svelte checking has zero errors and seven existing
warnings. All **52 tracked engine files** served by the restarted preview
match the committed source byte for byte.

All **12 browser workflows** pass in Chromium, Firefox and WebKit: matching,
independent and Anti hats, plus the star. The workflows import fresh images,
solve, open Draw and download SVG; they check shared control points, the
editor geometry rules and woven-image fidelity. The star also exports PDF.
The matching hat was re-imported from its downloaded SVG into a fresh Draw
session and visually inspected with outlines hidden.

| Browser | Hat mode | Shared spans after export | Protected-motif disagreement |
| --- | --- | ---: | ---: |
| chromium | matching | 41 | 0.3206% |
| chromium | independent | 30 | 0.2958% |
| chromium | anti | 39 | 0.3189% |
| firefox | matching | 41 | 0.3206% |
| firefox | independent | 20 | 0.4517% |
| firefox | anti | 39 | 0.3189% |
| webkit | matching | 41 | 0.3206% |
| webkit | independent | 30 | 0.2958% |
| webkit | anti | 39 | 0.3189% |

These scores describe fresh fits of the reproduced silhouette, not a recovery
of the unavailable original drawing from the screenshot. The prior complete
22-Hunodan and 32-free-border release checks are linked above; they were not
rerun for this additional regression test, which changes no production code.

The first browser attempt stopped before solving: rebuilding while an old
preview was running left its HTML referencing a removed JavaScript asset.
Restarting the preview resolved that stale-build problem. The 12 successful
workflows above are the subsequent complete run. Always restart the preview
after rebuilding before using it for QA.

The checked preview is at <http://127.0.0.1:5232/en/editor/paint/>. Raw results
and screenshots are in `tmp/hat-seam-recheck-browser-fresh/`; check logs are
`tmp/hat-seam-recheck-{test,check,lint,build}.log`.

The newer Paint integration has since passed 1,041 tests, 18 export workflows,
a JavaScript-fallback replay and two desktop/phone control replays. See
[the integration report](REDESIGN-INTEGRATION.md) for the current source commits
and measurements. Those checks retain the hat fix through the updated interface.

The subsequent [live-preview and budget correction](LIVE-GEOMETRY.md) enables
candidate cuts during fitting and fixes a refinement allocation that could
degrade the independent Firefox hat. Its final replay retains the same exported
hat geometry with previews enabled.

The [graceful Stop implementation](GRACEFUL-STOP.md) also applies the common
shared-cut cleanup to retained checkpoints before export. Keeping a partially
fitted hat therefore preserves exact shared spans through the same editor
conversion and downloaded SVG checks as a completed solve.

The subsequent [continuous-fill rendering fix](LOBE-JOINS.md) removes a separate
antialiasing seam where a lobe meets the woven square. It preserves the fitted
cuts and shares one contour builder across Paint, Draw and woven SVG previews.
