# Crop-edge components and a short-search scheduling discontinuity

Two unresolved collage photographs expose different failures at consecutive
pipeline stages. Tiny classified edge islands change their interior status
under one-pixel crop translations. In the outlined star, that small input change
also sends the fitter through a substantially different time allocation, leaving
its main motif under-refined. A fixed-input budget prototype improves the shifted
star's independently rendered mask error from **2.9869% to 0.7569%**. Its actual
editable SVG passes at **0.7588%**. The correction is now integrated into the main
fitter after the experimental corpus and editable-export checks passed.
Production verification is recorded separately below.

## Classification stability

The diagnostic tracks each original protected region through photograph
coordinates into nine crop positions: the saved production quadrilateral and
translations of up to one original source pixel in each direction. Each mask
is classified afresh. JPEG quality 75, half resolution and the existing
red/white-mixture classifier are separate interventions. No solver chooses
corners, no pixels are cleaned up, and feature thresholds remain unchanged.
Original cases must reproduce their saved mask hashes; mapping those masks
back to themselves retains every reference-region pixel.

| Original region | Protected across crop positions | Other observations |
| --- | ---: | --- |
| Outlined star: 4.25 mm² lower-edge white island | 6/9 | Becomes border-connected in three positions; half resolution leaves 13.2% of its colour pixels. |
| Outlined star: central red star | 9/9 | Retains at least 99.2% of its colour pixels across the nine positions. |
| Crossed ribbons: 4.50 mm² lower-edge white island | 6/9 | Becomes border-connected or too close to the border; JPEG reduces its classified area below the feature gate. |
| Bird: white eye | 9/9 | Retains at least 94.5% of its colour pixels under the crop translations. |

These comparisons use the same physical reference pixels, not a nearest-centre
match between unrelated components. Pixels that leave the new crop are reported
separately. The two failed edge islands are centred less than 1.3 mm from the
overlap boundary and lie along a blurred photographic edge. Their instability
is evidence of a preprocessing sensitivity; it does not prove that every such
region is noise or establish the true paper corners.

A blanket classifier change is unsuitable. The mixture classifier connects the
star's island to a large boundary region but removes **every original bird-eye
pixel**. Half resolution also reduces the genuine eye to 0.75 mm², below the
unchanged protection threshold. Scale instability alone cannot safely decide
which details should be discarded. No photograph-derived annotation or target
was added to training from these observations.

## Full fitting exposes an independent budget problem

Both cases were replayed after a +1-source-pixel horizontal crop translation,
with the same ten-second search allowance. The masks reproduce the diagnostic
hashes exactly. Crossed ribbons pass independent export checks at 0.8881% error
and editable SVG checks at 0.8894%. The outlined star passes the native 3% image
limit at 2.9869%, but the editable renderer measures **3.0044%**, so the complete
editable candidate fails. This is not counted as a new benchmark success.

The shifted star's best fine grid has 3.1433% error. Its classified central star
is retained and the tiny edge island is no longer an interior feature. The old
scheduler therefore gives speculative traced routing 4.67 seconds. That search
finds no validated pair, leaving just 0.175 seconds for direct refinement; only
the initial checkpoint survives. The original crop's competitive grid instead
reserves refinement, allowing more than two seconds of curve updates.

This is a scheduling discontinuity around the accepted image-error threshold,
not evidence that one source-pixel translation requires a new design family.

## Offline budget interpolation

For short searches, the prototype gradually interpolates between the existing
refinement-reserving routing budget and the existing routing-priority budget.
The weight is the best fine grid's excess over the image limit, divided by that
limit and clamped to [0, 1]. Existing competitive and feature-preferred grids
retain their reserve. Far worse grids and longer searches retain routing
priority. The source image, curve representation and all final checks are
unchanged.

On the same shifted-star mask, the routing weight is 0.04777. The unsuccessful
MILP probe takes 0.919 seconds, followed by 1.921 seconds of curve refinement.
The complete native solve and export take **8.208 seconds**. Independent error
is 0.7569% at 400 pixels and 0.9142% at 800 pixels; image features, geometry and
paper checks pass. The editable SVG also passes. Visual inspection shows a much
closer star shape and fewer pinched boundaries, with remaining small kinks.

The original unshifted star retains exactly its earlier 0.8156% error and still
fails the unchanged edge-feature check. The shifted ribbons also pass, but do
not invoke the changed recovery-budget path; their smaller error is not credited
to this change. The original hard-photo benchmark therefore remains **25/31**.
The fresh experimental Hunodan run passes all **22/22 designs** within ten
seconds (maximum **7.935 seconds**), with every independent mask error exactly
unchanged from the preceding release. The automatic hard-photo replay retains
**25/31 passes**, with unchanged photographs, crop corners and fitting-input
hashes. Five passing errors decrease and the Viking increases from 2.0550% to
2.056875%. The other errors are unchanged.

The leaf is the substantial second improvement: its error falls from 2.5625%
to **1.32875%**. The unsuccessful routing search falls from 4.735 to 2.850 seconds,
leaving 1.964 seconds of direct refinement instead of none. Visual inspection
shows better recovery of the lower frame. Its complete native solve/export
takes 9.062 seconds. Smaller changes on other photos need not be caused by
the new policy: several finish routing before either budget expires, or use an
unchanged feature-reserving path. All per-case differences remain in the
[validation record](routing-budget-blend.json).

All **11 experimental focused tests** pass, including long-budget routing
fallbacks, the tree with hidden endpoints, and the new shifted-star regression.
All **47 accepted editable SVG pairs** pass their independent replay.

## Production integration

The main fitter uses the same short-search allocation formula. Existing
competitive and feature-preferred grids retain their reserves; longer searches
and high-error grids retain routing priority. The report records a zero routing
weight when the existing refinement reserve overrides interpolation. No
classification, crop, source-feature, symmetry, geometry or paper acceptance
rule changes.

The production regression starts from the original photograph and translated
corners, verifies its mask hash, requires useful validated refinement
checkpoints, and independently renders the result at 400 and 800 pixels. It
requires less than 1.1% disagreement, passing geometry/paper checks, unchanged
source arrays and a complete solve/export below ten seconds. All **11 production
focused tests pass**. Full repository and rebuilt-browser verification are pending.

## Reproduction and evidence

```sh
node scripts/inverse/diagnostics/photo-feature-stability.mjs \
  --run=tmp/heart-learning/eye-routing-v1/release/photos \
  --ids=outline-star,crossed-ribbons,bird \
  --output=tmp/photo-feature-stability-replay
```

The [measurements and hashes](photo-feature-stability.json) retain all 36
classification variants, three fresh prototype fits, both sets of editable
checks, the frozen prototype and its runner. The initial diagnostic attempt
stopped before writing results because report settings omit tracing resolution;
the tool now takes the actual prepared source resolution. The corrected run
completed all 36 variants. The classification tool remains an offline diagnostic;
no new cropper, classifier or neural model is deployed.
