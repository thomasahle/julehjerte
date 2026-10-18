# Original-photo checks before testing a neural crop fallback

A retrospective review of the blue outlined star finds a crop loss that the
derived-mask score cannot see. The saved background-trained foreground model's
crop and exported weave retain all 28 reviewed source points. The scene-trained
model's crop excludes one blue border point, so both classification and export
retain only 27/28. These are existing offline outputs, not fresh inference or a
new production success.

| Saved output | Points inside crop | Correct after classification | Correct in exported weave |
| --- | ---: | ---: | ---: |
| Background-trained foreground model | 28/28 | 28/28 | 28/28 |
| Paired background control replay | 28/28 | 28/28 | 28/28 |
| Scene-trained foreground model | 27/28 | 27/28 | 27/28 |

The first two rows have identical foreground predictions and crop coordinates;
they are not independent models. Their fitted exports differ, but both retain
the reviewed points. The scene result excludes source pixel `(512, 573)` on the
lower blue border diamond. This is a crop-stage loss, not a demonstrated error
in classification or fitting. The point remains in the denominator even though
there is no corresponding pixel in the derived square.

The [observations](blue-star-material-observations.json) cover both sides of
the four star arms, eight blue border points, the white centre and surrounding
gaps. They were selected by assistant review of the original photograph and
frozen before this comparison. Two draft white-gap positions were moved to
clear cream-paper interiors based on original RGB values; the draft and pixel
audit are preserved. No candidate output was used to move the final points.
All 28 original RGB samples and the exact annotation bytes are pinned in the
[machine-readable review](neural-fallback-source-review.json).

The audit verifies the original photograph, historical prediction manifests,
full-photo input windows, crop/mask/export asset hashes and mask conventions.
It infers one global paper phase from classification and carries that same
phase to the exported weave. It neither runs a model nor changes any crop,
classifier target, geometry or acceptance limit. The source photograph is an
existing reserved QA input; these observations are not training labels and must
not enter crop selection or template fitting.

Retaining all 28 sparse observations does not certify the complete star. The
earlier visual review still found short uneven seams in accepted reconstructions,
and these points do not establish physical corner positions or cutting paths.
A later fresh replay must retain the source checks and independently validate
the full exported pair. No learned model has been added to the website, and the
production automatic-photo count is unchanged by this review.

The audit script and historical outputs remain under
`tmp/heart-learning/neural-fallback-probe-v1/`. The separately recorded routing
release QA continues without concurrent neural inference or fitting.
