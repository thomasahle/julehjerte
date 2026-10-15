# First grouped body/material pilot: discrimination remains too weak

All three fixed-budget training runs and the independent checkpoint audit
completed. **These checkpoints are rejected for browser integration.** Neither
training approach reliably distinguishes the two papers, and the mixed model's
average body overlap is slightly worse than its unchanged parent.

The [predeclared plan](material-pilot-plan.md) uses nine partially annotated
photographs in two conservative source/motif groups, 240 updates per run,
identical initialization and paired synthetic draws. The encoder and its
BatchNorm statistics stay fixed; 9,906 decoder parameters are trainable. The
synthetic control takes 48.7 seconds and the two mixed folds 56.3 and 53.9 seconds,
excluding shared input preparation. These are CPU experiment timings.

| Mean over nine development photographs | Neutral material head | Synthetic-only control | Mixed, out of fold |
| --- | ---: | ---: | ---: |
| Body IoU | 86.58% | 86.30% | 85.42% |
| Observed material disagreement | 45.13% | 45.24% | 46.11% |
| Joint material error, including missed body | 46.78% | 47.60% | 47.00% |
| Balanced error across the two materials | 51.41% | 50.18% | 51.61% |

The neutral head is a constant 0.5 probability, not a trained material baseline.
Its apparently sub-50% disagreement comes from the observed class imbalance
and one permitted global label exchange. The balanced errors expose the failure
to recover the minority paper. Partial unlabelled regions are not scored.
These nine-photo figures are not comparable to the earlier ten-photo
foreground-only adaptation averages.

Initial visual review of the floral/striped heart, dark star and blue/yellow
checker confirms almost single-paper predictions despite recognizable body
masks. The printed floral outline still has holes and notches. Remaining
photographs and the complete crop/classify/fit replay are still being reviewed;
no new automatic reconstruction successes are claimed.

The independent audit reloads each checkpoint, reproduces its predictions,
verifies unchanged encoder tensors, reconstructs all sampled training identities,
checks whole-group holdout exclusion and recomputes errors using separate
confusion accounting. All checks pass. Four input/metric regression tests pass,
including fractional synthetic coverage, paired reflections, label exchange
and minority-paper failure. Passing these checks establishes experiment
integrity, not model quality.

The [evidence record](material-pilot-results.json) pins the runs, audit and exact
source promotion. The tested helper, tests and CLI now live in
`scripts/inverse/learning/`. Reproduce with a new output directory:

```sh
python3 scripts/inverse/learning/train-material-pilot.py \
  --plan=docs/inverse/datasets/material-pilot-plan.json \
  --output=tmp/heart-learning/material-pilot-replay
```

The next diagnostic measures material loss and prediction distributions on
the exact synthetic training replay. Poor training-set discrimination would
point toward optimization or representation limitations before attributing
failure solely to real-photo diversity. No ONNX model or website inference
has been added, and nothing has been pushed or deployed.
