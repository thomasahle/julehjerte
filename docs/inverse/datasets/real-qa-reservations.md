# Current QA reservations apply to historical training inputs

The reflective gold-angel photograph now supplies the committed
`photographic-gold-routing.json` solver regression. Its source asset,
`real-4066fe9f9aafb3e4`, had remained unassigned in the collected-photo catalog.
It is now explicitly reserved for QA. The collector propagates that reservation
through its existing source/near-duplicate grouping. This source currently has
one catalog member, so reserved files increase from 475 to 476.

All 1,034 source files, decoded identities, dimensions and group identities are
unchanged. The corpus still contains 573 photo-containing files; 313 of them
are outside reserved groups. Family and instance review remain incomplete.
There are sixteen visible-body annotations: fifteen in thirteen groups outside
QA, and the one gold instance reserved for diagnostics. No new training or
model-quality result is claimed.

## Preserve history while enforcing current reservations

Label verification still checks the exact source catalog and annotation hashes,
source pixels, grouping, transforms and rasterized labels. An old label export
continues to verify against its original snapshots. Historical integrity is
separate from permission to use those inputs in a new training run.

The training loader now also reads the current catalog. It rejects a source
that is missing, changed, newly reserved, connected to a reserved split group,
or whose grouping changed since the label snapshot. Missing current metadata
fails closed. An unrelated catalog addition does not invalidate unchanged
inputs. The training CLI cannot disable this check by selecting an old
`--manifest`.

Annotation building and loading distinguish `training-candidate` and
`diagnostic` purpose. Reserved source annotations require explicit diagnostic
purpose and `qa-reserved` allocation. Diagnostic label bundles cannot be
silently consumed by the training loader. Legacy exports without a purpose
field retain their old format, but training admission still consults the live
catalog. The ordinary ten-instance pilot remains admissible.

Evaluation and annotation-bound probe commands explicitly use diagnostic
loading. Their new `--manifest` option selects the recorded source snapshot;
the evaluator also forwards it when exporting cached probes. These commands
do not perform optimization or turn QA labels into training data.

## Verification

The [record](real-qa-reservations.json) retains the catalog delta, old snapshots,
new label manifests, test logs and a real training-entry rejection.

- All 1,034 original assets pass the independent file/hash/dimension audit.
- All 63 tests in twelve offline learning modules pass, including four new
  cases for stale reservations, related groups, diagnostic purpose and missing
  current metadata. All fourteen collector tests pass, including a new check
  that collected sources named by photographic regression fixtures are reserved.
- All sixteen annotations rebuild successfully. Their 48 RGB, label and overlay
  PNGs are byte-identical to the earlier reviewed exports.
- Historical label exports still verify against the original catalog. Loading
  the old gold/hand bundle for diagnostics succeeds; loading it for training is
  rejected using the current gold reservation.
- The historical annotation-bound CLI reproduces all four saved gold/hand
  foreground fields byte-for-byte using the explicit original catalog.
- The actual fine-tuning CLI rejects that stale bundle before loading its
  deliberately absent checkpoint or creating a training output directory.
- The recorded four prior adaptation runs contain the original ten real inputs
  and 1,920 sampled batch identifiers. The gold source did not enter those runs.

This is a prevention fix, not evidence of contamination in the existing models.
It does not make the repeatedly inspected gold case an unseen evaluation set.
No image, model weight, fitting algorithm or production UI changed. Application
and inverse-engine QA remain the preceding 855/812 passes; this change's fresh
checks cover the Python/data paths it modifies.

## Replay the historical scene labels

The original catalog and scene annotations are retained in Git at `be1eea5`.
For the existing local reviewed-label directory:

```sh
git show be1eea5:docs/inverse/datasets/real-manifest.json > tmp/real-sources-before-gold.json
git show be1eea5:scripts/inverse/datasets/real-annotations-scenes.json > tmp/real-scenes-before-gold.json
python3 scripts/inverse/datasets/real_annotations.py \
  --manifest=tmp/real-sources-before-gold.json \
  --annotations=tmp/real-scenes-before-gold.json \
  --output=tmp/heart-learning/real-scene-annotation-v1/reviewed-labels \
  --purpose=diagnostic --verify
```

Fresh current scene labels instead use the current catalog and annotations with
`--purpose=diagnostic` and a new output directory. Historical training-result
audits also pin their executed implementation; their source-code checks remain
intact and require the recorded source version. Raw evidence for this change
is under `tmp/heart-learning/qa-source-reservation-v1/`.
