# Fresh neural crop proposals through the current fitter

Two frozen foreground models recover a numerically checked template pair for
the blue outlined star, where the production cropper has no proposal. Neither
recovers the other two no-crop cases, nested squares and Santa. The scene model
has a lower derived-mask error but crops away a photographed border detail.
Both star exports still have visible curve artifacts. **This does not establish
a deployable neural fallback or increase the production benchmark's 24/31.**

## Matched inputs and current fitting

Fresh inference uses the existing background and scene checkpoints, with no
training or checkpoint selection. Both receive the same 31 real photograph/ROI
windows and 12 preselected synthetic controls. The three real cases selected
for fitting are exactly the no-crop failures in the latest production benchmark.
The published cutting paths and the source-photo QA points are not inputs.

This replay uses `target=mask`, the current binary-mask fitting path, and the
same ten-second search allowance and automatic settings as the full photo
benchmark. Earlier neural studies used `target=photo`; their loss scores cannot
be compared directly. The learned adapter replaces foreground evidence and
retains the locator's geometry/support requirements. All image, source-feature,
geometry, nominal-paper and independent export checks remain in force.

| Input | Production | Background model | Scene model |
| --- | --- | --- | --- |
| Nested squares | No supported crop | No supported crop | No supported crop |
| Santa | No supported crop | No supported crop | No supported crop |
| Blue outlined star | No supported crop | Checked pair, 1.2725% mask error | Checked pair, 0.59625% mask error |

The focused background replay reproduces the earlier broad replay's selected
crops, classified masks and fitting masks. Both star pairs use four cuts per
sheet. Background fitting takes 9.36 seconds; scene fitting takes 6.65 seconds.
Adding the separately measured inference, cropping and preparation gives about
10.58 and 7.98 seconds respectively, still excluding process startup, decoding,
artifact I/O and independent replay. These are native timings, not browser or
ONNX measurements, and the ten-second setting is a search allowance.

## What the original photograph reveals

The [28 frozen observations](blue-star-material-observations.json) were recorded
from the original blue-star photograph before this fresh replay. They are sparse
development QA observations, not dense ground truth, training labels or asserted
physical corners. Missing points remain in the denominator. One global paper
phase is inferred at classification and retained when evaluating the export.

| Star proposal | Observations inside crop | Correct after classification | Correct in exported weave |
| --- | ---: | ---: | ---: |
| Background model | 28/28 | 28/28 | 28/28 |
| Scene model | 27/28 | 27/28 | 27/28 |

The scene crop excludes blue source pixel `(512, 573)` on a lower border diamond.
The absence begins at cropping; classification and fitting cannot recover a
pixel outside their input. Its lower mask disagreement therefore does not prove
a better reconstruction of the complete photograph. The fresh result confirms
the earlier [historical source review](neural-fallback-source-review.md).

Visual inspection also rejects a stronger claim about the background model:
although it preserves all sampled points, the exported star has small bumps and
seams along otherwise simple bands. The scene export has visible notches near
inner corners. Sparse point agreement, global pixel error and geometric validity
all leave room for these defects. No physical cutting or assembly was tested.

The background fit's final outline-detail pass adds 57 curve pieces, reducing
its internal source error from 1.967% to 1.259%. That identifies a useful stage
to investigate for the remaining artifacts; this replay does not establish
that removing the pass would yield a better valid design.

## Replay improvements

`foreground-replay.mjs` now automatically records the shared source-photo QA
observations at cropping, classification and exported-weave stages. It verifies
source bytes, decoded pixels and dimensions before using the observations for
review. They never enter the reconstruction. `checkedPair` retains its existing
mask/geometry meaning; the separate `materialReview` makes its limitation visible.

The blue-star observations have been copied unchanged into the common review
fixture, with the original frozen document's digest retained. A regression test
checks that identity and confirms that the scene crop loses exactly the reviewed
lower-border point. The existing tests cover missing crops, phase inversion,
perspective, reflections and cropped-away observations.

A new `--ids` option restricts expensive cropping as well as fitting. It preserves
manifest order, records the selected IDs and full probe size, and rejects unknown
IDs before creating output. The original full replay and the focused rerun are
both retained.

## Remaining work

The next model/crop change must preserve the physical border, not just improve
foreground averages. The two unresolved collage cases still lack sufficient
support for their complete heart outlines. For the recovered star, curve
regularization and shared joins need attention beyond crop selection. A learned
fallback is still offline; browser integration and ONNX export remain untested.

## Verification and artifacts

The [machine-readable audit](neural-fallback-current.json) verifies 602 retained
artifacts and 94 current source hashes. All 31 production crop outcomes,
coordinates and classified/fitting mask hashes match the last released photo
benchmark. The new fitter runs cover only the three named failures; this is not
a fresh full-corpus solving benchmark.

Both exported pairs survive production editable conversion, SVG serialization
and parsing, the editor's intersection rules, source-feature checks and nominal
paper validation. Their editable mask disagreements are 1.269375% and 0.59625%.
The original-photo reviews remain 28/28 and 27/28 respectively. The fitter and
editable previews were visually inspected. This native replay does not substitute
for a browser neural-upload flow, which does not exist yet.

All 773 inverse tests and 855 application tests pass, with one existing
application skip. The final application run explicitly uses two workers. Type
checking reports zero errors and seven existing warnings. Final lint has only
its one existing warning, and the production build passes. The final test-only
unused-variable cleanup was checked again with the seven source-review tests.
An invalid `--ids` request is also verified to fail before creating output.

Raw predictions, crops, masks, cut geometry, editable SVGs, logs and audit scripts
remain under `tmp/heart-learning/neural-fallback-probe-v1/`. To repeat a focused
replay, use the corresponding `background-probe` or `scene-probe` with:

```sh
node scripts/inverse/learning/foreground-replay.mjs \
  --probe=tmp/heart-learning/neural-fallback-probe-v1/background-probe \
  --output=tmp/heart-learning/neural-fallback-probe-v1/new-replay \
  --ids=bibel-star-outline,nested-squares,santa \
  --solve-ids=all --methods=production,learned --target=mask --seconds=10
```

The existing `audit-fresh.mjs` script verifies the saved study without rerunning
inference, cropping, fitting or tests. Nothing was pushed or deployed. The owned
preview remains at `http://127.0.0.1:5232/editor/mal/`.
