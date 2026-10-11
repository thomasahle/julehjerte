# Recover routing across contour seams and infeasible traces

Follow-up: the cropped-upload failure recorded below is now recovered by
[one-sided endpoint inference and common-fitter refinement](OPPOSITE-EDGE-RECOVERY.md).
The original failed measurements remain here as the baseline.

The red tree on the right of `danish-tree-group` had a plausible automatic crop
and recognizable branches in its classified mask. The returned 4+4 grid rounded
those branches away: independent rendering measured **5.973125% disagreement**.
The detailed trace had consistent 3+3 border counts, but both connector graphs
were rejected as infeasible. This was not a solver timeout or proof that the
photographed design was impossible.

## A contour's storage seam was blocking junction repair

`repairJunctions` already looked for nearby, opposed corners with four separated
arms. It refused edits touching the first or last vertex of any chain. That is
appropriate for a real open endpoint, but a closed contour's first vertex is
arbitrary. Two corners only about 0.7 mm apart near the tree's upper-left frame
junction remained disconnected because one was at that seam.

Closed contours now use circular edit intervals. An edit can wrap across index
zero, multiple edits cannot overlap, and the unedited arcs connect successive
repaired junctions. Open endpoints remain fixed; the existing radius, arm-angle,
spacing and displacement checks are unchanged. The original source chains are
not mutated.

Where no edit touches the seam, the established head/tail subdivision is retained.
An initial implementation unnecessarily joined those pieces and regressed the
Hunodan `hjfig-05` reconstruction. The existing independent-export regression
caught that change; preserving the subdivision restores its previous result.

Regressions rotate and reverse closed contours, including dense contours with
multiple edits wrapping across the seam. They check the repaired four-way
junctions, bounded motion, unchanged inputs and retention of every unaffected
arc. Dense-chain candidate sampling can still move a chosen centre by half a
pixel; this is not a claim of exact subpixel invariance to all resampling.

## Retry a different seed after a proved graph failure

The seam correction alone did not solve the group-photo tree. Its traced frame
also contained a narrow spur near the inward-profile border seam. Changing
connection density, curve tolerance or maximum span did not produce a solution
in the diagnostic budgets. The original graph's linear relaxation was already
infeasible, before integer search.

A surgical diagnostic replaced only that spur's three curves with a chord;
the graph still proved infeasible. Thus the spur alone is **not** an established
root cause. The successful smoother seed changes several junction and boundary
positions. A separate replay with the previous seam logic and the smoother seed
also found a valid routing, so the seam fix is not claimed to be necessary for
this particular photo's recovery. The two improvements address distinct
weaknesses: dependence on contour storage order, and committing to one infeasible
geometric interpretation of a noisy mask.

Feature recovery now retains its existing 0.3 mm smoothing and both connector
graphs first. Only if every attempted graph reports `candidate_graph_exhausted`
and time remains does it trace one additional seed with 0.5 mm smoothing.
Timeouts do not trigger this retry. The retry shares the original phase budget;
it does not request more solving time or introduce another user-facing mode.

Only the routing seed is smoothed. The photograph, crop, classified mask and
probabilities remain unchanged. As before, a candidate must satisfy geometry and
paper checks before it can seed the common Bézier fitter. Refinement and final
selection use the original source mask, including its border pixels and small
features. There is no change to the image-error or feature-retention thresholds.

The new photo regression runs automatic cropping, classification, routing,
refinement, export and independent resvg rendering. It requires a legal 3+3
pair below 2.5% disagreement, improving on the previous 5.973125%, and checks
that the source mask, probabilities and crop coordinates remain unchanged.

## Complete-corpus measurements

The final 44-case replay has **11 candidate passes, 18 needing review and 15
without a crop**, compared with 10/19/15 previously. All 29 generated pairs pass
geometry and guarded paper checks. Source photograph hashes, crop coordinates
and preparation metadata are unchanged throughout; acceptance thresholds are
unchanged in this release.

| Full-photo case | Previous exported error | New exported error | New result |
| --- | ---: | ---: | --- |
| Group photograph, right-hand red tree | 5.973125% | 1.922500% | 3+3 cuts; candidate checks pass |
| Green tree | 1.137500% | 1.075000% | 3+3 cuts; candidate checks pass |

