# Keeping simpler curve fits in the search

A small photographic perturbation could change which slit counts received
curve refinement, even though the fitter initialized all count hypotheses.
The three available slots could all go to elaborate grids, leaving a simpler
routing just below the cutoff. Those coarse grids are not reliable estimates
of the error after their Bézier curves can move.

The motivating flower comes from the larger Pinterest collage. With fixed
approximate corners, reducing the source from 3648 × 2736 to 1482 × 1112
changed only 0.395% of its classified mask. The old outputs changed from 4+4
cuts to 4+2; their independent mask disagreements were 1.075% and 1.431%.
The three-cut seed ranked fifth in both initialization lists.

An October 14 follow-up reproduced a remaining failure with unchanged
production code (811/812 inverse tests). The finalist reservation
still retains 3+3, but on the downsampled photo it receives only 0.114 seconds
of free refinement after 3.131 seconds for 2+4. Minimum-width clearance has
already reversed their fine-grid error ordering. The final 4+2 export passes
geometry/paper checks at 1.332% mask disagreement, but fails this regression.
The [fresh replay and timing record](datasets/flower-budget-diagnostic.json)
preserve both input-mask hashes and the original ten-second settings. The
[clearance-order correction](datasets/clearance-order.md) now compares one
existing alternative before committing the refinement budget. A fresh replay
recovers checked 3+3 pairs at 0.450% and 0.615%, and the complete photo replay
retains all 25 previous successes. Full inverse QA passes this flower test,
but finishes at 809/813: one obsolete candle scheduling assertion has since
been corrected, and three existing near-miss checks expose a separately
reproduced [deadline cutoff](datasets/feature-deadline-diagnostic.json).
Build/browser validation and the preview update remain pending.
Two Hunodan errors rise slightly in the full run despite all 22 finishing
under ten seconds; the stricter unchanged-error goal remains unproven.

## Change

`gridFinalists` still refines at most three ordinary candidates. It keeps the
leading seed and any seed reserved by consistent opposite-border evidence.
One remaining slot can now go to a lower-cut candidate whose coarse image
error is within 1.5 percentage points of the best measured coarse error.
Among equally small candidates it prefers balanced counts, then lower error.
All count/phase initializations remain in the search.

That coarse selection band is not an extra allowance on the final image.
The mask, final disagreement threshold, feature checks, geometry checks,
paper checks and matching-sheet allowance are unchanged. Equal cut counts
do not imply identical templates.

In the paired prototype, the flower produced checked 3+3 pairs at both
resolutions: 0.450% and 0.824% independent mask disagreement. The production
regression checks both original classified masks by hash, requires checked
3+3 exports, and independently renders each export to verify less than 1%
disagreement. Its two rectified photographs are committed with source and
crop provenance in `scripts/inverse/fixtures/flower-resolution/`.

## What the resolution study does and does not establish

The controlled comparison resizes one downloaded photograph to three sizes:
3648 × 2736, 1482 × 1112 and 736 × 552. A robust image registration transfers
the historical approximate selections onto the larger source. At a 741 × 556
matching scale, 88 patch correspondences are within two pixels of the fitted
projective transform; their overall median residual is 0.446 pixels.
This supports coordinate transfer, not a claim of true physical overlap
corners. Fixed crops are held constant in normalized source coordinates;
automatic crops are a separate track and receive only rough rectangles.

The baseline replay covers four selected motifs at three resolutions in
both tracks (24 outcomes). Every fixed-crop track accepts the star, flower
and jigsaw and rejects the bauble. Every registered automatic track returns
numerically accepted pairs for the first three and no crop for the bauble.
The available automatic proposals have weak outline evidence; numerical
acceptance is not evidence that those crop corners are physically correct.

There are separate failure mechanisms:

- The locator can still follow internal motif edges or neighboring paper.
  Higher source resolution alone does not recover a supported outline.
- Color classification can discard photographed pink frame sections as
  white. No fitter can recover omitted detail from that binary target alone.
