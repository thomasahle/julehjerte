"""Uncertain real-photo body labels for offline diagnostics and future training.

Keep existing synthetic losses/checkpoints unchanged. Unknown pixels are absent
from BOTH terms of this loss and from every reported metric's denominator.
These pilot labels have no assigned training or held-out evaluation split.
"""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
import torch
from torch.nn import functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'datasets'))
from real_annotations import ROOT, verify  # noqa: E402


def load_real_labels(directory, manifest=ROOT/'docs/inverse/datasets/real-manifest.json',
                     annotations=ROOT/'scripts/inverse/datasets/real-annotations.json', root=ROOT):
    directory = Path(directory)
    audit = verify(Path(manifest), Path(annotations), directory, root)
    report = json.loads((directory/'manifest.json').read_text())
    items = []
    for row in report['instances']:
        labels = np.asarray(Image.open(directory/row['assets']['labels']['path']))
        items.append({'id': row['id'], 'rgb': np.asarray(Image.open(directory/row['assets']['rgb']['path'])).copy(),
                      'target': (labels == 1).astype(np.float32), 'weight': (labels != 255).astype(np.float32),
                      'allocation': row['allocation'], 'splitGroupId': row['splitGroupId'],
                      'nearDuplicateGroup': row['nearDuplicateGroup'], 'motif': row['motif']})
    return items, audit


def masked_foreground_loss(logits, target, weight):
    if logits.ndim != 4 or logits.shape[1] != 1 or target.shape != logits.shape or weight.shape != logits.shape:
        raise ValueError('Require matching batch/channel/height/width tensors')
    if not torch.isfinite(logits).all() or not torch.isfinite(target).all() or not torch.isfinite(weight).all() or not ((target == 0) | (target == 1)).all() or not ((weight == 0) | (weight == 1)).all():
        raise ValueError('Require finite logits and binary targets/observation weights')
    count = weight.sum((2, 3))
    if (count == 0).any():
        raise ValueError('An all-unknown sample cannot supervise a model')
    probability = logits.sigmoid()
    bce = (F.binary_cross_entropy_with_logits(logits, target, reduction='none')*weight).sum((2, 3))/count
    intersection = (probability*target*weight).sum((2, 3))
    dice = (2*intersection+1)/((probability*weight).sum((2, 3))+(target*weight).sum((2, 3))+1)
    return (bce+1-dice).mean()


def known_region_metrics(predictions, items):
    if not items or len(items) != len(predictions):
        raise ValueError('Require exactly one prediction per annotated instance')
    rows = []
    for probability, item in zip(predictions, items):
        probability = np.asarray(probability)
        target_values, weights = np.asarray(item['target']), np.asarray(item['weight'])
        if target_values.ndim != 2 or weights.shape != target_values.shape or not np.isin(target_values, [0, 1]).all() or not np.isin(weights, [0, 1]).all():
            raise ValueError('Require binary targets and observation weights of equal shape')
        if probability.shape != target_values.shape or not np.isfinite(probability).all() or probability.min() < 0 or probability.max() > 1:
            raise ValueError('Invalid real foreground probability')
        known, target = weights == 1, target_values == 1
        if not known.any():
            raise ValueError('No known annotated pixels')
        prediction = probability >= .5
        union = ((prediction | target) & known).sum()
        paper, background = known & target, known & ~target
        rows.append({'id': item['id'], 'knownPixels': int(known.sum()), 'unknownPixels': int((~known).sum()),
                     'knownPaperPixels': int(paper.sum()), 'knownBackgroundPixels': int(background.sum()),
                     'knownRegionIoU': float(((prediction & target) & known).sum()/union) if union else 1.,
                     'knownRegionPixelError': float((prediction[known] != target[known]).mean()),
                     'knownPaperFalseNegative': float((~prediction[paper]).mean()) if paper.any() else None,
                     'knownBackgroundFalsePositive': float(prediction[background].mean()) if background.any() else None})
    keys = ['knownRegionIoU', 'knownRegionPixelError', 'knownPaperFalseNegative', 'knownBackgroundFalsePositive']
    return {'instances': len(rows), 'threshold': .5, 'scope': 'Known pixels only; excludes uncertain outline bands, occlusions and letterbox padding. No boundary-localization or complete-crop accuracy claim.',
            'macroMean': {k: float(np.mean([r[k] for r in rows if r[k] is not None])) if any(r[k] is not None for r in rows) else None for k in keys},
            'rows': rows}