The group tree takes 6.457 s including automatic detection, preparation, fitting,
export and external rendering in this serial run. These are single-run timings,
not latency distributions. The reconstructed branch outlines were visually checked
in the generated comparison panels.

Of the other 27 generated outputs, 25 have exactly unchanged exported errors.
Two printed-paper cases retain their needs-review status with time-budget
variation: `danish-red-gold` changes from 13.9425% to 13.795625%, and
`vissevasse-arranged-r3c4` from 5.8225% to 5.84375%. Both still select grid seeds;
their clearance/refinement checkpoint counts differ. These figures are retained
rather than claiming every case improves or attributing all variation to the
junction change.

All **22 regular Hunodan cases** pass with exactly unchanged exported errors.
Median preparation-through-export time is 5.343 s and the maximum is 8.419 s,
excluding decoding and external replay. **845 application tests and 541 inverse
tests pass**, with one existing application skip. Type checking has zero errors
and seven existing warnings; lint and build pass. Browser QA has **12 passes
and two new failures**, detailed below.

The [measurement ledger](JUNCTION-RECOVERY-VALIDATION.json) records every case,
before/after values, source hashes, browser failures and diagnostic ablations.
Local visual panels and exported curves are in
`tmp/circular-junction-web-all/report.html`.

## Remaining failure found by the browser replay

The new browser case uploads only the photograph's rough selection rectangle.
The Node photo benchmark supplies the full original photograph plus that
rectangle to the detector. These are different input contexts: the cropped
upload produces slightly different automatic corners and a different source
mask. The new routing passes the full-photo case, but **does not yet solve the
cropped upload**.

For that upload, Chromium returns a 1+1 approximation after **75.040 s** and
WebKit after **80.948 s**. Both report **5.250625% engine mask disagreement** and
failed template checks. The new browser assertions fail before independent
export replay, so these are not external-renderer measurements. The other six
cases pass in both browsers, including the existing trees, Hunodan recovery,
matching and independent free-border hats, and the blue/green checker.

Both established routing attempts stop before MILP search: the left and right
edges have one versus three transitions. At radii 2–3 mm, the boundary profiles
give `[3,3,3,1]` transitions (top, right, bottom, left). Shallower profiles do not
provide reliable replacements: the apparent three left transitions at 0.5 mm
are at 1%, 98.75% and 99.75% of the edge, not meaningful slit endpoints. A
diagnostic with a 5 mm band restores 3+3 counts but still yields infeasible
graphs; simply increasing the border radius is not a verified solution. No
such radius change has been added to production.

The exact unmodified worker mask is retained in
[`browser-group-tree.json`](../../scripts/inverse/fixtures/browser-group-tree.json),
with its source photograph hash, rough ROI, automatic corners and lossless
run-length encoding. It isolates fitting from future detector changes. This
failure remains explicit in the browser benchmark rather than being replaced
with the better full-photo crop. Robust recovery under these boundary changes
is still outstanding.

## Reproduce

Run CPU-intensive commands serially:

```sh
node --test --test-concurrency=1 scripts/inverse/junctions.test.mjs scripts/inverse/feature-refinement.test.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --ids=danish-tree-group-right --output=tmp/junction-recovery-tree
INVERSE_SPEED_OUT=tmp/junction-recovery-hunodan node scripts/inverse/hunodan-speed-benchmark.mjs
node scripts/inverse/web-photo-benchmark.mjs --stage=solve --seconds=10 --output=tmp/junction-recovery-web
```

With a production build served on an isolated port, the upload-to-editable-SVG
workflow includes the new group-photo case:

```sh
INVERSE_TEST_URL=http://127.0.0.1:5232 INVERSE_TEST_BROWSERS=chromium,webkit INVERSE_TEST_CASES=web-danish-tree-group-right,web-danish-tree-red,web-danish-tree-green,hunodan-hjfig-05,top-hat-preferred,top-hat-independent,web-bibel-checker-3 INVERSE_TEST_OUTPUT=tmp/junction-recovery-browser node scripts/inverse/paint-browser-test.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed standalone Playwright module when needed.
As in the other photograph benchmarks, agreement is measured against the
classified crop, not unavailable original artwork or physically tested templates.
