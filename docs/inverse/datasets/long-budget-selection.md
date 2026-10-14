# Why the longer leaf search returned a rougher fit

The two completed `c000d30` browser runs used identical prepared masks and
weights, identical scores for all twenty coarse seeds, and identical fine-grid
scores. The only final settings difference was the requested time limit.
Cropping, classification and initial cut-count evidence do not explain the
different leaf reconstructions.

| Measurement | Ordinary 180-second allowance | Explicit ten-second allowance |
| --- | ---: | ---: |
| Actual click-to-ready time | 8.746 s | 10.215 s |
| Independent editable disagreement, 400 px | 2.5488% | 1.3156% |
| Independent editable disagreement, 800 px | 2.6841% | 1.4828% |
| Selected slits per sheet | 3 + 3 | 3 + 3 |
| Feature-routing allowance | 6.155 s | 2.558 s |
| Ordinary clearance-grid attempts | 0 | 2 |

Both exported pairs pass the existing image, feature, geometry and paper
checks. The shorter allowance produces the better image fit but takes longer
wall time in this pair; it is not a universal latency improvement.

Two control-flow decisions explain the observed paths. Near-fit routing-time
interpolation currently applies only to short searches. The longer request
therefore gives routing full priority. It obtains a valid traced routing,
refines it below the 3% image threshold, and immediately returns that result
before trying the ordinary grids. The shorter request exhausts its smaller
routing allowance, then clearance comparison selects a three-by-three grid
that refines to lower disagreement.

Both runs reject a matching-sheet replacement using the same 14.65375% image
lower bound. Matching preference is therefore not the reason for the gap.
The [saved evidence](long-budget-selection.json) records inputs, per-stage
measurements and source hashes. It establishes the differing execution paths,
not the independent numerical contribution of each scheduling decision.

The initially queued experiment did not execute because the sharing-change
release failed its photographic comparison. A new isolated study restores
runtime `c000d30` in every arm and completes all twenty runs. It compares the
unchanged policy, routing interpolation during long searches, retention of a
valid but above-1% recovered fit for grid comparison, and both changes.

| Fixed mask | Original long policy | Routing interpolation | Retain recovered fit | Both |
| --- | ---: | ---: | ---: | ---: |
| Leaf | 2.6050% | 1.3163% | 1.3163% | 1.3163% |
| Leaf shifted right one pixel | 1.5837% | 1.5637% | 1.5350% | 1.5637% |
| Leaf shifted down one pixel | 1.2569% | 1.2569% | 1.2569% | 1.2569% |
| Shifted outline-star control | 0.7569% | 0.7569% | 0.7569% | 0.7569% |

These are independent 400-pixel exported-render errors against the fixed masks,
with one run per arm. All sixteen long-budget outputs pass the original image,
feature, geometry and paper checks, including independent 800-pixel rendering.
The recorded allowance is 180 seconds; observed solves are much shorter. Native
process timings do not establish browser latency.

On the original leaf, interpolation takes about 10.09 seconds including process
startup, versus 8.87 seconds for the rougher original fit and 13.40 seconds for
retention alone. On the shifted star, interpolation takes 9.83 versus 13.10
seconds with unchanged error. These are diagnostic observations, not a general
speed guarantee. Retention adds no clear advantage over interpolation on this
small set, so it is not being combined into production by default.

Visual inspection confirms a closer leaf silhouette but still shows ragged
outer edges and small corner wedges. The masks contain photographed boundary
irregularities; their pixel agreement is not recovered original artwork.

The ten-second controls expose another perturbation failure: shifting the leaf
down one pixel selects a 3-by-5 grid and fails at 4.9769% disagreement. Longer
runs compare and prefer a 3-by-3 clearance grid, reaching 1.2569%. A separate
repeated experiment tests that inexpensive comparison with less remaining
time, using both directions of one-pixel horizontal and vertical shifts.

All 411 protocol-pinned files remain unchanged. The evidence record includes
every result, including the failed short control, with rendered artifacts and
source hashes. No production policy, cropper, classified mask, time limit or
acceptance threshold was changed. Wider-corpus and browser checks remain
necessary before adopting a scheduling change.
