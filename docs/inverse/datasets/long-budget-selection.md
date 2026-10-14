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

The next experiment is queued after the current sharing-change release checks.
It compares separate isolated runtime copies: unchanged behavior, near-fit
routing interpolation for long searches, retention of a valid but above-1%
recovered fit for subsequent grid comparison, and both changes together.
Every accepted output still needs the existing final gates. Retained valid
alternatives use the existing 25-second comparison allowance; the one-percent
condition governs early return, not final acceptance.

The inputs are the recorded leaf mask, one-pixel horizontal and vertical shifts
with edge extension, and the shifted-star control. Each gets a ten-second
baseline and four long-budget arms in separate native processes. No saved cuts
or slit counts enter those solves. This is an initial fixed-mask diagnostic,
not a fresh crop, browser-latency result, or adopted algorithm change. No
experimental outcome is claimed yet.