- Even with fixed crops, small mask differences can change the few grid
  candidates chosen for detailed refinement. The finalist change addresses
  this last mechanism; it does not repair the crop or classifier.

## Color experiment retained for further study

A two-component Gaussian mixture with independent color covariances can
recover more of the pale bauble frame than the existing nearest-center Lab
classification. A Lab version and an RGB version produced checked pairs at
2.682% and 2.215% error against their respective new masks. They changed
7.506% and 9.934% of the baseline bauble mask, respectively. These errors are
not comparable with errors against the previous mask or unknown artwork.

The Lab version also made previously accepted star and jigsaw fits fail.
It is therefore not the production default. Its masks, model parameters and
fitted curves are preserved as experiments. The improved-looking frame does
not justify a universal classifier change without broader evidence.

## Reproduction

`hard-photo-benchmark.mjs --catalog=...` now supports a separate, hashed
source catalogue. It leaves the original 31-complete-heart inventory intact.
The catalogue records source bytes and rough selections; automatic cropping
requires no saved corners, fitted templates or cutting paths.

```sh
node --test --test-concurrency=1 scripts/inverse/finalist-diversity.test.mjs
node scripts/inverse/hard-photo-benchmark.mjs \
  --catalog=tmp/heart-learning/collage-resolution-v1/native-registered-catalog.json \
  --ids=flower --crop=fixed --target=mask --seconds=10 \
  --output=tmp/flower-finalist-replay-new
```

The local study is under `tmp/heart-learning/collage-resolution-v1/`.
Its `comparison.html` shows the 24 baseline outcomes and preserves the
rejected or unresolved cases. Browser verification decoded all 60 report
images without JavaScript errors. Dataset examples remain reserved for QA;
automatic crop outputs are not training labels.

## Broader checks

The 22 regular Hunodan photographs all pass the existing release quality
criteria and the ten-second preparation/solve/validation/export limit. The
slowest was `hjstr-03` at 9.400 seconds. Against the preceding saved run, 19
mask errors are identical, two decrease, and `hjcur-04` increases by 0.00853
percentage points; it remains below its release error. These are serial
measurements on this machine, not a universal browser latency guarantee.

All 30 synthetic-photograph replays still produce checked pairs, and all
24 coverage cases retain the reference cut counts up to sheet exchange.
Their automatic corners and classified masks are unchanged. Twenty-nine
latent-artwork errors are identical. One dense lattice increases by 0.0270
percentage points; its refined grid candidates are identical, but the
wall-clock-limited final stages stop at different points. This supports a
budget-sensitivity explanation, rather than proving an effect of the new
finalist selection. Twenty-seven of 30 complete pipeline runs finish within
ten seconds; the three dense cases remain over that threshold.

All 687 inverse tests and 855 application tests pass (one application test is
skipped). Type checking reports no errors and seven existing warnings; lint
and the production build pass. Fresh production benchmark replays measure
0.450% and 0.942% for the two flowers against the same mask hashes. The latter
is slightly above the paired prototype’s 0.824%; wall-clock-bounded refinement
does not promise identical final checkpoints between runs. Both production
outputs retain three cuts per sheet and improve on the previous errors.

Five Chromium Paint → worker → Draw → SVG/PDF flows pass: both flower masks,
the star, matching hat and half-resolution puppy photo. The editable flower
exports have 0.562% and 0.938% source disagreement, with geometry and paper
checks passing. Click-to-ready times are 8.10 s and 10.92 s, respectively;
these include browser preparation/conversion and use the live UI's settings,
so they are distinct from the ten-second Node benchmark measurements.
All five flows report no JavaScript errors. The native flower editor result
was also inspected visually.

Source hashes, measurements and saved artifact locations are in
[the evidence record](FINALIST-DIVERSITY.json). The local experiment archive
includes the resolution inputs, rejected color models, alternative finalist
trials and their source scripts; its member hashes are checked separately
from the actual production replays. None of the unresolved automatic crops
is promoted to a training label or treated as verified reconstruction.
