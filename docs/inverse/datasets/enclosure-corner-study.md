# Enclosure failures and coupled corner noise

The stacked-hearts investigation separates three problems: candidate scheduling,
lost motif enclosure, and a noisy corner that prevents traced routing from
starting. None of these experiments establishes a complete reconstruction of
this photograph. The learned model and new corner proposals remain offline;
the automatic fitter's production path is unchanged.

## Frozen input and candidate scheduling

The source is the `synthetic-joint` prediction for
`real-8c875dd0f298b5a4-body-1` from the second material pilot. It is an estimated
two-sheet mask, not original artwork. The
[committed fixture](../../../scripts/inverse/fixtures/stacked-hearts-corner-mask.json)
records its provenance, run-length encoded pixels and hashes. No saved templates
enter fresh fitting.

The ordinary ten-second search refines a five-by-three layout which fails the
paper-core check. A three-by-three layout was already among the image-derived
initializers; restricting initialization to that pair yields a candidate passing
the existing checks in 8.51 seconds, with 1.225% independently rendered mask
disagreement. Ordinary search with a longer allowance takes 18.36 seconds and
returns a five-by-three pair at 1.29875% disagreement. These instrumented runs
identify a scheduling opportunity; they are not a new latency benchmark.

Visual review prevents counting either as a solved photograph. The longer
ordinary result opens two enclosed motifs to the image boundary. The restricted
three-by-three result opens three. Their small disagreement percentages hide
these visible defects. Both retain most original motif pixels.

## Why existing feature checks missed them

`auditFeatureFidelity` protects substantial regions against lost colour, but
checks enclosure only for small interior features: area at most
`4 * nominalWidth ** 2`, approximately 25 mm² under these settings. The source's
five detected interior regions are approximately 223–568 mm². The four heart
motifs therefore receive no enclosure protection.

Frozen-mask/component measurements cover 55 saved exports: 29 available hard
photo candidates, 22 Hunodan candidates, and four stacked-hearts diagnostic
runs. There are 181 source-region measurements. Similar connections appear in
other accepted candidates, including Viking. The study also exposes ambiguous
checkerboard corner contacts: demanding exact raster connectivity for every
region can reject an otherwise faithful reconstruction after a tiny junction
change. Component measurements supplement, rather than certify, geometry.

Two controlled experiments did not solve the larger motifs:

- Expanding the enclosure gate to all observed interior regions correctly
  rejects the visually defective stacked-hearts results, but fresh fitting still
  finds no fully enclosed valid pair. More rejection alone is not recovery.
- Removing a soft curvature preference does not close the missing enclosures.
  Trying shorter shared spans closes one additional heart in the restricted
  candidate, but leaves two open and adds about 2.5 seconds. Wider sharing
  proposals alone are insufficient. These changes were not integrated.

## A concrete border-model defect

The original mask has edge-transition counts `[9, 4, 6, 3]` in top/right/bottom/left
order. A 1 mm inward-profile interpretation reduces them to `[3, 4, 4, 3]`.
Its bottom-right component occupies only 6.875 mm², but adds one transition to
both adjacent sides. The existing single-edge recovery cannot repair both
opposite-edge mismatches. Sampling more deeply also begins to intersect the
nearby heart motifs and introduces different extra endpoints.

The new [corner proposal helper](../../../static/inverse/core/corner-border-seeds.js)
enumerates small corner-connected components in bounded border interpretations.
It proposes flipping them only when both opposite-edge counts become consistent.
Each removed component must fit inside a corner square no wider than 5% of the
design and twice the nominal strip width. Large regions and whole strips are
not eligible. Already consistent original borders produce no proposals.

On the frozen mask, the best proposal changes 0.430625% of pixels from the
original estimate and restores `[3, 3, 3, 3]`. All five original interior regions
keep every pixel and remain enclosed. This is an initialization hypothesis;
the original mask remains the target for all image and feature measurements.

The proposal now lets HiGHS attempt actual routing. It does **not** finish the
photograph: the initial three trace tolerances yield exhausted graphs or time
limits, with rejected integer candidates containing short returns and narrow
necks. This is a separate failure after endpoint recovery, not a remaining
count mismatch and not evidence that the design is impossible.

## Replaying and verification

Run the bounded offline study with:

```sh
node scripts/inverse/diagnostics/corner-fragment-routing.mjs \
  --output=tmp/corner-fragment-study --seconds=20
```

The output directory must be new. The script hashes its input and runtime,
chooses the provisional mask by its difference from the source, and retains
all three tracing/routing outcomes. `--seconds` is a budget **per routing
attempt**, not an overall photo-to-template time claim. Successful routes would
also be independently rendered and scored against the original mask.

Regression tests cover both colours, four rotations and three image scales;
preservation of consistent borders, real strips and larger corner regions;
the frozen photographic mask; and a fresh noisy-checker solve with independent
export rendering. The checker still reports its 16 erroneous source pixels,
rather than scoring itself against the repaired seed. All 23 focused tests and
857 application tests pass (one existing application skip), as do explicit core
lint, repository lint, type checking and build. All 657 recorded source hashes
remain unchanged. The previous full inverse-suite run is preserved; it was not
repeated for this helper with no production callers. Experiment evidence and
check results are pinned in the [JSON record](enclosure-corner-study.json).

Next work is to improve routing and continuous refinement of the newly reachable
integer candidates, and to distinguish stable motif openings from ambiguous
pixel contacts before expanding production feature acceptance checks. The
helper is used by the offline experiment and regression tests; it is not yet
scheduled by the automatic fitter.
