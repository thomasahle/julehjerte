# Measure crop-edge support after refinement

The cropper previously refined a line against photographic colour steps but
kept the inlier count and span from its earlier segmentation fit. Its reported
support therefore did not describe the samples supporting the returned line.
The main locator now measures support after refinement and retains segmentation
agreement separately. This fixes crop evidence and the support used by crop
selection; it does not recover the seven unresolved photographs.

The complete fresh photographic replay remains **24/31 accepted**, with every
crop, classified mask and pass/fail result unchanged across the 47-entry
inventory. Fifteen clipped entries and one obscured entry remain separate.
The fitter's source bytes are unchanged. Nine time-limited fits return slightly
different errors in both directions, including regressions; those results are
preserved, not credited as improvements from this correction.

## The defect and the corrected evidence

A controlled wedge has 70 segmentation samples per side. A stronger colour
boundary six pixels away moves the fitted line, but the old result continues
to claim 70 supporting samples. Its RMS is measured against the old samples,
about 4.84 pixels, despite an inlier tolerance of only 1.8 pixels.

Using segmentation agreement alone as the new acceptance criterion is also
wrong: colour refinement can correctly localize a blurred paper edge beyond
the segmentation tolerance. That attempted fix rejected a known shaded-channel
fixture and a cream-and-green Hunodan photograph. It was not retained.

Each final line now records:

- `support`, `inliers`, `rms` and `span` measured against the final edge samples.
  Rows with an accepted colour-refinement sample use that sample; other rows
  retain their segmentation sample. The denominator stays the full sample set.
- `initial`, measured against the initial least-squares segmentation line.
- `segmentation`, measuring how the original mask samples agree with the final
  line, plus both original and refined sample coordinates for inspection.

All use the recorded perpendicular-distance tolerance. Empty support has zero
span and `null` RMS. A second controlled wedge contains 14 conflicting colour
samples: its final support is correctly 56/70, **80%**, instead of the seed's
100%. The four pinned analytic replays preserve their fitted coordinates
exactly; the correction changes their evidence.

The distinction is substantial in the real collage:

| Case, left edge | Earlier reported support | Final sample support | Original mask agreement with final line |
| --- | ---: | ---: | ---: |
| Outline star | 69.4% | 79.6% | 12.2% |
| Jigsaw | 73.9% | 54.3% | 0.0% |
| Crossed ribbons | 85.4% | 75.6% | 17.1% |

Colour agreement is not proof of a physical paper edge. Internal pattern
boundaries and shadows can also supply strong colour steps. Lobe checks,
review status and independent template checks remain necessary. These three
photos remain failures; their new measurements are not new ground truth.

## Rejected crop changes

Six diagnostic cases were used before fitting: the star, jigsaw, crossed
ribbons and bauble, with flower and dense-checker controls. Thirty-six runs
compare the baseline with disabled RGB refinement, paper-transition weighting,
a segmentation-drift guard, and two later vertical sampling bands.

None returns a supported outline for the four failed cases. Some changes
remove proposals altogether; others still put a tip outside the photograph or
leave weak lobe support. Moving the sampled band helps the flower's outline
support but does not consistently help the difficult crops. These policies are
preserved under `tmp/heart-learning/crop-edge-v1/` and
`tmp/heart-learning/crop-edge-band-v1/`; none is enabled in production.

This leaves a concrete next problem: distinguish physical paper edges from
internal motifs and neighbouring hearts. Adjusting a support score cannot
supply missing instance segmentation or repair the bauble's lost pale frame.

## Reproduction and verification

Implementation: `47ba2f3`. Pinned earlier source: `68e4f99`.

```sh
node --test --test-concurrency=1 scripts/inverse/lower-edge-support.test.mjs
node scripts/inverse/lower-edge-evidence-study.mjs \
  --source-ref=68e4f99 --output=tmp/crop-edge-evidence-replay
node scripts/inverse/hard-photo-benchmark.mjs \
  --crop=automatic --target=mask --seconds=10 \
  --output=tmp/crop-edge-photo-replay
```

The study accepts `--baseline-photos` and `--current-photos` to attach two
complete benchmark reports. It verifies locator source hashes and source
photograph identities, and records crop identity, mask identity, status and
error separately. Its analytic cases require byte-identical source arrays and
unchanged fitted coordinates. The full local replay is under
`tmp/heart-learning/crop-edge-v1/reproduction-study/`.

All **22 regular Hunodan cases** pass below ten seconds, with a maximum of
**9.142 seconds**. Twenty-one errors match the preceding run and one is lower;
the fitter itself has not changed. This timer covers preparation, fitting,
validation and export, excluding decoding and independent replay. Browser
latency is measured separately.

The [release audit](crop-edge-evidence.json) records the source hashes, paired
photo results, rejected crop variants and a hashed inventory of 1,371 local
artifacts. Verification passed:

- 743 inverse tests and 855 application tests; one existing application test
  remains skipped.
- Type checking, lint and the production build. There are zero errors, seven
  existing type-check warnings and one existing lint warning.
- Six Chromium flows covering the star example, free-border hat, unequal
  lobes, cream-and-green Hunodan photo, eight-point star photo and half-size
  puppy photo. They pass template, paper, editable-conversion and export
  checks, including independent 400/800-pixel comparisons, with no page errors.
- All recorded browser source/harness hashes match the checkout, and all 52
  recorded static modules match the rebuilt preview's served bytes.

Browser click-to-ready times range from 2.13 to 22.26 seconds under the UI's
larger allowance. These are separate from the native ten-second benchmark.
The Hunodan import and result screenshots were also inspected: the crop follows
the photographed overlap, while small irregularities remain near the motif's
upper tips. No perfect-detail or physical-assembly claim is made.

The preview remains running at `http://127.0.0.1:5232/editor/mal/`. Nothing was
pushed or deployed.
