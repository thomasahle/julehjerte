# Shared-cut recovery after straight-span selection

The pale frame in the [background recovery study](background-photo-recovery.md)
retained a faint diagonal seam between its center and lower-right corner. The
two exported cuts followed slightly different paths even though that portion
of the source mask requested a single uninterrupted color.

## Cause and correction

The finalizer checked shared-cut proposals before selecting straight spans.
The original alignment proposal failed its image checks. Straight-span
selection subsequently removed small bends, making a different alignment
acceptable, but the finalizer did not check again. Replaying each intermediate
geometry isolates this ordering effect; neither cropping nor another gradient
search is needed to resolve this particular seam.

The finalizer now retains the first alignment pass and retries after
straight-span selection changes the geometry. Both alignment passes share the
existing two-second allowance and the overall export reserve. The second pass
does not run if straight-span selection leaves the geometry unchanged.
Simplification of the invisible runs follows the last alignment.

Simply moving the first alignment pass later was insufficient. A second frame
loses four source pixels of agreement under that ordering: early alignments
enable straight-span reductions that the reversed order does not retain.
Controlled replays of the same saved curves confirm this difference, without
depending on the timing of a fresh optimization. Keeping the first pass and
adding the conditional retry handles both cases.

No image-error, feature-retention, symmetry, geometry, paper or cutting-quality
threshold is relaxed. The reports retain the first pass in `finalSharing` and
the retry in `finalSharingAfterPrimitives`; their separate accepted and rejected
proposals remain inspectable. In particular, a rejected first pass remains
visible even if straightening enables a successful retry.

## Regression evidence

The new fixtures contain curves captured before cleanup and the classified
photographic masks. They come from generated photographs with known provenance;
reference cutting paths are not supplied to the fitter or cleanup.

- The pale frame reproduces the original failed alignment. Common finalization
  then removes the seam, decreases source-mask disagreement, and passes geometry
  and paper checks without worsening the minimum bend radius. A separate resvg
  render of the exported cuts confirms lower fractional image error than the
  historical finalization order and zero remaining seam coverage in the
  inspected interior band.
- The second frame demonstrates why the first alignment pass must remain. Its
  source agreement and matching sheets are retained by the retry approach.
- Replacing the pale frame's target with a high-resolution mask that actually
  contains the thin line preserves that line.
- An exhausted completion reserve leaves the original geometry unchanged.

```sh
node --test --test-concurrency=1 scripts/inverse/sharing-order.test.mjs
```

## Browser QA exposed a separate sampling defect

The full Paint → Draw → SVG replay rejected the anti-symmetric hat after
download. Spacing, intersections and edge parity passed, but its independent
forward check reported one wrong pixel. Repeating the browser case with engine
commit `ae7bdd3` reproduced the failure, so the cleanup retry did not introduce
it.

The exported curves were still exactly shared. At one sample, traversing the
same straight segment in opposite directions produced crossing coordinates
`44.05940594059406` and `44.059405940594054` mm. The sample lay between those
floating-point results, causing one crossing to toggle its color without the
other. The difference was approximately `7 × 10⁻¹⁵` mm, rather than a gap in the
cutting geometry.

`sampleRings` now evaluates each segment from its lower endpoint toward its
upper endpoint. Equal segments therefore use identical arithmetic regardless
of their traversal direction. This neither rounds coordinates nor merges
nearby crossings, and no geometry or image tolerance is increased. New tests
reproduce the old failure, check cancellation and winding invariance, and
retain a genuinely distinct region only `2 × 10⁻⁸` mm wide at a sample point.

## Full-pipeline replay

All six diagnostic photographs and all 24 previously frozen coverage photographs
again produce checked template pairs. The conditional retry accepts additional
alignments in the pale diagnostic frame and in coverage frame 732222. Their
source-mask disagreements decrease by 3 and 36 pixels respectively on the
384-pixel square masks. The other 28 cases require no accepted retry.
All 30 cropped images and classified masks have the same hashes as before.

This is not a uniform improvement against the latent synthetic artwork. The
pale frame's independently rasterized latent disagreement increases by one
observed pixel at the benchmark resolution even though its high-resolution
seam disappears. Two dense lattices also have different source errors in the
fresh search; neither accepts a change from the new retry. All before/after errors
are retained in the results record.

Twenty-seven of the 30 complete pipelines finish within ten seconds; the slowest
takes 11.31 seconds including cropping and preparation. An earlier replay
completed 25 within ten seconds while unrelated headless Firefox jobs were
observed consuming CPU. These times do not establish an isolated speed
comparison. The conditional retries
that accept changes take about 0.10 and 0.12 seconds in the recorded run.

All 22 regular Hunodan inputs pass the established independent-image, feature,
geometry and paper gates, including the existing one-percentage-point allowance
for matching sheets. The final run finishes every case within ten seconds,
with a maximum of 9.61 seconds. The earlier run retains a 10.29-second result
for `hjcur-02`; its new retry did not run. A subsequent paired replay took
5.95 seconds with the preceding engine and 6.03 seconds with the cleanup retry,
with identical independent image error. That checks the observed overrun
without replacing the original failed timing record. Runtime remains sensitive
to machine load; this is a measured benchmark result, not a hard latency bound.

This fixes one source of false seams. It does not establish that every proposed
alignment will be found, that photographed corners are exact, or that aggregate
image agreement proves the intended design. The extra-cut frame and strong
paper-shading failures from the background study remain separate issues.
