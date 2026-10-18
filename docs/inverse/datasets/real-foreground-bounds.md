# Separating foreground, cropping and routing failures

The six additional real photographs now have an annotation-assisted diagnostic.
It holds reviewed paper/background labels fixed and tries both extremes for
uncertain pixels: all background, or all paper. Letterbox padding stays outside
the heart. Neither case supplies overlap corners or a region of interest.
These are diagnostic bounds on the reviewed labels, not exact physical outlines
or predictions from a neural network.

Both variants use the unchanged cropper, colour classifier and main fitter with
a ten-second search allowance. All twelve runs completed:

| Foreground field | Checked pair | No crop | Rejected fit |
| --- | ---: | ---: | ---: |
| Known paper only | 2/6 | 4 | 0 |
| Include uncertain pixels | 3/6 | 0 | 3 |

The decorated checker and boar pass with either field. The blue/yellow checker
also passes when uncertain edge pixels are included, although its crop includes
some lower/right fringe and its 3+4 cuts retain an unnecessary border strip.
All five accepted pairs pass editable conversion, SVG serialization/parsing,
source-feature retention, independent geometry and paper-core checks. Their
editable disagreements range from 0.41% to 1.81%. Different crops produce
different masks; these figures do not measure agreement with original artwork.

The other three cases separate downstream problems:

- The rabbit now has a crop, but carpet fringe remains in its mask. Its selected
  fit distorts the ears/body, disagrees by 4.34%, and fails geometry/paper checks.
- The gold angel has a more plausible crop than the production detector's
  earlier quadrilateral through the motif. Bright gold remains difficult to
  classify. Its initial result passes geometry/paper checks but has 7.07% error.
- The hand-held checker has patterned paper. Classified flecks inside the cells
  become six protected source regions; the fit loses them and remains rejected
  despite 2.71% total disagreement. A body-foreground model does not itself
  distinguish printed texture from the two underlying paper materials.

## Fixed-mask trace experiment

The rabbit and angel recovery logs spend much of their budget on a dense graph
from the first trace. The angel never reaches a different trace. A separate
diagnostic therefore tests smoothing radii 0.3, 0.5, 0.75 and 1 against each
unchanged upper-bound crop mask. Each admissible trace receives two seconds of
sparse HiGHS search, with normal geometry and paper gates. Valid routes receive
up to 800 steps of the common Bézier refinement, then independent export checks.

All four rabbit traces fail to produce a validated route. The angel's 0.5 trace
has a visible self-intersection, which optional hidden connectors cannot fix.
Its 0.75 trace removes one junction and produces a valid route: 1.94% error
before refinement, **0.76% after**, and **0.74% after editable SVG conversion**.
The trace search and refinement together take 3.19 seconds in this diagnostic.
The source mask and fitting probabilities remain unchanged. Visual inspection
confirms much better preservation of the angel and surrounding frame, with
some asymmetric thin border arms still visible.

This isolates a routing/search-order limitation on one fixed input. It is not
a new automatic-upload success: its crop uses reviewed foreground evidence,
the trace alternatives are separate diagnostic runs, and its refinement does
not share a fresh ten-second public-solver deadline. It motivates testing
alternative traces before spending the remaining budget on a denser graph.

## Verification and reproduction

Commit `6e438ad` provides `real_annotation_probe.py` and the explicit
`--methods=annotation` replay mode. The CLI rejects annotation fields offered
as learned predictions or synthetic oracle fields. Nine Python tests and five
Node tests pass, including unknown-pixel exclusion and provenance guards.

```sh
python3 scripts/inverse/learning/real_annotation_probe.py \
  --labels=tmp/heart-learning/real-supplement-diagnostic-v1/labels \
  --annotations=tmp/heart-learning/real-supplement-diagnostic-v1/annotations.json \
  --output=tmp/heart-learning/real-foreground-bounds-new/probes
node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/real-foreground-bounds-new/probes/include-unknown \
  --output=tmp/heart-learning/real-foreground-bounds-new/include-unknown \
  --methods=annotation --target=mask --solve-ids=all --seconds=10
```

The [evidence record](real-foreground-bounds.json) verifies original sources,
recomputes all twelve annotation fields from reviewed labels, checks source
mask hashes, records eight trace probes and six successful editable exports,
and pins implementation and artifact hashes. All eight crop-producing runs,
the alternative angel fit, and all six editable renderings were inspected.
Local scripts and logs live in `tmp/heart-learning/real-foreground-bounds-v1/`.
No model was trained, no production algorithm changed, and no physical
assembly or new browser upload test was performed for this diagnostic.
