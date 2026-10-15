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

Visual review of all nine photographs confirms almost single-paper predictions
despite often recognizable body masks. The printed floral outline still has
holes and notches; the bowed red/pink and hand-held scenes have substantial
body/background errors.

The full-photo replay completes all 36 declared arms. Production proposes three
crops and yields two checked editable designs. Mixed body evidence with RGB
classification proposes two crops and yields one checked design: it recovers
the boar but loses both production checker successes. Neither joint material
model proposes any crop. The two stacked-heart reconstructions distort the small
motifs and remain rejected. All five available candidates pass editable conversion,
but only those three derived-mask fits pass the complete checks. These are
nine-photo development results, separate from the 31-photo benchmark.

The original target PNG uses white for mask value one; the independent renderer
uses black. The reviewed comparison figure aligns this display convention only.
Stored masks, template coordinates and measured errors are unchanged.

The independent audit reloads each checkpoint, reproduces its predictions,
verifies unchanged encoder tensors, reconstructs all sampled training identities,
checks whole-group holdout exclusion and recomputes errors using separate
confusion accounting. All checks pass. Four input/metric regression tests pass,
including fractional synthetic coverage, paired reflections, label exchange
and minority-paper failure. All **94 offline learning tests across sixteen
modules** pass after source promotion, as do three coordinate/phase regression
tests for the experimental material adapter. Passing these checks establishes
experiment integrity, not model quality.

The [evidence record](material-pilot-results.json) pins the runs, audit and exact
source promotion. The tested helper, tests and CLI now live in
`scripts/inverse/learning/`. Reproduce with a new output directory:

```sh
python3 scripts/inverse/learning/train-material-pilot.py \
  --plan=docs/inverse/datasets/material-pilot-plan.json \
  --output=tmp/heart-learning/material-pilot-replay
```

The completed training-set diagnosis finds **48.24% material disagreement** on
the exact 64-image synthetic replay for the original control. Its material BCE
is 0.691, close to the constant-prediction value of 0.693; 62 of 64 images are
almost entirely one predicted paper. The mixed folds similarly fail on these
training images. Visual inspection confirms that the synthetic paper targets
match their photographs, while the predicted distinctions are missing.

A separately [declared learning-rate comparison](material-rate-study-plan.json)
keeps the initial model, training images, draw schedule and 240 updates fixed.
Rates 0.001 and 0.003 reduce synthetic training material disagreement to **4.09%**
and **3.63%**, with body IoU 96.86% and 97.12%. This is evidence that the initial
setup underfits the task; it does not establish generalization. The smaller
successful rate, 0.001, is fixed for the [next grouped photo pilot](material-pilot-v2-plan.json),
which is running. No new-rate real-photo scores selected that rate. No ONNX model
or website inference has been added, and nothing has been pushed or deployed.
