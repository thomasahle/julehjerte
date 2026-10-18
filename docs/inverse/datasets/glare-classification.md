# Glare and color-classification diagnosis

A broader paired test rejects the proposed full-covariance color classifier as a replacement for the current automatic classifier. It can recover washed-out motifs, but it also displaces clean boundaries, changes the inferred cut count, and sometimes collapses into an illumination segmentation. The application classifier and fitter are unchanged by this experiment.

The reusable change is an optional localized glare intervention in the synthetic renderer and a `glare` replay profile. They provide known material labels under a previously missing photographic disturbance. See [the renderer controls](synthetic-training.md#controlled-photographic-interventions), [measurements](glare-classification.json), and the local experiment at `tmp/heart-learning/glare-colors-v1/`.

## Controlled inputs

The existing family-balanced coverage sample supplies 24 designs: eight each from the channel, frame and lattice recipes, with one view per design. Its original selection sorted SHA-256(seed/id) within each family, before crop outcomes were inspected. These images have since been repeatedly inspected; this is diagnostic QA, not a held-out evaluation or a claim about real-photograph generalization.

Each design has four views: its original photograph, centered glare at strengths 0.55 and 0.85, and offset glare at strength 0.85. Glare blends only paper toward white with Gaussian widths of 0.22 photograph dimensions. Camera, random draws, crop coordinates, geometry and latent material labels remain fixed. All 144 baseline image hashes match their original dataset assets. All 696 saved assets pass the replay verifier.

The stressor uses empirical sRGB mixing, not measured optical physics. Strong glare can erase useful contrast. The labels intentionally describe the material before blur, glare and JPEG; they do not assert that its identity remains recoverable from every resulting image. Only three procedural recipe families are represented.

## Classification comparison

The production automatic classifier chooses between grayscale Otsu and Lab two-means. The experimental alternatives fit two full-covariance Gaussian components in Lab, RGB, or Lab chroma. Each begins with production's mask and uses at most 16,384 deterministically strided image pixels for up to 25 EM steps. Fixed covariance ridges are two Lab units or three RGB units. No reference labels, cutting paths or palette metadata enter classification.

Predictions are scored against the pre-degradation material mask only after they have been emitted. Scoring uses pixels with a fully valid overlap label and allows one global color-phase flip. The numbers below are mean disagreement percentages with equal weight per image; each cell includes all 24 images in that condition.

| Classifier | Original | Mild glare | Strong glare | Offset glare |
| --- | ---: | ---: | ---: | ---: |
| Production automatic | 0.513% | 5.103% | 18.778% | 17.015% |
| Lab covariance | 2.842% | 4.654% | 19.454% | 14.513% |
| RGB covariance | 4.488% | 5.337% | 16.923% | 12.264% |
| Chroma covariance | 5.187% | 5.570% | 15.137% | 10.375% |
| Lab covariance, midpoint threshold | 0.778% | 3.774% | 20.001% | 13.273% |
| RGB covariance, midpoint threshold | 0.841% | 3.764% | 17.433% | 11.806% |

Lab covariance worsens 23 of the 24 original masks by more than 0.1 percentage point; RGB covariance worsens all 24. The existing red/white-mixture mode was also tested, but rejected 8–11 inputs per condition because some palettes are not red/white. Its partial-sample means are recorded separately and must not be compared as if they covered the whole table.

## Why covariance changes the artwork

A Gaussian posterior estimates which pixel population is more likely. It does not estimate the amount of each material in a blurred boundary pixel. With unequal covariance, its equal-posterior boundary can lie far from the midpoint of the two learned colors. Component-size priors are another influence, but setting equal priors did not repair the regression.

On the 24 original images, the Lab model's decision crossing along the line between its learned means has a median absolute displacement of 0.277 from the color midpoint, on a zero-to-one segment. About 80% of its incorrect pixels are within four pixels of a true boundary. Visual comparisons show shifted widths and rounded/shrunken regions, not just isolated specks.

An additional experiment calibrates the decision threshold to that learned-color midpoint. This reduces the original-image mean error from 2.842% to 0.778%, supporting the decision-boundary diagnosis. It still regresses 16 of 24 originals by more than 0.1 percentage point, and it cannot fix a component assignment dominated by lighting. It is also a threshold in the chosen color space, not a calibrated physical material-fraction estimate.

Two severe-glare collapses reveal an interaction with residual crop background. In `channel-815969-v3` and `shared-lattice-778636-v2`, 79.7% and 89.8% of the Lab model's smaller predicted component lie off the known paper footprint. The remaining large component largely merges the two materials. The off-paper footprint was computed afterward from the saved synthetic homography and paper shape; it was not supplied to the classifier. This is evidence for a third-color/background failure in these two cases, not a claim that all glare failures have that cause. Background contamination and lighting need to be handled together.

The paired construction establishes that the additional glare failures in this study occur without changing the crop. It does not establish that every faded-frame failure in a real photograph has the same cause. In particular, the real bauble has no known cutting-path or artwork ground truth.

## Consequences for template fitting

Three diagnostic inputs were each fitted with the automatic, Lab-covariance, and midpoint-calibrated masks. The production automatic fitter received only the prepared mask, a ten-second budget and zero extra trials. After export, a separate resvg renderer reconstructed the pair from `cut_geometry.json`; only then were the material labels read for scoring. This isolates classification through fitting/export, and does not rerun automatic crop detection.

Error against the fitted mask covers the entire 384 × 384 square. Error against known material uses only fully valid overlap pixels, with a global phase flip allowed. Each method for a given input uses the same evaluation region; the original and glare frame also share it.

| Input | Mask method | Cuts | Error against fitted mask | Error against known material |
| --- | --- | --- | ---: | ---: |
| Original frame | Automatic | 2 + 2 | 0.545% | 0.532% |
| Original frame | Lab covariance | 3 + 3 | 1.695% | 5.906% |
| Original frame | Midpoint | 2 + 2 | 0.736% | 0.764% |
| Same frame, strong glare | Automatic | 2 + 1 | 1.971% | 35.786% |
| Same frame, strong glare | Lab covariance | 2 + 2 | 0.780% | 2.387% |
| Same frame, strong glare | Midpoint | 2 + 2 | 0.878% | 3.772% |
| Original lattice | Automatic | 5 + 5 | 2.083% | 2.244% |
| Original lattice | Lab covariance | 3 + 5 | 1.635% | 6.522% |
| Original lattice | Midpoint | 5 + 5 | 2.078% | 2.733% |

The glare-damaged automatic frame fails the application's image-fidelity checks because three substantial regions lose their color or enclosure; its nominal geometry validator passes. The other eight pairs pass the application's checks, including covariance results that misrepresent the original artwork. These checks measure the supplied mask, so they cannot detect an upstream classifier changing the intended design.

The reference frame has 2 + 2 cuts and the reference lattice has 5 + 3. Thus the covariance lattice's 3 + 5 counts match the reference after swapping sheets, even though its image is worse. Cutting decompositions need not be unique; a different count alone is not proof of an incorrect or illegal design. The original frame does show unnecessary extra cuts: 3 + 3 against the reference 2 + 2.

The lattice is an especially useful counterexample to selecting whichever classifier gives the best fitting score: covariance improves agreement with its own mask from 2.083% to 1.635%, while worsening agreement with the fixed artwork from 2.244% to 6.522%. Neither that score, matching reference counts, nor legal geometry is sufficient to select the correct photographic interpretation.

## Reproduction and next direction

Repository verification passed: 855 application tests, one existing skipped test, and all 688 serial inverse tests. Check reported zero errors and seven existing warnings; lint and build passed. The focused glare tests also verify increasing photographic brightness, unchanged material targets, input validation and byte-identical default/zero-glare renders. The archive contains 1,983 files; every member was re-read and hash-verified. That verifies archive integrity, not a fresh execution of every experiment.

The local experiment retains the selection, generated inputs, production masks, per-image Gaussian parameters, calibrated variants, independent renderings, and full fitting reports. Its archived inventory and repository checks are recorded in [the evidence file](glare-classification.json). Default dataset generation still produces the previous image and label bytes; the glare intervention is opt-in.

```sh
node scripts/inverse/datasets/synthetic-intervention-probe.mjs \
  --profile=glare \
  --selection=tmp/heart-learning/glare-colors-v1/selection.json \
  --output=tmp/heart-learning/glare-colors-replay/inputs
node scripts/inverse/datasets/synthetic-intervention-probe.mjs \
  --verify=tmp/heart-learning/glare-colors-replay/inputs
```

The experiment scripts under `tmp/heart-learning/glare-colors-v1/` are preserved in the archive with their hashes. They use the current local NumPy, SciPy, Pillow and canvas installations. `prepare.mjs` runs production conversion, `score.py` fits/scores covariance models, `calibrate.py` tries the two alternative decision thresholds, `diagnose.py` measures boundary displacement, `components.py` diagnoses the two background collapses, and `fit.mjs` performs the nine fixed-mask solves. Replay these experimental scripts in an isolated copy: they retain experiment-specific paths, and some overwrite intermediate outputs. The archive preserves the recorded run. Deadline-limited fitting may select a different final refinement stage on another run.

A promising next direction is a spatial illumination model that preserves transitions between material colors, or learned boundary proposals trained with these controlled corruptions. Both need fixed-artwork scoring and paired regression checks. This experiment provides evidence against replacing two-means with a global Gaussian posterior or choosing color models solely by their downstream fitting error.
