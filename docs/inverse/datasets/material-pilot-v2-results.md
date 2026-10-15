# Second material pilot: useful separation, incomplete reconstruction

The fixed higher-rate follow-up learns paper separation but does not improve
complete reconstruction reliably. All three training runs, independent inference
audits, nine-photo pipeline comparisons and seven available editable conversions
completed. No model is deployed. The [evidence record](material-pilot-v2-results.json)
pins the inputs, reports and visual review.

Only the learning rate changed from the first pilot: 0.0001 to 0.001, selected
using synthetic training evidence before this run. The 240 updates, seed, replay,
frozen encoder and grouped real-photo folds remain fixed. All 254 control-model
tensors exactly reproduce the corresponding synthetic rate-study checkpoint.
Independent inference exactly reproduces all three archived prediction arrays.

| Nine-photo development score | Synthetic control | Mixed, grouped predictions |
| --- | ---: | ---: |
| Body IoU | 84.09% | 81.24% |
| Observed material disagreement | 24.40% | 17.84% |
| Material disagreement including missing body | 26.98% | 19.51% |

Mixed material disagreement improves from the first pilot's 46.11%, while body
IoU falls from 85.42%. These are previously inspected development photographs,
with partial labels and conservative source/motif grouping, not unseen tests.
Unknown areas are not scored; material predictions are not original artwork.

| Full pipeline, without supplied crop or labels | Crops | Checked editable pairs |
| --- | ---: | ---: |
| Existing production | 3/9 | 2/9 |
| Learned body with RGB classification | 2/9 | 2/9 |
| Synthetic-only joint predictions | 1/9 | 0/9 |
| Mixed joint predictions | 1/9 | 1/9 |

The learned-body arm recovers the boar and blue/yellow checker but loses the
production bowed red/pink checker. The mixed joint model recovers only the boar.
All seven available candidates convert successfully; five pass complete checks
across the four arms (these include repeated photos). Different derived masks
and crops prevent interpreting their fit errors as paired artwork accuracy.

The synthetic-only stacked-hearts fit has 1.191875% independently measured mask
disagreement and retains the checked features, but its second sheet fails the
700-resolution guarded paper-core test: two possible detached core islands.
Production's stacked-hearts candidate passes that paper check but disagrees with
its mask by 7.35125%. Low image error alone is therefore not sufficient.

All nine prediction panels and seven reconstructed outputs were visually
reviewed. Printed ink is confused with sheet identity; hands, handles, table and
chocolates also damage the body mask. The synthetic generator before this study
uses uniform sheet colors with slight grain, a relevant coverage gap for printed
papers. This does not establish that missing prints explain every failure.

A further controlled replay combines the unchanged mixed material fields with
the original frozen body predictions. Again only the boar produces a checked
editable pair. Restoring the body alone is insufficient; material uncertainty,
outline evidence and downstream cutting feasibility remain separate issues.

The next controlled intervention adds sheet-attached procedural prints to
synthetic photographs while preserving their exact material and geometry labels.
