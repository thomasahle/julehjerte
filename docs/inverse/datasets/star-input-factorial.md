# Separating crop changes from routing changes in the blue star

The original photograph and its JPEG copy both pass the current pipeline, but
their fitted bands differ visibly. A controlled follow-up finds two interacting
causes: small changes in the classified mask alter the traced routing graph,
and a short refinement pass can leave an otherwise useful routing insufficiently
fitted. This study does not change the production runtime.

The [evidence record](star-input-factorial.json) pins 103 source hashes and 160
local artifacts under `tmp/heart-learning/star-input-factorial-v1/`. The runtime
is the checked `4469b9f` code at documentation-only commit `3fcde1e`.

## Pixel/crop intervention

The experiment uses the original source and the exact JPEG quality 75 transform
from the release benchmark. Each is paired with both recorded automatic crop
proposals. Those corners remain fixed during fitting, with no extra inset. All
four combinations start fresh under the production ten-second search allowance.

| Pixels | Fixed crop | Independent mask disagreement | Fit and validation | Selected routing |
| --- | --- | ---: | ---: | --- |
| Original | Original proposal | 1.3063% | 9.42 s | Grid followed by Bézier fitting |
| JPEG | Original proposal | 1.6088% | 7.22 s | Grid followed by Bézier fitting |
| Original | JPEG proposal | 1.2913% | 9.30 s | Grid followed by Bézier fitting |
| JPEG | JPEG proposal | 1.7481% | 3.31 s | MILP seed followed by Bézier fitting |

All four pass and use four cuts per sheet. Only the joint pixel-and-crop change
finds the simpler traced routing. Compression alone does not explain the result.
Each row has a different classified target, so these percentages are not a
ranking of crop accuracy. The original-pixel/JPEG-crop run never schedules
feature recovery; its initialization changes that scheduling decision too.

The current source-image comparison can be repeated with:

```sh
node scripts/inverse/hard-photo-benchmark.mjs \
  --catalog=tmp/heart-learning/star-input-factorial-v1/catalog.json \
  --crop=fixed --target=mask --seconds=10 --output=<new-directory>
```

## The routing graph is sensitive to tracing

Sixteen isolated probes trace each unchanged mask at smoothing radii 0.3, 0.5,
0.75 and 1.0 mm. Each receives a one-second sparse MILP allowance. The existing
0.3/0.5 traces exhaust their candidate graphs on three inputs. A 0.75 mm trace
produces a geometrically valid, paper-supported routing on all four.

This is not an endpoint-count repair: all these masks retain the same required
four cuts per sheet. None of the original star's traces triggers the existing
visible-self-intersection or short-return diagnostic. At radius 0.5 its visible
graph has seven degree-four junctions; at 0.75 it has five. Smoothing changes
junction placement and connectivity. Count alone is not the explanation: the
successful JPEG 0.5 trace also has seven such junctions.

The main recovery code only tries radius 0.75 after specific self-intersection
evidence, so it does not try that alternative for this original star. Additional
hidden connectors in the existing graph do not recover a routing here. These
observations support trying alternative local boundary interpretations after
graph exhaustion, while retaining the original classified mask as the objective.

## Refinement and export

The raw routed seeds differ from their masks by more than 3%, so none is admitted
as a final reconstruction on that evidence alone. All eight 0.75/1.0 mm seeds
pass after 160 fixed refinement steps. Their errors range from 1.58% to 2.54%;
stronger smoothing is not uniformly better.

For the original pixels and original crop, extending the 0.75 mm seed to 800
steps lowers independent disagreement to **1.1556%**, compared with **1.3063%**
for the fresh production run on the identical mask. It uses 68 unique cubic
edges rather than 167. Inspection of the actual rendered outputs shows cleaner
star bands and removal of the baseline's small notches and protrusions. Some
edge rounding remains; this is not a recovery of known original cutting paths.

That extended refinement plus independent checks takes 4.50 seconds. It excludes
crop detection, initial count search and MILP routing, and is not an end-to-end
or browser speed claim. Short 700 ms probes are retained separately: cold runtime
overhead leaves the first loaded-kernel probe at five steps and above the source
error limit. Fixed-step runs separate convergence from that timing effect.

Production editable SVG conversion also passes editor intersection rules and
independent geometry/paper checks, with **1.1531%** disagreement. All 28 reserved
source-photo observations match in the classification, independently rendered
native output and editable output. These are sparse checks, not dense artwork
labels. No physical assembly or live browser test of this experimental seed has
been performed.

## Consequence for the next implementation

A useful next change is a bounded alternative trace after ordinary boundary
interpretations are exhausted, followed by enough common Bézier refinement to
compare it fairly with the grid candidate. It must preserve the existing border
retry ordering, geometry and paper gates, source features, matching-sheet
preference and overall search budget. The 22-design speed benchmark and complete
photo benchmark must determine whether this generalizes before enabling it.

This also sharpens the possible neural-network task: propose uncertainty and
alternative connectivity around ambiguous junctions. Predicting one hard graph
would reproduce the discontinuity exposed here. That is an inference from this
experiment, not a demonstrated neural result. All these photographs and derived
variants remain reserved for development QA, outside training.
