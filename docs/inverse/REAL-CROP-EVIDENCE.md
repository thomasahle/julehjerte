# Real-photo crop evidence and rejected alternatives

The jigsaw and bauble from the original collage still need work. This replay
does not add a production cropper or change the fitter. It makes a misleading
benchmark outcome explicit: a checked template pair can closely reproduce a
bad crop or a mask that has already lost photographed detail.

A later [short-search feature refinement study](datasets/short-budget-feature-handoff.md)
raises complete-case acceptance from 23/31 to 24/31 by retaining the bird's eye.
It uses unchanged crop and mask hashes and still rejects these jigsaw and bauble
cases. The measurements below remain the earlier crop experiment's results.

## Current production replay

Source bytes and rough selections are frozen in `hard-photo-cases.json`.
The automatic track receives the photograph and rough ROI only. The fixed
track uses the historical assistant-selected corners and recorded 1.5% inset;
those corners are approximate and are not ground truth.

| Case and crop | Solver allowance | Independent mask disagreement | Pair checks | `design()` time |
| --- | ---: | ---: | --- | ---: |
| Jigsaw, automatic | 10 s | 6.694% | Fails | See record |
| Bauble, automatic | 10 s | 9.296% | Fails | See record |
| Jigsaw, automatic | 25 s | 1.761% | Passes, 4+4 cuts | 23.12 s |
| Bauble, automatic | 25 s | 2.042% | Passes, 5+5 cuts | 20.90 s |
| Jigsaw, historical fixed crop | 25 s | 0.999% | Passes, 3+3 cuts | 6.51 s |
| Bauble, historical fixed crop | 25 s | 2.909% | Fails, missing feature | 23.63 s |

The two automatic crops have weak lobe-outline support. Jigsaw supports only
50% and 22% of the sampled lobes; bauble supports 47% and 19%. The bauble tip
is at y=1139.31 in a photograph only 1112 pixels high. Both remain editable
`needs_review` proposals. The full fitter does not move those corners.

The jigsaw control supports a crop-related diagnosis: with the historical
crop, the same algorithm reaches a checked result much faster and uses fewer
cuts. That is not proof that the manually chosen corners or exported paths
are exact. Errors from differently cropped targets are not directly comparable
as original-artwork measurements.

Bauble has a separate classification failure. In the fixed-crop photograph,
faint pink frame sections are visible, but much of that frame is white in the
binary mask. The final fit also misses a retained 4.81 mm² classified fragment
near the right edge. The photo's blur, uneven brightness and color ambiguity
are visible; their individual causal contributions have not been isolated.
The earlier existing red/white-mixture intervention also failed to restore
the frame. More search time cannot recover information omitted from its target.

## Experiments not promoted to production

Several alternatives were tested using only the photo and rough selections:

- Restrict the anchored paper model's component seed to the selected ROI.
  This changes which stage fails but recovers neither crop. Taking the union
  of red components also fails the outline checks; nearby hearts contaminate
  the proposed silhouette.
- Separate paper and background by chromatic clusters, then add brightness
  to distinguish some pale-paper and wooden-background pixels. Neither
  alternative produces a supported crop. Hue alone merges substantial
  background into the pale-paper class; adding brightness leaves fragmented
  boundaries.
- Search multiple lower-edge hypotheses from all segmentation transitions.
  Joint lobe fitting does not yield a supported proposal for either case.
- Search raw RGB-gradient lines and fit lobes to a gradient-distance field.
  A jigsaw proposal passes the prototype's numerical support checks but
  visibly excludes part of the heart. Strong internal motif boundaries can
  impersonate the physical paper edge. This is a rejected result, not a
  successful detector.
- Penalize photographed paper outside those gradient proposals. The tested
  version rejects both cases rather than recovering convincing corners.

The raw-gradient result is particularly useful negative evidence: stronger
edge coverage alone is insufficient to validate a crop in a repeated motif.
Future learned or geometric proposals need validation that distinguishes
physical paper boundaries from internal pattern edges. No known cutting
paths were used in these experiments, and no successful reconstruction is
claimed for the rejected alternatives.

These collage examples remain reserved QA data. They are useful diagnostics
for future learned crop proposals, but the cropper's own outputs are not
physical-corner labels. Paper-outline annotation must be distinguished from
internal motif boundaries; the RGB-gradient failure illustrates the cost of
conflating those targets.

The local experiment archive retains code, outputs and annotated images:
`tmp/heart-learning/real-crop-experiments-v1/experiments.tar.gz`. Its inventory
and hashes are included in the evidence record. The experiments depend on
the production source at `46fbebf` and the repository's frozen collage.

## Benchmark change

The machine-readable automatic-crop result now includes a separate
`detection.assessment`: outline support, image bounds, out-of-frame corner
indices and the three underlying support/color measurements. Missing older
evidence stays unknown. Pixel-edge coordinates at x=width or y=height are
within bounds.

The visual report displays those diagnostics next to each crop and counts
weak or out-of-photo crops among numerically accepted pairs. The original
acceptance count and denominator remain unchanged. This preserves historical
fit comparisons while making their scope visible. A regression explicitly
checks a 0.1%-error accepted pair whose crop is weak and outside the photo.

These diagnostics are not corner ground truth. A supported in-bounds outline
can still be wrong, as the rejected gradient experiment demonstrates. The
website, exports, image-error thresholds and physical geometry rules are
unchanged by this benchmark change.

## Reproduction

```sh
node scripts/inverse/hard-photo-benchmark.mjs \
  --ids=jigsaw,bauble --crop=automatic --target=mask --seconds=25 \
  --output=tmp/real-crop-automatic-new
node scripts/inverse/hard-photo-benchmark.mjs \
  --ids=jigsaw,bauble --crop=fixed --target=mask --seconds=25 \
  --output=tmp/real-crop-fixed-new
node --test --test-concurrency=1 \
  scripts/inverse/crop-evidence.test.mjs \
  scripts/inverse/hard-photo-report.test.mjs
```

Source hashes, saved corners, per-case outcomes, experiment inventory and
validation are in [the evidence record](REAL-CROP-EVIDENCE.json).

Validation passed: 684 inverse tests, 855 application tests (one skipped),
type checking, lint and the production build. Type checking retains seven
existing warnings. A separate Chromium check decoded all report images,
verified both crop diagnostics and the accepted/failed filters, and recorded
no JavaScript errors. The rendered report was also inspected visually.
The local archive's 39 members and archive checksum were verified against
its inventory; this is byte-integrity verification, not an execution replay
of every rejected prototype.
